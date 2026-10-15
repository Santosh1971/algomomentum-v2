// POST: run the strategy's native engine over a date range.
//
// By default this is a DRY RUN: it returns stats + trades and changes
// nothing. The strategy's displayed backtest (shown to marketplace
// subscribers, normally from a TradingView upload) is only overwritten when
// the body has `apply: true`.
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { NEXT_AUTH } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ENGINES, resolveEngineConfig } from "@/lib/strategyEngine/registry";
import { fetchDeltaCandles } from "@/lib/strategyEngine/fetchCandles";
import { computeBacktestStats } from "@/lib/strategyEngine/backtestRunner";

export const maxDuration = 120;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(NEXT_AUTH);
  if (session?.user?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  const strategy: any = await prisma.strategy.findUnique({ where: { id } });
  if (!strategy) return NextResponse.json({ error: "Strategy not found" }, { status: 404 });
  if (!strategy.engineType || !ENGINES[strategy.engineType]) {
    return NextResponse.json({ error: "No native engine attached to this strategy" }, { status: 400 });
  }
  const engine = ENGINES[strategy.engineType];

  const body = await req.json().catch(() => ({}));
  const startSec = Math.floor(new Date(body.startDate).getTime() / 1000);
  const endSec = body.endDate ? Math.floor(new Date(body.endDate).getTime() / 1000) : Math.floor(Date.now() / 1000);
  if (!Number.isFinite(startSec) || !Number.isFinite(endSec) || startSec >= endSec) {
    return NextResponse.json({ error: "Valid startDate (and optional endDate after it) required" }, { status: 400 });
  }
  const initialCapital = Number(body.initialCapital) > 0 ? Number(body.initialCapital) : 1000;

  // Delta's symbol for this strategy's market (falls back to the strategy symbol itself)
  const script = await prisma.script.findUnique({ where: { symbol: strategy.symbol } });
  const deltaSymbol = script?.exchange_symbol ?? strategy.symbol;

  try {
    const cfg = resolveEngineConfig(strategy.engineType, body.config ?? strategy.engineConfig);
    cfg.startTime = startSec;
    if (body.endDate) { cfg.endTime = endSec; cfg.useDateRange = true; }

    const candles = await fetchDeltaCandles(
      deltaSymbol,
      engine.candleResolution,
      startSec - engine.warmupDays * 86400,
      endSec
    );
    if (candles.length < 100) {
      return NextResponse.json({ error: `Only ${candles.length} candles returned for ${deltaSymbol}` }, { status: 502 });
    }

    const trades = engine.run(candles, cfg);
    const stats = computeBacktestStats(trades, initialCapital);

    if (body.apply === true) {
      await prisma.strategy.update({
        where: { id },
        data: {
          equityData: stats.equityData as any,
          totalPnlPct: stats.totalPnlPct,
          winRate: stats.winRate,
          maxDrawdown: stats.maxDrawdown,
          profitFactor: stats.profitFactor,
          totalTrades: stats.totalTrades,
          initialCapitalUsd: initialCapital,
          engineConfig: cfg as any,
        } as any,
      });
      await prisma.strategyTrade.deleteMany({ where: { strategyId: id, source: "backtest" } });
      if (stats.backtestTrades.length) {
        await prisma.strategyTrade.createMany({
          data: stats.backtestTrades.map((t) => ({
            strategyId: id,
            source: "backtest",
            side: t.side,
            trade: t.type,
            signal: t.signal,
            price: t.price,
            size: t.size,
            netPnlUsd: t.netPnlUsd,
            netPnlPct: t.netPnlPct,
            cumulativePnlUsd: t.cumulativePnlUsd,
            tradeNumber: t.tradeNumber,
            symbol: strategy.symbol,
            firedAt: new Date(t.firedAt),
            totalFired: 0,
          })),
        });
      }
    }

    return NextResponse.json({
      applied: body.apply === true,
      candles: candles.length,
      config: cfg,
      stats: { ...stats, backtestTrades: undefined },
      trades: stats.backtestTrades,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Backtest failed" }, { status: 500 });
  }
}
