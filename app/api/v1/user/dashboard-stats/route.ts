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

  const activeBots = await prisma.tradeConfig.findMany({
    where: { userId, isActive: true, userActive: true },
    select: { script: true, amount: true },
  });
  const INR_TO_USD = 85;
  const totalAllocatedUsd = activeBots.reduce((sum, b) => sum + b.amount, 0) / INR_TO_USD;
  const allocByScript: Record<string, number> = {};
  for (const b of activeBots) allocByScript[b.script] = (allocByScript[b.script] ?? 0) + b.amount / INR_TO_USD;

  const bySymbol: Record<string, any> = {};
  for (const r of rows) {
    bySymbol[r.symbol] = {
      totalRealizedPnl: r.totalRealizedPnl, totalNetPnl: r.totalNetPnl,
      monthlyRealizedPnl: r.monthlyRealizedPnl, monthlyNetPnl: r.monthlyNetPnl,
      totalTrades: r.totalTrades, winRate: r.winRate,
      avgProfitLoss: r.avgProfitLoss, avgTradeSize: r.avgTradeSize,
      equityCurve: r.equityCurve ?? [],
      updatedAt: r.updatedAt,
      allocatedUsd: r.symbol === "ALL" ? totalAllocatedUsd : (allocByScript[r.symbol] ?? 0),
    };
  }
  const symbols = rows.map(r => r.symbol).filter(s => s !== "ALL").sort();

  return NextResponse.json({ symbols, bySymbol });
}
