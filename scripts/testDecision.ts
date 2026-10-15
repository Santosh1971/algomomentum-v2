/**
 * Simulated-exchange test of lib/strategyEngine/liveDecision.ts.
 *
 * Walks forward over the whole history, re-running the engine on a rolling 30-day window
 * at each bar close (what the live runner will do), asks decide() what to do, applies those
 * actions to a simulated exchange, and checks after every bar that:
 *   - the simulated exchange position matches the engine's open position
 *   - no ALERT was raised (an alert means the logic and the exchange disagreed)
 *   - no stop order is left behind after a position closes
 * The simulated exchange follows the behaviour measured in the Delta probe (stops are NOT
 * auto-cancelled when a position is closed by another order; a limit target is).
 *
 *   npx tsx scripts/testDecision.ts [windowBars=1440]
 */
import fs from "fs";
import path from "path";
import { runALM3XrpT3State, ALM3_XRP_T3_DEFAULTS } from "../lib/strategyEngine/alm3XrpT3";
import { decide, ExchangeState } from "../lib/strategyEngine/liveDecision";

const raw = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "backtest-data", "xrpusd_30m.json"), "utf-8"));
const candles = raw.candles;
const W = Number(process.argv[2] ?? 1440);
const cfg = { ...ALM3_XRP_T3_DEFAULTS, startTime: 0 };
const TICK = 0.0001;

const ex: ExchangeState = { position: null, stops: [], targets: [] };
let steps = 0, mismatches = 0, alerts = 0, leftovers = 0, entries = 0, closes = 0, stopMoves = 0, safetyCloses = 0;
const problems: string[] = [];

for (let i = W + 50; i < candles.length; i++) {
  const c = candles[i];

  // 1) what the exchange did during this bar, using the orders placed at the previous bar close
  if (ex.position) {
    const stop = ex.stops[0], tgt = ex.targets[0];
    const long = ex.position.side === "buy";
    const stopHit = stop && (long ? c.low <= stop.price : c.high >= stop.price);
    const tgtHit = tgt && (long ? c.high >= tgt.price : c.low <= tgt.price);
    if (stopHit) { ex.position = null; ex.stops = []; ex.targets = []; }          // stop consumed, limit target auto-cancelled
    else if (tgtHit) { ex.position = null; ex.targets = []; /* stop is left behind */ }
  }

  // 2) bar close: replay + decide + apply
  const res = runALM3XrpT3State(candles.slice(i - W + 1, i + 1), cfg);
  const actions = decide(res, ex, c.time, TICK, c.close);
  for (const a of actions) {
    if (a.type === "ENTER") { ex.position = { side: a.side, size: 1, entryPrice: c.close }; ex.stops = [{ id: 1, price: a.stopPrice }]; ex.targets = a.targetPrice ? [{ id: 2, price: a.targetPrice }] : []; entries++; }
    else if (a.type === "SET_STOP") { ex.stops = [{ id: 1, price: a.price }]; stopMoves++; }
    else if (a.type === "SET_TARGET") ex.targets = [{ id: 2, price: a.price }];
    else if (a.type === "CLOSE_MARKET") { ex.position = null; ex.targets = []; closes++; }
    else if (a.type === "CANCEL_ALL_STOPS") { ex.stops = []; ex.targets = []; }
    else if (a.type === "ALERT") { alerts++; if (problems.length < 6) problems.push(`${new Date(c.time * 1000).toISOString()} ALERT ${a.message}`); }
    if (a.type === "CLOSE_MARKET" && /still open/.test(a.why)) safetyCloses++;
  }

  // 3) invariants after every bar
  steps++;
  if ((ex.position?.side ?? null) !== (res.open?.side ?? null)) { mismatches++; if (problems.length < 6) problems.push(`${new Date(c.time * 1000).toISOString()} exchange=${ex.position?.side ?? "flat"} engine=${res.open?.side ?? "flat"}`); }
  if (!ex.position && (ex.stops.length || ex.targets.length)) { leftovers++; if (problems.length < 6) problems.push(`${new Date(c.time * 1000).toISOString()} leftover orders while flat`); }
}

console.log(`window=${W}  steps=${steps}`);
console.log(`entries=${entries}  market closes=${closes} (of which a price-level stop failed to fill: ${safetyCloses})  stop edits=${stopMoves}`);
console.log(`position mismatches=${mismatches}  alerts=${alerts}  leftover orders while flat=${leftovers}`);
if (problems.length) console.log(problems.join("\n"));
process.exit(mismatches || alerts || leftovers ? 1 : 0);
