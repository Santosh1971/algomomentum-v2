// lib/pnlEngine.ts
import { getAllFills, getAllFillsOAuth } from "@/lib/deltaClient";
import { prisma } from "@/lib/prisma";
import { DateTime } from "luxon";

export interface FillSummary {
  date: string;
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

export interface TradeRow {
  entryTime: string;
  exitTime: string;
  entryPrice: number;
  exitPrice: number;
  side: string;       // "buy" | "sell"
  size: number;
  contractSize: number;
  notionalValue: number; // size × contractSize × exitPrice
  grossPnl: number;
  commission: number;
  netPnl: number;
  status: string;     // "win" | "loss"
}

export interface PnlReport {
  totalGrossPnl: number;
  totalCommissions: number;
  totalNetPnl: number;
  totalTrades: number;
  winRate: number;        // percentage 0-100
  maxDrawdown: number;    // in USD, negative value
  dailyBreakdown: FillSummary[];
  coinBreakdown: CoinSummary[];
  equityCurve: { date: string; cumPnl: number; equity: number }[];
  trades: TradeRow[];
}

function toISTDate(createdAt: number | string): string {
  if (typeof createdAt === "string") {
    return DateTime.fromISO(createdAt, { zone: "UTC" })
      .setZone("Asia/Kolkata")
      .toFormat("yyyy-MM-dd");
  }
  const ms = createdAt > 1e15 ? Math.floor(createdAt / 1000) : createdAt;
  return DateTime.fromMillis(ms, { zone: "UTC" })
    .setZone("Asia/Kolkata")
    .toFormat("yyyy-MM-dd");
}

function toISTDateTime(createdAt: number | string): string {
  if (typeof createdAt === "string") {
    return DateTime.fromISO(createdAt, { zone: "UTC" })
      .setZone("Asia/Kolkata")
      .toFormat("yyyy-MM-dd HH:mm:ss");
  }
  const ms = createdAt > 1e15 ? Math.floor(createdAt / 1000) : createdAt;
  return DateTime.fromMillis(ms, { zone: "UTC" })
    .setZone("Asia/Kolkata")
    .toFormat("yyyy-MM-dd HH:mm:ss");
}

export async function computePnlReport(
  apiKeyEnc: string,
  apiSecretEnc: string,
  product_symbol: string,
  fromIST: string,
  toIST: string,
  oauthToken?: string | null,
): Promise<PnlReport> {
  const startUTC = DateTime.fromISO(fromIST, { zone: "Asia/Kolkata" }).startOf("day").toUTC().toMillis();
  const endUTC = DateTime.fromISO(toIST, { zone: "Asia/Kolkata" }).endOf("day").toUTC().toMillis();

  const fills = oauthToken
    ? await getAllFillsOAuth(oauthToken, {
        product_symbol,
        start_time: startUTC * 1000,
        end_time: endUTC * 1000,
      })
    : await getAllFills(apiKeyEnc, apiSecretEnc, {
        product_symbol,
        start_time: startUTC * 1000,
        end_time: endUTC * 1000,
      });

  // Fetch contract size (lot) from Script table — e.g. DUSK=100, SOL=1, ETH=0.01
  const scriptRecord = await prisma.script.findUnique({ where: { symbol: product_symbol } });
  const contractSize = scriptRecord?.lot ?? 1;

  const dailyMap = new Map<string, FillSummary>();
  const coinMap = new Map<string, CoinSummary>();
  const trades: TradeRow[] = [];

  let totalGross = 0;
  let totalComm = 0;
  let totalTrades = 0;
  let wins = 0;

  // Track open position per symbol to avoid cross-symbol contamination
  const entryFillMap = new Map<string, any>();
  const entryLotsMap = new Map<string, number>(); // accumulated lots per position

  // Sort fills oldest-first for entry/exit matching
  const sorted = [...fills].sort((a, b) => {
    const ta = typeof a.created_at === "string" ? new Date(a.created_at).getTime() : a.created_at;
    const tb = typeof b.created_at === "string" ? new Date(b.created_at).getTime() : b.created_at;
    return ta - tb;
  });

  for (const fill of sorted) {
    // Strict symbol filter — skip fills that don't match the requested symbol
    const fillProductSymbol = fill?.product_symbol ?? "";
    if (fillProductSymbol && fillProductSymbol !== product_symbol) continue;

    const newSize = fill?.meta_data?.new_position?.size;
    const prevSize = fill?.meta_data?.previous_position?.size ?? fill?.meta_data?.old_position?.size ?? null;

    // Track entry fill per symbol: position opens when prev size is 0 or null and new size != 0
    const fillSymbol = fill?.product_symbol ?? product_symbol;
    if ((prevSize === 0 || prevSize === null || prevSize === undefined) && newSize !== 0) {
      entryFillMap.set(fillSymbol, fill);
      entryLotsMap.set(fillSymbol, parseFloat(fill?.size ?? fill?.quantity ?? "0"));
    } else if (newSize !== 0 && prevSize !== 0 && prevSize !== null && prevSize !== undefined) {
      // Accumulate lots for partial fills that add to existing position
      const existing = entryLotsMap.get(fillSymbol) ?? 0;
      entryLotsMap.set(fillSymbol, existing + parseFloat(fill?.size ?? fill?.quantity ?? "0"));
    }

    // Closing fill: new position size === 0
    if (newSize !== 0) continue;

    const pnl = parseFloat(fill?.meta_data?.new_position?.realized_pnl ?? "0");
    const comm = parseFloat(fill?.paid_commission ?? fill?.commission ?? fill?.fees ?? "0");
    const symbol = fill?.product_symbol ?? product_symbol;
    const dateIST = toISTDate(fill?.created_at ?? 0);

    totalGross += pnl;
    totalComm += comm;
    totalTrades++;
    if (pnl > 0) wins++;

    // Build trade row
    const closingSymbol = fill?.product_symbol ?? product_symbol;
    const entryFill = entryFillMap.get(closingSymbol) ?? null;
    const exitPrice = parseFloat(fill?.price ?? fill?.fill_price ?? "0");
    const entryPrice = entryFill ? parseFloat(entryFill?.price ?? entryFill?.fill_price ?? "0") : 0;
    const side = entryFill?.side ?? fill?.side ?? "buy";

    // order_size = total order size in lots (matches Delta Order History Qty column)
    const orderSize = parseFloat(fill?.meta_data?.order_size ?? "0");
    const size = orderSize > 0 ? orderSize : parseFloat(fill?.size ?? fill?.quantity ?? "0");


    const notionalValue = parseFloat((size * contractSize * exitPrice).toFixed(2));
    trades.push({
      entryTime: entryFill ? toISTDateTime(entryFill.created_at) : toISTDateTime(fill.created_at),
      exitTime: toISTDateTime(fill.created_at),
      entryPrice,
      exitPrice,
      side,
      size,
      contractSize,
      notionalValue,
      grossPnl: parseFloat(pnl.toFixed(4)),
      commission: parseFloat(comm.toFixed(4)),
      netPnl: parseFloat((pnl - comm).toFixed(4)),
      status: pnl > 0 ? "win" : "loss",
    });

    entryFillMap.delete(closingSymbol);
    entryLotsMap.delete(closingSymbol);

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

  const dailyBreakdown = Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date));

