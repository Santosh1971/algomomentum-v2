import { NextRequest, NextResponse } from "next/server";
import axios from "axios";

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get("symbol");
  const resolution = req.nextUrl.searchParams.get("resolution") || "15";
  const limit = parseInt(req.nextUrl.searchParams.get("limit") || "100");

  if (!symbol) return NextResponse.json({ error: "symbol required" }, { status: 400 });

  const end = Math.floor(Date.now() / 1000);
  const start = end - limit * parseInt(resolution) * 60;

  try {
    const r = await axios.get(`https://api.india.delta.exchange/v2/history/candles`, {
      params: { symbol, resolution, start, end }
    });

    const raw = r.data?.result ?? [];
    const candles = raw.map((c: any) => ({
      time: c.time,
      open: parseFloat(c.open),
      high: parseFloat(c.high),
      low: parseFloat(c.low),
      close: parseFloat(c.close),
    })).sort((a: any, b: any) => a.time - b.time);

    return NextResponse.json({ symbol, candles });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
