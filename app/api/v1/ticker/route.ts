import { NextRequest, NextResponse } from "next/server";
import axios from "axios";

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get("symbol");
  if (!symbol) return NextResponse.json({ error: "symbol required" }, { status: 400 });
  try {
    const r = await axios.get(`https://api.india.delta.exchange/v2/tickers?symbol=${symbol}`);
    const result = r.data?.result;
    const price = result?.close ?? result?.last_price ?? result?.mark_price ?? null;
    console.log(`Ticker ${symbol}:`, JSON.stringify(result));
    return NextResponse.json({ symbol, price });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
