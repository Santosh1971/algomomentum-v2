// lib/oauthRefreshCron.ts
// Delta confirmed (2026-08-22, via Ayush/Manku Pathak) that the refresh_token
// has only a 1-day TTL — separate from, and much shorter than, the 30-day
// access_token TTL. Our per-request getValidAccessToken() only calls the
// refresh endpoint when the ACCESS token is near its own 30-day expiry,
// which means the refresh_token sits completely unused for ~29 days and is
// already dead by the time it's actually needed — this was the real root
// cause behind the Aug 12 and Aug 20 "must reconnect" failures, not a rare
// one-off.
//
// This cron closes that gap by proactively refreshing every OAuth-connected
// account well inside the 1-day window, so the refresh_token chain never
// goes cold. getValidAccessToken()'s per-request check remains in place as a
// safety net for anything this cron misses (a new connection made between
// runs, a transient failure on a given run, etc).

import cron from "node-cron";
import { prisma } from "@/lib/prisma";
import { refreshAndPersist } from "@/lib/deltaOAuth";

let started = false;

export function startOAuthRefreshCron() {
  if (started) return;
  started = true;

  // Every 6 hours — 4 attempts inside each 24h refresh_token window, so a
  // single missed or failed run (deploy, restart, transient Delta outage)
  // still leaves multiple chances before the token actually dies.
  cron.schedule("0 */6 * * *", async () => {
    try {
      await refreshAllOAuthAccounts();
    } catch (e) {
      console.error("[OAuthRefreshCron] Fatal:", e);
    }
  }, {
    timezone: "UTC",
  });

  console.log("[OAuthRefreshCron] Scheduled — refreshes every 6 hours");
}

async function refreshAllOAuthAccounts() {
  const accounts = await prisma.deltaAccount.findMany({
    where: { is_oauth: true, oauth_refresh_token: { not: null } },
    select: {
      id: true,
      userId: true,
      is_oauth: true,
      oauth_access_token: true,
      oauth_refresh_token: true,
      oauth_expires_at: true,
    },
  });

  if (accounts.length === 0) {
    console.log("[OAuthRefreshCron] No OAuth-connected accounts to refresh");
    return;
  }

  const failures: { userId: string; reason: string }[] = [];

  for (const account of accounts) {
    try {
      await refreshAndPersist(account);
    } catch (e: any) {
      failures.push({ userId: account.userId, reason: e?.message ?? "Unknown error" });
    }
  }

  console.log(`[OAuthRefreshCron] Refreshed ${accounts.length - failures.length}/${accounts.length} account(s)`);

  // A failure here means the refresh_token is ALREADY dead — that account
  // will silently fail its next live trade unless the user reconnects first.
  // Email admins now, proactively, instead of finding out from a missed
  // trade the way Aug 12 and Aug 20 both played out.
  if (failures.length > 0) {
    const users = await prisma.user.findMany({
      where: { id: { in: failures.map(f => f.userId) } },
      select: { id: true, name: true, email: true },
    });
    const lines = failures.map(f => {
      const u = users.find((u: any) => u.id === f.userId);
      return `${u?.name ?? u?.email ?? f.userId}: ${f.reason}`;
    });

    const admins = await prisma.user.findMany({ where: { role: "admin" }, select: { email: true } });
    const { sendOAuthReconnectAlert } = await import("@/lib/email");
    for (const admin of admins) {
      if (admin.email) await sendOAuthReconnectAlert(admin.email, lines);
    }
    console.error(`[OAuthRefreshCron] ${failures.length} account(s) need reconnect:`, lines);
  }
}
