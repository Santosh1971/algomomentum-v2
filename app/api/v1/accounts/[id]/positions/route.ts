// app/api/v1/accounts/[id]/positions/route.ts
// Fetches live open positions from Delta Exchange for this account

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { NEXT_AUTH } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPositions } from "@/lib/deltaClient";

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
    const data = await getPositions(account.api_key_enc, account.api_secret_enc);
    const positions: any[] = (data?.result ?? []).filter((p: any) => Math.abs(p.size) > 0);

    const enriched = positions.map((p: any) => {
      const upnlUSD = parseFloat(p.unrealized_pnl ?? "0");
      return {
        symbol: p.product_symbol,
        side: p.size > 0 ? "buy" : "sell",
        size: Math.abs(p.size),
        entryPrice: parseFloat(p.entry_price ?? "0"),
        markPrice: parseFloat(p.mark_price ?? "0"),
        upnlUSD,
        upnlINR: upnlUSD * INR_PER_USD,
        leverage: p.leverage ?? 1,
        liquidationPrice: parseFloat(p.liquidation_price ?? "0"),
        margin: parseFloat(p.initial_margin ?? "0"),
      };
    });

    const totalUpnlUSD = enriched.reduce((sum, p) => sum + p.upnlUSD, 0);

    return NextResponse.json({
      positions: enriched,
      totalUpnlUSD,
      totalUpnlINR: totalUpnlUSD * INR_PER_USD,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? "Failed to fetch positions" }, { status: 500 });
  }
}
