// lib/strategyEngine/alm3XrpT3.ts
//
// Native TypeScript port of ALM3_XRP_30_T3_1000_Feb9.pine (the strategy Amit
// deployed directly on Delta, subscribed to 9 Feb 2026).
//
// This is a bar-by-bar reimplementation, not a line-for-line transliteration
// of the Pine source — Pine's plotting/label code is dropped entirely since
// it has no bearing on trade outcomes, and the engine is restructured around
// two phases per bar to match how Pine's own backtesting engine actually
// resolves stop/limit orders vs. the script's own bar-close logic:
//
//   Phase 1 (intrabar): if a stop/target order is already "working" from the
//   previous bar's close, check whether THIS bar's high/low would have
//   triggered it. This mirrors Pine's own behavior — strategy.exit's stop
//   and limit arguments fill intrabar against the exchange simulator even
//   though the rest of the script only evaluates once per closed bar.
//
//   Phase 2 (bar close): if the position is still open, run the script's own
//   bar-close logic — update the switch-SL state, check the ribbon-cross
//   exit (which, unlike the stop/target, genuinely can only be evaluated on
//   a closed candle since T3 is a closed-bar indicator) — and if nothing
//   closed the trade, recompute the stop/target levels for the *next* bar's
//   Phase 1 check.
//
// Known simplifications vs. the original Pine script, called out explicitly
// because they haven't been validated against a real TradingView export yet:
//   - The `ref_tf` (5-min) "gap boost target" feature is NOT implemented.
//     It's gated behind `IncreseTargetEnable`, which defaults to `false` in
//     the deployed script, so it has zero effect on the parameters actually
//     used in production — but if that flag is ever turned on, this engine
//     will not reproduce it.
//   - Same-bar re-entry after an exit (Pine re-evaluates entry conditions on
//     the same bar a position closes, since position_size updates instantly
//     within one script execution) IS modeled: see the main loop.
//   - Commission is applied as a flat `commissionPct` per fill (entry and
//     exit), matching `commission_type = percent, commission_value = 0.03`
//     in the Pine `strategy()` declaration, applied against the full
//     100%-of-equity position size Pine's `default_qty_value = 100` implies.
//     This is a non-compounding approximation at the single-trade level;
//     the backtest runner compounds equity between trades.

import { Candle, supertrend, t3 } from "./indicators";

export interface ALM3XrpT3Config {
  // SuperTrend
  atrPeriod: number;
  factor: number;
  // T3 ribbon
  t3FastLength: number; // aLength in the Pine source
  t3SlowLength: number; // Length in the Pine source
  // Exit management (all percentages, e.g. 1.9 means 1.9%)
  switchSlPercent: number;
  drawdownPercent: number;
  liquidatePercent: number;
  targetLongPercent: number;
  targetShortPercent: number;
  // Costs
  commissionPercent: number; // per fill, e.g. 0.03
  // Optional date window, mirrors the Pine script's Strategy Start/End Date inputs
  startTime?: number; // unix seconds, inclusive
  endTime?: number; // unix seconds, inclusive (only used if useDateRange is true)
  useDateRange?: boolean;
  // How stop/limit levels are tested: "intrabar" fills at the level when the
  // bar's high/low touches it; "close" triggers on the bar's close and fills
  // at the close; "close_cur" same but against the stop recomputed on the
  // current bar. See README for which one matches TradingView.
  stopMode?: "intrabar" | "close" | "close_cur" | "hybrid";
}

// The exact constants the live script was deployed with ("...Fixed" vars in
// the Pine source) — the defaults a parameter-tuning UI would start from.
export const ALM3_XRP_T3_DEFAULTS: ALM3XrpT3Config = {
  atrPeriod: 15,
  factor: 3,
  t3FastLength: 4,
  t3SlowLength: 7,
  switchSlPercent: 1.9,
  drawdownPercent: 4.0,
  liquidatePercent: 0.2,
  targetLongPercent: 9999, // effectively "no long target" — matches the deployed script
  targetShortPercent: 8.3,
  commissionPercent: 0.03,
  startTime: Date.parse("2026-02-09T19:30:00+05:30") / 1000,
  useDateRange: false,
  stopMode: "hybrid", // best match to TradingView's Strategy Tester — see README
};

