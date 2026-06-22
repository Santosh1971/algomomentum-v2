import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { NEXT_AUTH } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getBalances } from "@/lib/deltaClient";
import axios from "axios";

const INR_PER_USD = 85;

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(NEXT_AUTH);
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await context.params;
  const user = await prisma.user.findUnique({ where: { email: session.user.email } });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const account = await prisma.deltaAccount.findFirst({
    where: { id, userId: user.id },
  });
  if (!account) return NextResponse.json({ error: "Account not found" }, { status: 404 });

  try {
    let balances: any[] = [];

    if (account.is_oauth && account.oauth_access_token) {
      // OAuth account - use Bearer token without "Bearer" prefix
      const res = await axios.get("https://api.india.delta.exchange/v2/wallet/balances", {
        headers: { Authorization: account.oauth_access_token }
      });
      balances = res.data?.result ?? [];
    } else if (account.api_key_enc && account.api_key_enc !== "") {
      const data = await getBalances(account.api_key_enc, account.api_secret_enc);
      balances = data?.result ?? [];
    } else {
      return NextResponse.json({ error: "Account not connected" }, { status: 400 });
    }

    const wallet = balances.find((b: any) => b.asset_symbol === "USD")
      ?? balances.find((b: any) => b.asset_symbol === "USDT")
      ?? balances.find((b: any) => (b.available_balance ?? 0) > 0)
      ?? balances[0];

    const availableUSD = parseFloat(wallet?.available_balance ?? "0");
    const totalUSD = parseFloat(wallet?.balance ?? "0");

    return NextResponse.json({
      available: availableUSD,
      total: totalUSD,
      availableINR: availableUSD * INR_PER_USD,
      totalINR: totalUSD * INR_PER_USD,
      currency: "USD",
    });
  } catch (err: any) {
    console.error("Balance fetch error:", err.response?.data ?? err.message);
    return NextResponse.json({ error: err.message ?? "Failed to fetch balance" }, { status: 500 });
  }
}
