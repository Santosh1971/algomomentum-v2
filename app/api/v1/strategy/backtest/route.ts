// app/api/v1/strategy/backtest/route.ts
import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import { runPdhPdl } from "@/lib/strategies/pdh_pdl";
import { runEmaCross } from "@/lib/strategies/ema_cross";
import { Candle, StrategyConfig } from "@/lib/strategies/types";

const DELTA_BASE = "https://api.india.delta.exchange";

async function fetchCandles(symbol: string, resolution: string, limit: number): Promise<Candle[]> {
  const resMap: Record<string, number> = {
    "1m": 60, "3m": 180, "5m": 300, "15m": 900, "30m": 1800,
    "1h": 3600, "2h": 7200, "4h": 14400, "1d": 86400,
  };
  const resSecs = resMap[resolution] ?? 900;
  const end = Math.floor(Date.now() / 1000);
  const start = end - limit * resSecs;
  const r = await axios.get(`${DELTA_BASE}/v2/history/candles`, {
    params: { symbol, resolution, start, end },
  });
  return (r.data?.result ?? [])
    .map((c: any) => ({ time: c.time, open: parseFloat(c.open), high: parseFloat(c.high), low: parseFloat(c.low), close: parseFloat(c.close) }))
    .sort((a: Candle, b: Candle) => a.time - b.time);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { symbol, strategy, timeframe, rr, sessionStart, sessionEnd, emaFast, emaSlow, retestBuffer } = body;

  if (!symbol || !strategy) {
    return NextResponse.json({ error: "symbol and strategy required" }, { status: 400 });
  }

  const config: StrategyConfig = {
    symbol, timeframe: timeframe ?? "15m",
    rr: rr ?? 2,
    sessionStart: sessionStart ?? "09:30",
    sessionEnd: sessionEnd ?? "23:30",
    emaFast: emaFast ?? 9,
    emaSlow: emaSlow ?? 21,
    retestBuffer: retestBuffer ?? 0.2,
  };

  try {
    // Fetch intraday candles (300 candles back)
    const candles = await fetchCandles(symbol, timeframe ?? "15m", 300);

    let result;
    if (strategy === "pdh_pdl") {
      // Also fetch daily candles for PDH/PDL levels (60 days)
      const dailyCandles = await fetchCandles(symbol, "1d", 60);
      result = runPdhPdl(candles, dailyCandles, config);
    } else if (strategy === "ema_cross") {
      result = runEmaCross(candles, config);
    } else {
      return NextResponse.json({ error: "Unknown strategy" }, { status: 400 });
    }

    return NextResponse.json({ success: true, candles, ...result });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? "Backtest failed" }, { status: 500 });
  }
}