export interface Trade {
  tradeNumber: number;
  side: "buy" | "sell"; // direction of the entry
  entryTime: number;
  entryPrice: number;
  exitTime: number;
  exitPrice: number;
  exitReason:
    | "buy_target"
    | "sell_target"
    | "buy_liq_exit"
    | "buy_dd_exit"
    | "sell_liq_exit"
    | "sell_dd_exit"
    | "buy_tp_ribbon"
    | "sell_tp_ribbon";
  grossPnlPct: number;
  netPnlPct: number; // after 2x commissionPercent round-trip
}

/**
 * Runs the ALM3 XRP T3 strategy bar-by-bar against a 30-min candle series
 * (the strategy's native timeframe — STtimeframeFixed = 30 in the Pine
 * source, matching the chart it was built on, so no higher/lower timeframe
 * resampling is needed for the core signal).
 */
export interface OpenPosition {
  side: "buy" | "sell";
  entryTime: number;
  entryPrice: number;
  switchAchieved: boolean;
  /** Stop that should be working on the exchange from now until the next bar close. */
  stopPrice: number;
  /** Target that should be working on the exchange (very large for longs when targetLongPercent is 9999). */
  targetPrice: number;
  switchPrice: number;
  drawdownPrice: number;
}

export interface EngineResult {
  trades: Trade[];
  /** Position still open after the last candle, or null if flat. */
  open: OpenPosition | null;
  /** open time of the last candle processed */
  lastBarTime: number;
}

export function runALM3XrpT3(candles: Candle[], cfgOverrides: Partial<ALM3XrpT3Config> = {}): Trade[] {
  return runALM3XrpT3State(candles, cfgOverrides).trades;
}

