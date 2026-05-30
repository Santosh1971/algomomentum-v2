// lib/pnlEngine.ts
// Computes PnL from Delta Exchange fills API — no local trade storage

import { getAllFills } from "@/lib/deltaClient";
import { DateTime } from "luxon";

export interface FillSummary {
  date: string;        // IST date "YYYY-MM-DD"
  symbol: string;
  grossPnl: number;
  commissions: number;
  netPnl: number;
  fillsCount: number;
}

export interface CoinSummary {
  symbol: string;
  grossPnl: number;
  commissions: number;
  netPnl: number;
  tradesCount: number;
}

export interface PnlReport {
  totalGrossPnl: number;
  totalCommissions: number;
  totalNetPnl: number;
  totalTrades: number;
  dailyBreakdown: FillSummary[];
  coinBreakdown: CoinSummary[];
  equityCurve: { date: string; cumPnl: number }[];
}

/** Convert UTC timestamp (microseconds from Delta API) to IST date string */
function toISTDate(utcMicros: number): string {
  const ms = Math.floor(utcMicros / 1000);
  return DateTime.fromMillis(ms, { zone: "UTC" })
    .setZone("Asia/Kolkata")
    .toFormat("yyyy-MM-dd");
}

/** Core: compute PnL report from Delta fills for a given symbol + date range */
export async function computePnlReport(
  apiKeyEnc: string,
  apiSecretEnc: string,
  product_symbol: string,
  fromIST: string,   // "YYYY-MM-DD"
  toIST: string,     // "YYYY-MM-DD"
): Promise<PnlReport> {
  // Convert IST date range to UTC timestamps (microseconds)
  const startUTC = DateTime.fromISO(fromIST, { zone: "Asia/Kolkata" }).startOf("day").toUTC().toMillis();
  const endUTC = DateTime.fromISO(toIST, { zone: "Asia/Kolkata" }).endOf("day").toUTC().toMillis();

  const fills = await getAllFills(apiKeyEnc, apiSecretEnc, {
    product_symbol,
    start_time: startUTC * 1000, // Delta uses microseconds
    end_time: endUTC * 1000,
  });

  const dailyMap = new Map<string, FillSummary>();
  const coinMap = new Map<string, CoinSummary>();

  let totalGross = 0;
  let totalComm = 0;
  let totalTrades = 0;

  for (const fill of fills) {
    // Only closing fills count for PnL
    const newSize = fill?.meta_data?.new_position?.size;
    if (newSize === undefined) continue;
    // IMPORTANT: strict equality — 0 is falsy in JS, must use === 0
    if (newSize !== 0) continue;

    const pnl = parseFloat(fill?.meta_data?.new_position?.realized_pnl ?? "0");
    const comm = parseFloat(fill?.paid_commission ?? "0");
    const symbol = fill?.product_symbol ?? product_symbol;
    const dateIST = toISTDate(fill?.created_at ?? 0);

    totalGross += pnl;
    totalComm += comm;
    totalTrades++;

    // Daily breakdown
    if (!dailyMap.has(dateIST)) {
      dailyMap.set(dateIST, { date: dateIST, symbol, grossPnl: 0, commissions: 0, netPnl: 0, fillsCount: 0 });
    }
    const day = dailyMap.get(dateIST)!;
    day.grossPnl += pnl;
    day.commissions += comm;
    day.netPnl = day.grossPnl - day.commissions;
    day.fillsCount++;

    // Coin breakdown
    if (!coinMap.has(symbol)) {
      coinMap.set(symbol, { symbol, grossPnl: 0, commissions: 0, netPnl: 0, tradesCount: 0 });
    }
    const coin = coinMap.get(symbol)!;
    coin.grossPnl += pnl;
    coin.commissions += comm;
    coin.netPnl = coin.grossPnl - coin.commissions;
    coin.tradesCount++;
  }

  // Sort daily by date
  const dailyBreakdown = Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date));

  // Build equity curve
  let cum = 0;
  const equityCurve = dailyBreakdown.map((d) => {
    cum += d.netPnl;
    return { date: d.date, cumPnl: parseFloat(cum.toFixed(4)) };
  });

  return {
    totalGrossPnl: parseFloat(totalGross.toFixed(4)),
    totalCommissions: parseFloat(totalComm.toFixed(4)),
    totalNetPnl: parseFloat((totalGross - totalComm).toFixed(4)),
    totalTrades,
    dailyBreakdown,
    coinBreakdown: Array.from(coinMap.values()),
    equityCurve,
  };
}

/** Compute PnL for ALL symbols of a user's trade configs for a month */
export async function computeMonthlyPnl(
  apiKeyEnc: string,
  apiSecretEnc: string,
  symbols: string[],
  monthIST: string, // "YYYY-MM"
): Promise<number> {
  const [year, month] = monthIST.split("-").map(Number);
  const from = DateTime.local(year, month, 1, { zone: "Asia/Kolkata" }).toFormat("yyyy-MM-dd");
  const to = DateTime.local(year, month, 1, { zone: "Asia/Kolkata" }).endOf("month").toFormat("yyyy-MM-dd");

  let totalNetPnl = 0;
  for (const symbol of symbols) {
    const report = await computePnlReport(apiKeyEnc, apiSecretEnc, symbol, from, to);
    totalNetPnl += report.totalNetPnl;
  }
  return parseFloat(totalNetPnl.toFixed(4));
}
