// lib/strategyEngine/liveExecutor.ts
//
// Turns the Action list from liveDecision.ts into real orders. It talks to Delta only through
// the small TradeApi interface so scripts/testExecutor.ts can run it against a fake exchange
// with injected failures. Nothing in this file knows about HTTP, keys or the database.
//
// Rules (from LIVE_RUNNER_DESIGN.md and the 15 Oct probe):
//  - Delta is the source of truth: re-read the account before acting, and after any order
//    that may or may not have been accepted (a timeout is not a failure).
//  - Never hold a position without a stop: if an entry fills and the stop cannot be placed
//    (or cannot be confirmed), close the position at market immediately and raise a critical alert.
//  - Editing a stop to a price already beyond the market is rejected by Delta
//    (immediate_execution_stop_order): close at market instead.
//  - Stop-loss orders are NOT cancelled when a position closes: cancel them after every exit
//    and before every entry.
//  - After the first failure the remaining actions for this bar are skipped.

import type { Action, ExchangeState } from "./liveDecision";

export type Side = "buy" | "sell";

export interface TradeApi {
  readState(): Promise<{ state: ExchangeState; balanceUsd: number }>;
  setLeverage(leverage: number): Promise<void>;
  marketOrder(a: { side: Side; size: number; reduceOnly: boolean; clientOrderId: string }): Promise<void>;
  placeStop(a: { side: Side; size: number; stopPrice: number; clientOrderId: string }): Promise<{ id: number | string }>;
  placeTarget(a: { side: Side; size: number; price: number; clientOrderId: string }): Promise<{ id: number | string }>;
  editStop(id: number | string, stopPrice: number): Promise<void>;
  cancel(id: number | string): Promise<void>;
}

export interface ExecContext {
  /** open time (unix seconds) of the bar that just closed; used for client order ids */
  barTime: number;
  /** most lots any single entry may use; the executor enforces it again even though the runner already capped */
  maxLots: number;
  leverage: number;
  sleep?: (ms: number) => Promise<void>;
}

export interface ExecResult {
  ok: boolean;
  detail: string;
}

export interface ExecOutcome {
  results: ExecResult[]; // one per action, same order; actions after a failure get ok=false "skipped"
  critical: string[];    // things an admin must hear about
  halted: boolean;
}

const opposite = (s: Side): Side => (s === "buy" ? "sell" : "buy");
const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function isImmediateExecution(e: any): boolean {
  const text = `${e?.code ?? ""} ${e?.message ?? ""} ${JSON.stringify(e?.body ?? e?.response?.data ?? "")}`;
  return /immediate_execution/i.test(text);
}

class Halt extends Error {
  constructor(message: string, public critical = false) { super(message); }
}

