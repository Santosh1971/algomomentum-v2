// app/api/v1/accounts/[id]/symbols/[tcId]/exit/route.ts
// Immediately closes the open position for this TradeConfig

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { NEXT_AUTH } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPositions, placeOrder, getPositionsOAuth, placeOrderOAuth } from "@/lib/deltaClient";
import { getValidAccessToken } from "@/lib/deltaOAuth";

export async function POST(req: NextRequest, context: { params: Promise<{ id: string; tcId: string }> }) {
  const session = await getServerSession(NEXT_AUTH);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, tcId } = await context.params;

  // Verify ownership
  const tc = await prisma.tradeConfig.findFirst({
    where: { id: tcId, accountId: id, userId: session.user.id },
    include: {
      account: {
        select: {
          id: true,
          is_oauth: true,
          oauth_access_token: true,
          oauth_refresh_token: true,
          oauth_expires_at: true,
          api_key_enc: true,
          api_secret_enc: true,
        },
      },
    },
  });
  if (!tc) return NextResponse.json({ error: "Config not found" }, { status: 404 });

  const script = await prisma.script.findUnique({ where: { symbol: tc.script } });
  if (!script) return NextResponse.json({ error: "Script not found" }, { status: 404 });

  try {
    // OAuth-connected accounts have no usable api_key_enc/api_secret_enc
    // ("vault") — those fields are empty strings for them, which is what was
    // producing "Invalid vault format" here. Branch on is_oauth the same way
    // the webhook route and discrepancy cron already do.
    const isOAuth = tc.account.is_oauth && !!tc.account.oauth_access_token;
    const oauthToken = isOAuth ? await getValidAccessToken(tc.account) : null;

    const posData = isOAuth
      ? await getPositionsOAuth(oauthToken!)
      : await getPositions(tc.account.api_key_enc, tc.account.api_secret_enc);
    const positions: any[] = posData?.result ?? [];
    const openPos = positions.find(
      (p: any) => p.product_symbol === script.exchange_symbol && Math.abs(p.size) > 0
    );

    if (!openPos) return NextResponse.json({ message: "No open position to close" });

    const closeSide = openPos.size > 0 ? "sell" : "buy";
    const quantity = Math.abs(openPos.size);

    const orderBody = {
      product_id: script.productId,
      product_symbol: script.exchange_symbol,
      size: quantity,
      side: closeSide,
      order_type: "market_order",
      time_in_force: "ioc",
      client_order_id: `am-close-${tcId.slice(-6)}-${Date.now()}`,
    };

    const result = isOAuth
      ? await placeOrderOAuth(oauthToken!, orderBody)
      : await placeOrder(tc.account.api_key_enc, tc.account.api_secret_enc, orderBody);

    return NextResponse.json({ success: true, result });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? "Exit failed" }, { status: 500 });
  }
}
