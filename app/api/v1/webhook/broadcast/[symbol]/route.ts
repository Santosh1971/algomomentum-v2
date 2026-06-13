// app/api/v1/webhook/broadcast/[symbol]/route.ts
// Broadcast webhook — fires trades for ALL active users on a given symbol
// TradingView alert URL: POST /api/v1/webhook/broadcast/{symbol}?secret=BROADCAST_SECRET
// Body: { "side": "buy|sell", "trade": "entry|exit", "price": "{{close}}", "trigger_time": "{{timenow}}" }

import { NextRequest, NextResponse } from "next/server";
import { placeOrder, getPositions, getTicker, setLeverage } from "@/lib/deltaClient";
import cache from "@/lib/cache";
import { prisma } from "@/lib/prisma";

const INR_TO_USD = 85;
const BROADCAST_SECRET = process.env.BROADCAST_SECRET ?? "changeme";

export async function POST(req: NextRequest, context: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await context.params;

  const url = new URL(req.url);
  const secret = url.searchParams.get("secret");
  if (secret !== BROADCAST_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const data = await req.json();
  const { side, trade } = data;

  console.log(`📡 Broadcast symbol=${symbol} trade=${trade} side=${side}`);

  const isEntry = /entry/i.test(trade);
  const isExit = /exit/i.test(trade);
  if (!isEntry && !isExit) return NextResponse.json({ error: "Invalid trade type — use entry or exit" }, { status: 400 });

  const script = cache.getScript(symbol);
  if (!script) return NextResponse.json({ error: `Unknown symbol: ${symbol}` }, { status: 400 });

  const configs = await prisma.tradeConfig.findMany({
    where: { script: symbol, isActive: true, userActive: true },
    include: {
      account: { select: { api_key_enc: true, api_secret_enc: true, delta_account_name: true } },
    },
  });

  if (configs.length === 0) {
    return NextResponse.json({ success: false, message: `No active configs found for ${symbol}` });
  }

  console.log(`📡 Broadcasting to ${configs.length} active config(s) for ${symbol}`);

  const results = await Promise.allSettled(
    configs.map(async (tc) => {
      const config = {
        id: tc.id, userId: tc.userId, accountId: tc.accountId,
        script: tc.script, isActive: tc.isActive, userActive: tc.userActive,
        amount: tc.amount, leverage: tc.leverage, compoundMode: tc.compoundMode,
        api_key_enc: tc.account.api_key_enc, api_secret_enc: tc.account.api_secret_enc,
        mode: tc.mode, strategy: tc.strategy,
        delta_account_name: tc.account.delta_account_name ?? null,
        webhookToken: tc.webhookToken,
      };
      try {
        const result = isEntry
          ? await handleEntry({ config, side, script })
          : await handleExit({ config, side, script });
        return { configId: tc.id, userId: tc.userId, accountName: tc.account.delta_account_name, success: true, result };
      } catch (err: any) {
        const errCode = err?.response?.data?.error?.code;
        return { configId: tc.id, userId: tc.userId, accountName: tc.account.delta_account_name, success: false, error: errCode ?? err.message };
      }
    })
  );

  const summary = results.map((r) => r.status === "fulfilled" ? r.value : { success: false, error: r.reason });
  const successCount = summary.filter((r) => r.success).length;
  const failCount = summary.length - successCount;

  return NextResponse.json({ success: true, symbol, trade, side, total: summary.length, successCount, failCount, results: summary });
}

type ScriptInfo = { symbol: string; exchange_symbol: string; productId: number; lot: number };
type ConfigInfo = { id: string; amount: number; leverage: number; compoundMode: string; api_key_enc: string; api_secret_enc: string; };

async function handleEntry({ config, side, script }: { config: ConfigInfo; side: string; script: ScriptInfo }) {
  const marketPrice = await getTicker(script.exchange_symbol);
  if (!marketPrice) throw new Error(`Could not fetch market price for ${script.exchange_symbol}`);
  const amountUSD = config.amount / INR_TO_USD;
  const lot = script.lot || 1;
  const quantity = Math.max(lot, Math.floor(amountUSD / marketPrice / lot) * lot);
  if (config.leverage && config.leverage > 1) {
    await setLeverage(config.api_key_enc, config.api_secret_enc, script.productId, config.leverage);
  }
  return await placeOrder(config.api_key_enc, config.api_secret_enc, {
    product_id: script.productId, product_symbol: script.exchange_symbol,
    size: quantity, side, order_type: "market_order", time_in_force: "ioc",
    client_order_id: `am-bc-${config.id.slice(-6)}-${Date.now()}`,
  });
}

async function handleExit({ config, side, script }: { config: ConfigInfo; side: string; script: ScriptInfo }) {
  const posData = await getPositions(config.api_key_enc, config.api_secret_enc);
  const positions: any[] = posData?.result ?? [];
  const openPos = positions.find((p: any) => p.product_symbol === script.exchange_symbol && Math.abs(p.size) > 0);
  if (!openPos) return { message: "No open position" };
  return await placeOrder(config.api_key_enc, config.api_secret_enc, {
    product_id: script.productId, product_symbol: script.exchange_symbol,
    size: Math.abs(openPos.size), side, order_type: "market_order", time_in_force: "ioc",
    client_order_id: `am-bc-exit-${config.id.slice(-6)}-${Date.now()}`,
  });
}
