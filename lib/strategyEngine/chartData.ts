// lib/strategyEngine/chartData.ts
//
// Pure helper for the chart on /admin/engine-log: turns the EngineRunLog rows plus recent candles into
// what the chart draws (entries, exits, the engine's stop trail, the stop/target now in force).
// No I/O, so scripts/testChartData.ts can check it.
//
// Time rule: the engine decides when a 30m bar CLOSES and the order goes in at that moment, which is the
// OPEN of the next candle. A trade's entryTime / a log row's barTime are the open time of the bar that just
// closed, so the candle the trade shows on is entryTime + 1800 (this is also the time the log page prints).

export const BAR_SECS = 1800;
const BAR = BAR_SECS;

export interface ChartCandle { time: number; open: number; high: number; low: number; close: number }

export interface ChartTrade {
  side: "buy" | "sell";
  /** open time (unix s) of the candle on which the entry happened */
  entryTime: number;
  entryPrice: number;
  exitTime: number | null;
  exitPrice: number | null;
  reason: string | null;
  pnlPct: number | null;
  /** the engine placed a real order for this entry (LIVE row with a successful ENTER) */
  live: boolean;
  /** price Delta actually filled, read from the next log row (null when unknown) */
  fill: number | null;
  lots: number | null;
}

export interface StopPoint { time: number; price: number; side: "buy" | "sell" }

export interface ChartLevels {
  side: "buy" | "sell";
  entryTime: number;
  entryPrice: number;
  stop: number | null;
  target: number | null;
  /** price at which the engine switches its stop logic (TradingView's "Switch SL" line); not an order on Delta */
  switchPrice: number | null;
  /** cap on how far the stop may sit from entry (TradingView's "DD" line); not an order on Delta */
  drawdownPrice: number | null;
  /** "exchange" = read from the orders open on Delta, "engine" = what the engine wants (nothing placed) */
  source: "exchange" | "engine";
  asOf: number;
}

export interface ChartData {
  candles: ChartCandle[];
  trades: ChartTrade[];
  stopTrail: StopPoint[];
  levels: ChartLevels | null;
}

const rowSec = (r: any) => Math.floor(new Date(r.barTime).getTime() / 1000);
const num = (v: any): number | null => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

/** @param rowsDesc EngineRunLog rows, newest first (as the API returns them) */
export function buildChartData(rowsDesc: any[], candles: ChartCandle[]): ChartData {
  const asc = [...rowsDesc].sort((a, b) => rowSec(a) - rowSec(b));

  // ---- real entries: LIVE rows whose ENTER action succeeded --------------------------------------------
  const liveEntries = new Map<number, { fill: number | null; lots: number | null }>();
  for (const r of asc) {
    if (r.mode !== "live") continue;
    const en = (r.actions ?? []).find((a: any) => a?.type === "ENTER" && a?.result?.ok);
    if (!en) continue;
    const t = rowSec(r);
    const next = asc.find((x) => x.mode === "live" && rowSec(x) === t + BAR);
    const pos = next?.exchange?.position;
    liveEntries.set(t, { fill: pos && pos.side === en.side ? num(pos.entryPrice) : null, lots: num(en.lots) });
  }

  // ---- the engine's trades (from the newest row that has a replay) -------------------------------------
  const latest = rowsDesc.find((r) => r?.replay);
  const trades: ChartTrade[] = [];
  const mk = (t: any, closed: boolean): ChartTrade => {
    const live = liveEntries.get(Number(t.entryTime));
    return {
      side: t.side,
      entryTime: Number(t.entryTime) + BAR,
      entryPrice: Number(t.entryPrice),
      exitTime: closed ? Number(t.exitTime) + BAR : null,
      exitPrice: closed ? Number(t.exitPrice) : null,
      reason: closed ? (t.reason ?? null) : null,
      pnlPct: closed ? num(t.netPnlPct) : null,
      live: !!live,
      fill: live?.fill ?? null,
      lots: live?.lots ?? null,
    };
  };
  for (const t of latest?.replay?.recent ?? []) trades.push(mk(t, true));
  if (latest?.replay?.open) trades.push(mk(latest.replay.open, false));
  trades.sort((a, b) => a.entryTime - b.entryTime);

  // ---- the engine's stop, bar by bar --------------------------------------------------------------------
  const trail = new Map<number, StopPoint>();
  for (const r of asc) {
    const open = r.replay?.open;
    const p = num(open?.stopPrice);
    if (open && p !== null) trail.set(rowSec(r) + BAR, { time: rowSec(r) + BAR, price: p, side: open.side });
  }
  const stopTrail = [...trail.values()].sort((a, b) => a.time - b.time);

  // ---- stop / target in force now -----------------------------------------------------------------------
  let levels: ChartLevels | null = null;
  const open = latest?.replay?.open;
  if (latest && open) {
    const ex = latest.exchange;
    const hasPos = !!ex?.position;
    const engineTarget = num(open.targetPrice);
    const usableEngineTarget = engineTarget !== null && engineTarget > 0 && engineTarget < Number(open.entryPrice) * 5 ? engineTarget : null;
    levels = {
      side: open.side,
      entryTime: Number(open.entryTime) + BAR,
      entryPrice: hasPos ? Number(ex.position.entryPrice) : Number(open.entryPrice),
      stop: hasPos ? num(ex.stops?.[0]?.price) : num(open.stopPrice),
      target: hasPos ? num(ex.targets?.[0]?.price) : usableEngineTarget,
      switchPrice: num(open.switchPrice),
      drawdownPrice: num(open.drawdownPrice),
      source: hasPos ? "exchange" : "engine",
      asOf: rowSec(latest) + BAR,
    };
  }

  // A row stores the exchange as it was BEFORE that bar's orders went in, so apply the orders that row placed successfully;
  // otherwise the stop / target shown would always be one bar behind what is really on Delta.
  if (levels) {
    for (const a of latest?.actions ?? []) {
      if (!a?.result?.ok) continue;
      if (a.type === "SET_STOP") levels.stop = num(a.price) ?? levels.stop;
      else if (a.type === "SET_TARGET") levels.target = num(a.price) ?? levels.target;
      else if (a.type === "ENTER") {
        levels.stop = num(a.stopPrice) ?? levels.stop;
        levels.target = num(a.targetPrice) ?? levels.target;
        levels.source = "exchange";
      }
    }
  }

  return { candles, trades, stopTrail, levels };
}
