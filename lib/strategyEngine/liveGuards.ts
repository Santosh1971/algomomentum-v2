// lib/strategyEngine/liveGuards.ts
//
// Pure checks that must ALL pass before the runner is allowed to place a real order.
// Kept free of I/O so scripts/testExecutor.ts can test every refusal.

export const LIVE_CONFIRM_TEXT = "PLACE_REAL_ORDERS";
export const MAX_LOTS_CEILING = 50; // hard ceiling, whatever ENGINE_MAX_LOTS says (about $65 at XRP 1.3)
export const DEFAULT_MAX_BALANCE_USD = 150;

export interface LiveGuardInput {
  env: Record<string, string | undefined>;
  killSwitchOn: boolean;
  accountType: string;
  isOauth: boolean;
  hasApiKey: boolean;
  balanceUsd: number;
  /** active TradingView/webhook bots that trade XRPUSD on this same Delta account */
  activeWebhookBots: number;
}

export type LiveGuardResult = { ok: true; maxLots: number } | { ok: false; reason: string };

export function checkLiveGuards(g: LiveGuardInput): LiveGuardResult {
  if (g.env.ENGINE_LIVE_CONFIRM !== LIVE_CONFIRM_TEXT) return { ok: false, reason: `live mode needs ENGINE_LIVE_CONFIRM=${LIVE_CONFIRM_TEXT}` };
  if (g.killSwitchOn) return { ok: false, reason: "kill switch is on (ENGINE_KILL file exists): not touching the exchange" };
  const lots = Number(g.env.ENGINE_MAX_LOTS);
  if (!Number.isInteger(lots) || lots < 1) return { ok: false, reason: "live mode needs ENGINE_MAX_LOTS set to a whole number of lots (>= 1); there is no default on purpose" };
  if (lots > MAX_LOTS_CEILING) return { ok: false, reason: `ENGINE_MAX_LOTS=${lots} is above the hard ceiling of ${MAX_LOTS_CEILING}` };
  if (g.accountType === "main" || g.isOauth || !g.hasApiKey) return { ok: false, reason: `live mode is for API-key sub-accounts only (type=${g.accountType}, oauth=${g.isOauth})` };
  const cap = Number(g.env.ENGINE_MAX_BALANCE_USD ?? DEFAULT_MAX_BALANCE_USD);
  if (!(g.balanceUsd > 0)) return { ok: false, reason: "account balance is zero or unreadable" };
  if (g.balanceUsd > cap) return { ok: false, reason: `account balance $${g.balanceUsd.toFixed(2)} is above the cap of $${cap} (ENGINE_MAX_BALANCE_USD): is this really the small test account?` };
  if (g.activeWebhookBots > 0) return { ok: false, reason: `${g.activeWebhookBots} active webhook bot(s) already trade XRPUSD on this account: both would trade. Turn them off first.` };
  return { ok: true, maxLots: lots };
}