  // Build equity curve:
  // equity = absolute notional value (size × contractSize × exitPrice) per closing trade
  // cumPnl = running net PnL from 0
  // Filter out tiny/test trades (notionalValue < $50) from equity curve to avoid noise spikes
  const MIN_NOTIONAL_FOR_EQUITY = 50;
  let cum = 0;
  let peak = 0;
  let maxDrawdown = 0;
  const sortedTrades = trades.slice().sort((a, b) => a.exitTime.localeCompare(b.exitTime));
  const equityCurve = sortedTrades
    .filter((t) => t.notionalValue >= MIN_NOTIONAL_FOR_EQUITY)
    .map((t) => {
    cum += t.netPnl;
    if (cum > peak) peak = cum;
    const dd = cum - peak;
    if (dd < maxDrawdown) maxDrawdown = dd;
    return {
      date: t.exitTime.slice(0, 10),
      cumPnl: parseFloat(cum.toFixed(2)),
      equity: t.notionalValue,
    };
  });

  const winRate = totalTrades > 0 ? parseFloat(((wins / totalTrades) * 100).toFixed(1)) : 0;

  return {
    totalGrossPnl: parseFloat(totalGross.toFixed(4)),
    totalCommissions: parseFloat(totalComm.toFixed(4)),
    totalNetPnl: parseFloat((totalGross - totalComm).toFixed(4)),
    totalTrades,
    winRate,
    maxDrawdown: parseFloat(maxDrawdown.toFixed(4)),
    dailyBreakdown,
    coinBreakdown: Array.from(coinMap.values()),
    equityCurve,
    trades: trades.sort((a, b) => b.exitTime.localeCompare(a.exitTime)), // newest first
  };
}

export async function computeMonthlyPnl(
  apiKeyEnc: string,
  apiSecretEnc: string,
  symbols: string[],
  monthIST: string,
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

