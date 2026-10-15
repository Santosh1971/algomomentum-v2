/**
 * Walk-forward check for the live-runner approach.
 *
 * A live runner only sees a rolling window of recent candles (not the full history the
 * backtest used). It re-runs the engine on that window after every bar close and acts on
 * the result. This script does exactly that at every historical bar and compares what the
 * "live" runner would have done against the full-history backtest:
 *
 *   - entries: a live entry is a bar where the windowed run ends with a position whose
 *     entryTime is that very bar
 *   - exits:   at each backtest exit bar, the windowed run should show the position closed
 *
 *   npx tsx scripts/walkForward.ts [windowBars=1440]
 */
import fs from "fs";
import path from "path";
import { runALM3XrpT3, runALM3XrpT3State, ALM3_XRP_T3_DEFAULTS } from "../lib/strategyEngine/alm3XrpT3";

const raw = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "backtest-data", "xrpusd_30m.json"), "utf-8"));
const candles = raw.candles;
const W = Number(process.argv[2] ?? 1440);
const cfg = { ...ALM3_XRP_T3_DEFAULTS, startTime: 0 };

const batch = runALM3XrpT3(candles, cfg);
const firstIdx = W + 50;
const firstTime = candles[firstIdx].time;
const batchTrades = batch.filter((t) => t.entryTime >= firstTime);

const idxByTime = new Map<number, number>();
candles.forEach((c: any, i: number) => idxByTime.set(c.time, i));

const liveEntries = new Map<number, { side: string; price: number }>();
const closedAt = new Map<number, { price: number; reason: string }>(); // bars where the windowed run's last completed trade exited on this bar (a same-bar re-entry may follow)
const t0 = Date.now();
for (let i = firstIdx; i < candles.length; i++) {
  const win = candles.slice(i - W + 1, i + 1);
  const res = runALM3XrpT3State(win, cfg);
  const t = candles[i].time;
  if (res.open && res.open.entryTime === t) liveEntries.set(t, { side: res.open.side, price: res.open.entryPrice });
  const last = res.trades[res.trades.length - 1];
  if (last && last.exitTime === t) closedAt.set(t, { price: last.exitPrice, reason: last.exitReason });
}
console.log(`window=${W} bars, ${candles.length - firstIdx} walk-forward steps in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

let entryMatch = 0, entryMissing = 0;
const missing: string[] = [];
for (const t of batchTrades) {
  const le = liveEntries.get(t.entryTime);
  if (le && le.side === t.side && Math.abs(le.price - t.entryPrice) < 1e-9) entryMatch++;
  else { entryMissing++; missing.push(new Date(t.entryTime * 1000).toISOString()); }
}
const batchEntryTimes = new Set(batchTrades.map((t) => t.entryTime));
const extra = [...liveEntries.keys()].filter((t) => !batchEntryTimes.has(t));
let exitMatch = 0, exitPriceMatch = 0;
for (const t of batchTrades) {
  const c = closedAt.get(t.exitTime);
  if (c) { exitMatch++; if (Math.abs(c.price - t.exitPrice) < 1e-9 && c.reason === t.exitReason) exitPriceMatch++; }
}

console.log(`backtest trades in range: ${batchTrades.length}`);
console.log(`  live entry == backtest entry : ${entryMatch}`);
console.log(`  backtest entry missed live   : ${entryMissing}  ${missing.slice(0, 8).join(" ")}`);
console.log(`  live entries not in backtest : ${extra.length}  ${extra.slice(0, 8).map((x) => new Date(x * 1000).toISOString()).join(" ")}`);
console.log(`  exit seen on the same bar    : ${exitMatch} / ${batchTrades.length}`);
console.log(`  ...same price and reason     : ${exitPriceMatch} / ${batchTrades.length}`);
