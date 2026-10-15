/**
 * Delta order-API probe — answers the "VERIFY" questions in
 * lib/strategyEngine/LIVE_RUNNER_DESIGN.md using a SUB-ACCOUNT and 1 lot.
 *
 * Run on the VPS (needs DATABASE_URL + vault key from .env, and Delta access):
 *
 *   npx tsx scripts/deltaProbe.ts --account <DeltaAccount.id>          # DRY RUN: read-only checks
 *   npx tsx scripts/deltaProbe.ts --account <DeltaAccount.id> --go     # places real 1-lot orders
 *
 * Safety (all enforced in code):
 *  - refuses accountType "main" and OAuth accounts (API-key sub-accounts only)
 *  - refuses if the account's USD balance is above --max-balance-usd (default 100)
 *    — this is what stops it ever running against your main account by mistake
 *  - size is always 1 lot (1 XRP, about $1.3); leverage 2x
 *  - whatever happens, it tries to cancel its orders and flatten the position at the end
 */
import crypto from "crypto";
import axios from "axios";
import fs from "fs";
import "dotenv/config"; // must be the first side-effect import: loads .env before lib/prisma reads DATABASE_URL
import { prisma } from "../lib/prisma";
import { decrypt } from "../lib/vault";

const BASE_URL = "https://api.india.delta.exchange";
const SYMBOL = "XRPUSD";
const PRODUCT_ID = 14969;

const arg = (n: string) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : undefined; };
const GO = process.argv.includes("--go");
const SCEN = arg("--scenario"); // optional: "autocancel"
const accountId = arg("--account");
const MAX_BAL = Number(arg("--max-balance-usd") ?? 100);
const log: any[] = [];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let apiKey = "", apiSecret = "";

async function call(method: "GET" | "POST" | "PUT" | "DELETE", path: string, opts: { query?: Record<string, string>; body?: any; auth?: boolean; label: string }) {
  const qs = opts.query ? "?" + new URLSearchParams(opts.query).toString() : "";
  const bodyStr = opts.body ? JSON.stringify(opts.body) : "";
  const headers: Record<string, string> = { "Content-Type": "application/json", Accept: "application/json", "User-Agent": "algomomentum-v2/2.0" };
  if (opts.auth !== false) {
    const ts = Math.floor(Date.now() / 1000).toString();
    headers["api-key"] = apiKey; headers["timestamp"] = ts;
    headers["signature"] = crypto.createHmac("sha256", apiSecret).update(method + ts + path + qs + bodyStr).digest("hex");
  }
  let res: any;
  try {
    const r = await axios.request({ method, url: BASE_URL + path + qs, headers, data: opts.body ? bodyStr : undefined, validateStatus: () => true });
    res = { status: r.status, data: r.data };
  } catch (e: any) { res = { status: 0, data: String(e.message) }; }
  log.push({ t: new Date().toISOString(), label: opts.label, method, path: path + qs, body: opts.body, ...res });
  const ok = res.data?.success === true;
  console.log(`${ok ? "OK  " : "FAIL"} ${opts.label} -> HTTP ${res.status} ${ok ? "" : JSON.stringify(res.data)}`);
  return res.data;
}

const round = (x: number, tick: number) => (Math.round(x / tick) * tick).toFixed(Math.max(0, (String(tick).split(".")[1] ?? "").length));

async function getPosition() {
  const p = await call("GET", "/v2/positions/margined", { label: "get positions" });
  return (p?.result ?? []).find((x: any) => x.product_symbol === SYMBOL || x.product_id === PRODUCT_ID);
}
async function openOrders() {
  const o = await call("GET", "/v2/orders", { query: { product_ids: String(PRODUCT_ID), states: "open,pending" }, label: "list open+pending orders" });
  return o?.result ?? [];
}

