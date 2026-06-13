// app/api/v1/webhook/token/[webhookToken]/route.ts
// New webhook — routes by unique token per symbol+account combo
// TradingView alert URL: POST /api/v1/webhook/token/{webhookToken}
// Body: { "side": "buy", "trade": "ENTRY 1 buy" }

import { NextRequest, NextResponse } from "next/server";
import { placeOrder, getPositions, getTicker, setLeverage } from "@/lib/deltaClient";
import cache from "@/lib/cache";
import { prisma } from "@/lib/prisma";

const INR_TO_USD = 85;

export async function POST(req: NextRequest, context: { params: Promise<{ webhookToken: string }> }) {
  const { webhookToken } = await context.params;
  const data = await req.json();
  const { side, trade } = data;

  console.log(`📨 Webhook token=${webhookToken} trade=${trade} side=${side}`);

  const isEntry = /ENTRY/i.test(trade);
  const isExit = /EXIT/i.test(trade);
  if (!isEntry && !isExit) return NextResponse.json({ error: "Invalid trade type" }, { status: 400 });

  // Look up config by webhook token
  let config = cache.getConfigByToken(webhookToken);

  // Fallback to DB if not in cache (e.g. just activated)
  if (!config) {
    const tc = await prisma.tradeConfig.findUnique({
      where: { webhookToken },
      include: {
        account: { select: { api_key_enc: true, api_secret_enc: true, delta_account_name: true } },
      },
    });
    if (!tc) return NextResponse.json({ error: "Invalid webhook token" }, { status: 404 });
    if (!tc.isActive || !tc.userActive) {
      return NextResponse.json({ success: false, error: "Config is not active" });
    }
    config = {
      id: tc.id, userId: tc.userId, accountId: tc.accountId,
      script: tc.script, isActive: tc.isActive, userActive: tc.userActive,
      amount: tc.amount, leverage: tc.leverage, compoundMode: tc.compoundMode,
      api_key_enc: tc.account.api_key_enc, api_secret_enc: tc.account.api_secret_enc,
      mode: tc.mode, strategy: tc.strategy,
      delta_account_name: tc.account.delta_account_name ?? null,
      webhookToken: tc.webhookToken,
    };
  }

  if (!config.isActive || !config.userActive) {
    return NextResponse.json({ success: false, error: "Config is not active" });
  }

  const script = cache.getScript(config.script);
  if (!script) return NextResponse.json({ error: `Unknown symbol: ${config.script}` }, { status: 400 });

  try {
    const result = isEntry
      ? await handleEntry({ config, side, script })
      : await handleExit({ config, side, script });

    return NextResponse.json({ success: true, result });
  } catch (err: any) {
    const status = err?.response?.status;
    const errCode = err?.response?.data?.error?.code;
    const clientIp = err?.response?.data?.error?.context?.client_ip;

    if (errCode === "ip_not_whitelisted_for_api_key") {
      return NextResponse.json({
        success: false,
        error: { code: "ip_not_whitelisted_for_api_key", client_ip: clientIp },
      });
    }
    return NextResponse.json({ success: false, error: err.message ?? "Order failed" }, { status: 500 });
  }
}

type ScriptInfo = { symbol: string; exchange_symbol: string; productId: number; lot: number };
type ConfigInfo = {
  id: string; amount: number; leverage: number; compoundMode: string;
  api_key_enc: string; api_secret_enc: string;
};

async function handleEntry({ config, side, script }: { config: ConfigInfo; side: string; script: ScriptInfo }) {
  const marketPrice = await getTicker(script.exchange_symbol);
  if (!marketPrice) throw new Error(`Could not fetch market price for ${script.exchange_symbol}`);
  const amountUSD = config.amount / INR_TO_USD;
  const lot = script.lot || 1;
  const quantity = Math.max(1, Math.floor(amountUSD / marketPrice / lot));
  console.log(`📦 Entry: amountINR=${config.amount} amountUSD=${amountUSD.toFixed(2)} price=${marketPrice} qty=${quantity} leverage=${config.leverage}`);
  // Set leverage on Delta before placing order
  if (config.leverage && config.leverage > 1) {
    await setLeverage(config.api_key_enc, config.api_secret_enc, script.productId, config.leverage);
    console.log(`⚙️ Leverage set to ${config.leverage}x for ${script.exchange_symbol}`);
  }
  const result = await placeOrder(config.api_key_enc, config.api_secret_enc, {
    product_id: script.productId,
    product_symbol: script.exchange_symbol,
    size: quantity,
    side,
    order_type: "market_order",
    time_in_force: "ioc",
    client_order_id: `am-${config.id.slice(-6)}-${Date.now()}`,
  });
  return result;
}

async function handleExit({ config, side, script }: { config: ConfigInfo; side: string; script: ScriptInfo }) {
  const posData = await getPositions(config.api_key_enc, config.api_secret_enc);
  const positions: any[] = posData?.result ?? [];
  const openPos = positions.find(
    (p: any) => p.product_symbol === script.exchange_symbol && Math.abs(p.size) > 0
  );
  if (!openPos) return { message: "No open position" };
  const result = await placeOrder(config.api_key_enc, config.api_secret_enc, {
    product_id: script.productId,
    product_symbol: script.exchange_symbol,
    size: Math.abs(openPos.size),
    side,
    order_type: "market_order",
    time_in_force: "ioc",
    client_order_id: `am-exit-${config.id.slice(-6)}-${Date.now()}`,
  });
  return result;
}
