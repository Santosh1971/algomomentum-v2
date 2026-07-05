import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { NEXT_AUTH } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { computePnlReport } from "@/lib/pnlEngine";
import { DateTime } from "luxon";

export async function GET(req: NextRequest) {
  const session = await getServerSession(NEXT_AUTH);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const configs = await prisma.tradeConfig.findMany({
    where: { userId: session.user.id, isActive: true, userActive: true },
    select: {
      script: true,
      account: { select: { api_key_enc: true, api_secret_enc: true, is_oauth: true, oauth_access_token: true } },
    },
  });

  if (!configs.length) {
    return NextResponse.json({
      totalGrossPnl: 0, totalNetPnl: 0, monthlyGrossPnl: 0, monthlyNetPnl: 0,
      totalTrades: 0, winRate: 0, avgProfitLoss: 0, avgTradeSize: 0,
      equityCurve: [],
    });
  }

  const from = "2020-01-01";
  const to = DateTime.now().setZone("Asia/Kolkata").toFormat("yyyy-MM-dd");
  const monthStart = DateTime.now().setZone("Asia/Kolkata").startOf("month").toFormat("yyyy-MM-dd");

  const reports = await Promise.allSettled(
    configs.map((c: any) => {
      const oauthToken = c.account.is_oauth ? c.account.oauth_access_token : null;
      return computePnlReport(c.account.api_key_enc, c.account.api_secret_enc, c.script, from, to, oauthToken);
    })
  );

  const allTrades = reports
    .filter((r): r is PromiseFulfilledResult<any> => r.status === "fulfilled")
    .flatMap(r => r.value.trades)
    .sort((a, b) => new Date(a.exitTime).getTime() - new Date(b.exitTime).getTime());

  const totalGrossPnl = allTrades.reduce((s, t) => s + t.grossPnl, 0);
  const totalNetPnl   = allTrades.reduce((s, t) => s + t.netPnl, 0);
  const monthlyTrades = allTrades.filter(t => t.exitTime.slice(0, 10) >= monthStart);
  const monthlyGrossPnl = monthlyTrades.reduce((s, t) => s + t.grossPnl, 0);
  const monthlyNetPnl   = monthlyTrades.reduce((s, t) => s + t.netPnl, 0);
  const wins = allTrades.filter(t => t.status === "win").length;
  const winRate = allTrades.length ? Math.round((wins / allTrades.length) * 1000) / 10 : 0;
  const avgProfitLoss = allTrades.length ? totalNetPnl / allTrades.length : 0;
  const avgTradeSize  = allTrades.length ? allTrades.reduce((s, t) => s + (t.notionalValue || 0), 0) / allTrades.length : 0;

  let cum = 0;
  const equityCurve = allTrades.map(t => {
    cum += t.netPnl;
    return { date: t.exitTime.slice(0, 10), cumPnl: Math.round(cum * 100) / 100 };
  });

  return NextResponse.json({
    totalGrossPnl: Math.round(totalGrossPnl * 100) / 100,
    totalNetPnl: Math.round(totalNetPnl * 100) / 100,
    monthlyGrossPnl: Math.round(monthlyGrossPnl * 100) / 100,
    monthlyNetPnl: Math.round(monthlyNetPnl * 100) / 100,
    totalTrades: allTrades.length,
    winRate,
    avgProfitLoss: Math.round(avgProfitLoss * 100) / 100,
    avgTradeSize: Math.round(avgTradeSize * 100) / 100,
    equityCurve,
  });
}
