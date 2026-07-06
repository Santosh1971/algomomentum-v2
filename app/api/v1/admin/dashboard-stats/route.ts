import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { NEXT_AUTH } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(NEXT_AUTH);
  if (session?.user?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const stats = await prisma.platformStats.findUnique({ where: { id: "singleton" } });

  if (!stats) {
    return NextResponse.json({ pending: true });
  }

  return NextResponse.json({
    activeBots: stats.activeBots,
    inactiveBots: stats.inactiveBots,
    activeBotsAllocInr: stats.activeBotsAllocInr,
    inactiveBotsAllocInr: stats.inactiveBotsAllocInr,
    totalRealizedPnl: stats.totalRealizedPnl,
    totalNetPnl: stats.totalNetPnl,
    monthlyRealizedPnl: stats.monthlyRealizedPnl,
    monthlyNetPnl: stats.monthlyNetPnl,
    totalDeltaCharge: stats.totalDeltaCharge,
    monthlyDeltaCharge: stats.monthlyDeltaCharge,
    updatedAt: stats.updatedAt,
  });
}
