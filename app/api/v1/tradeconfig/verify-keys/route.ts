// app/api/v1/tradeconfig/verify-keys/route.ts
// Validates Delta API keys — saves to DeltaAccount (not TradeConfig)

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { NEXT_AUTH } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { encrypt } from "@/lib/vault";
import { verifyKeys } from "@/lib/deltaClient";

export async function POST(req: NextRequest) {
  const session = await getServerSession(NEXT_AUTH);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { api_key, api_secret, accountId } = await req.json();

  if (!api_key || !api_secret) {
    return NextResponse.json({ error: "api_key and api_secret are required" }, { status: 400 });
  }

  try {
    const profile = await verifyKeys(api_key, api_secret);
    if (!profile?.success || !profile?.result) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    const accountName = profile.result.full_name || profile.result.email || "Delta Account";
    const deltaUserId = String(profile.result.id);

    // Save verified credentials to DeltaAccount
    if (accountId) {
      await prisma.deltaAccount.update({
        where: { id: accountId },
        data: {
          api_key_enc: encrypt(api_key),
          api_secret_enc: encrypt(api_secret),
          delta_account_name: accountName,
          delta_user_id: deltaUserId,
        },
      });
    }

    return NextResponse.json({
      success: true,
      delta_account_name: accountName,
      delta_user_id: deltaUserId,
      email: profile.result.email,
    });
  } catch (err: any) {
    const msg = err?.response?.data?.error?.message ?? err.message ?? "Verification failed";
    return NextResponse.json({ error: msg }, { status: 401 });
  }
}
