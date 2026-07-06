// lib/dashboardStatsCron.ts
// Runs every 15 minutes: walks all active bots once, computes PnL via the
// existing pnlEngine, and caches both platform-wide (per symbol + ALL) and
// per-user (per symbol + ALL) aggregates. Dashboards read the cache instead
// of hitting Delta's API on every page view.

import cron from "node-cron";
import { prisma } from "@/lib/prisma";
import { computePnlReport, TradeRow } from "@/lib/pnlEngine";
import { DateTime } from "luxon";

let started = false;
const ALL = "ALL";

function emptyAgg() {
  return { trades: [] as TradeRow[] };
}

function computeEquityCurve(trades: TradeRow[]) {
  const sorted = trades.slice().sort((a, b) => a.exitTime.localeCompare(b.exitTime));
  let cum = 0;
  return sorted.map(t => {
    cum += t.netPnl;
    return { date: t.exitTime.slice(0, 10), cumPnl: Math.round(cum * 100) / 100 };
  });
}

function summarize(trades: TradeRow[], monthStart: string) {
  const totalRealizedPnl = trades.reduce((s, t) => s + t.grossPnl, 0);
  const totalNetPnl = trades.reduce((s, t) => s + t.netPnl, 0);
  const totalDeltaCharge = trades.reduce((s, t) => s + (t.grossPnl - t.netPnl), 0);
  const monthlyTrades = trades.filter(t => t.exitTime.slice(0, 10) >= monthStart);
  const monthlyRealizedPnl = monthlyTrades.reduce((s, t) => s + t.grossPnl, 0);
  const monthlyNetPnl = monthlyTrades.reduce((s, t) => s + t.netPnl, 0);
  const monthlyDeltaCharge = monthlyTrades.reduce((s, t) => s + (t.grossPnl - t.netPnl), 0);
  const wins = trades.filter(t => t.netPnl > 0).length;
  return {
    totalRealizedPnl, totalNetPnl, monthlyRealizedPnl, monthlyNetPnl, totalDeltaCharge, monthlyDeltaCharge,
    totalTrades: trades.length,
    winRate: trades.length ? Math.round((wins / trades.length) * 1000) / 10 : 0,
    avgProfitLoss: trades.length ? totalNetPnl / trades.length : 0,
    avgTradeSize: trades.length ? trades.reduce((s, t) => s + (t.notionalValue || 0), 0) / trades.length : 0,
    equityCurve: computeEquityCurve(trades),
  };
}

