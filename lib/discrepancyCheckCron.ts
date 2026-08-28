// lib/discrepancyCheckCron.ts
// Runs every hour. For each active strategy, checks whether any subscriber's
// bot has stopped while others are still running, has NO open position at
// all while others clearly do (usually a missed entry), shows negative P&L
// while the majority is positive, or is sitting on a position with a
// materially different entry price than the rest of the group (a sign their
// most recent entry/exit silently failed and they're still holding a stale
// position from an earlier cycle). If anything is found, emails every admin
// a summary.
//
// This is a backup safety net — the primary defense is the immediate
// per-failure alert built into the production webhook route itself
// (sendTradeFireErrorAlert), which fires the moment a real order is
// rejected. This hourly check catches anything that slips past that,
// e.g. a failure mode that doesn't throw.

import cron from "node-cron";
import { prisma } from "@/lib/prisma";
import { getPositions, getPositionsOAuth } from "@/lib/deltaClient";
import { getValidAccessToken } from "@/lib/deltaOAuth";

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
        // discrepancyExempt = admin has marked this bot as intentionally
        // paused/stopped — exclude it entirely so it's never flagged in any
        // of the checks below (stopped, missing position, negative P&L,
        // stale entry price).
        where: { isSubscription: true, discrepancyExempt: false },
        include: {
          account: { select: { id: true, api_key_enc: true, api_secret_enc: true, is_oauth: true, oauth_access_token: true, oauth_refresh_token: true, oauth_expires_at: true } },
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

    if (activeSubs.length < 2) continue;

    // Fetch each active subscriber's current position once, reused for both
    // the P&L-direction check and the entry-price check below.
    const results = await Promise.allSettled(activeSubs.map(async tc => {
      const posData = tc.account.is_oauth && tc.account.oauth_access_token
        ? await getPositionsOAuth((await getValidAccessToken(tc.account))!)
        : await getPositions(tc.account.api_key_enc, tc.account.api_secret_enc);
      const pos = (posData?.result ?? []).find((p: any) => p.product_symbol === strategy.symbol && Math.abs(parseFloat(p.size ?? "0")) > 0);
      return {
        name: tc.user.name ?? tc.user.email ?? "unknown",
        upnl: pos ? parseFloat(pos.unrealized_pnl ?? "0") : null,
        entryPrice: pos ? parseFloat(pos.entry_price ?? "0") : null,
      };
    }));

    const withPositions = results
      .filter((r): r is PromiseFulfilledResult<{ name: string; upnl: number | null; entryPrice: number | null }> => r.status === "fulfilled")
      .map(r => r.value)
      .filter(v => v.upnl !== null && v.entryPrice !== null) as { name: string; upnl: number; entryPrice: number }[];

    const withoutPositions = results
      .filter((r): r is PromiseFulfilledResult<{ name: string; upnl: number | null; entryPrice: number | null }> => r.status === "fulfilled")
      .map(r => r.value)
      .filter(v => v.upnl === null);

    // A bot is marked active in our system but has NO open position on Delta
    // at all, while others on the same strategy clearly do — usually means a
    // past entry silently failed and was never retried (this is exactly the
    // gap the immediate per-fire alert now closes going forward, but this
    // check catches any bot still sitting empty from before that existed).
    if (withPositions.length > 0 && withoutPositions.length > 0) {
      const names = withoutPositions.map(v => v.name).join(", ");
      issues.push(`${strategy.name} (${strategy.symbol}): ${names} ${withoutPositions.length > 1 ? "have" : "has"} no open position at all, while ${withPositions.length} other subscriber${withPositions.length > 1 ? "s are" : " is"} currently in a trade — likely a missed entry.`);
    }

    if (withPositions.length < 2) continue;

    // Negative P&L while the majority is positive — same signal, so a lone
    // loser can mean that bot's entry/exit didn't fire correctly.
    const positives = withPositions.filter(v => v.upnl > 0);
    const negatives = withPositions.filter(v => v.upnl < 0);
    if (negatives.length > 0 && positives.length > negatives.length) {
      const names = negatives.map(v => v.name).join(", ");
      issues.push(`${strategy.name} (${strategy.symbol}): ${names} showing negative P&L while ${positives.length} other subscriber${positives.length > 1 ? "s are" : " is"} positive on the same open position.`);
    }

    // Entry price mismatch — everyone on the same strategy should have
    // entered at roughly the same price and time. Find the majority entry
    // price (within 0.5% tolerance) and flag anyone meaningfully off it,
    // which usually means they're still holding a stale position from an
    // earlier entry/exit cycle that silently failed to update.
    const groups: { price: number; members: typeof withPositions }[] = [];
    for (const v of withPositions) {
      const g = groups.find(g => Math.abs(g.price - v.entryPrice) / g.price < 0.005);
      if (g) g.members.push(v);
      else groups.push({ price: v.entryPrice, members: [v] });
    }
    if (groups.length > 1) {
      groups.sort((a, b) => b.members.length - a.members.length);
      const [majority, ...minorities] = groups;
      for (const minority of minorities) {
        const names = minority.members.map(v => v.name).join(", ");
        issues.push(`${strategy.name} (${strategy.symbol}): ${names} entered at ${minority.price} while ${majority.members.length} other subscriber${majority.members.length > 1 ? "s" : ""} entered around ${majority.price} — likely holding a stale position from an earlier cycle.`);
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
