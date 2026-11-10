// npx tsx scripts/testChartData.ts
// Rows below are the real 9 Nov 2026 log (times converted to unix seconds, IST = UTC+5:30).
import { buildChartData, BAR_SECS } from "../lib/strategyEngine/chartData";

let bad = 0;
const check = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) bad++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : ` got ${JSON.stringify(got)} want ${JSON.stringify(want)}`}`);
};

const ist = (h: number, m: number) => Date.UTC(2026, 10, 9, h - 5, m - 30) / 1000; // 9 Nov 2026 h:m IST
const iso = (s: number) => new Date(s * 1000).toISOString();

const entry1 = ist(8, 30); // signal bar of the 09:00 short (not traded live: we were not running live yet)
const entry2 = ist(15, 0); // signal bar of the live short
const trade1 = { side: "sell", entryTime: entry1, entryPrice: 1.1097, exitTime: ist(13, 30), exitPrice: 1.0977, reason: "sell_liq_exit", netPnlPct: 1.02 };
const open2 = { side: "sell", entryTime: entry2, entryPrice: 1.0902, stopPrice: 1.1206, targetPrice: 0.9997, switchPrice: 1.069486, drawdownPrice: 1.133808 };

const rows = [
  // newest first
  { mode: "live", barTime: iso(ist(15, 30)), replay: { open: { ...open2, stopPrice: 1.1206 }, recent: [trade1] }, exchange: { position: { side: "sell", size: 1, entryPrice: 1.0897 }, stops: [{ id: 1, price: 1.1206 }], targets: [{ id: 2, price: 0.9997 }] }, actions: [] },
  { mode: "live", barTime: iso(entry2), replay: { open: open2, recent: [trade1] }, exchange: { position: null, stops: [], targets: [] }, actions: [{ type: "ENTER", side: "sell", lots: 1, previewLots: 168, result: { ok: true, detail: "entered" } }] },
  { mode: "live", barTime: iso(ist(14, 30)), replay: { open: null, recent: [trade1] }, exchange: { position: null }, actions: [] },
  { mode: "live", barTime: iso(ist(13, 0)), ok: false, notes: "error: ", replay: null, exchange: null, actions: null },
  { mode: "live", barTime: iso(ist(12, 30)), replay: { open: { side: "sell", entryTime: entry1, entryPrice: 1.1097, stopPrice: 1.101, targetPrice: 1.0 }, recent: [] }, exchange: { position: null }, actions: [{ type: "ALERT", message: "x" }] },
  { mode: "shadow", barTime: iso(ist(9, 0)), replay: { open: { side: "sell", entryTime: entry1, entryPrice: 1.1097, stopPrice: 1.1422, targetPrice: 1.0 }, recent: [] }, exchange: { position: null }, actions: [] },
];
const candles = [{ time: ist(15, 30), open: 1.09, high: 1.0899, low: 1.0866, close: 1.0874 }];
const d = buildChartData(rows, candles);

check("two trades, oldest first", d.trades.map((t) => t.entryTime), [entry1 + BAR_SECS, entry2 + BAR_SECS]);
check("09:00 short is engine-only (not live)", [d.trades[0].live, d.trades[0].fill], [false, null]);
check("closed trade carries exit and P&L", [d.trades[0].exitTime, d.trades[0].exitPrice, d.trades[0].pnlPct], [ist(13, 30) + BAR_SECS, 1.0977, 1.02]);
check("15:30 short is live, with the real fill", [d.trades[1].live, d.trades[1].fill, d.trades[1].lots, d.trades[1].exitTime], [true, 1.0897, 1, null]);
check("entry candle is 15:30 IST", iso(d.trades[1].entryTime), iso(ist(15, 30)));
check("stop trail has a point per bar the engine was open", d.stopTrail.map((p) => p.price), [1.1422, 1.101, 1.1206, 1.1206]);
check("error row (no replay) adds nothing to the trail", d.stopTrail.length, 4);
check("levels come from the exchange when it holds the position", [d.levels?.source, d.levels?.entryPrice, d.levels?.stop, d.levels?.target], ["exchange", 1.0897, 1.1206, 0.9997]);

check("switch and drawdown levels come from the engine", [d.levels?.switchPrice, d.levels?.drawdownPrice], [1.069486, 1.133808]);

// 10 Nov 21:00 row: Delta still held the 20:30 stop (1.0720) when the row was read; the row then moved it to 1.0677
const moved = buildChartData([{ mode: "live", barTime: iso(ist(15, 30)), replay: { open: open2, recent: [] }, exchange: { position: { side: "sell", size: 1, entryPrice: 1.0897 }, stops: [{ id: 1, price: 1.0720 }], targets: [{ id: 2, price: 0.9997 }] }, actions: [{ type: "SET_STOP", price: 1.0677, result: { ok: true } }] }], candles);
check("stop shown is the one just placed, not the one read before it", moved.levels?.stop, 1.0677);
const failed = buildChartData([{ mode: "live", barTime: iso(ist(15, 30)), replay: { open: open2, recent: [] }, exchange: { position: { side: "sell", size: 1, entryPrice: 1.0897 }, stops: [{ id: 1, price: 1.0720 }], targets: [] }, actions: [{ type: "SET_STOP", price: 1.0677, result: { ok: false } }] }], candles);
check("a failed stop move is not shown", failed.levels?.stop, 1.0720);
const entered = buildChartData([{ mode: "live", barTime: iso(ist(15, 0)), replay: { open: open2, recent: [] }, exchange: { position: null, stops: [], targets: [] }, actions: [{ type: "ENTER", stopPrice: 1.1206, targetPrice: 0.9997, result: { ok: true } }] }], candles);
check("entry bar shows the stop and target just placed", [entered.levels?.source, entered.levels?.stop, entered.levels?.target], ["exchange", 1.1206, 0.9997]);

const flat = buildChartData([{ mode: "live", barTime: iso(ist(15, 0)), replay: { open: open2, recent: [] }, exchange: { position: null, stops: [], targets: [] }, actions: [] }], candles);
check("flat exchange: engine levels, no fill", [flat.levels?.source, flat.levels?.stop, flat.levels?.target, flat.trades[0].live], ["engine", 1.1206, 0.9997, false]);

const longOpen = buildChartData([{ mode: "shadow", barTime: iso(ist(15, 0)), replay: { open: { side: "buy", entryTime: entry2, entryPrice: 1.09, stopPrice: 1.05, targetPrice: 10900 }, recent: [] }, exchange: { position: null }, actions: [] }], candles);
check("9999% long target means no target", longOpen.levels?.target, null);
check("no rows at all is safe", buildChartData([], []).trades.length, 0);

console.log(bad ? `\n${bad} FAILED` : "\nall passed");
process.exit(bad ? 1 : 0);