/** Same engine as runALM3XrpT3, but also returns the position left open at the end — what a live runner needs. */
export function runALM3XrpT3State(candles: Candle[], cfgOverrides: Partial<ALM3XrpT3Config> = {}): EngineResult {
  const cfg: ALM3XrpT3Config = { ...ALM3_XRP_T3_DEFAULTS, ...cfgOverrides };
  const n = candles.length;
  const closes = candles.map((c) => c.close);
  const opens = candles.map((c) => c.open);
  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);

  const { supertrend: st, direction } = supertrend(candles, cfg.factor, cfg.atrPeriod);
  const t3Fast = t3(closes, cfg.t3FastLength); // anT3Average
  const t3Slow = t3(closes, cfg.t3SlowLength); // nT3Average

  const greenRibbon = (i: number) => t3Slow[i] < t3Fast[i];
  const redRibbon = (i: number) => t3Slow[i] > t3Fast[i];

  function isAfterStart(i: number): boolean {
    if (cfg.useDateRange && cfg.endTime !== undefined) {
      return candles[i].time >= (cfg.startTime ?? -Infinity) && candles[i].time <= cfg.endTime;
    }
    return cfg.startTime === undefined || candles[i].time >= cfg.startTime;
  }

  function buySignal(i: number): boolean {
    if (i < 2) return false;
    if (isNaN(st[i]) || isNaN(t3Fast[i]) || isNaN(t3Slow[i]) || isNaN(t3Fast[i - 1]) || isNaN(t3Fast[i - 2])) return false;
    if (!isAfterStart(i)) return false;
    if (direction[i] >= 0) return false; // need positiveTrend (direction < 0)
    if (closes[i] < opens[i]) return false;
    const aboveBoth = closes[i] >= t3Fast[i] && closes[i] >= t3Slow[i];
    if (!aboveBoth) return false;
    if (redRibbon(i)) return true;
    if (greenRibbon(i) && redRibbon(i - 1) && redRibbon(i - 2)) return true;
    return false;
  }

  function sellSignal(i: number): boolean {
    if (i < 2) return false;
    if (isNaN(st[i]) || isNaN(t3Fast[i]) || isNaN(t3Slow[i]) || isNaN(t3Fast[i - 1]) || isNaN(t3Fast[i - 2])) return false;
    if (!isAfterStart(i)) return false;
    if (direction[i] <= 0) return false; // need negativeTrend (direction > 0)
    if (closes[i] > opens[i]) return false;
    const belowBoth = closes[i] <= t3Fast[i] && closes[i] <= t3Slow[i];
    if (!belowBoth) return false;
    if (greenRibbon(i)) return true;
    if (redRibbon(i) && greenRibbon(i - 1) && greenRibbon(i - 2)) return true;
    return false;
  }

  const trades: Trade[] = [];
  let position: 0 | 1 | -1 = 0;
  let tradeIndex = 0;
  let entryPrice = 0;
  let entryTime = 0;
  let buyTarget = 0;
  let sellTarget = 0;
  let switchPrice = 0;
  let drawdownPrice = 0;
  let switchAchieved = false;
  let pendingStop = NaN;
  let pendingLimit = NaN;

  function commission(grossPct: number): number {
    return grossPct - 2 * cfg.commissionPercent;
  }

  function openLong(i: number) {
    tradeIndex += 1;
    position = 1;
    entryPrice = closes[i];
    entryTime = candles[i].time;
    buyTarget = entryPrice * (1 + cfg.targetLongPercent / 100);
    switchPrice = entryPrice * (1 + cfg.switchSlPercent / 100);
    drawdownPrice = entryPrice * (1 - cfg.drawdownPercent / 100);
    switchAchieved = false;
    const liquidatePrice = st[i] - st[i] * (cfg.liquidatePercent / 100);
    pendingStop = Math.max(liquidatePrice, drawdownPrice);
    pendingLimit = buyTarget;
  }

  function openShort(i: number) {
    tradeIndex += 1;
    position = -1;
    entryPrice = closes[i];
    entryTime = candles[i].time;
    sellTarget = entryPrice * (1 - cfg.targetShortPercent / 100);
    switchPrice = entryPrice * (1 - cfg.switchSlPercent / 100);
    drawdownPrice = entryPrice * (1 + cfg.drawdownPercent / 100);
    switchAchieved = false;
    const liquidatePrice = st[i] + st[i] * (cfg.liquidatePercent / 100);
    pendingStop = Math.min(liquidatePrice, drawdownPrice);
    pendingLimit = sellTarget;
  }

  function closeTrade(i: number, price: number, reason: Trade["exitReason"]) {
    const grossPct =
      position === 1 ? ((price - entryPrice) / entryPrice) * 100 : ((entryPrice - price) / entryPrice) * 100;
    trades.push({
      tradeNumber: tradeIndex,
      side: position === 1 ? "buy" : "sell",
      entryTime,
      entryPrice,
      exitTime: candles[i].time,
      exitPrice: price,
      exitReason: reason,
      grossPnlPct: grossPct,
      netPnlPct: commission(grossPct),
    });
    position = 0;
  }

  for (let i = 0; i < n; i++) {
    // True when the position was closed by the bar-close logic (ribbon exit, or a
    // stop that the close is already beyond). In Pine with process_orders_on_close
    // that exit fills at this bar's close *after* the script has run, so
    // strategy.position_size is still non-zero while the entry condition is
    // evaluated and no new entry can happen on this bar. (An intrabar stop/target
    // fill, by contrast, has already closed the position before the script runs.)
    let closedAtBarClose = false;
    if (position !== 0) {
      // ---- Phase 1: test the working stop/target against this bar ----
      const mode = cfg.stopMode ?? "intrabar";
      if (mode === "close_cur") {
        // recompute the stop on the current bar before testing it
        if (position === 1) {
          const sl = switchAchieved ? t3Slow[i] : st[i];
          pendingStop = Math.max(sl - sl * (cfg.liquidatePercent / 100), drawdownPrice);
        } else {
          const sl = switchAchieved ? t3Slow[i] : st[i];
          pendingStop = Math.min(sl + sl * (cfg.liquidatePercent / 100), drawdownPrice);
        }
      }
      const useClose = mode === "close" || mode === "close_cur";
      if (position === 1) {
        const hitStop = (useClose ? closes[i] : lows[i]) <= pendingStop;
        const hitTarget = (useClose ? closes[i] : highs[i]) >= pendingLimit;
        const fill = (lvl: number) => (useClose ? closes[i] : lvl);
        if (hitStop) closeTrade(i, fill(pendingStop), pendingStop >= drawdownPrice ? "buy_liq_exit" : "buy_dd_exit");
        else if (hitTarget) closeTrade(i, fill(pendingLimit), "buy_target");
      } else if (position === -1) {
        const hitStop = (useClose ? closes[i] : highs[i]) >= pendingStop;
        const hitTarget = (useClose ? closes[i] : lows[i]) <= pendingLimit;
        const fill = (lvl: number) => (useClose ? closes[i] : lvl);
        if (hitStop) closeTrade(i, fill(pendingStop), pendingStop < drawdownPrice ? "sell_liq_exit" : "sell_dd_exit");
        else if (hitTarget) closeTrade(i, fill(pendingLimit), "sell_target");
      }

      // ---- Phase 2: bar-close logic, only if still open ----
      if (position === 1) {
        if (closes[i] >= switchPrice) switchAchieved = true;
        if (switchAchieved && closes[i] < t3Slow[i]) {
          closeTrade(i, closes[i], "buy_tp_ribbon");
          closedAtBarClose = true;
        } else {
          const buyStopLoss = switchAchieved ? t3Slow[i] : st[i];
          const liquidatePrice = buyStopLoss - buyStopLoss * (cfg.liquidatePercent / 100);
          pendingStop = Math.max(liquidatePrice, drawdownPrice);
          pendingLimit = buyTarget;
          if (cfg.stopMode === "hybrid" && closes[i] <= pendingStop) {
            closeTrade(i, closes[i], pendingStop >= drawdownPrice ? "buy_liq_exit" : "buy_dd_exit");
            closedAtBarClose = true;
          }
        }
      } else if (position === -1) {
        if (closes[i] <= switchPrice) switchAchieved = true;
        if (switchAchieved && closes[i] > t3Slow[i]) {
          closeTrade(i, closes[i], "sell_tp_ribbon");
          closedAtBarClose = true;
        } else {
          const sellStopLoss = switchAchieved ? t3Slow[i] : st[i];
          const liquidatePrice = sellStopLoss + sellStopLoss * (cfg.liquidatePercent / 100);
          pendingStop = Math.min(liquidatePrice, drawdownPrice);
          pendingLimit = sellTarget;
          if (cfg.stopMode === "hybrid" && closes[i] >= pendingStop) {
            closeTrade(i, closes[i], pendingStop < drawdownPrice ? "sell_liq_exit" : "sell_dd_exit");
            closedAtBarClose = true;
          }
        }
      }
    }

    // ---- Fresh entry check (also runs on the same bar a position just closed,
    //      matching Pine's instant position_size update within one bar) ----
    if (position === 0 && !closedAtBarClose) {
      if (buySignal(i)) openLong(i);
      else if (sellSignal(i)) openShort(i);
    }
  }

  const open: OpenPosition | null =
    position === 0
      ? null
      : {
          side: position === 1 ? "buy" : "sell",
          entryTime,
          entryPrice,
          switchAchieved,
          stopPrice: pendingStop,
          targetPrice: pendingLimit,
          switchPrice,
          drawdownPrice,
        };
  return { trades, open, lastBarTime: n ? candles[n - 1].time : 0 };
}
