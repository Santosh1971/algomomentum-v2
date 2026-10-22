/**
 * Test of lib/strategyEngine/liveExecutor.ts and liveGuards.ts against a FAKE exchange. No network, no real orders.
 *
 * The fake exchange behaves like the Delta probe results in LIVE_RUNNER_DESIGN.md:
 *   - a market order fills at the bar close
 *   - a reduce-only stop edited/placed beyond the market is rejected (immediate_execution_stop_order)
 *   - when a position is closed by another order the limit target is cancelled but the STOP stays open
 *   - between bars the exchange fires stops/targets using the candle high/low
 *
 *   npx tsx scripts/testExecutor.ts [windowBars=480] [lastBars=12000]
 *
 * Run A (no failures): the exchange must track the engine exactly, with no leftovers and no critical alerts.
 * Run B (random failures injected: stop placement fails, entry times out after filling, edits fail, orders rejected):
 *   after EVERY bar there must never be a position without exactly one stop, never orders while flat,
 *   never more than the lot cap, and the executor must never throw.
 */
import fs from "fs";
import path from "path";
import { runALM3XrpT3State, ALM3_XRP_T3_DEFAULTS } from "../lib/strategyEngine/alm3XrpT3";
import { decide, ExchangeState } from "../lib/strategyEngine/liveDecision";
import { executeActions, TradeApi, Side } from "../lib/strategyEngine/liveExecutor";
import { checkLiveGuards, LIVE_CONFIRM_TEXT } from "../lib/strategyEngine/liveGuards";

const raw = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "backtest-data", "xrpusd_30m.json"), "utf-8"));
const candles = raw.candles;
const W = Number(process.argv[2] ?? 480);
const LAST = Number(process.argv[3] ?? 12000);
const cfg = { ...ALM3_XRP_T3_DEFAULTS, startTime: 0 };
const TICK = 0.0001;
const MAX_LOTS = 5;
let failures = 0;
const fail = (m: string) => { failures++; if (failures <= 12) console.log("  FAIL " + m); };

// ---------------------------------------------------------------- guards
{
  const base = { env: { ENGINE_LIVE_CONFIRM: LIVE_CONFIRM_TEXT, ENGINE_MAX_LOTS: "3" }, killSwitchOn: false, accountType: "sub", isOauth: false, hasApiKey: true, balanceUsd: 50, activeWebhookBots: 0 };
  const cases: [string, any, boolean][] = [
    ["all good", base, true],
    ["no confirm text", { ...base, env: { ENGINE_MAX_LOTS: "3" } }, false],
    ["kill switch on", { ...base, killSwitchOn: true }, false],
    ["lots missing", { ...base, env: { ENGINE_LIVE_CONFIRM: LIVE_CONFIRM_TEXT } }, false],
    ["lots not a whole number", { ...base, env: { ENGINE_LIVE_CONFIRM: LIVE_CONFIRM_TEXT, ENGINE_MAX_LOTS: "2.5" } }, false],
    ["lots above ceiling", { ...base, env: { ENGINE_LIVE_CONFIRM: LIVE_CONFIRM_TEXT, ENGINE_MAX_LOTS: "500" } }, false],
    ["main account", { ...base, accountType: "main" }, false],
    ["oauth account", { ...base, isOauth: true }, false],
    ["balance above cap", { ...base, balanceUsd: 5000 }, false],
    ["balance zero", { ...base, balanceUsd: 0 }, false],
    ["webhook bot active", { ...base, activeWebhookBots: 1 }, false],
  ];
  for (const [name, input, want] of cases) {
    const r = checkLiveGuards(input);
    if (r.ok !== want) fail(`guard "${name}": expected ${want ? "allowed" : "refused"}, got ${r.ok ? "allowed" : "refused: " + r.reason}`);
  }
  console.log(`guards: ${cases.length} cases checked`);
}

// ---------------------------------------------------------------- fake exchange
class Rng { constructor(private s: number) {} next() { this.s = (this.s * 1664525 + 1013904223) % 4294967296; return this.s / 4294967296; } }

class FakeEx implements TradeApi {
  position: { side: Side; size: number; entryPrice: number } | null = null;
  orders: { id: number; kind: "stop" | "target"; price: number }[] = [];
  nextId = 1;
  price = 1;
  balance = 100;
  calls = { marketOrder: 0, placeStop: 0, editStop: 0, cancel: 0 };
  constructor(private rng: Rng | null, private p: { stopFail: number; entryTimeout: number; entryReject: number; editFail: number; closeFail: number }) {}

