import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { NEXT_AUTH } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPositions, getBalances, getPositionsOAuth, getBalancesOAuth } from "@/lib/deltaClient";

export async function GET() {
  const session = await getServerSession(NEXT_AUTH);
  if (!session || session.user.role !== "admin")
    return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const accounts = await prisma.deltaAccount.findMany({
    where: {
      isActive: true,
      OR: [
        { api_key_enc: { not: "" } },
        { is_oauth: true, oauth_access_token: { not: null } },
      ],
    },
    include: { user: { select: { name: true, email: true } } },
  });

  const results = await Promise.allSettled(accounts.map(async (account) => {
    try {
      const [posData, balData] = account.is_oauth && account.oauth_access_token
        ? await Promise.allSettled([
            getPositionsOAuth(account.oauth_access_token),
            getBalancesOAuth(account.oauth_access_token),
          ])
        : await Promise.allSettled([
            getPositions(account.api_key_enc, account.api_secret_enc),
            getBalances(account.api_key_enc, account.api_secret_enc),
          ]);

      const positions = posData.status === "fulfilled"
        ? (posData.value?.result ?? []).map((p: any) => {
            const size = Math.abs(parseFloat(p.size ?? "0"));
            const entryPrice = parseFloat(p.entry_price ?? "0");
            const contractValue = parseFloat(p.product?.contract_value ?? "1");
            const margin = parseFloat(p.margin ?? "0");
            const notional = size * contractValue * entryPrice;
            // Delta's position payload doesn't include a direct "leverage" field —
            // compute the actual applied leverage from notional value ÷ margin used.
            const leverage = margin > 0 ? Math.round((notional / margin) * 10) / 10 : 1;
            return {
              symbol: p.product_symbol ?? p.symbol,
              side: p.entry_price > 0 ? (p.size > 0 ? "buy" : "sell") : "—",
              size,
              entryPrice,
              markPrice: parseFloat(p.mark_price ?? "0"),
              upnlUSD: parseFloat(p.unrealized_pnl ?? p.upnl ?? "0"),
              leverage,
              liquidationPrice: parseFloat(p.liquidation_price ?? "0"),
            };
          }).filter((p: any) => p.size > 0)
        : [];

      const balances = balData.status === "fulfilled" ? balData.value?.result ?? [] : [];
      const wallet = balances.find((b: any) => b.asset_symbol === "USD")
        ?? balances.find((b: any) => b.asset_symbol === "USDT")
        ?? balances[0];

      return {
        accountId: account.id,
        accountName: account.accountName,
        accountType: account.accountType,
        userName: account.user.name ?? "",
        userEmail: account.user.email,
        positions,
        totalUpnlUSD: positions.reduce((s: number, p: any) => s + p.upnlUSD, 0),
        balance: wallet ? {
          availableUSD: parseFloat(wallet.available_balance ?? "0"),
          totalUSD: parseFloat(wallet.balance ?? "0"),
        } : undefined,
      };
    } catch (e: any) {
      return {
        accountId: account.id,
        accountName: account.accountName,
        accountType: account.accountType,
        userName: account.user.name ?? "",
        userEmail: account.user.email,
        positions: [],
        totalUpnlUSD: 0,
        error: e.message ?? "Failed to fetch",
      };
    }
  }));

  return NextResponse.json(results.map(r => r.status === "fulfilled" ? r.value : null).filter(Boolean));
}
