import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/prisma";

const CLIENT_ID = process.env.DELTA_CLIENT_ID!;
const CLIENT_SECRET = process.env.DELTA_CLIENT_SECRET!;
const TOKEN_URL = "https://cdn.india.deltaex.org/v2/oauth/token";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.redirect(new URL("/Signup", req.url));
  }

  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");

  if (error || !code) {
    return NextResponse.redirect(new URL("/user/tradeconfig?delta_error=1", req.url));
  }

  try {
    const REDIRECT_URI = process.env.NEXTAUTH_URL + "/api/auth/delta/callback";
    const formData = new FormData();
    formData.append("grant_type", "authorization_code");
    formData.append("client_id", CLIENT_ID);
    formData.append("client_secret", CLIENT_SECRET);
    formData.append("redirect_uri", REDIRECT_URI);
    formData.append("code", code);

    const tokenRes = await fetch(TOKEN_URL, { method: "POST", body: formData });
    const tokenData = await tokenRes.json();

    if (!tokenData.access_token) {
      console.error("Delta OAuth token error:", tokenData);
      return NextResponse.redirect(new URL("/user/tradeconfig?delta_error=2", req.url));
    }

    const profileRes = await fetch("https://api.india.delta.exchange/v2/profile", {
      headers: { "Authorization": "Bearer " + tokenData.access_token },
    });
    const profileData = await profileRes.json();
    const deltaUserId = profileData?.result?.id?.toString() ?? null;
    const deltaAccountName = profileData?.result?.email ?? profileData?.result?.name ?? "Delta Account";

    const expiresAt = tokenData.expires_in
      ? new Date(Date.now() + tokenData.expires_in * 1000)
      : new Date(Date.now() + 24 * 60 * 60 * 1000);

    const user = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (!user) return NextResponse.redirect(new URL("/Signup", req.url));

    await prisma.deltaAccount.upsert({
      where: { userId_accountType: { userId: user.id, accountType: "main" } },
      update: {
        oauth_access_token: tokenData.access_token,
        oauth_refresh_token: tokenData.refresh_token ?? null,
        oauth_expires_at: expiresAt,
        is_oauth: true,
        delta_user_id: deltaUserId,
        delta_account_name: deltaAccountName,
        isActive: true,
      },
      create: {
        userId: user.id,
        accountType: "main",
        accountName: "Main Account",
        api_key_enc: "",
        api_secret_enc: "",
        oauth_access_token: tokenData.access_token,
        oauth_refresh_token: tokenData.refresh_token ?? null,
        oauth_expires_at: expiresAt,
        is_oauth: true,
        delta_user_id: deltaUserId,
        delta_account_name: deltaAccountName,
        isActive: true,
      },
    });

    if (deltaUserId) {
      await prisma.userDetails.updateMany({
        where: { userId: user.id },
        data: { deltaUserId },
      });
    }

    return NextResponse.redirect(new URL("/user/tradeconfig?delta_connected=1", req.url));
  } catch (e: any) {
    console.error("Delta OAuth error:", e);
    return NextResponse.redirect(new URL("/user/tradeconfig?delta_error=3", req.url));
  }
}