async function main() {
  if (!accountId) throw new Error("--account <DeltaAccount.id> is required");
  const acct = await prisma.deltaAccount.findUnique({ where: { id: accountId } });
  if (!acct) throw new Error("account not found");
  console.log(`Account: ${acct.accountName} (type=${acct.accountType}, oauth=${acct.is_oauth})`);
  if (acct.accountType === "main") throw new Error("REFUSING: this is a main account");
  if (acct.is_oauth || !acct.api_key_enc) throw new Error("REFUSING: needs an API-key account (not OAuth)");
  apiKey = decrypt(acct.api_key_enc); apiSecret = decrypt(acct.api_secret_enc);

  // --- read-only checks (always) ---
  const bal = await call("GET", "/v2/wallet/balances", { label: "wallet balances" });
  const usd = (bal?.result ?? []).find((b: any) => ["USD", "USDT"].includes(b.asset_symbol));
  const avail = Number(usd?.balance ?? 0);
  console.log(`USD balance on this account: ${avail}`);
  if (!(avail > 0)) throw new Error("no USD balance found — fund the sub-account first");
  if (avail > MAX_BAL) throw new Error(`REFUSING: balance ${avail} > --max-balance-usd ${MAX_BAL}. Is this really the sub-account?`);

  const prod = await call("GET", `/v2/products/${SYMBOL}`, { auth: false, label: "product info" });
  const tick = Number(prod?.result?.tick_size ?? 0.0001);
  const tk = await call("GET", `/v2/tickers/${SYMBOL}`, { auth: false, label: "ticker" });
  const last = Number(tk?.result?.close ?? tk?.result?.mark_price);
  console.log(`tick=${tick} contract_value=${prod?.result?.contract_value} last=${last}`);
  const existing = await getPosition();
  if (existing && Number(existing.size) !== 0) throw new Error(`REFUSING: ${SYMBOL} position already open on this account (size ${existing.size})`);

  if (!GO) { console.log("\nDRY RUN complete — nothing was placed. Re-run with --go to place the 1-lot test orders."); return; }

  let cleanupNeeded = true;
  try {
    const cid = (s: string) => `probe-${s}-${Date.now()}`;
    await call("POST", `/v2/products/${PRODUCT_ID}/orders/leverage`, { body: { leverage: "2" }, label: "set leverage 2x" });

    if (SCEN === "autocancel") {
      // Do stop/target orders disappear when the position is closed by ANOTHER order?
      await call("POST", "/v2/orders", { label: "ENTRY market buy 1 lot", body: { product_id: PRODUCT_ID, product_symbol: SYMBOL, size: 1, side: "buy", order_type: "market_order", time_in_force: "ioc", client_order_id: cid("entry") } });
      await sleep(2000);
      const p0 = await getPosition(); const e0 = Number(p0?.entry_price ?? last);
      await call("POST", "/v2/orders", { label: "STOP-LOSS (-3%)", body: { product_id: PRODUCT_ID, product_symbol: SYMBOL, size: 1, side: "sell", order_type: "market_order", stop_order_type: "stop_loss_order", stop_price: round(e0 * 0.97, tick), stop_trigger_method: "last_traded_price", reduce_only: true, client_order_id: cid("sl") } });
      await call("POST", "/v2/orders", { label: "TARGET limit (+10%)", body: { product_id: PRODUCT_ID, product_symbol: SYMBOL, size: 1, side: "sell", order_type: "limit_order", limit_price: round(e0 * 1.10, tick), reduce_only: true, time_in_force: "gtc", client_order_id: cid("tp") } });
      console.log("closing the position with a market order, NOT cancelling the stop/target...");
      await call("POST", "/v2/orders", { label: "CLOSE market reduce-only (stop/target left in place)", body: { product_id: PRODUCT_ID, product_symbol: SYMBOL, size: 1, side: "sell", order_type: "market_order", time_in_force: "ioc", reduce_only: true, client_order_id: cid("close") } });
      await sleep(2500);
      const left = await openOrders();
      console.log(`RESULT autocancel: position size=${(await getPosition())?.size ?? 0}, orders still open after the position closed = ${left.length}`, left.map((o: any) => `${o.id}:${o.stop_order_type ?? o.order_type}`));
      return; // cleanup below cancels anything left
    }

    // 1) entry
    await call("POST", "/v2/orders", { label: "ENTRY market buy 1 lot", body: { product_id: PRODUCT_ID, product_symbol: SYMBOL, size: 1, side: "buy", order_type: "market_order", time_in_force: "ioc", client_order_id: cid("entry") } });
    await sleep(2000);
    const pos = await getPosition();
    const entry = Number(pos?.entry_price ?? last);
    console.log(`position size=${pos?.size} entry=${entry}`);

    // 2) stop-loss (reduce-only stop-market, trigger on last traded price)
    const sl = await call("POST", "/v2/orders", { label: "STOP-LOSS stop-market reduce-only (-3%)", body: { product_id: PRODUCT_ID, product_symbol: SYMBOL, size: 1, side: "sell", order_type: "market_order", stop_order_type: "stop_loss_order", stop_price: round(entry * 0.97, tick), stop_trigger_method: "last_traded_price", reduce_only: true, client_order_id: cid("sl") } });
    const slId = sl?.result?.id;

    // 3) target as a plain reduce-only limit far above market
    await call("POST", "/v2/orders", { label: "TARGET reduce-only limit sell (+10%)", body: { product_id: PRODUCT_ID, product_symbol: SYMBOL, size: 1, side: "sell", order_type: "limit_order", limit_price: round(entry * 1.10, tick), reduce_only: true, time_in_force: "gtc", client_order_id: cid("tp") } });
    await sleep(1000);
    console.log("open orders after placing:", (await openOrders()).map((o: any) => `${o.id}:${o.side}:${o.stop_order_type ?? o.order_type}@${o.stop_price ?? o.limit_price}`));

    // 4) move the stop (this is what the runner would do every bar)
    if (slId) await call("PUT", "/v2/orders", { label: "EDIT stop-loss to -2.5%", body: { id: slId, product_id: PRODUCT_ID, product_symbol: SYMBOL, stop_price: round(entry * 0.975, tick) } });

    // 5) edge case: move a sell stop ABOVE the market (already "beyond") — rejected, or does it fire?
    if (slId) {
      await call("PUT", "/v2/orders", { label: "EDGE: edit stop ABOVE market (+1%) — rejected or fires?", body: { id: slId, product_id: PRODUCT_ID, product_symbol: SYMBOL, stop_price: round(last * 1.01, tick) } });
      await sleep(2000);
      const after = await getPosition();
      console.log(`after edge test: position size=${after?.size ?? 0}  (0 means the stop fired immediately)`);
    }
  } finally {
    if (cleanupNeeded) {
      console.log("\n--- cleanup: cancel orders, flatten ---");
      for (const o of await openOrders()) await call("DELETE", "/v2/orders", { label: `cancel ${o.id}`, body: { id: o.id, product_id: PRODUCT_ID } });
      const p = await getPosition();
      const sz = Number(p?.size ?? 0);
      if (sz !== 0) await call("POST", "/v2/orders", { label: "FLATTEN market reduce-only", body: { product_id: PRODUCT_ID, product_symbol: SYMBOL, size: Math.abs(sz), side: sz > 0 ? "sell" : "buy", order_type: "market_order", time_in_force: "ioc", reduce_only: true, client_order_id: `probe-flat-${Date.now()}` } });
      await sleep(1500);
      const left = await openOrders(); const fp = await getPosition();
      console.log(`final: open orders=${left.length}, position size=${fp?.size ?? 0}`);
      cleanupNeeded = false;
    }
  }
}

main()
  .catch((e) => console.error("\nABORTED:", e.message))
  .finally(async () => {
    const f = `probe-log-${Date.now()}.json`;
    // keys are never logged; request bodies/responses only
    fs.writeFileSync(f, JSON.stringify(log, null, 2));
    console.log(`\nfull request/response log: ${f}  (send me this file)`);
    await prisma.$disconnect();
    process.exit(0);
  });
