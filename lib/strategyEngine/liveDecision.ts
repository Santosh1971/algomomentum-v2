// lib/strategyEngine/liveDecision.ts
//
// Pure decision logic for the live runner: given what the engine says should be
// happening after the bar that just closed, and what the exchange actually holds,
// return the actions to take. No I/O here, so it can be tested against a
// simulated exchange (scripts/testDecision.ts) and reused unchanged by shadow
// mode (logs the actions) and live mode (executes them).
//
// Rules come from the Delta probe results in LIVE_RUNNER_DESIGN.md:
//  - stop-loss orders are NOT cancelled when a position closes -> always cancel
//    leftover stops after an exit and before an entry
//  - editing a stop to a price already beyond the market is rejected -> if the
//    engine has exited, close at market instead of editing
//  - never guess on a mismatch: alert and do nothing

import type { EngineResult } from "./alm3XrpT3";

export interface ExchangeOrder {
  id: number | string;
  price: number;
}

export interface ExchangeState {
  position: { side: "buy" | "sell"; size: number; entryPrice: number } | null;
  stops: ExchangeOrder[];   // reduce-only stop-loss orders on this product
  targets: ExchangeOrder[]; // reduce-only limit (take-profit) orders on this product
}

export type Action =
  | { type: "CANCEL_ALL_STOPS"; why: string }
  | { type: "ENTER"; side: "buy" | "sell"; stopPrice: number; targetPrice: number | null; why: string; previewLots?: number; lots?: number }
  | { type: "SET_STOP"; price: number; why: string }
  | { type: "SET_TARGET"; price: number; why: string }
  | { type: "CLOSE_MARKET"; why: string }
  | { type: "ALERT"; message: string };

/** Very large long targets (targetLongPercent = 9999) mean "no target". */
function usableTarget(target: number, entry: number): number | null {
  return Number.isFinite(target) && target > 0 && target < entry * 5 ? target : null;
}

export function decide(replay: EngineResult, ex: ExchangeState, lastBarTime: number, tick: number, lastClose: number): Action[] {
  const actions: Action[] = [];
  const open = replay.open;
  const lastTrade = replay.trades[replay.trades.length - 1];
  const exitedThisBar = !!lastTrade && lastTrade.exitTime === lastBarTime;
  const justEntered = !!open && open.entryTime === lastBarTime;
  const same = (a: number, b: number) => Math.abs(a - b) < tick / 2;

  if (!ex.position) {
    // ---- exchange is flat ----
    if (justEntered && open) {
      if (ex.stops.length || ex.targets.length) actions.push({ type: "CANCEL_ALL_STOPS", why: "leftover orders before a new entry" });
      actions.push({
        type: "ENTER",
        side: open.side,
        stopPrice: open.stopPrice,
        targetPrice: usableTarget(open.targetPrice, open.entryPrice),
        why: `engine entered on bar ${lastBarTime}`,
      });
    } else if (open) {
      actions.push({
        type: "ALERT",
        message: `engine has an open ${open.side} since ${open.entryTime} but the exchange is flat (started mid-trade, or closed by hand?). Doing nothing.`,
      });
    } else if (ex.stops.length || ex.targets.length) {
      actions.push({ type: "CANCEL_ALL_STOPS", why: "flat, but stop/target orders are still open" });
    }
    return actions;
  }

  // ---- exchange holds a position ----
  if (open && open.side === ex.position.side) {
    const stop = ex.stops[0];
    if (ex.stops.length > 1) actions.push({ type: "ALERT", message: `${ex.stops.length} stop orders open, expected 1` });
    if (!stop || !same(stop.price, open.stopPrice)) actions.push({ type: "SET_STOP", price: open.stopPrice, why: stop ? "stop moved with the bar" : "no stop on the exchange" });
    const tgt = usableTarget(open.targetPrice, open.entryPrice);
    const have = ex.targets[0];
    if (tgt !== null && (!have || !same(have.price, tgt))) actions.push({ type: "SET_TARGET", price: tgt, why: have ? "target changed" : "no target on the exchange" });
    return actions;
  }

  if (open && open.side !== ex.position.side) {
    actions.push({ type: "ALERT", message: `engine is ${open.side} but the exchange holds a ${ex.position.side}. Doing nothing.` });
    return actions;
  }

  // engine is flat, exchange still holds a position
  if (exitedThisBar && lastTrade) {
    // An exit at this bar's close (ribbon cross, or the recomputed stop is already beyond the
    // close - the "hybrid" case, ~14% of trades) is ours to execute with a market order: the
    // exchange stop was not touched. An exit at a price LEVEL means the price crossed the stop
    // during the bar, so the exchange stop should have filled; if the position is still open
    // that is a failure — close at market and alert.
    const atClose = Math.abs(lastTrade.exitPrice - lastClose) < tick / 2;
    actions.push({ type: "CLOSE_MARKET", why: atClose ? `exit at bar close (${lastTrade.exitReason})` : `engine exited at a price level (${lastTrade.exitReason}) but the exchange position is still open` });
    actions.push({ type: "CANCEL_ALL_STOPS", why: "exit — remove leftover stop/target" });
    if (!atClose) actions.push({ type: "ALERT", message: `price-level exit (${lastTrade.exitReason} @ ${lastTrade.exitPrice}) was not filled by the exchange stop; closed at market` });
  } else {
    actions.push({ type: "ALERT", message: `exchange holds a ${ex.position.side} (${ex.position.size}) but the engine is flat and did not exit on this bar. Foreign or manual position — doing nothing.` });
  }
  return actions;
}
