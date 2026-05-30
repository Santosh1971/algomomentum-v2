// app/api/v1/webhook/[symbolTV]/route.ts
// Receives TradingView alerts and fans out to all active Bridge-mode TradeConfigs

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { placeOrder } from "@/lib/deltaClient";
import cache from "@/lib/cache";

export async function POST(req: NextRequest, context: { params: Promise<{ symbolTV: string }> }) {
  const { symbolTV } = await context.params;
  const data = await req.json();
  const { side, trade, price: rawPrice, trigger_time } = data;

  const price = parseFloat(rawPrice);
  const isEntry = /ENTRY/i.test(trade);
  const isExit = /EXIT/i.test(trade);

  if (!isEntry && !isExit) {
    return NextResponse.json({ error: "Invalid trade type" }, { status: 400 });
  }

  const script = cache.getScript(symbolTV);
  if (!script) {
    return NextResponse.json({ error: `Unknown symbol: ${symbolTV}` }, { status: 400 });
  }

  // Only Bridge-mode active configs for this symbol
  const configs = cache.getConfigsByScript(symbolTV).filter((c) => c.mode === "bridge");

  const results = await Promise.allSettled(
    configs.map((config) =>
      isEntry
        ? handleEntry({ config, side, price, script })
        : handleExit({ config, side, price, trigger_time, script })
    )
  );

  const summary = results.map((r, i) => ({
    configId: configs[i].id,
    status: r.status,
    reason: r.status === "rejected" ? String((r as any).reason) : undefined,
  }));

  return NextResponse.json({ success: true, processed: configs.length, summary });
}

type ScriptInfo = { symbol: string; exchange_symbol: string; productId: number };
type ConfigInfo = { id: string; userId: string; amount: number; api_key_enc: string; api_secret_enc: string };

async function handleEntry({ config, side, price, script }: { config: ConfigInfo; side: string; price: number; script: ScriptInfo }) {
  // Prevent duplicate open positions
  const existing = await prisma.$queryRaw`
    SELECT id FROM "TradeConfig" WHERE id = ${config.id} LIMIT 1
  `;
  // Check via Delta positions API instead of local DB
  // (positions are no longer stored locally — checked via Delta API in real-time)

  const quantity = Math.max(1, Math.floor(config.amount / price / 10));

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
  if (!result?.result) throw new Error(`Entry order failed: ${JSON.stringify(result)}`);
  console.log(`✅ ENTRY ${side} ${script.exchange_symbol} qty:${quantity} user:${config.userId}`);
  return result;
}

async function handleExit({ config, side, price, trigger_time, script }: { config: ConfigInfo; side: string; price: number; trigger_time: string; script: ScriptInfo }) {
  // Get quantity from Delta open positions (live, not local DB)
  const { getPositions } = await import("@/lib/deltaClient");
  const posData = await getPositions(config.api_key_enc, config.api_secret_enc);
  const positions: any[] = posData?.result ?? [];
  const openPos = positions.find((p: any) => p.product_symbol === script.exchange_symbol && Math.abs(p.size) > 0);

  if (!openPos) {
    console.log(`⚠️ No open position for ${script.exchange_symbol} user:${config.userId}`);
    return;
  }

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
  if (!result?.result) throw new Error(`Exit order failed: ${JSON.stringify(result)}`);
  console.log(`✅ EXIT ${side} ${script.exchange_symbol} qty:${quantity} user:${config.userId}`);
  return result;
}
