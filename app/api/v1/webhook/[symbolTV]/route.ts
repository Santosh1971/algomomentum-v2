import { NextRequest, NextResponse } from "next/server";
import { placeOrder, getPositions } from "@/lib/deltaClient";
import cache from "@/lib/cache";

export async function POST(req: NextRequest, context: { params: Promise<{ symbolTV: string }> }) {
  const { symbolTV } = await context.params;
  const data = await req.json();
  const { side, trade, price: rawPrice } = data;
  console.log(`📨 Webhook: ${symbolTV} ${trade} ${side} @ ${rawPrice}`);

  const price = parseFloat(rawPrice);
  const isEntry = /ENTRY/i.test(trade);
  const isExit = /EXIT/i.test(trade);
  if (!isEntry && !isExit) return NextResponse.json({ error: "Invalid trade type" }, { status: 400 });

  const script = cache.getScript(symbolTV);
  if (!script) return NextResponse.json({ error: `Unknown symbol: ${symbolTV}` }, { status: 400 });

  const allConfigs = cache.getConfigsByScript(symbolTV);
  console.log(`📋 Configs for ${symbolTV}: ${allConfigs.length}`, allConfigs.map(c => `mode=${c.mode} isActive=${c.isActive}`));

  const configs = allConfigs.filter((c) => c.isActive && c.userActive !== false);
  if (configs.length === 0) return NextResponse.json({ success: false, error: "No active configs" });

  const results = await Promise.allSettled(
    configs.map((config) => isEntry ? handleEntry({ config, side, price, script }) : handleExit({ config, side, script }))
  );

  results.forEach((r, i) => {
    if (r.status === "rejected") console.error(`❌ Config ${configs[i].id} failed:`, r.reason);
    else console.log(`✅ Config ${configs[i].id} ok:`, JSON.stringify((r as any).value));
  });

  return NextResponse.json({ success: true, processed: configs.length });
}

type ScriptInfo = { symbol: string; exchange_symbol: string; productId: number; lot: number };
type ConfigInfo = { id: string; userId: string; amount: number; api_key_enc: string; api_secret_enc: string; mode: string };

async function handleEntry({ config, side, price, script }: { config: ConfigInfo; side: string; price: number; script: ScriptInfo }) {
  const lot = script.lot || 1;
  const quantity = Math.max(lot, Math.round(config.amount / price / 10 / lot) * lot);
  console.log(`📦 Entry qty=${quantity} price=${price} amount=${config.amount} lot=${lot}`);
  const body = {
    product_id: script.productId,
    product_symbol: script.exchange_symbol,
    size: quantity,
    side,
    order_type: "market_order",
    time_in_force: "ioc",
    client_order_id: `am-${config.id.slice(-6)}-${Date.now()}`,
  };
  console.log(`🚀 Order body:`, JSON.stringify(body));
  const result = await placeOrder(config.api_key_enc, config.api_secret_enc, body);
  console.log(`📬 Order result:`, JSON.stringify(result));
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
  console.log(`🚀 Exit body:`, JSON.stringify(body));
  const result = await placeOrder(config.api_key_enc, config.api_secret_enc, body);
  console.log(`📬 Exit result:`, JSON.stringify(result));
  return result;
}