  private maybe(prob: number) { return this.rng !== null && this.rng.next() < prob; }
  async readState() {
    const state: ExchangeState = {
      position: this.position ? { ...this.position } : null,
      stops: this.orders.filter((o) => o.kind === "stop").map((o) => ({ id: o.id, price: o.price })),
      targets: this.orders.filter((o) => o.kind === "target").map((o) => ({ id: o.id, price: o.price })),
    };
    return { state, balanceUsd: this.balance };
  }
  async setLeverage() {}
  async marketOrder(a: { side: Side; size: number; reduceOnly: boolean }) {
    this.calls.marketOrder++;
    const entering = !a.reduceOnly;
    if (entering && this.maybe(this.p.entryReject)) throw new Error("order rejected");
    if (!entering && this.maybe(this.p.closeFail)) throw new Error("close failed");
    if (entering) {
      this.position = { side: a.side, size: a.size, entryPrice: this.price };
      if (this.maybe(this.p.entryTimeout)) throw new Error("timeout of 15000ms exceeded"); // order filled but we never saw the reply
    } else if (this.position) {
      this.position = null;
      this.orders = this.orders.filter((o) => o.kind !== "target"); // limit target is cancelled, stop stays
    }
  }
  private checkStop(side: Side, price: number) {
    if ((side === "sell" && price >= this.price) || (side === "buy" && price <= this.price)) {
      const e: any = new Error("HTTP 400 immediate_execution_stop_order"); e.code = "immediate_execution_stop_order"; throw e;
    }
  }
  async placeStop(a: { side: Side; size: number; stopPrice: number }) {
    this.calls.placeStop++;
    if (!this.position) throw new Error("reduce-only stop with no position");
    if (this.maybe(this.p.stopFail)) throw new Error("stop placement failed");
    this.checkStop(a.side, a.stopPrice);
    const id = this.nextId++; this.orders.push({ id, kind: "stop", price: a.stopPrice }); return { id };
  }
  async placeTarget(a: { side: Side; size: number; price: number }) {
    const id = this.nextId++; this.orders.push({ id, kind: "target", price: a.price }); return { id };
  }
  async editStop(id: number | string, price: number) {
    this.calls.editStop++;
    const o = this.orders.find((x) => x.id === id && x.kind === "stop");
    if (!o) throw new Error("order not found");
    if (this.maybe(this.p.editFail)) throw new Error("socket hang up");
    this.checkStop(this.position?.side === "buy" ? "sell" : "buy", price);
    o.price = price;
  }
  async cancel(id: number | string) { this.calls.cancel++; this.orders = this.orders.filter((o) => o.id !== id); }

  /** what the exchange did during a bar, using the orders in place at the previous close */
  tick(c: { high: number; low: number }) {
    if (!this.position) return;
    const long = this.position.side === "buy";
    const stop = this.orders.find((o) => o.kind === "stop"), tgt = this.orders.find((o) => o.kind === "target");
    if (stop && (long ? c.low <= stop.price : c.high >= stop.price)) { this.position = null; this.orders = []; }
    else if (tgt && (long ? c.high >= tgt.price : c.low <= tgt.price)) { this.position = null; this.orders = this.orders.filter((o) => o.kind === "stop"); }
  }
}

