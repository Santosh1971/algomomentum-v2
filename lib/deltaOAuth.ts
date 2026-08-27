// lib/deltaOAuth.ts
export function buildDeltaAuthUrl(): string {
  const REDIRECT_URI = process.env.NEXTAUTH_URL + "/api/auth/delta/callback";
  const state = Math.random().toString(36).substring(2, 15);
  const url = new URL("https://www.delta.exchange/app/authorize");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", process.env.DELTA_CLIENT_ID!);
  url.searchParams.set("redirect_uri", REDIRECT_URI);
  url.searchParams.set("scope", "read");
  url.searchParams.set("state", state);
  return url.toString();
}

// Thrown (never swallowed) so callers — and, ultimately, the TradeFireError row
// and admin alert email — can show the REAL reason a reconnect was needed,
// instead of a single generic "must reconnect" string that hides whether the
// access token merely expired or the stored refresh_token itself is dead.
export class DeltaReconnectRequiredError extends Error {
  constructor(reason: string) {
    super(`Delta connection expired — user must reconnect (${reason})`);
    this.name = "DeltaReconnectRequiredError";
  }
}

export async function refreshDeltaToken(refreshToken: string) {
  let res: Response;
  try {
    const formData = new FormData();
    formData.append("grant_type", "refresh_token");
    formData.append("client_id", process.env.DELTA_CLIENT_ID!);
    formData.append("client_secret", process.env.DELTA_CLIENT_SECRET!);
    formData.append("redirect_uri", process.env.NEXTAUTH_URL + "/api/auth/delta/callback");
    formData.append("refresh_token", refreshToken);
    res = await fetch("https://cdn.india.deltaex.org/v2/oauth/token", { method: "POST", body: formData });
  } catch (e: any) {
    throw new DeltaReconnectRequiredError(`network error contacting Delta: ${e.message}`);
  }
  const data = await res.json().catch(() => null);
  if (!data?.access_token) {
    // Delta's OAuth error shape is typically { error, error_description } — surface
    // whichever fields are present rather than a bare HTTP status.
    const reason = data?.error_description || data?.error || `HTTP ${res.status}`;
    throw new DeltaReconnectRequiredError(`refresh_token rejected by Delta — ${reason}`);
  }
  return data;
}

// Any DeltaAccount row shape that has the oauth fields we need. Callers can
// pass their own prisma `select` result as long as it includes these.
type OAuthAccountLike = {
  id: string;
  is_oauth: boolean;
  oauth_access_token: string | null;
  oauth_refresh_token: string | null;
  oauth_expires_at: Date | null;
};

// Refresh a bit before the real expiry so we never race a token that's about
// to die mid-request.
const REFRESH_SKEW_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Unconditionally exchanges this account's stored refresh_token for a new
 * access_token (and persists both), regardless of whether the current
 * access_token is still valid. This exists separately from
 * getValidAccessToken() because of a critical asymmetry Delta confirmed on
 * 2026-08-22: the access_token has a 30-day TTL, but the refresh_token
 * itself has only a 1-day TTL. getValidAccessToken() only calls refresh when
 * the ACCESS token is near its 30-day expiry — meaning the refresh_token
 * would otherwise sit completely unused for ~29 days and be long dead by the
 * time it's actually needed. OAuthRefreshCron (lib/oauthRefreshCron.ts)
 * calls this directly, on its own schedule well inside that 1-day window,
 * to keep the refresh_token chain continuously alive.
 */
export async function refreshAndPersist(account: OAuthAccountLike): Promise<string> {
  if (!account.oauth_refresh_token) {
    throw new DeltaReconnectRequiredError("no refresh_token stored on this account");
  }

  // refreshDeltaToken throws DeltaReconnectRequiredError itself on any
  // failure (network error or Delta rejecting the refresh_token) — let it
  // propagate with the real reason rather than catching and re-generalizing it.
  const refreshed = await refreshDeltaToken(account.oauth_refresh_token);

  const { prisma } = await import("@/lib/prisma");
  const newExpiresAt = refreshed.expires_in
    ? new Date(Date.now() + refreshed.expires_in * 1000)
    : new Date(Date.now() + 24 * 60 * 60 * 1000);

  await prisma.deltaAccount.update({
    where: { id: account.id },
    data: {
      oauth_access_token: refreshed.access_token,
      // Delta confirmed (2026-08-22) the refresh_token is NOT rotated on use —
      // it keeps returning the same one. Still handled defensively here in
      // case that ever changes on their side.
      oauth_refresh_token: refreshed.refresh_token ?? account.oauth_refresh_token,
      oauth_expires_at: newExpiresAt,
    },
  });

  return refreshed.access_token;
}

/**
 * Returns a valid OAuth access token for this Delta account, transparently
 * refreshing (and persisting) it first if it's expired or about to expire.
 * Returns null if the account isn't OAuth-connected. Throws
 * DeltaReconnectRequiredError if refresh is needed but fails (e.g. the
 * refresh_token itself has died) — callers should let that propagate so the
 * real reason reaches TradeFireError / the admin alert email.
 */
export async function getValidAccessToken(account: OAuthAccountLike): Promise<string | null> {
  if (!account.is_oauth || !account.oauth_access_token) return null;

  const expiresAt = account.oauth_expires_at ? new Date(account.oauth_expires_at).getTime() : 0;
  const stillValid = expiresAt - Date.now() > REFRESH_SKEW_MS;
  if (stillValid) return account.oauth_access_token;

  return refreshAndPersist(account);
}
