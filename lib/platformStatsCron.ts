// lib/platformStatsCron.ts
// Runs every 15 minutes: aggregates bot counts + PnL + Delta charges across
// all active bots, caches into PlatformStats singleton row so the admin
// dashboard reads instantly instead of hitting Delta's API on every page view.

import cron from "node-cron";
import { prisma } from "@/lib/prisma";
import { computePnlReport } from "@/lib/pnlEngine";
import { DateTime } from "luxon";

let started = false;

export async function refreshPlatformStats() {
  const nowIST = DateTime.now().setZone("Asia/Kolkata");
  const monthStart = nowIST.startOf("month").toFormat("yyyy-MM-dd");
  const from = "2020-01-01";
  const to = nowIST.toFormat("yyyy-MM-dd");

  const allConfigs = await prisma.tradeConfig.findMany({
    select: {
      isActive: true, userActive: true, amount: true, script: true,
      account: { select: { api_key_enc: true, api_secret_enc: true, is_oauth: true, oauth_access_token: true } },
    },
  });

  const activeConfigs = allConfigs.filter(c => c.isActive && c.userActive);
  const inactiveConfigs = allConfigs.filter(c => !(c.isActive && c.userActive));

  const activeBotsAllocInr = activeConfigs.reduce((s, c) => s + c.amount, 0);
  const inactiveBotsAllocInr = inactiveConfigs.reduce((s, c) => s + c.amount, 0);

  const reports = await Promise.allSettled(
    activeConfigs.map(c => {
      const oauthToken = c.account.is_oauth ? c.account.oauth_access_token : null;
      return computePnlReport(c.account.api_key_enc, c.account.api_secret_enc, c.script, from, to, oauthToken);
    })
  );

  const allTrades = reports
    .filter((r): r is PromiseFulfilledResult<any> => r.status === "fulfilled")
    .flatMap(r => r.value.trades);

  const totalRealizedPnl = allTrades.reduce((s, t) => s + t.grossPnl, 0);
  const totalNetPnl = allTrades.reduce((s, t) => s + t.netPnl, 0);
  const totalDeltaCharge = allTrades.reduce((s, t) => s + (t.grossPnl - t.netPnl), 0);

  const monthlyTrades = allTrades.filter(t => t.exitTime.slice(0, 10) >= monthStart);
  const monthlyRealizedPnl = monthlyTrades.reduce((s, t) => s + t.grossPnl, 0);
  const monthlyNetPnl = monthlyTrades.reduce((s, t) => s + t.netPnl, 0);
  const monthlyDeltaCharge = monthlyTrades.reduce((s, t) => s + (t.grossPnl - t.netPnl), 0);

  await prisma.platformStats.upsert({
    where: { id: "singleton" },
    create: {
      id: "singleton", activeBots: activeConfigs.length, inactiveBots: inactiveConfigs.length,
      activeBotsAllocInr, inactiveBotsAllocInr,
      totalRealizedPnl, totalNetPnl, monthlyRealizedPnl, monthlyNetPnl,
      totalDeltaCharge, monthlyDeltaCharge,
    },
    update: {
      activeBots: activeConfigs.length, inactiveBots: inactiveConfigs.length,
      activeBotsAllocInr, inactiveBotsAllocInr,
      totalRealizedPnl, totalNetPnl, monthlyRealizedPnl, monthlyNetPnl,
      totalDeltaCharge, monthlyDeltaCharge,
    },
  });

  console.log(`[PlatformStatsCron] ✓ ${activeConfigs.length} active / ${inactiveConfigs.length} inactive bots, ${allTrades.length} trades`);
}

export function startPlatformStatsCron() {
  if (started) return;
  started = true;

  // Run once shortly after boot, then every 15 minutes
  setTimeout(() => { refreshPlatformStats().catch(e => console.error("[PlatformStatsCron] Fatal (initial run):", e)); }, 10_000);

  cron.schedule("*/15 * * * *", async () => {
    try {
      await refreshPlatformStats();
    } catch (e) {
      console.error("[PlatformStatsCron] Fatal:", e);
    }
  });

  console.log("[PlatformStatsCron] Scheduled — refreshes every 15 minutes");
}