export async function refreshDashboardStats() {
  const nowIST = DateTime.now().setZone("Asia/Kolkata");
  const monthStart = nowIST.startOf("month").toFormat("yyyy-MM-dd");
  const from = "2020-01-01";
  const to = nowIST.toFormat("yyyy-MM-dd");

  const allConfigs = await prisma.tradeConfig.findMany({
    select: {
      userId: true, isActive: true, userActive: true, amount: true, script: true,
      account: { select: { api_key_enc: true, api_secret_enc: true, is_oauth: true, oauth_access_token: true } },
    },
  });

  const activeConfigs = allConfigs.filter(c => c.isActive && c.userActive);
  const inactiveConfigs = allConfigs.filter(c => !(c.isActive && c.userActive));

  // Platform bot counts/allocation, both per-symbol and ALL
  const platformBots = new Map<string, { activeBots: number; inactiveBots: number; activeAlloc: number; inactiveAlloc: number }>();
  const bump = (symbol: string, active: boolean, amount: number) => {
    const cur = platformBots.get(symbol) ?? { activeBots: 0, inactiveBots: 0, activeAlloc: 0, inactiveAlloc: 0 };
    if (active) { cur.activeBots++; cur.activeAlloc += amount; } else { cur.inactiveBots++; cur.inactiveAlloc += amount; }
    platformBots.set(symbol, cur);
  };
  for (const c of activeConfigs) { bump(c.script, true, c.amount); bump(ALL, true, c.amount); }
  for (const c of inactiveConfigs) { bump(c.script, false, c.amount); bump(ALL, false, c.amount); }

  // Fetch trades for every active bot once
  const results = await Promise.allSettled(
    activeConfigs.map(async c => {
      const oauthToken = c.account.is_oauth ? c.account.oauth_access_token : null;
      const report = await computePnlReport(c.account.api_key_enc, c.account.api_secret_enc, c.script, from, to, oauthToken);
      return { userId: c.userId, symbol: c.script, trades: report.trades };
    })
  );

  const platformTradesBySymbol = new Map<string, TradeRow[]>();
  const userTradesByUserSymbol = new Map<string, TradeRow[]>(); // key `${userId}::${symbol}`
  const userTradesByUserAll = new Map<string, TradeRow[]>();

  for (const r of results) {
    if (r.status !== "fulfilled") continue;
    const { userId, symbol, trades } = r.value;

    if (!platformTradesBySymbol.has(symbol)) platformTradesBySymbol.set(symbol, []);
    platformTradesBySymbol.get(symbol)!.push(...trades);

    const key = `${userId}::${symbol}`;
    if (!userTradesByUserSymbol.has(key)) userTradesByUserSymbol.set(key, []);
    userTradesByUserSymbol.get(key)!.push(...trades);

    if (!userTradesByUserAll.has(userId)) userTradesByUserAll.set(userId, []);
    userTradesByUserAll.get(userId)!.push(...trades);
  }

  // --- Upsert PlatformStats: one row per symbol + one ALL row ---
  const allPlatformTrades: TradeRow[] = [];
  for (const trades of platformTradesBySymbol.values()) allPlatformTrades.push(...trades);

  const platformSymbols = new Set([...platformTradesBySymbol.keys(), ...platformBots.keys()]);
  for (const symbol of platformSymbols) {
    const trades = symbol === ALL ? allPlatformTrades : (platformTradesBySymbol.get(symbol) ?? []);
    const bots = platformBots.get(symbol) ?? { activeBots: 0, inactiveBots: 0, activeAlloc: 0, inactiveAlloc: 0 };
    const s = summarize(trades, monthStart);
    await prisma.platformStats.upsert({
      where: { symbol },
      create: {
        symbol, activeBots: bots.activeBots, inactiveBots: bots.inactiveBots,
        activeBotsAllocInr: bots.activeAlloc, inactiveBotsAllocInr: bots.inactiveAlloc,
        totalRealizedPnl: s.totalRealizedPnl, totalNetPnl: s.totalNetPnl,
        monthlyRealizedPnl: s.monthlyRealizedPnl, monthlyNetPnl: s.monthlyNetPnl,
        totalDeltaCharge: s.totalDeltaCharge, monthlyDeltaCharge: s.monthlyDeltaCharge,
        equityCurve: s.equityCurve,
      },
      update: {
        activeBots: bots.activeBots, inactiveBots: bots.inactiveBots,
        activeBotsAllocInr: bots.activeAlloc, inactiveBotsAllocInr: bots.inactiveAlloc,
        totalRealizedPnl: s.totalRealizedPnl, totalNetPnl: s.totalNetPnl,
        monthlyRealizedPnl: s.monthlyRealizedPnl, monthlyNetPnl: s.monthlyNetPnl,
        totalDeltaCharge: s.totalDeltaCharge, monthlyDeltaCharge: s.monthlyDeltaCharge,
        equityCurve: s.equityCurve,
      },
    });
  }

  // --- Upsert UserDashboardStats: one row per (user, symbol) + one (user, ALL) row ---
  for (const [key, trades] of userTradesByUserSymbol) {
    const [userId, symbol] = key.split("::");
    const s = summarize(trades, monthStart);
    await prisma.userDashboardStats.upsert({
      where: { userId_symbol: { userId, symbol } },
      create: { userId, symbol, ...s },
      update: { ...s },
    });
  }
  for (const [userId, trades] of userTradesByUserAll) {
    const s = summarize(trades, monthStart);
    await prisma.userDashboardStats.upsert({
      where: { userId_symbol: { userId, symbol: ALL } },
      create: { userId, symbol: ALL, ...s },
      update: { ...s },
    });
  }

  console.log(`[DashboardStatsCron] ✓ ${activeConfigs.length} active / ${inactiveConfigs.length} inactive bots, ${platformSymbols.size} symbols, ${userTradesByUserAll.size} users`);
}

export function startDashboardStatsCron() {
  if (started) return;
  started = true;

  setTimeout(() => { refreshDashboardStats().catch(e => console.error("[DashboardStatsCron] Fatal (initial run):", e)); }, 10_000);

  cron.schedule("*/15 * * * *", async () => {
    try {
      await refreshDashboardStats();
    } catch (e) {
      console.error("[DashboardStatsCron] Fatal:", e);
    }
  });

  console.log("[DashboardStatsCron] Scheduled — refreshes every 15 minutes");
}
