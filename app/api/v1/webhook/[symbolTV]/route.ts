import { NextRequest, NextResponse } from "next/server";
import { placeOrder, getPositions, getTicker } from "@/lib/deltaClient";
import cache from "@/lib/cache";

const INR_TO_USD = 85;

export async function POST(req: NextRequest, context: { params: Promise<{ symbolTV: string }> }) {
  const { symbolTV } = await context.params;
  const data = await req.json();
  const { side, trade } = data;
  console.log(`📨 Webhook: ${symbolTV} ${trade} ${side}`);

  const isEntry = /ENTRY/i.test(trade);
  const isExit = /EXIT/i.test(trade);
  if (!isEntry && !isExit) return NextResponse.json({ error: "Invalid trade type" }, { status: 400 });

  const script = cache.getScript(symbolTV);
  if (!script) return NextResponse.json({ error: `Unknown symbol: ${symbolTV}` }, { status: 400 });

  const configs = cache.getConfigsByScript(symbolTV).filter((c) => c.isActive && c.userActive !== false);
  if (configs.length === 0) return NextResponse.json({ success: false, error: "No active configs for this symbol" });

  const results = await Promise.allSettled(
    configs.map((config) => isEntry ? handleEntry({ config, side, script }) : handleExit({ config, side, script }))
  );

  const summary = results.map((r, i) => {
    if (r.status === "rejected") {
      const err = r.reason;
      let reason = String(err);
      // Parse Axios 401 errors into human-readable messages
      if (err?.response?.status === 401) {
        const errCode = err?.response?.data?.error?.code;
        const clientIp = err?.response?.data?.error?.context?.client_ip;
        if (errCode === "ip_not_whitelisted_for_api_key") {
          return { configId: configs[i].id, status: "fulfilled", value: { success: false, error: { error: { code: "ip_not_whitelisted_for_api_key", context: { client_ip: clientIp } } } } };
        }
        reason = "Authentication failed (401) — IP may not be whitelisted in Delta API Keys";
      } else if (err?.response?.status === 403) {
        reason = "Access denied (403) — check API key permissions";
      } else if (err?.code === "ECONNREFUSED" || err?.code === "ENOTFOUND") {
        reason = "Cannot connect to Delta Exchange — check internet connection";
      }
      console.error(`❌ Config ${configs[i].id} failed:`, reason);
      return { configId: configs[i].id, status: "rejected", reason };
    }
    const val = (r as any).value;
    console.log(`📬 Config ${configs[i].id} result:`, JSON.stringify(val));
    return { configId: configs[i].id, status: "fulfilled", value: val };
  });

  // Check if any orders actually succeeded
  const anySuccess = summary.some(s => s.status === "fulfilled" && (s as any).value?.result);
  const anyIpBlocked = summary.some(s => {
    const val = (s as any).value;
    return val?.success === false && (val?.error?.error?.code === "ip_not_whitelisted_for_api_key" || val?.error?.code === "ip_not_whitelisted_for_api_key");
  });

  return NextResponse.json({ 
    success: true, 
    processed: configs.length, 
    anySuccess,
    anyIpBlocked,
    summary 
  });
}

type ScriptInfo = { symbol: string; exchange_symbol: string; productId: number; lot: number };
type ConfigInfo = { id: string; userId: string; amount: number; api_key_enc: string; api_secret_enc: string };

async function handleEntry({ config, side, script }: { config: ConfigInfo; side: string; script: ScriptInfo }) {
  const marketPrice = await getTicker(script.exchange_symbol);
  if (!marketPrice) throw new Error(`Could not fetch market price for ${script.exchange_symbol}`);
  const amountUSD = config.amount / INR_TO_USD;
  const lot = script.lot || 1;
  const quantity = Math.max(1, Math.floor(amountUSD / marketPrice / lot));
  console.log(`📦 Entry: amountINR=${config.amount} amountUSD=${amountUSD.toFixed(2)} price=${marketPrice} qty=${quantity}`);
  const body = {
    product_id: script.productId,
    product_symbol: script.exchange_symbol,
    size: quantity,
    side,
    order_type: "market_order",
    time_in_force: "ioc",
    client_order_id: `am-${config.id.slice(-6)}-${Date.now()}`,
  };
  const result = await placeOrder(config.api_key_enc, config.api_secret_enc, body);
  return result;
}

async function handleExit({ config, side, script }: { config: ConfigInfo; side: string; script: ScriptInfo }) {
  const posData = await getPositions(config.api_key_enc, config.api_secret_enc);
  const positions: any[] = posData?.result ?? [];
  const openPos = positions.find((p: any) => p.product_symbol === script.exchange_symbol && Math.abs(p.size) > 0);
  if (!openPos) { console.log(`⚠️ No open position for ${script.exchange_symbol}`); return { message: "No open position" }; }
  const quantity = Math.abs(openPos.size);
  const body = {
    product_id: script.productId,
    product_symbol: script.exchange_symbol,
    size: quantity,
    side,
    order_type: "market_order",
    time_in_force: "ioc",
    client_order_id: `am-exit-${config.id.slice(-6)}-${Date.now()}`,
  };
  const result = await placeOrder(config.api_key_enc, config.api_secret_enc, body);
  return result;
}
