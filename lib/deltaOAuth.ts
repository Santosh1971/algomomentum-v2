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
 * Returns a valid OAuth access token for this Delta account, transparently
 * refreshing (and persisting) it first if it's expired or about to expire.
 * Returns null if the account isn't OAuth-connected, or if refresh fails
 * (e.g. the refresh token itself was revoked) — callers should treat null
 * the same way they'd treat a missing oauth_access_token today.
 */
export async function getValidAccessToken(account: OAuthAccountLike): Promise<string | null> {
  if (!account.is_oauth || !account.oauth_access_token) return null;

  const expiresAt = account.oauth_expires_at ? new Date(account.oauth_expires_at).getTime() : 0;
  const stillValid = expiresAt - Date.now() > REFRESH_SKEW_MS;
  if (stillValid) return account.oauth_access_token;

  if (!account.oauth_refresh_token) {
    throw new DeltaReconnectRequiredError("no refresh_token stored on this account");
  }

  // refreshDeltaToken now throws DeltaReconnectRequiredError itself on any
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
      // Delta may or may not rotate the refresh token on each use — keep the
      // old one if a new one isn't returned.
      oauth_refresh_token: refreshed.refresh_token ?? account.oauth_refresh_token,
      oauth_expires_at: newExpiresAt,
    },
  });

  return refreshed.access_token;
}
