// app/api/v1/accounts/[id]/balance/route.ts
// Fetches live USDT balance from Delta Exchange for this account

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { NEXT_AUTH } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getBalances } from "@/lib/deltaClient";

const INR_PER_USD = 85;

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(NEXT_AUTH);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await context.params;

  const account = await prisma.deltaAccount.findFirst({
    where: { id, userId: session.user.id },
  });
  if (!account) return NextResponse.json({ error: "Account not found" }, { status: 404 });
  if (!account.api_key_enc || account.api_key_enc === "") {
    return NextResponse.json({ error: "Account not connected" }, { status: 400 });
  }

  try {
    const data = await getBalances(account.api_key_enc, account.api_secret_enc);
    const balances: any[] = data?.result ?? [];

    // Delta India uses USD or USDT — try both
    const wallet = balances.find((b: any) => b.asset_symbol === "USD")
      ?? balances.find((b: any) => b.asset_symbol === "USDT")
      ?? balances.find((b: any) => (b.available_balance ?? 0) > 0)
      ?? balances[0];

    // Log what we got for debugging
    console.log("Balance assets:", balances.map((b: any) => `${b.asset_symbol}:${b.balance}`).join(", "));

    const availableUSD = parseFloat(wallet?.available_balance ?? "0");
    const totalUSD = parseFloat(wallet?.balance ?? "0");

    return NextResponse.json({
      availableUSD: availableUSD,
      totalUSD: totalUSD,
      availableINR: availableUSD * INR_PER_USD,
      totalINR: totalUSD * INR_PER_USD,
      currency: "USDT",
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? "Failed to fetch balance" }, { status: 500 });
  }
}
