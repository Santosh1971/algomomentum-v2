// lib/strategyEngine/backtestRunner.ts
//
// Turns a Trade[] from the engine into the exact same stats shape
// lib/parseBacktest.ts produces from a TradingView export (equityData,
// totalPnlPct, winRate, maxDrawdown, profitFactor, totalTrades,
// backtestTrades) — so a native backtest can be stored on the same
// Strategy/StrategyTrade rows and rendered by the existing admin UI
// unchanged.

import { Trade } from "./alm3XrpT3";

export interface EquityPoint {
  date: string; // ISO
  equity: number;
}

export interface BacktestStats {
  equityData: EquityPoint[];
  totalPnlPct: number | null;
  winRate: number | null;
  maxDrawdown: number; // percent
  profitFactor: number | null;
  totalTrades: number;
  backtestTrades: Array<{
    tradeNumber: number;
    type: string;
    side: "buy" | "sell";
    signal: string;
    price: number;
    size: number;
    netPnlUsd: number;
    netPnlPct: number;
    cumulativePnlUsd: number;
    firedAt: string;
  }>;
}

/**
 * Compounds trades sequentially against a starting capital, applying each
 * trade's netPnlPct to the running equity (matches
 * default_qty_type=percent_of_equity, default_qty_value=100 in the Pine
 * source — i.e. the full account re-enters each trade).
 */
export function computeBacktestStats(trades: Trade[], initialCapitalUsd = 1000): BacktestStats {
  let equity = initialCapitalUsd;
  let peak = equity;
  let maxDrawdown = 0;
  let wins = 0;
  let losses = 0;
  let grossProfitUsd = 0;
  let grossLossUsd = 0;

  const equityData: EquityPoint[] = [
    { date: trades.length ? new Date(trades[0].entryTime * 1000).toISOString() : new Date().toISOString(), equity },
  ];
  const backtestTrades: BacktestStats["backtestTrades"] = [];

  for (const t of trades) {
    const pnlUsd = equity * (t.netPnlPct / 100);
    equity += pnlUsd;

    if (pnlUsd > 0) {
      wins++;
      grossProfitUsd += pnlUsd;
    } else if (pnlUsd < 0) {
      losses++;
      grossLossUsd += Math.abs(pnlUsd);
    }

    if (equity > peak) peak = equity;
    const dd = peak > 0 ? (peak - equity) / peak : 0;
    if (dd > maxDrawdown) maxDrawdown = dd;

    const exitDate = new Date(t.exitTime * 1000).toISOString();
    equityData.push({ date: exitDate, equity });

    backtestTrades.push({
      tradeNumber: t.tradeNumber,
      type: `EXIT ${t.tradeNumber} ${t.side === "buy" ? "buy" : "sell"}`,
      side: t.side,
      signal: t.exitReason,
      price: t.exitPrice,
      size: 0, // filled in by the caller once position sizing is wired up
      netPnlUsd: pnlUsd,
      netPnlPct: t.netPnlPct,
      cumulativePnlUsd: equity - initialCapitalUsd,
      firedAt: exitDate,
    });
  }

  const totalTrades = wins + losses;
  const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : null;
  const profitFactor = grossLossUsd > 0 ? grossProfitUsd / grossLossUsd : null;
  const totalPnlPct = ((equity - initialCapitalUsd) / initialCapitalUsd) * 100; // profit %, same meaning as parseBacktest.ts

  return {
    equityData,
    totalPnlPct: Math.round(totalPnlPct * 100) / 100,
    winRate: winRate !== null ? Math.round(winRate * 100) / 100 : null,
    maxDrawdown: Math.round(maxDrawdown * 10000) / 100,
    profitFactor: profitFactor !== null ? Math.round(profitFactor * 1000) / 1000 : null,
    totalTrades,
    backtestTrades,
  };
}
