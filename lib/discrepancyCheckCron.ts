// lib/discrepancyCheckCron.ts
// Runs every hour. For each active strategy, checks whether any subscriber's
// bot has stopped while others are still running, or shows negative P&L while
// the majority of subscribers on the same strategy are positive — either can
// indicate a bot-specific problem worth an admin looking into. If anything is
// found, emails every admin a single summary.

import cron from "node-cron";
import { prisma } from "@/lib/prisma";
import { getPositions, getPositionsOAuth } from "@/lib/deltaClient";

let started = false;

export function startDiscrepancyCheckCron() {
  if (started) return;
  started = true;

  cron.schedule("0 * * * *", async () => {
    try {
      await checkDiscrepancies();
    } catch (e) {
      console.error("[DiscrepancyCheckCron] Fatal:", e);
    }
  }, {
    timezone: "UTC",
  });

  console.log("[DiscrepancyCheckCron] Scheduled — checks every hour");
}

async function checkDiscrepancies() {
  const strategies = await prisma.strategy.findMany({
    where: { isActive: true },
    include: {
      subscribers: {
        where: { isSubscription: true },
        include: {
          account: { select: { api_key_enc: true, api_secret_enc: true, is_oauth: true, oauth_access_token: true } },
          user: { select: { name: true, email: true } },
        },
      },
    },
  });

  const issues: string[] = [];

  for (const strategy of strategies) {
    const activeSubs = strategy.subscribers.filter(tc => tc.isActive && tc.userActive);
    const stoppedSubs = strategy.subscribers.filter(tc => !tc.isActive || !tc.userActive);

    // A bot went inactive while its siblings on the same strategy are still running
    if (activeSubs.length > 0 && stoppedSubs.length > 0) {
      const names = stoppedSubs.map(tc => tc.user.name ?? tc.user.email ?? "unknown").join(", ");
      issues.push(`${strategy.name} (${strategy.symbol}): ${names} ${stoppedSubs.length > 1 ? "have" : "has"} stopped, while ${activeSubs.length} other subscriber${activeSubs.length > 1 ? "s are" : " is"} still active.`);
    }

    // Among active subscribers with an open position, flag anyone negative
    // while the majority is positive — same signal, so a lone loser can mean
    // that bot's entry/exit didn't fire correctly.
    if (activeSubs.length >= 2) {
      const results = await Promise.allSettled(activeSubs.map(async tc => {
        const posData = tc.account.is_oauth && tc.account.oauth_access_token
          ? await getPositionsOAuth(tc.account.oauth_access_token)
          : await getPositions(tc.account.api_key_enc, tc.account.api_secret_enc);
        const pos = (posData?.result ?? []).find((p: any) => p.product_symbol === strategy.symbol && Math.abs(parseFloat(p.size ?? "0")) > 0);
        const upnl = pos ? parseFloat(pos.unrealized_pnl ?? "0") : null;
        return { name: tc.user.name ?? tc.user.email ?? "unknown", upnl };
      }));

      const withPositions = results
        .filter((r): r is PromiseFulfilledResult<{ name: string; upnl: number | null }> => r.status === "fulfilled")
        .map(r => r.value)
        .filter(v => v.upnl !== null) as { name: string; upnl: number }[];

      if (withPositions.length >= 2) {
        const positives = withPositions.filter(v => v.upnl > 0);
        const negatives = withPositions.filter(v => v.upnl < 0);
        if (negatives.length > 0 && positives.length > negatives.length) {
          const names = negatives.map(v => v.name).join(", ");
          issues.push(`${strategy.name} (${strategy.symbol}): ${names} showing negative P&L while ${positives.length} other subscriber${positives.length > 1 ? "s are" : " is"} positive on the same open position.`);
        }
      }
    }
  }

  if (issues.length > 0) {
    const admins = await prisma.user.findMany({ where: { role: "admin" }, select: { email: true } });
    const { sendDiscrepancyAlert } = await import("@/lib/email");
    for (const admin of admins) {
      if (admin.email) await sendDiscrepancyAlert(admin.email, issues);
    }
    console.log(`[DiscrepancyCheckCron] Found ${issues.length} issue(s), emailed ${admins.length} admin(s)`);
  } else {
    console.log("[DiscrepancyCheckCron] No discrepancies found");
  }
}