async function run(label: string, ex: FakeEx, injected: boolean) {
  let armed = false; let shownCrit = 0; let steps = 0, entries = 0, crit = 0, mism = 0, leftover = 0, unprot = 0, oversize = 0, thrown = 0, maxSeen = 0;
  const start = Math.max(W + 50, candles.length - LAST);
  for (let i = start; i < candles.length; i++) {
    const c = candles[i];
    ex.tick(c); ex.price = c.close;
    const res = runALM3XrpT3State(candles.slice(i - W + 1, i + 1), cfg);
    if (!armed) { if (res.open) continue; armed = true; } // like the runner: never join a trade that is already running
    const { state, balanceUsd } = await ex.readState();
    const actions = decide(res, state, c.time, TICK, c.close).map((a) =>
      a.type === "ENTER" ? { ...a, lots: Math.min(MAX_LOTS, Math.floor((balanceUsd * 2) / c.close)) } : a
    );
    try {
      const out = await executeActions(ex, actions, { barTime: c.time, maxLots: MAX_LOTS, leverage: 2, sleep: async () => {} });
      crit += out.critical.length;
      if (!injected && out.critical.length && shownCrit < 3) { shownCrit++; console.log(`   first critical @ ${new Date(c.time * 1000).toISOString()}: ${out.critical.join(' | ')}\n     actions=${JSON.stringify(actions)}\n     results=${JSON.stringify(out.results)}\n     ex=${JSON.stringify({ pos: ex.position, orders: ex.orders, price: ex.price })}`); }
      entries += out.results.filter((r, k) => r.ok && actions[k].type === "ENTER").length;
    } catch (e: any) { thrown++; fail(`${label}: executeActions threw at ${new Date(c.time * 1000).toISOString()}: ${e?.message}`); }
    steps++;
    const stops = ex.orders.filter((o) => o.kind === "stop").length;
    if (ex.position) { maxSeen = Math.max(maxSeen, ex.position.size); if (ex.position.size > MAX_LOTS) oversize++; if (stops !== 1) { unprot++; if (unprot < 4) fail(`${label}: position with ${stops} stops at ${new Date(c.time * 1000).toISOString()}`); } }
    else if (ex.orders.length) { leftover++; if (leftover < 4) fail(`${label}: orders left while flat at ${new Date(c.time * 1000).toISOString()}`); }
    if (!injected) {
      if ((ex.position?.side ?? null) !== (res.open?.side ?? null)) { mism++; if (mism < 4) fail(`${label}: exchange=${ex.position?.side ?? "flat"} engine=${res.open?.side ?? "flat"} at ${new Date(c.time * 1000).toISOString()}`); }
      else if (res.open && ex.position) {
        const st = ex.orders.find((o) => o.kind === "stop");
        if (!st || Math.abs(st.price - res.open.stopPrice) > TICK / 2) { mism++; if (mism < 4) fail(`${label}: stop on exchange ${st?.price} != engine ${res.open.stopPrice}`); }
      }
    }
  }
  console.log(`${label}: bars=${steps} entries=${entries} biggest position=${maxSeen} lots | calls: market=${ex.calls.marketOrder} stop=${ex.calls.placeStop} edit=${ex.calls.editStop} cancel=${ex.calls.cancel}`);
  console.log(`   position without exactly one stop=${unprot}  orders while flat=${leftover}  over lot cap=${oversize}  executor exceptions=${thrown}  critical alerts=${crit}${injected ? "" : `  engine/exchange mismatches=${mism}`}`);
  if (!injected && crit) fail(`${label}: ${crit} critical alert(s) in a failure-free run`);
  if (!injected && !entries) fail(`${label}: no entries at all`);
  if (unprot || leftover || oversize || thrown) fail(`${label}: safety invariant broken`);
}

(async () => {
  // direct checks of single behaviours
  {
    const ex = new FakeEx(null, { stopFail: 0, entryTimeout: 0, entryReject: 0, editFail: 0, closeFail: 0 });
    ex.price = 1.3; ex.position = { side: "buy", size: 2, entryPrice: 1.3 };
    const out = await executeActions(ex, [{ type: "ENTER", side: "buy", stopPrice: 1.25, targetPrice: null, why: "t", lots: 3 }], { barTime: 1, maxLots: MAX_LOTS, leverage: 2, sleep: async () => {} });
    if (out.results[0].ok || !out.critical.length || ex.position?.size !== 2) fail("ENTER on top of an existing position must be refused and flagged");
    const ex2 = new FakeEx(null, { stopFail: 0, entryTimeout: 0, entryReject: 0, editFail: 0, closeFail: 0 });
    ex2.price = 1.3;
    const o2 = await executeActions(ex2, [{ type: "ENTER", side: "buy", stopPrice: 1.25, targetPrice: null, why: "t", lots: 99 }], { barTime: 2, maxLots: MAX_LOTS, leverage: 2, sleep: async () => {} });
    if (!o2.results[0].ok || ex2.position?.size !== MAX_LOTS) fail(`lot cap: expected ${MAX_LOTS} lots, got ${ex2.position?.size}`);
    const ex3 = new FakeEx(null, { stopFail: 0, entryTimeout: 0, entryReject: 0, editFail: 0, closeFail: 0 });
    ex3.price = 1.3;
    const o3 = await executeActions(ex3, [{ type: "ENTER", side: "buy", stopPrice: 1.35, targetPrice: null, why: "t", lots: 2 }], { barTime: 3, maxLots: MAX_LOTS, leverage: 2, sleep: async () => {} });
    if (ex3.position || ex3.orders.length || !o3.critical.length) fail("a stop on the wrong side of the market must lead to an immediate close and a critical alert");
    console.log("single-case checks done");
  }

  await run("A (no failures)", new FakeEx(null, { stopFail: 0, entryTimeout: 0, entryReject: 0, editFail: 0, closeFail: 0 }), false);
  for (const seed of [12345, 777, 2024, 99, 31337]) {
    await run(`B seed ${seed} (injected failures)`, new FakeEx(new Rng(seed), { stopFail: 0.05, entryTimeout: 0.05, entryReject: 0.03, editFail: 0.04, closeFail: 0.05 }), true);
  }
  console.log(failures ? `\n${failures} FAILURE(S)` : "\nALL CHECKS PASSED");
  process.exit(failures ? 1 : 0);
})();
