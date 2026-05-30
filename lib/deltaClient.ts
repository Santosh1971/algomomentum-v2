import crypto from "crypto";
import axios from "axios";
import { decrypt } from "@/lib/vault";

const BASE_URL = "https://api.india.delta.exchange";

function sign(method: string, path: string, query: string, body: string, secret: string) {
  const ts = Math.floor(Date.now() / 1000).toString();
  const prehash = method + ts + path + query + body;
  const sig = crypto.createHmac("sha256", secret).update(prehash).digest("hex");
  return { signature: sig, timestamp: ts };
}

function headers(apiKey: string, sig: string, ts: string) {
  return {
    "Content-Type": "application/json",
    Accept: "application/json",
    "api-key": apiKey,
    signature: sig,
    timestamp: ts,
    "User-Agent": "algomomentum-v2/2.0",
  };
}

export async function placeOrder(apiKeyEnc: string, apiSecretEnc: string, body: Record<string, any>) {
  const apiKey = decrypt(apiKeyEnc);
  const apiSecret = decrypt(apiSecretEnc);
  const bodyStr = JSON.stringify(body);
  const { signature, timestamp } = sign("POST", "/v2/orders", "", bodyStr, apiSecret);
  try {
    const r = await axios.post(`${BASE_URL}/v2/orders`, body, { headers: headers(apiKey, signature, timestamp) });
    return r.data;
  } catch (e: any) {
    console.error("placeOrder error:", e.response?.data ?? e.message);
    return { success: false, error: e.response?.data ?? e.message };
  }
}

export async function verifyKeys(apiKey: string, apiSecret: string) {
  // Try /v2/profile first, fall back to /v2/wallet/balances for sub-accounts
  const { signature, timestamp } = sign("GET", "/v2/profile", "", "", apiSecret);
  try {
    const r = await axios.get(`${BASE_URL}/v2/profile`, { 
      headers: headers(apiKey, signature, timestamp) 
    });
    if (r.data?.success) return r.data;
  } catch (e: any) {
    // Sub-accounts may not have /v2/profile access, try balances
    console.log("Profile failed, trying balances for sub-account...");
  }
  
  // Fallback: use wallet balances to verify key works
  const { signature: sig2, timestamp: ts2 } = sign("GET", "/v2/wallet/balances", "", "", apiSecret);
  const r2 = await axios.get(`${BASE_URL}/v2/wallet/balances`, { 
    headers: headers(apiKey, sig2, ts2) 
  });
  
  // Return in profile format
  return {
    success: true,
    result: {
      id: apiKey.slice(0, 8),
      email: "Sub Account",
      full_name: "Delta Sub Account",
    }
  };
}

export async function getFills(apiKeyEnc: string, apiSecretEnc: string, params: {
  product_symbol: string;
  start_time?: number;
  end_time?: number;
  page_size?: number;
  after?: string;
}) {
  const apiKey = decrypt(apiKeyEnc);
  const apiSecret = decrypt(apiSecretEnc);
  const qs = new URLSearchParams();
  qs.set("product_symbol", params.product_symbol);
  qs.set("page_size", String(params.page_size ?? 100));
  if (params.start_time) qs.set("start_time", String(params.start_time));
  if (params.end_time) qs.set("end_time", String(params.end_time));
  if (params.after) qs.set("after", params.after);

  const qStr = "?" + qs.toString();
  const { signature, timestamp } = sign("GET", "/v2/fills", qStr, "", apiSecret);
  const r = await axios.get(`${BASE_URL}/v2/fills${qStr}`, {
    headers: headers(apiKey, signature, timestamp),
  });
  return r.data;
}

export async function getAllFills(apiKeyEnc: string, apiSecretEnc: string, params: {
  product_symbol: string;
  start_time?: number;
  end_time?: number;
}) {
  const allFills: any[] = [];
  let after: string | undefined;
  while (true) {
    const data = await getFills(apiKeyEnc, apiSecretEnc, { ...params, after });
    const fills = data?.result ?? [];
    allFills.push(...fills);
    after = data?.meta?.after;
    if (!after || fills.length === 0) break;
  }
  return allFills;
}

export async function getPositions(apiKeyEnc: string, apiSecretEnc: string) {
  const apiKey = decrypt(apiKeyEnc);
  const apiSecret = decrypt(apiSecretEnc);
  const { signature, timestamp } = sign("GET", "/v2/positions/margined", "", "", apiSecret);
  const r = await axios.get(`${BASE_URL}/v2/positions/margined`, {
    headers: headers(apiKey, signature, timestamp),
  });
  return r.data;
}

export async function getBalances(apiKeyEnc: string, apiSecretEnc: string) {
  const apiKey = decrypt(apiKeyEnc);
  const apiSecret = decrypt(apiSecretEnc);
  const { signature, timestamp } = sign("GET", "/v2/wallet/balances", "", "", apiSecret);
  const r = await axios.get(`${BASE_URL}/v2/wallet/balances`, {
    headers: headers(apiKey, signature, timestamp),
  });
  return r.data;
}

export async function getCandles(symbol: string, resolution: string, start: number, end: number) {
  const qs = `?symbol=${symbol}&resolution=${resolution}&start=${start}&end=${end}`;
  const r = await axios.get(`${BASE_URL}/v2/history/candles${qs}`);
  return r.data;
}
