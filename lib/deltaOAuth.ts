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

export async function refreshDeltaToken(refreshToken: string) {
  try {
    const formData = new FormData();
    formData.append("grant_type", "refresh_token");
    formData.append("client_id", process.env.DELTA_CLIENT_ID!);
    formData.append("client_secret", process.env.DELTA_CLIENT_SECRET!);
    formData.append("redirect_uri", process.env.NEXTAUTH_URL + "/api/auth/delta/callback");
    formData.append("refresh_token", refreshToken);
    const res = await fetch("https://cdn.india.deltaex.org/v2/oauth/token", { method: "POST", body: formData });
    const data = await res.json();
    if (!data.access_token) return null;
    return data;
  } catch { return null; }
}
