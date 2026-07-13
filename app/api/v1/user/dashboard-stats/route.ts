import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { NEXT_AUTH } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await getServerSession(NEXT_AUTH);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const qUserId = req.nextUrl.searchParams.get("userId");
  const isAdmin = session.user.role === "admin";
  const userId = isAdmin && qUserId ? qUserId : session.user.id;

  const rows = await prisma.userDashboardStats.findMany({ where: { userId } });
  if (!rows.length) return NextResponse.json({ pending: true });

  const bySymbol: Record<string, any> = {};
  for (const r of rows) {
    bySymbol[r.symbol] = {
      totalRealizedPnl: r.totalRealizedPnl, totalNetPnl: r.totalNetPnl,
      monthlyRealizedPnl: r.monthlyRealizedPnl, monthlyNetPnl: r.monthlyNetPnl,
      totalTrades: r.totalTrades, winRate: r.winRate,
      avgProfitLoss: r.avgProfitLoss, avgTradeSize: r.avgTradeSize,
      equityCurve: r.equityCurve ?? [],
      updatedAt: r.updatedAt,
    };
  }
  const symbols = rows.map(r => r.symbol).filter(s => s !== "ALL").sort();

  return NextResponse.json({ symbols, bySymbol });
}
