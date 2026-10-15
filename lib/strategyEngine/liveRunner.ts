// lib/strategyEngine/liveRunner.ts
//
// SHADOW-MODE runner for the ALM3 XRP T3 engine. After every 30-minute bar close it:
//   1. fetches the last ~30 days of closed candles (public Delta endpoint)
//   2. replays the engine over them (same result as the full-history backtest —
//      see scripts/walkForward.ts)
//   3. reads the account's actual position / orders from Delta (GET only)
//   4. decides what it WOULD do (liveDecision.ts) and writes that to EngineRunLog
// It never places, edits or cancels an order. Live mode is deliberately not implemented.
//
// Off unless ENGINE_RUNNER_ACCOUNT_ID is set (in .env). Optional: ENGINE_RUNNER_MODE=shadow.

import cron from "node-cron";
import { prisma } from "@/lib/prisma";
import { fetchDeltaCandles } from "./fetchCandles";
import { runALM3XrpT3State, ALM3_XRP_T3_DEFAULTS } from "./alm3XrpT3";
import { decide } from "./liveDecision";
import { readExchangeState } from "./deltaReadonly";

const BAR = 1800; // 30m
const SYMBOL = "XRPUSD";
const PRODUCT_ID = 14969;
const TICK = 0.0001;
const LEVERAGE = 2;
const WINDOW_SECS = 31 * 86400;
const ENGINE = "alm3_xrp_t3";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function runShadowOnce(): Promise<void> {
  const accountId = process.env.ENGINE_RUNNER_ACCOUNT_ID;
  if (!accountId) return;
  const mode = process.env.ENGINE_RUNNER_MODE ?? "shadow";
  if (mode !== "shadow") {
    console.error(`[EngineRunner] mode "${mode}" is not implemented — only "shadow". Doing nothing.`);
    return;
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const barTimeSec = Math.floor(nowSec / BAR) * BAR - BAR; // open time of the bar that just closed
  const barTime = new Date(barTimeSec * 1000);

  const existing = await prisma.engineRunLog.findUnique({ where: { accountId_barTime_mode: { accountId, barTime, mode } } });
  if (existing) return; // already evaluated this bar

  const write = (data: { ok: boolean; replay?: any; exchange?: any; actions?: any; notes?: string }) =>
    prisma.engineRunLog
      .create({ data: { accountId, engineType: ENGINE, mode, barTime, ...data } })
      .catch((e: any) => { if (e?.code !== "P2002") throw e; });

  try {
    const acct = await prisma.deltaAccount.findUnique({ where: { id: accountId } });
    if (!acct) return void (await write({ ok: false, notes: "account not found" }));
    if (acct.accountType === "main" || acct.is_oauth || !acct.api_key_enc) {
      return void (await write({ ok: false, notes: `refusing account type=${acct.accountType} oauth=${acct.is_oauth}: shadow runner is for API-key sub-accounts only` }));
    }

    // candles: wait briefly for the just-closed bar to be published
    let closed: Awaited<ReturnType<typeof fetchDeltaCandles>> = [];
    for (let attempt = 1; attempt <= 4; attempt++) {
      const all = await fetchDeltaCandles(SYMBOL, "30m", nowSec - WINDOW_SECS, nowSec);
      closed = all.filter((c) => c.time + BAR <= Math.floor(Date.now() / 1000));
      if (closed.length && closed[closed.length - 1].time === barTimeSec) break;
      if (attempt < 4) await sleep(10_000);
    }
    const last = closed[closed.length - 1];
    if (!last || last.time !== barTimeSec) {
      return void (await write({ ok: false, notes: `candle for bar ${barTime.toISOString()} not available (latest ${last ? new Date(last.time * 1000).toISOString() : "none"})` }));
    }
    if (closed.length < 600) return void (await write({ ok: false, notes: `only ${closed.length} candles returned, need ≥ 600` }));

    const replay = runALM3XrpT3State(closed, { ...ALM3_XRP_T3_DEFAULTS, startTime: 0 });
    const { state, balanceUsd, raw } = await readExchangeState(acct, PRODUCT_ID, SYMBOL);
    const actions = decide(replay, state, barTimeSec, TICK, last.close).map((a) =>
      a.type === "ENTER" ? { ...a, previewLots: Math.floor((balanceUsd * LEVERAGE) / last.close) } : a
    );

    const lastTrade = replay.trades[replay.trades.length - 1] ?? null;
    await write({
      ok: !actions.some((a) => a.type === "ALERT"),
      replay: { open: replay.open, lastTrade, barClose: last.close, candles: closed.length },
      exchange: { ...state, balanceUsd, raw },
      actions,
    });
    console.log(`[EngineRunner] bar ${barTime.toISOString()} engine=${replay.open ? replay.open.side : "flat"} exchange=${state.position ? state.position.side : "flat"} actions=${actions.map((a) => a.type).join(",") || "none"}`);
  } catch (e: any) {
    console.error("[EngineRunner] failed:", e?.message ?? e);
    await write({ ok: false, notes: `error: ${String(e?.message ?? e).slice(0, 500)}` }).catch(() => {});
  }
}

let started = false;
export function startEngineRunnerCron() {
  if (started || !process.env.ENGINE_RUNNER_ACCOUNT_ID) return; // off unless configured
  started = true;
  // 10 seconds after each 30-minute boundary (UTC :00 and :30 are also IST :30 and :00)
  cron.schedule("10 0,30 * * * *", () => { runShadowOnce().catch((e) => console.error("[EngineRunner] fatal:", e)); }, { timezone: "UTC" });
  console.log(`[EngineRunner] Scheduled (${process.env.ENGINE_RUNNER_MODE ?? "shadow"} mode) — every 30 min for account ${process.env.ENGINE_RUNNER_ACCOUNT_ID}`);
}