export async function executeActions(api: TradeApi, actions: Action[], ctx: ExecContext): Promise<ExecOutcome> {
  const sleep = ctx.sleep ?? defaultSleep;
  const cid = (tag: string) => `a3-${ctx.barTime}-${tag}`.slice(0, 36);
  const results: ExecResult[] = [];
  const critical: string[] = [];
  let halted = false;

  /**
   * Best-effort flatten + cleanup. Never throws. Retries the close; only removes the leftover
   * stop/target orders once the account is confirmed flat (an open position keeps its stop).
   */
  async function emergencyClose(why: string): Promise<string> {
    const notes: string[] = [];
    try {
      for (let attempt = 1; attempt <= 3; attempt++) {
        const { state } = await api.readState();
        if (!state.position) break;
        try {
          await api.marketOrder({ side: opposite(state.position.side), size: state.position.size, reduceOnly: true, clientOrderId: cid(`emerg${attempt}`) });
          notes.push(`close attempt ${attempt} sent (${state.position.size} lots)`);
        } catch (e: any) { notes.push(`close attempt ${attempt} FAILED: ${e?.message ?? e}`); }
        await sleep(1500);
      }
      const fin = (await api.readState()).state;
      if (fin.position) {
        notes.push(`STILL OPEN: ${fin.position.side} ${fin.position.size}; existing stop orders left in place. MANUAL ACTION NEEDED`);
      } else {
        for (const o of [...fin.stops, ...fin.targets]) {
          try { await api.cancel(o.id); } catch (e: any) { notes.push(`cancel ${o.id} failed: ${e?.message ?? e}`); }
        }
        const last = (await api.readState()).state;
        notes.push(last.stops.length || last.targets.length ? `flat, but ${last.stops.length + last.targets.length} order(s) could not be cancelled` : "flat, no orders left");
      }
    } catch (e: any) { notes.push(`emergency read failed: ${e?.message ?? e}`); }
    return `${why} -> ${notes.join("; ")}`;
  }

  async function cancelAll(): Promise<number> {
    const { state } = await api.readState();
    let n = 0;
    for (const o of [...state.stops, ...state.targets]) { await api.cancel(o.id); n++; }
    return n;
  }

  async function run(a: Action): Promise<string> {
    switch (a.type) {
      case "ALERT":
        critical.push(a.message);
        throw new Halt(a.message);

      case "CANCEL_ALL_STOPS": {
        const n = await cancelAll();
        const left = (await api.readState()).state;
        if (left.stops.length || left.targets.length) throw new Halt(`${left.stops.length + left.targets.length} order(s) still open after cancelling`, true);
        return `cancelled ${n} order(s)`;
      }

      case "ENTER": {
        const want = Math.min(Number(a.lots ?? 0), ctx.maxLots);
        if (!Number.isInteger(want) || want < 1) throw new Halt(`entry size is ${want} lots (balance too small, or no size given)`);
        const before = (await api.readState()).state;
        if (before.position) throw new Halt(`refusing to enter ${a.side}: the account already holds a ${before.position.side} (${before.position.size})`, true);
        for (const o of [...before.stops, ...before.targets]) await api.cancel(o.id);
        await api.setLeverage(ctx.leverage);

        try {
          await api.marketOrder({ side: a.side, size: want, reduceOnly: false, clientOrderId: cid("enter") });
        } catch (e: any) {
          // a timeout may still have filled: Delta decides, not us
          await sleep(1500);
          const chk = (await api.readState()).state;
          if (!chk.position) throw new Halt(`entry order failed and no position exists: ${e?.message ?? e}`);
        }
        await sleep(1500);
        const after = (await api.readState()).state;
        if (!after.position) throw new Halt("entry order was sent but no position appeared", true);
        if (after.position.side !== a.side) {
          const msg = await emergencyClose(`position is ${after.position.side}, expected ${a.side}`);
          throw new Halt(msg, true);
        }
        const size = after.position.size;
        if (size > ctx.maxLots) {
          const msg = await emergencyClose(`position size ${size} is above the ${ctx.maxLots}-lot limit`);
          throw new Halt(msg, true);
        }

        try {
          await api.placeStop({ side: opposite(a.side), size, stopPrice: a.stopPrice, clientOrderId: cid("stop") });
        } catch (e: any) {
          const msg = await emergencyClose(`stop at ${a.stopPrice} could not be placed (${e?.message ?? e})`);
          throw new Halt(msg, true);
        }
        const confirm = (await api.readState()).state;
        if (confirm.stops.length !== 1) {
          const msg = await emergencyClose(`expected 1 stop after placing it, found ${confirm.stops.length}`);
          throw new Halt(msg, true);
        }
        let note = "";
        if (a.targetPrice) {
          try { await api.placeTarget({ side: opposite(a.side), size, price: a.targetPrice, clientOrderId: cid("target") }); }
          catch (e: any) { note = `; target NOT placed (${e?.message ?? e}), stop is in place`; }
        }
        return `entered ${a.side} ${size} lots, stop ${a.stopPrice}${a.targetPrice ? `, target ${a.targetPrice}` : ""}${note}`;
      }

      case "SET_STOP": {
        const { state } = await api.readState();
        if (!state.position) return "no position, nothing to do";
        const stop = state.stops[0];
        try {
          if (stop) await api.editStop(stop.id, a.price);
          else await api.placeStop({ side: opposite(state.position.side), size: state.position.size, stopPrice: a.price, clientOrderId: cid("stop2") });
        } catch (e: any) {
          if (isImmediateExecution(e)) {
            const msg = await emergencyClose(`stop ${a.price} is already beyond the market`);
            throw new Halt(msg);
          }
          throw e;
        }
        return `stop ${stop ? "moved" : "placed"} at ${a.price}`;
      }

      case "SET_TARGET": {
        const { state } = await api.readState();
        if (!state.position) return "no position, nothing to do";
        for (const t of state.targets) await api.cancel(t.id);
        await api.placeTarget({ side: opposite(state.position.side), size: state.position.size, price: a.price, clientOrderId: cid("target2") });
        return `target set at ${a.price}`;
      }

      case "CLOSE_MARKET": {
        const { state } = await api.readState();
        if (!state.position) return "already flat";
        await api.marketOrder({ side: opposite(state.position.side), size: state.position.size, reduceOnly: true, clientOrderId: cid("close") });
        await sleep(1500);
        const after = (await api.readState()).state;
        if (after.position) throw new Halt(`close order sent but the account still holds ${after.position.side} ${after.position.size}`, true);
        return `closed ${state.position.size} lots at market`;
      }
    }
  }

  for (const a of actions) {
    if (halted) { results.push({ ok: false, detail: "skipped (an earlier action failed)" }); continue; }
    try {
      results.push({ ok: true, detail: await run(a) });
    } catch (e: any) {
      halted = true;
      const msg = String(e?.message ?? e);
      results.push({ ok: false, detail: msg });
      if (e instanceof Halt ? e.critical : true) critical.push(`${a.type}: ${msg}`);
    }
  }
  return { results, critical, halted };
}
