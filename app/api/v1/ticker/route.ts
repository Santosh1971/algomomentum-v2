import { NextRequest, NextResponse } from "next/server";
import axios from "axios";

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get("symbol");
  if (!symbol) return NextResponse.json({ error: "symbol required" }, { status: 400 });
  try {
    const r = await axios.get("https://api.india.delta.exchange/v2/tickers");
    const tickers: any[] = r.data?.result ?? [];
    const ticker = tickers.find((t: any) => t.symbol === symbol);
    if (!ticker) return NextResponse.json({ symbol, price: null, available: tickers.length });
    const price = parseFloat(ticker.close ?? ticker.mark_price ?? ticker.last_price);
    return NextResponse.json({ symbol, price });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
