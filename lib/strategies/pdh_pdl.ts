// lib/strategies/pdh_pdl.ts
// PDH/PDL Breakout + Retest strategy

import { Candle, Signal, StrategyConfig, BacktestResult, TradeResult } from "./types";
import { computeStats, isInSession, simulateTrades } from "./runner";

export function runPdhPdl(candles: Candle[], dailyCandles: Candle[], config: StrategyConfig): BacktestResult {
  if (candles.length < 2 || dailyCandles.length < 2) {
    return { signals: [], trades: [], stats: computeStats([]) };
  }

  const signals: Signal[] = [];
  const buffer = (config.retestBuffer ?? 0.2) / 100;
  const rr = config.rr ?? 2;

  // Build a map of date → PDH/PDL using previous day's candle
  // Key: "YYYY-MM-DD" in IST, value: { pdh, pdl }
  function toISTDate(unix: number): string {
    const d = new Date((unix + 5.5 * 3600) * 1000);
    return d.toISOString().slice(0, 10);
  }

  const dailyMap = new Map<string, { pdh: number; pdl: number }>();
  for (let i = 1; i < dailyCandles.length; i++) {
    const prevDay = dailyCandles[i - 1];
    const currDate = toISTDate(dailyCandles[i].time);
    dailyMap.set(currDate, { pdh: prevDay.high, pdl: prevDay.low });
  }

  // State machine per level
  type LevelState = "watching" | "broken" | "retesting" | "traded";
  const state = { long: "watching" as LevelState, short: "watching" as LevelState };
  let breakPrice = { long: 0, short: 0 };
  let currentPDH = 0, currentPDL = 0;
  let currentDate = "";
  let inTrade = false;

  for (let i = 1; i < candles.length; i++) {
    const c = candles[i];
    const prev = candles[i - 1];
    const date = toISTDate(c.time);
    const inSess = isInSession(c.time, config.sessionStart, config.sessionEnd);

    // Update PDH/PDL when day changes
    if (date !== currentDate) {
      currentDate = date;
      const levels = dailyMap.get(date);
      if (levels) { currentPDH = levels.pdh; currentPDL = levels.pdl; }
      state.long = "watching";
      state.short = "watching";
      inTrade = false;
    }

    if (!currentPDH || !currentPDL || !inSess || inTrade) continue;

    // ── LONG SETUP ──
    // Step 1: Candle closes above PDH → "broken"
    if (state.long === "watching" && prev.close < currentPDH && c.close > currentPDH) {
      state.long = "broken";
      breakPrice.long = c.close;
    }
    // Step 2: Price pulls back into PDH zone → "retesting"
    if (state.long === "broken" && c.low <= currentPDH * (1 + buffer) && c.low >= currentPDH * (1 - buffer)) {
      state.long = "retesting";
    }
    // Step 3: Candle closes back above PDH after retest → ENTRY
    if (state.long === "retesting" && c.close > currentPDH) {
      const entryPrice = c.close;
      const sl = currentPDH * (1 - buffer);
      const risk = entryPrice - sl;
      const tp = entryPrice + risk * rr;
      signals.push({ time: c.time, type: "long_entry", price: entryPrice, sl, tp, label: "PDH Break+Retest" });
      state.long = "traded";
      inTrade = true;
    }

    // ── SHORT SETUP ──
    if (state.short === "watching" && prev.close > currentPDL && c.close < currentPDL) {
      state.short = "broken";
      breakPrice.short = c.close;
    }
    if (state.short === "broken" && c.high >= currentPDL * (1 - buffer) && c.high <= currentPDL * (1 + buffer)) {
      state.short = "retesting";
    }
    if (state.short === "retesting" && c.close < currentPDL) {
      const entryPrice = c.close;
      const sl = currentPDL * (1 + buffer);
      const risk = sl - entryPrice;
      const tp = entryPrice - risk * rr;
      signals.push({ time: c.time, type: "short_entry", price: entryPrice, sl, tp, label: "PDL Break+Retest" });
      state.short = "traded";
      inTrade = true;
    }
  }

  const trades = simulateTrades(signals, candles, config);
  const stats = computeStats(trades);

  // Use last known PDH/PDL for chart overlay
  const lastDate = toISTDate(candles[candles.length - 1].time);
  const lastLevels = dailyMap.get(lastDate);

  return { signals, trades, stats, pdh: lastLevels?.pdh, pdl: lastLevels?.pdl };
}
