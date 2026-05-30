// app/api/v1/tradeconfig/verify-keys/route.ts
// Validates Delta API keys against GET /v2/profile
// On success: saves delta_account_name and delta_user_id to TradeConfig

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { NEXT_AUTH } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { encrypt } from "@/lib/vault";
import { verifyKeys } from "@/lib/deltaClient";

export async function POST(req: NextRequest) {
  const session = await getServerSession(NEXT_AUTH);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { api_key, api_secret, tradeConfigId } = await req.json();

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

    // If a tradeConfigId was passed, update that config with the verified creds
    if (tradeConfigId) {
      await prisma.tradeConfig.update({
        where: { id: tradeConfigId },
        data: {
          api_key_enc: encrypt(api_key),
          api_secret_enc: encrypt(api_secret),
          delta_account_name: accountName,
          delta_user_id: deltaUserId,
          lastEditAt: new Date(),
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
