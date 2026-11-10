// GET: data for the chart on /admin/engine-log (admin only, read-only). Candles come from Delta's public endpoint,
// trades / stops from the EngineRunLog rows. Nothing here can touch an order.
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { NEXT_AUTH } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fetchDeltaCandles } from "@/lib/strategyEngine/fetchCandles";
import { buildChartData, type ChartCandle } from "@/lib/strategyEngine/chartData";

const DAYS = 4;
let cache: { at: number; candles: ChartCandle[] } | null = null;

export async function GET() {
  const session = await getServerSession(NEXT_AUTH);
  if (session?.user?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const rows = await prisma.engineRunLog.findMany({ orderBy: { barTime: "desc" }, take: 150 });

  let candles: ChartCandle[] = [];
  let candleError: string | null = null;
  if (cache && Date.now() - cache.at < 30_000) {
    candles = cache.candles;
  } else {
    try {
      const now = Math.floor(Date.now() / 1000);
      candles = (await fetchDeltaCandles("XRPUSD", "30m", now - DAYS * 86400, now)).map((c) => ({ time: c.time, open: c.open, high: c.high, low: c.low, close: c.close }));
      cache = { at: Date.now(), candles };
    } catch (e: any) {
      candleError = String(e?.message ?? e);
      if (cache) candles = cache.candles; // stale is better than nothing
    }
  }
  return NextResponse.json({ ...buildChartData(rows, candles), candleError });
}
