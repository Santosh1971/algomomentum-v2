import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import { runPdhPdl } from "@/lib/strategies/pdh_pdl";
import { runEmaCross } from "@/lib/strategies/ema_cross";
import { runALM3, ALM3Config } from "@/lib/strategies/alm3";
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
  const { symbol, strategy, timeframe, rr, sessionStart, sessionEnd,
          emaFast, emaSlow, retestBuffer,
          // ALM3 params
          stTimeframe, atrPeriod, factor,
          t3Fast, t3Slow, switchSLPercent, drawdownPercent,
          liquidatePercent, targetLongPercent, targetShortPercent,
          useADX, adxThreshold, useHTF_ST, htfTimeframe } = body;

  if (!symbol || !strategy) {
    return NextResponse.json({ error: "symbol and strategy required" }, { status: 400 });
  }

  try {
    if (strategy === "alm3") {
      const config: ALM3Config = {
        stTimeframe: stTimeframe ?? 35,
        atrPeriod: atrPeriod ?? 15,
        factor: factor ?? 3.0,
        t3Fast: t3Fast ?? 4,
        t3Slow: t3Slow ?? 7,
        switchSLPercent: switchSLPercent ?? 10,
        drawdownPercent: drawdownPercent ?? 10,
        liquidatePercent: liquidatePercent ?? 0.6,
        targetLongPercent: targetLongPercent ?? 15,
        targetShortPercent: targetShortPercent ?? 15,
        useADX: useADX ?? true,
        adxThreshold: adxThreshold ?? 25,
        useHTF_ST: useHTF_ST ?? true,
        htfTimeframe: htfTimeframe ?? 120,
        sessionStart: sessionStart ?? "09:30",
        sessionEnd: sessionEnd ?? "23:30",
      };

      // Fetch all candles in parallel
      const chartTF = timeframe ?? "30m";
      const stMinutes = config.stTimeframe; // 35
      // For 35m: fetch 5m candles (7×5=35), need enough to cover chart range
      // Chart: 500 candles of chartTF
      // ST: 500 * (chartTFmins/5) * 7 * 5m candles
      const chartMins = parseInt(chartTF) || 30;
      const fiveMinsNeeded = Math.ceil(500 * chartMins / 5) + 100;
      const htfMins = config.htfTimeframe;
      const htfNeeded = Math.ceil(500 * chartMins / htfMins) + 50;

      const [chartCandles, stCandles5m, htfCandles] = await Promise.all([
        fetchCandles(symbol, chartTF, 500),
        fetchCandles(symbol, "5m", Math.min(fiveMinsNeeded, 1000)),
        fetchCandles(symbol, `${htfMins}m`, Math.max(htfNeeded, 100)),
      ]);

      const result = runALM3(chartCandles, stCandles5m, htfCandles, config);
      return NextResponse.json({ success: true, candles: chartCandles, ...result });
    }

    // PDH/PDL and EMA cross (existing)
    const config: StrategyConfig = {
      symbol, timeframe: timeframe ?? "15m",
      rr: rr ?? 2,
      sessionStart: sessionStart ?? "09:30",
      sessionEnd: sessionEnd ?? "23:30",
      emaFast: emaFast ?? 9,
      emaSlow: emaSlow ?? 21,
      retestBuffer: retestBuffer ?? 0.2,
    };

    const candles = await fetchCandles(symbol, timeframe ?? "15m", 300);

    let result;
    if (strategy === "pdh_pdl") {
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
