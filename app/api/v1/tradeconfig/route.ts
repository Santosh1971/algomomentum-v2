// app/api/v1/tradeconfig/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { NEXT_AUTH } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { encrypt } from "@/lib/vault";
import cache from "@/lib/cache";

// GET — list configs for a user (credentials never returned)
export async function GET(req: NextRequest) {
  const session = await getServerSession(NEXT_AUTH);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const isAdmin = session.user.role === "admin";
  const qUserId = new URL(req.url).searchParams.get("userId");
  const userId = isAdmin && qUserId ? qUserId : session.user.id;

  const configs = await prisma.tradeConfig.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true, userId: true, amount: true, initial_amount: true,
      script: true, isActive: true, userActive: true, comission: true,
      createdAt: true, lastToggledAt: true, pause_lastToggledAt: true,
      lastEditAt: true, delta_account_name: true, delta_user_id: true,
      mode: true, strategy: true, platformFeePercent: true,
      // api_key_enc and api_secret_enc intentionally excluded
    },
  });
  return NextResponse.json(configs);
}

// POST — create new TradeConfig
export async function POST(req: NextRequest) {
  const session = await getServerSession(NEXT_AUTH);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const isAdmin = session.user.role === "admin";
  const body = await req.json();
  const { amount, script, api_key, api_secret, mode, strategy, platformFeePercent, userId: reqUserId } = body;

  const userId = isAdmin && reqUserId ? reqUserId : session.user.id;

  if (!userId || typeof amount !== "number" || !script) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }
  if (!api_key || !api_secret) {
    return NextResponse.json({ error: "API credentials required" }, { status: 400 });
  }

  const config = await prisma.tradeConfig.create({
    data: {
      userId, amount, initial_amount: amount, script,
      api_key_enc: encrypt(api_key),
      api_secret_enc: encrypt(api_secret),
      mode: mode ?? "bridge",
      strategy: strategy ?? null,
      platformFeePercent: platformFeePercent ?? 20,
      isActive: false,
    },
  });

  cache.addConfig({
    id: config.id, userId: config.userId, script: config.script,
    isActive: config.isActive, userActive: config.userActive,
    amount: config.amount, api_key_enc: config.api_key_enc,
    api_secret_enc: config.api_secret_enc, mode: config.mode,
    strategy: config.strategy, delta_account_name: config.delta_account_name,
  });

  // Return without credentials
  const { api_key_enc, api_secret_enc, ...safe } = config;
  return NextResponse.json({ message: "Created", config: safe }, { status: 201 });
}

// PUT — update config (amount, mode, strategy, isActive toggle etc.)
export async function PUT(req: NextRequest) {
  const session = await getServerSession(NEXT_AUTH);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, api_key, api_secret, ...rest } = await req.json();
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const updateData: any = { ...rest, lastEditAt: new Date() };

  // If new credentials provided, re-encrypt
  if (api_key) updateData.api_key_enc = encrypt(api_key);
  if (api_secret) updateData.api_secret_enc = encrypt(api_secret);

  const updated = await prisma.tradeConfig.update({ where: { id }, data: updateData });

  cache.updateConfig({
    id: updated.id, userId: updated.userId, script: updated.script,
    isActive: updated.isActive, userActive: updated.userActive,
    amount: updated.amount, api_key_enc: updated.api_key_enc,
    api_secret_enc: updated.api_secret_enc, mode: updated.mode,
    strategy: updated.strategy, delta_account_name: updated.delta_account_name,
  });

  const { api_key_enc, api_secret_enc, ...safe } = updated;
  return NextResponse.json(safe);
}

// DELETE — remove config
export async function DELETE(req: NextRequest) {
  const session = await getServerSession(NEXT_AUTH);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  await prisma.tradeConfig.delete({ where: { id } });
  cache.removeConfig(id);
  return NextResponse.json({ message: "Deleted" });
}
