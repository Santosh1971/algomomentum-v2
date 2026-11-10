// npx tsx scripts/testDeltaTrade.ts
// Checks the request shapes deltaTrade.ts sends WITHOUT touching the network: axios.request is replaced by a recorder.
// Throwaway key and made-up credentials only.
process.env.VAULT_KEY = "0".repeat(64);
import crypto from "crypto";
import axios from "axios";
import { encrypt } from "../lib/vault";
import { createDeltaTradeApi, toTick, DeltaError } from "../lib/strategyEngine/deltaTrade";
import { isImmediateExecution } from "../lib/strategyEngine/liveExecutor";

let bad = 0;
const check = (name: string, ok: boolean, extra = "") => { if (!ok) bad++; console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : " " + extra}`); };

const calls: any[] = [];
let reply: any = { status: 200, data: { success: true, result: { id: 777 } } };
(axios as any).request = async (cfg: any) => {
  calls.push(cfg);
  if (reply.throw) { const e: any = new Error("Request failed"); e.response = { status: reply.throw.status, data: reply.throw.data }; throw e; }
  return reply;
};

const acct = { api_key_enc: encrypt("test-key"), api_secret_enc: encrypt("test-secret") };
const api = createDeltaTradeApi(acct, 14969, "XRPUSD", 0.0001);

(async () => {
  check("toTick rounds to the tick", toTick(1.24457, 0.0001) === 1.2446);
  check("toTick no float noise", toTick(1.1 + 0.2, 0.0001) === 1.3);

  await api.setLeverage(2);
  check("leverage path+body", calls[0].method === "POST" && calls[0].url.endsWith("/v2/products/14969/orders/leverage") && calls[0].data === JSON.stringify({ leverage: "2" }));

  await api.marketOrder({ side: "buy", size: 150, reduceOnly: false, clientOrderId: "a3-1-enter" });
  let b = JSON.parse(calls[1].data);
  check("entry body", b.order_type === "market_order" && b.side === "buy" && b.size === 150 && b.product_id === 14969 && b.time_in_force === "ioc" && b.reduce_only === undefined && b.client_order_id === "a3-1-enter", JSON.stringify(b));

  await api.marketOrder({ side: "sell", size: 150, reduceOnly: true, clientOrderId: "a3-1-close" });
  b = JSON.parse(calls[2].data);
  check("close is reduce_only", b.reduce_only === true && b.side === "sell");

  const st = await api.placeStop({ side: "sell", size: 150, stopPrice: 1.24457, clientOrderId: "a3-1-stop" });
  b = JSON.parse(calls[3].data);
  check("stop body", b.stop_order_type === "stop_loss_order" && b.order_type === "market_order" && b.stop_price === 1.2446 && b.stop_trigger_method === "last_traded_price" && b.reduce_only === true && st.id === 777, JSON.stringify(b));

  await api.placeTarget({ side: "sell", size: 150, price: 1.3, clientOrderId: "a3-1-tp" });
  b = JSON.parse(calls[4].data);
  check("target body", b.order_type === "limit_order" && b.limit_price === 1.3 && b.reduce_only === true && b.time_in_force === "gtc");

  await api.editStop(777, 1.25);
  check("edit is PUT with id", calls[5].method === "PUT" && JSON.parse(calls[5].data).id === 777 && JSON.parse(calls[5].data).stop_price === 1.25);

  await api.cancel("778");
  check("cancel is DELETE with numeric id", calls[6].method === "DELETE" && JSON.parse(calls[6].data).id === 778);

  // signature = HMAC_SHA256(method + timestamp + path + body)
  const c = calls[1];
  const want = crypto.createHmac("sha256", "test-secret").update("POST" + c.headers.timestamp + "/v2/orders" + c.data).digest("hex");
  check("signature matches Delta's scheme", c.headers.signature === want && c.headers["api-key"] === "test-key");

  // errors keep Delta's body so the immediate-execution case is recognised
  reply = { throw: { status: 400, data: { success: false, error: { code: "immediate_execution_stop_order" } } } };
  try { await api.editStop(777, 1.5); check("edit beyond market throws", false); }
  catch (e: any) { check("edit beyond market is recognised", e instanceof DeltaError && isImmediateExecution(e), String(e?.message)); }

  reply = { status: 200, data: { success: false, error: { code: "insufficient_margin" } } };
  try { await api.marketOrder({ side: "buy", size: 1, reduceOnly: false, clientOrderId: "x" }); check("success:false throws", false); }
  catch (e: any) { check("success:false throws with the reason", /insufficient_margin/.test(e.message)); }

  if (bad) { console.error(`${bad} failed`); process.exit(1); }
  console.log("all deltaTrade checks passed");
})();
