// lib/strategyEngine/deltaTrade.ts
//
// The ONLY file in the engine that places, edits or cancels Delta orders. It implements the small
// TradeApi interface used by liveExecutor.ts; nothing else in the runner talks to the exchange for writes.
// Request shapes are the ones proven on 15 Oct 2026 by scripts/deltaProbe.ts (see LIVE_RUNNER_DESIGN.md).
//
// Only used when the live guards in liveGuards.ts have all passed (liveRunner.ts checks them first).

import crypto from "crypto";
import axios from "axios";
import { decrypt } from "@/lib/vault";
import type { TradeApi, Side } from "./liveExecutor";
import { readExchangeState } from "./deltaReadonly";

const BASE_URL = "https://api.india.delta.exchange";
const TIMEOUT_MS = 15000;

type Acct = { api_key_enc: string; api_secret_enc: string };

/** Error that keeps Delta's response body where liveExecutor.isImmediateExecution() looks for it. */
export class DeltaError extends Error {
  constructor(public method: string, public path: string, public status: number | undefined, public body: unknown, message: string) {
    super(message);
  }
}

async function signedWrite(acct: Acct, method: "POST" | "PUT" | "DELETE", path: string, body: Record<string, unknown>): Promise<any> {
  const apiKey = decrypt(acct.api_key_enc);
  const apiSecret = decrypt(acct.api_secret_enc);
  const bodyStr = JSON.stringify(body);
  const ts = Math.floor(Date.now() / 1000).toString();
  const signature = crypto.createHmac("sha256", apiSecret).update(method + ts + path + "" + bodyStr).digest("hex");
  try {
    const r = await axios.request({
      method,
      url: BASE_URL + path,
      data: bodyStr,
      headers: { "Content-Type": "application/json", Accept: "application/json", "api-key": apiKey, signature, timestamp: ts, "User-Agent": "algomomentum-v2/2.0" },
      timeout: TIMEOUT_MS,
    });
    if (!r.data?.success) throw new DeltaError(method, path, r.status, r.data, `Delta ${method} ${path} failed: ${JSON.stringify(r.data?.error ?? r.data)}`);
    return r.data.result;
  } catch (e: any) {
    if (e instanceof DeltaError) throw e;
    const body = e?.response?.data;
    throw new DeltaError(method, path, e?.response?.status, body, `Delta ${method} ${path} ${e?.response?.status ?? "no response"}: ${body ? JSON.stringify(body.error ?? body) : (e?.message ?? e)}`);
  }
}

/** round a price to the tick and return a number without float noise */
export const toTick = (price: number, tick: number) => Number((Math.round(price / tick) * tick).toFixed(Math.max(0, Math.ceil(-Math.log10(tick)))));

export function createDeltaTradeApi(acct: Acct, productId: number, symbol: string, tick: number): TradeApi {
  const base = { product_id: productId, product_symbol: symbol };
  return {
    readState: async () => {
      const { state, balanceUsd } = await readExchangeState(acct, productId, symbol);
      return { state, balanceUsd };
    },

    setLeverage: async (leverage: number) => {
      await signedWrite(acct, "POST", `/v2/products/${productId}/orders/leverage`, { leverage: String(leverage) });
    },

    marketOrder: async ({ side, size, reduceOnly, clientOrderId }: { side: Side; size: number; reduceOnly: boolean; clientOrderId: string }) => {
      await signedWrite(acct, "POST", "/v2/orders", {
        ...base, size, side, order_type: "market_order", time_in_force: "ioc",
        ...(reduceOnly ? { reduce_only: true } : {}),
        client_order_id: clientOrderId,
      });
    },

    placeStop: async ({ side, size, stopPrice, clientOrderId }: { side: Side; size: number; stopPrice: number; clientOrderId: string }) => {
      const r = await signedWrite(acct, "POST", "/v2/orders", {
        ...base, size, side, order_type: "market_order", stop_order_type: "stop_loss_order",
        stop_price: toTick(stopPrice, tick), stop_trigger_method: "last_traded_price", reduce_only: true,
        client_order_id: clientOrderId,
      });
      return { id: r?.id };
    },

    placeTarget: async ({ side, size, price, clientOrderId }: { side: Side; size: number; price: number; clientOrderId: string }) => {
      const r = await signedWrite(acct, "POST", "/v2/orders", {
        ...base, size, side, order_type: "limit_order", limit_price: toTick(price, tick),
        reduce_only: true, time_in_force: "gtc", client_order_id: clientOrderId,
      });
      return { id: r?.id };
    },

    editStop: async (id: number | string, stopPrice: number) => {
      await signedWrite(acct, "PUT", "/v2/orders", { id: Number(id), ...base, stop_price: toTick(stopPrice, tick) });
    },

    cancel: async (id: number | string) => {
      await signedWrite(acct, "DELETE", "/v2/orders", { id: Number(id), product_id: productId });
    },
  };
}
