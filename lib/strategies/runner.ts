// lib/strategies/runner.ts
// Shared utilities: session check, trade simulation, stats

import { Candle, Signal, TradeResult, BacktestStats, StrategyConfig } from "./types";

// Check if a unix timestamp is within IST session
export function isInSession(unix: number, start: string, end: string): boolean {
  const IST_OFFSET = 5.5 * 3600;
  const istSecs = (unix + IST_OFFSET) % 86400;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const startSecs = sh * 3600 + sm * 60;
  const endSecs = eh * 3600 + em * 60;
  return istSecs >= startSecs && istSecs <= endSecs;
}

// Simulate trades from signals against subsequent candles
export function simulateTrades(signals: Signal[], candles: Candle[], config: StrategyConfig): TradeResult[] {
  const trades: TradeResult[] = [];

  for (const sig of signals) {
    if (sig.type !== "long_entry" && sig.type !== "short_entry") continue;
    const side = sig.type === "long_entry" ? "long" : "short";
    const entryIdx = candles.findIndex(c => c.time === sig.time);
    if (entryIdx < 0 || entryIdx >= candles.length - 1) continue;

    let exitPrice = sig.price;
    let exitTime = sig.time;
    let exitReason: TradeResult["exitReason"] = "session_end";

    for (let i = entryIdx + 1; i < candles.length; i++) {
      const c = candles[i];
      const inSess = isInSession(c.time, config.sessionStart, config.sessionEnd);

      if (side === "long") {
        if (c.low <= sig.sl) { exitPrice = sig.sl; exitTime = c.time; exitReason = "sl"; break; }
        if (c.high >= sig.tp) { exitPrice = sig.tp; exitTime = c.time; exitReason = "tp"; break; }
      } else {
        if (c.high >= sig.sl) { exitPrice = sig.sl; exitTime = c.time; exitReason = "sl"; break; }
        if (c.low <= sig.tp) { exitPrice = sig.tp; exitTime = c.time; exitReason = "tp"; break; }
      }

      if (!inSess) { exitPrice = c.close; exitTime = c.time; exitReason = "session_end"; break; }
    }

    const risk = Math.abs(sig.price - sig.sl);
    const pnl = side === "long" ? exitPrice - sig.price : sig.price - exitPrice;
    const pnlR = risk > 0 ? pnl / risk : 0;
    const pnlPct = sig.price > 0 ? (pnl / sig.price) * 100 : 0;

    trades.push({ entryTime: sig.time, exitTime, entryPrice: sig.price, exitPrice, sl: sig.sl, tp: sig.tp, side, exitReason, pnlPct, pnlR });
  }

  return trades;
}

// Compute backtest stats from trades
export function computeStats(trades: TradeResult[]): BacktestStats {
  if (trades.length === 0) {
    return { totalTrades: 0, wins: 0, losses: 0, winRate: 0, totalPnlR: 0, avgWinR: 0, avgLossR: 0, maxDrawdownR: 0, profitFactor: 0 };
  }

  const wins = trades.filter(t => t.pnlR > 0);
  const losses = trades.filter(t => t.pnlR <= 0);
  const totalPnlR = trades.reduce((s, t) => s + t.pnlR, 0);
  const grossWin = wins.reduce((s, t) => s + t.pnlR, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnlR, 0));

  // Max drawdown in R
  let peak = 0, equity = 0, maxDD = 0;
  for (const t of trades) {
    equity += t.pnlR;
    if (equity > peak) peak = equity;
    const dd = peak - equity;
    if (dd > maxDD) maxDD = dd;
  }

  return {
    totalTrades: trades.length,
    wins: wins.length,
    losses: losses.length,
    winRate: (wins.length / trades.length) * 100,
    totalPnlR: totalPnlR,
    avgWinR: wins.length > 0 ? grossWin / wins.length : 0,
    avgLossR: losses.length > 0 ? grossLoss / losses.length : 0,
    maxDrawdownR: maxDD,
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? 999 : 0,
  };
}
