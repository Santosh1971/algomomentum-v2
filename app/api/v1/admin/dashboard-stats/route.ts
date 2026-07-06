import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { NEXT_AUTH } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(NEXT_AUTH);
  if (session?.user?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rows = await prisma.platformStats.findMany();
  if (!rows.length) return NextResponse.json({ pending: true });

  const bySymbol: Record<string, any> = {};
  for (const r of rows) {
    bySymbol[r.symbol] = {
      activeBots: r.activeBots, inactiveBots: r.inactiveBots,
      activeBotsAllocInr: r.activeBotsAllocInr, inactiveBotsAllocInr: r.inactiveBotsAllocInr,
      totalRealizedPnl: r.totalRealizedPnl, totalNetPnl: r.totalNetPnl,
      monthlyRealizedPnl: r.monthlyRealizedPnl, monthlyNetPnl: r.monthlyNetPnl,
      totalDeltaCharge: r.totalDeltaCharge, monthlyDeltaCharge: r.monthlyDeltaCharge,
      equityCurve: r.equityCurve ?? [],
      updatedAt: r.updatedAt,
    };
  }
  const symbols = rows.map(r => r.symbol).filter(s => s !== "ALL").sort();

  return NextResponse.json({ symbols, bySymbol });
}
