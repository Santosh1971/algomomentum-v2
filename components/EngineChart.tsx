"use client";
// 30-minute XRPUSD candles with the engine's entries / exits and stops drawn on top. Plain SVG, no chart library.
// Solid + "LIVE" = a real order was placed. Faint + dashed = what the engine did on paper (shadow, or before live was on).
import { useMemo, useState } from "react";
import type { ChartData, ChartTrade } from "@/lib/strategyEngine/chartData";
import { BAR_SECS } from "@/lib/strategyEngine/chartData";

const W = 1000, H = 460, L = 8, R = 70, T = 50, B = 30;
const UP = "#16a34a", DOWN = "#dc2626", STOP = "#ea580c", ENTRY = "#2563eb", INK = "#161B22", GREY = "#9ca3af";

const ACTIVE = { backgroundColor: INK, color: "#fff", borderColor: INK } as const; // inline so the selected button never depends on a generated CSS class
const fmtTime =(s: number) => new Date(s * 1000).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
const fmtHour = (s: number) => new Date(s * 1000).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: false });
const fmtDay = (s: number) => new Date(s * 1000).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short" });
const p4 = (n: number) => n.toFixed(4);

export default function EngineChart({ data, error }: { data: (ChartData & { candleError?: string | null }) | null; error?: string | null }) {
  const [days, setDays] = useState<1 | 2 | 4>(2);
  const [fit, setFit] = useState(true); // scale the price axis so the target is on the chart (shows the real stop : target distance)

  const view = useMemo(() => {
    if (!data || !data.candles.length) return null;
    const bars = days * 48;
    const candles = data.candles.slice(-bars);
    const t0 = candles[0].time;
    const slots = candles.length + 6; // blank room on the right for labels
    const slot = (W - L - R) / slots;
    const x = (t: number) => L + ((t - t0) / BAR_SECS) * slot + slot / 2;
    const inView = (t: number) => t >= t0 - BAR_SECS && x(t) <= W - R;

    const trades = data.trades.filter((t) => (t.exitTime ?? Infinity) >= t0 && t.entryTime <= candles[candles.length - 1].time + BAR_SECS * 2);
    const trail = data.stopTrail.filter((p) => p.time >= t0);

    let lo = Math.min(...candles.map((c) => c.low)), hi = Math.max(...candles.map((c) => c.high));
    const widen = (v: number | null | undefined) => { if (v !== null && v !== undefined && Number.isFinite(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); } };
    for (const t of trades) { widen(t.entryPrice); widen(t.exitPrice); widen(t.fill); }
    for (const p of trail) widen(p.price);
    widen(data.levels?.stop);
    if (fit) { widen(data.levels?.target); widen(data.levels?.switchPrice); }
    const pad = (hi - lo) * 0.06 || 0.01;
    lo -= pad; hi += pad;
    const y = (p: number) => T + ((hi - p) / (hi - lo)) * (H - T - B);
    const clampY = (p: number) => Math.min(H - B - 2, Math.max(T + 2, y(p)));
    return { candles, t0, slot, x, y, clampY, inView, trades, trail, lo, hi };
  }, [data, days, fit]);

  if (error) return <div className="bg-white rounded-xl border p-4 text-sm text-red-600">Chart: {error}</div>;
  if (!data) return <div className="bg-white rounded-xl border p-4 text-sm text-gray-400">Loading chart…</div>;
  if (!view) return <div className="bg-white rounded-xl border p-4 text-sm text-gray-500">No candles to draw{data.candleError ? `: ${data.candleError}` : "."}</div>;

  const { candles, slot, x, y, clampY, inView, trades, trail, lo, hi } = view;
  const bodyW = Math.max(1.5, slot * 0.62);
  const ticks = Array.from({ length: 6 }, (_, i) => lo + ((hi - lo) * i) / 5);
  const last = candles[candles.length - 1];
  const levels = data.levels;
  const liveTrades = trades.filter((t) => t.live).length;

  // time axis: a label every 6 hours (12 bars), with the date where the day changes
  const axis = candles.filter((c) => new Date((c.time + 19800) * 1000).getUTCHours() % 6 === 0 && new Date((c.time + 19800) * 1000).getUTCMinutes() === 0);

  // stop trail as stepped path, broken where the engine was flat
  const trailPaths: string[] = [];
  let cur = "", prev: { time: number; price: number } | null = null;
  for (const p of trail) {
    const x0 = x(p.time) - slot / 2, x1 = x(p.time) + slot / 2;
    if (!prev || p.time - prev.time > BAR_SECS) { if (cur) trailPaths.push(cur); cur = `M${x0},${y(p.price)} L${x1},${y(p.price)}`; }
    else cur += ` L${x0},${y(p.price)} L${x1},${y(p.price)}`;
    prev = p;
  }
  if (cur) trailPaths.push(cur);

  // labels sit in lanes (top for entries, bottom for exits) so they never print over each other
  const used: { top: [number, number][][]; bottom: [number, number][][] } = { top: [], bottom: [] };
  const place = (where: "top" | "bottom", px: number, text: string, bold: boolean) => {
    const w = text.length * (bold ? 6.9 : 6.2);
    const anchorEnd = px + 4 + w > W - R - 4;
    const from = anchorEnd ? px - 4 - w : px + 4, to = from + w;
    let lane = 0;
    for (; lane < 3; lane++) {
      const taken = (used[where][lane] ??= []);
      if (!taken.some(([a, b]) => from < b + 6 && to > a - 6)) { taken.push([from, to]); break; }
    }
    return { lane: Math.min(lane, 2), tx: anchorEnd ? px - 4 : px + 4, anchor: anchorEnd ? ("end" as const) : ("start" as const) };
  };

  const tradeGfx = (t: ChartTrade, i: number) => {
    const sell = t.side === "sell";
    const col = sell ? DOWN : UP;
    const ex = x(t.entryTime);
    const py = y(t.fill ?? t.entryPrice);
    const op = t.live ? 1 : 0.55;
    const showEntry = inView(t.entryTime);
    const hasExit = t.exitTime !== null && t.exitPrice !== null;
    const xx = hasExit ? x(t.exitTime as number) : null;
    const win = (t.pnlPct ?? 0) >= 0;
    return (
      <g key={i} opacity={op}>
        {showEntry && <line x1={ex} x2={ex} y1={T} y2={H - B} stroke={col} strokeWidth={t.live ? 1.6 : 1} strokeDasharray={t.live ? "6 3" : "2 4"} />}
        {hasExit && xx !== null && inView(t.exitTime as number) && <line x1={xx} x2={xx} y1={T} y2={H - B} stroke={GREY} strokeWidth={1} strokeDasharray="2 4" />}
        {hasExit && xx !== null && showEntry && <line x1={ex} y1={py} x2={xx} y2={y(t.exitPrice as number)} stroke={win ? UP : DOWN} strokeWidth={1.6} strokeDasharray={t.live ? undefined : "4 3"} />}
        {showEntry && (
          <>
            <path d={sell ? `M${ex - 7},${py - 9} L${ex + 7},${py - 9} L${ex},${py} Z` : `M${ex - 7},${py + 9} L${ex + 7},${py + 9} L${ex},${py} Z`} fill={col} stroke={INK} strokeWidth={t.live ? 1.2 : 0} />
            {(() => {
              const text = `${t.live ? "LIVE " : ""}${t.side.toUpperCase()} ${p4(t.entryPrice)}${t.live && t.fill !== null ? ` (filled ${p4(t.fill)})` : ""}`;
              const p = place("top", ex, text, t.live);
              return <text x={p.tx} textAnchor={p.anchor} y={T - 22 + p.lane * 13} fontSize="11" fontWeight={t.live ? 700 : 400} fill={col}>{text}</text>;
            })()}
          </>
        )}
        {hasExit && xx !== null && inView(t.exitTime as number) && (
          <>
            <circle cx={xx} cy={y(t.exitPrice as number)} r={4.5} fill="#fff" stroke={win ? UP : DOWN} strokeWidth={2} />
            {(() => {
              const text = `exit ${p4(t.exitPrice as number)} ${t.pnlPct !== null ? `${t.pnlPct >= 0 ? "+" : ""}${t.pnlPct.toFixed(2)}%` : ""}`;
              const p = place("bottom", xx, text, false);
              return <text x={p.tx} textAnchor={p.anchor} y={H - B - 6 - p.lane * 13} fontSize="11" fill={win ? UP : DOWN}>{text}</text>;
            })()}
          </>
        )}
      </g>
    );
  };

  const lvl = (price: number | null, label: string, color: string) => {
    if (price === null || !levels || !inView(levels.entryTime)) return null;
    const outside = y(price) < T || y(price) > H - B;
    const yy = clampY(price);
    return (
      <g key={label}>
        <line x1={x(levels.entryTime)} x2={W - R} y1={yy} y2={yy} stroke={color} strokeWidth={1.4} strokeDasharray="7 4" />
        <text x={W - R - 6} y={outside && price < lo ? yy - 14 : yy - 4} fontSize="10.5" textAnchor="end" fill={color} fontWeight={700}>{label}</text>
      </g>
    );
  };

  // thin reference lines the engine uses internally (TradingView draws them too); they are not orders on Delta
  const ref = (price: number | null, label: string) => {
    if (price === null || !levels || !inView(levels.entryTime) || y(price) < T || y(price) > H - B) return null;
    return (
      <g key={label}>
        <line x1={x(levels.entryTime)} x2={W - R} y1={y(price)} y2={y(price)} stroke={GREY} strokeWidth={1} strokeDasharray="1 4" />
        <text x={x(levels.entryTime) + 8} y={y(price) - 4} fontSize="10" textAnchor="start" fill="#6b7280">{label} {p4(price)}</text>
      </g>
    );
  };

  // Price tags on the right axis (entry / stop / target / last price). Each line stays at its true price; when two tags would
  // overlap, the tags are spread apart (a short leader joins a moved tag to its line) so every number stays readable.
  const TAG_H = 19;
  const tagList = (() => {
    const items: { key: string; text: string; color: string; ly: number }[] = [];
    const add = (key: string, price: number | null | undefined, color: string) => {
      if (price === null || price === undefined || !levels || !inView(levels.entryTime)) return;
      const outside = y(price) < T || y(price) > H - B;
      items.push({ key, color, ly: clampY(price), text: `${outside ? (price < lo ? "▼ " : "▲ ") : ""}${p4(price)}` });
    };
    add("entry", levels?.entryPrice, ENTRY);
    add("stop", levels?.stop, STOP);
    add("target", levels?.target, UP);
    items.push({ key: "last", color: INK, ly: y(last.close), text: p4(last.close) });
    items.sort((a, b) => a.ly - b.ly);
    const ty = items.map((it) => it.ly);
    for (let i = 1; i < ty.length; i++) ty[i] = Math.max(ty[i], ty[i - 1] + TAG_H);           // push down
    const bottom = H - B + 6;
    for (let i = ty.length - 1; i >= 0; i--) {                                                 // then pull back up if it ran off the bottom
      if (i === ty.length - 1) ty[i] = Math.min(ty[i], bottom);
      else ty[i] = Math.min(ty[i], ty[i + 1] - TAG_H);
    }
    return items.map((it, i) => ({ ...it, ty: ty[i] }));
  })();

  // risk : reward of the open trade, measured from the entry price
  const rr = (() => {
    if (!levels || levels.stop === null || levels.target === null) return null;
    const risk = (Math.abs(levels.stop - levels.entryPrice) / levels.entryPrice) * 100;
    const reward = (Math.abs(levels.entryPrice - levels.target) / levels.entryPrice) * 100;
    return risk > 0 ? { risk, reward, ratio: reward / risk } : null;
  })();

  return (
    <div className="bg-white rounded-xl border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
        <div className="text-sm font-semibold text-[#161B22]">
          XRPUSD · 30m · IST
          <span className="ml-3 font-normal text-gray-500">{liveTrades} live trade{liveTrades === 1 ? "" : "s"} in view</span>
        </div>
        <div className="flex gap-1">
          <button onClick={() => setFit(!fit)} style={fit ? ACTIVE : undefined} className={"border rounded-md px-2.5 py-1 text-xs mr-2 " + (fit ? "" : "bg-white text-gray-600")} title="Include the target in the price scale so stop and target distances are true to scale">target to scale</button>
          {([1, 2, 4] as const).map((d) => (
            <button key={d} onClick={() => setDays(d)} style={days === d ? ACTIVE : undefined} className={"border rounded-md px-2.5 py-1 text-xs " + (days === d ? "" : "bg-white text-gray-600")}>{d}d</button>
          ))}
        </div>
      </div>
      <div className="text-xs text-gray-500 mb-1 flex flex-wrap gap-x-4 gap-y-1">
        <span><b style={{ color: DOWN }}>▼</b> sell entry · <b style={{ color: UP }}>▲</b> buy entry · ○ exit</span>
        <span>solid &amp; <b>LIVE</b> = real order · faint dashed = engine on paper only</span>
        <span><b style={{ color: STOP }}>━</b> engine stop (moves each bar) · <b style={{ color: ENTRY }}>╌</b> entry price</span>
        {rr && <span className="font-semibold text-[#161B22]">open trade: stop {rr.risk.toFixed(1)}% away · target {rr.reward.toFixed(1)}% away · 1 : {rr.ratio.toFixed(1)}</span>}
        {levels && <span>levels as of {fmtTime(levels.asOf)}, from {levels.source === "exchange" ? "the orders open on Delta" : "the engine (nothing placed)"}</span>}
      </div>
      {data.candleError && <div className="text-xs text-amber-700 mb-1">Candles may be stale: {data.candleError}</div>}
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="XRPUSD 30 minute candles with engine trades">
        <rect x={0} y={0} width={W} height={H} fill="#fff" />
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="#eef0f3" />
            <text x={W - R + 6} y={y(t) + 4} fontSize="10.5" fill="#6b7280">{p4(t)}</text>
          </g>
        ))}
        {axis.map((c) => (
          <g key={c.time}>
            <line x1={x(c.time)} x2={x(c.time)} y1={T} y2={H - B} stroke="#f3f4f6" />
            <text x={x(c.time)} y={H - 10} fontSize="10.5" textAnchor="middle" fill="#6b7280">{fmtHour(c.time) === "00:00" ? fmtDay(c.time) : fmtHour(c.time)}</text>
          </g>
        ))}
        {candles.map((c) => {
          const up = c.close >= c.open, col = up ? UP : DOWN, cx = x(c.time);
          return (
            <g key={c.time}>
              <title>{`${fmtTime(c.time)}  O ${p4(c.open)}  H ${p4(c.high)}  L ${p4(c.low)}  C ${p4(c.close)}`}</title>
              <line x1={cx} x2={cx} y1={y(c.high)} y2={y(c.low)} stroke={col} strokeWidth={1} />
              <rect x={cx - bodyW / 2} y={Math.min(y(c.open), y(c.close))} width={bodyW} height={Math.max(1, Math.abs(y(c.open) - y(c.close)))} fill={col} />
            </g>
          );
        })}
        {trailPaths.map((d, i) => <path key={i} d={d} fill="none" stroke={STOP} strokeWidth={1.6} opacity={0.9} />)}
        {trades.map(tradeGfx)}
        {lvl(levels?.entryPrice ?? null, "entry", ENTRY)}
        {lvl(levels?.stop ?? null, "stop", STOP)}
        {lvl(levels?.target ?? null, "target", UP)}
        {ref(levels?.switchPrice ?? null, "switch")}
        {ref(levels?.drawdownPrice ?? null, "DD cap")}
        <line x1={L} x2={W - R} y1={y(last.close)} y2={y(last.close)} stroke={INK} strokeWidth={0.8} strokeDasharray="1 3" />
        {tagList.map((t) => (
          <g key={t.key}>
            {Math.abs(t.ty - t.ly) > 1 && <line x1={W - R} x2={W - R + 2} y1={t.ly} y2={t.ty} stroke={t.color} strokeWidth={1} />}
            <rect x={W - R + 2} y={t.ty - 9} width={R - 4} height={18} rx={3} fill={t.color} />
            <text x={W - R + 6} y={t.ty + 4} fontSize="10.5" fill="#fff" fontWeight={700}>{t.text}</text>
          </g>
        ))}
      </svg>
      <div className="text-xs text-gray-400 mt-1">Hover a candle for its prices. An entry sits on the candle that opened when the order went in (the bar after the signal bar). Exits are drawn at the engine's own exit candle and price; Delta's fill can differ a little, and a stop or target hit between bars shows on Delta first.</div>
    </div>
  );
}
