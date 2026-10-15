// lib/strategyEngine/deltaReadonly.ts
//
// READ-ONLY Delta access for the engine runner (API-key accounts). Only GET requests
// exist in this file on purpose: shadow mode must not be able to place, edit or cancel
// anything. Order-placing code will live in a separate file when live mode is built.

import crypto from "crypto";
import axios from "axios";
import { decrypt } from "@/lib/vault";
import type { ExchangeState } from "./liveDecision";

const BASE_URL = "https://api.india.delta.exchange";

async function signedGet(acct: { api_key_enc: string; api_secret_enc: string }, path: string, query: Record<string, string> = {}) {
  const apiKey = decrypt(acct.api_key_enc);
  const apiSecret = decrypt(acct.api_secret_enc);
  const qs = Object.keys(query).length ? "?" + new URLSearchParams(query).toString() : "";
  const ts = Math.floor(Date.now() / 1000).toString();
  const signature = crypto.createHmac("sha256", apiSecret).update("GET" + ts + path + qs).digest("hex");
  const r = await axios.get(BASE_URL + path + qs, {
    headers: { Accept: "application/json", "api-key": apiKey, signature, timestamp: ts, "User-Agent": "algomomentum-v2/2.0" },
    timeout: 15000,
  });
  if (!r.data?.success) throw new Error(`Delta ${path} failed: ${JSON.stringify(r.data?.error ?? r.data)}`);
  return r.data.result;
}

export async function readExchangeState(
  acct: { api_key_enc: string; api_secret_enc: string },
  productId: number,
  symbol: string
): Promise<{ state: ExchangeState; balanceUsd: number; raw: any }> {
  const [positions, orders, balances] = await Promise.all([
    signedGet(acct, "/v2/positions/margined"),
    signedGet(acct, "/v2/orders", { product_ids: String(productId), states: "open,pending" }),
    signedGet(acct, "/v2/wallet/balances"),
  ]);

  const p = (positions ?? []).find((x: any) => x.product_symbol === symbol || x.product_id === productId);
  const size = Number(p?.size ?? 0);
  const position = size !== 0 ? { side: (size > 0 ? "buy" : "sell") as "buy" | "sell", size: Math.abs(size), entryPrice: Number(p.entry_price) } : null;

  const stops = (orders ?? [])
    .filter((o: any) => o.stop_order_type === "stop_loss_order")
    .map((o: any) => ({ id: o.id, price: Number(o.stop_price) }));
  const targets = (orders ?? [])
    .filter((o: any) => !o.stop_order_type && o.order_type === "limit_order" && o.reduce_only)
    .map((o: any) => ({ id: o.id, price: Number(o.limit_price) }));

  const usd = (balances ?? []).find((b: any) => ["USD", "USDT"].includes(b.asset_symbol));
  const balanceUsd = Number(usd?.balance ?? 0);

  return { state: { position, stops, targets }, balanceUsd, raw: { position: p ?? null, orders: (orders ?? []).length } };
}
