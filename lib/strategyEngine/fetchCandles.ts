// lib/strategyEngine/fetchCandles.ts
// Paged historical candle fetch from Delta's public (unauthenticated,
// unmetered) candle endpoint. Server-side only.

import axios from "axios";
import { Candle } from "./indicators";

const BASE_URL = "https://api.india.delta.exchange";
const RES_SECS: Record<string, number> = {
  "1m": 60, "3m": 180, "5m": 300, "15m": 900, "30m": 1800,
  "1h": 3600, "2h": 7200, "4h": 14400, "1d": 86400,
};
const PAGE_CANDLES = 2000;
const MAX_ATTEMPTS = 5;

export async function fetchDeltaCandles(
  symbol: string,
  resolution: string,
  startSec: number,
  endSec: number
): Promise<Candle[]> {
  const resSecs = RES_SECS[resolution];
  if (!resSecs) throw new Error(`Unsupported resolution: ${resolution}`);

  const byTime = new Map<number, Candle>();
  for (let cursor = startSec; cursor < endSec; cursor += PAGE_CANDLES * resSecs) {
    const pageEnd = Math.min(cursor + PAGE_CANDLES * resSecs, endSec);
    let rows: any[] = [];
    for (let attempt = 1; ; attempt++) {
      try {
        const r = await axios.get(`${BASE_URL}/v2/history/candles`, {
          params: { symbol, resolution, start: cursor, end: pageEnd },
          timeout: 20000,
        });
        rows = r.data?.result ?? [];
        break;
      } catch (e: any) {
        if (attempt >= MAX_ATTEMPTS) {
          const body = e.response?.data?.error ?? e.response?.data;
          const detail = [e.code, e.response?.status, typeof body === "string" ? body : body ? JSON.stringify(body) : "", e.message].filter(Boolean).join(" ");
          throw new Error(`Delta candle fetch failed after ${attempt} attempts: ${detail}`.slice(0, 400));
        }
        await new Promise((res) => setTimeout(res, 1500 * attempt)); // 1.5s, 3s, 4.5s, 6s
      }
    }
    for (const c of rows) {
      byTime.set(c.time, {
        time: c.time,
        open: parseFloat(c.open),
        high: parseFloat(c.high),
        low: parseFloat(c.low),
        close: parseFloat(c.close),
        volume: c.volume !== undefined ? parseFloat(c.volume) : undefined,
      });
    }
    await new Promise((res) => setTimeout(res, 200));
  }
  return Array.from(byTime.values()).sort((a, b) => a.time - b.time);
}
