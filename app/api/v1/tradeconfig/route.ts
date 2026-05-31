// app/api/v1/tradeconfig/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { NEXT_AUTH } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import cache from "@/lib/cache";

// GET — list configs for a user
export async function GET(req: NextRequest) {
  const session = await getServerSession(NEXT_AUTH);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const isAdmin = session.user.role === "admin";
  const qUserId = new URL(req.url).searchParams.get("userId");
  const userId = isAdmin && qUserId ? qUserId : session.user.id;

  const configs = await prisma.tradeConfig.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: {
      account: {
        select: {
          id: true,
          accountName: true,
          accountType: true,
          delta_account_name: true,
          delta_user_id: true,
        },
      },
    },
  });
  return NextResponse.json(configs);
}

// POST — create new TradeConfig under an existing DeltaAccount
export async function POST(req: NextRequest) {
  const session = await getServerSession(NEXT_AUTH);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const isAdmin = session.user.role === "admin";
  const body = await req.json();
  const { amount, script, accountId, mode, strategy, platformFeePercent, leverage, compoundMode, userId: reqUserId } = body;

  const userId = isAdmin && reqUserId ? reqUserId : session.user.id;

  if (!userId || typeof amount !== "number" || !script || !accountId) {
    return NextResponse.json({ error: "amount, script and accountId are required" }, { status: 400 });
  }

  // Verify account belongs to user
  const account = await prisma.deltaAccount.findFirst({ where: { id: accountId, userId } });
  if (!account) return NextResponse.json({ error: "Account not found" }, { status: 404 });

  const config = await prisma.tradeConfig.create({
    data: {
      userId,
      accountId,
      amount,
      initial_amount: amount,
      script: script.toUpperCase(),
      mode: mode ?? "bridge",
      strategy: strategy ?? null,
      platformFeePercent: platformFeePercent ?? 20,
      leverage: leverage ?? 1,
      compoundMode: compoundMode ?? "fixed",
      isActive: false,
    },
    include: {
      account: {
        select: { api_key_enc: true, api_secret_enc: true, delta_account_name: true },
      },
    },
  });

  cache.addConfig({
    id: config.id,
    userId: config.userId,
    accountId: config.accountId,
    script: config.script,
    isActive: config.isActive,
    userActive: config.userActive,
    amount: config.amount,
    leverage: config.leverage,
    compoundMode: config.compoundMode,
    api_key_enc: config.account.api_key_enc,
    api_secret_enc: config.account.api_secret_enc,
    mode: config.mode,
    strategy: config.strategy,
    delta_account_name: config.account.delta_account_name ?? null,
    webhookToken: config.webhookToken,
  });

  const { account: _acc, ...safe } = config;
  return NextResponse.json({ message: "Created", config: safe }, { status: 201 });
}

// PUT — update config
export async function PUT(req: NextRequest) {
  const session = await getServerSession(NEXT_AUTH);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, ...rest } = await req.json();
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const updateData: any = { ...rest, lastEditAt: new Date() };

  const updated = await prisma.tradeConfig.update({
    where: { id },
    data: updateData,
    include: {
      account: {
        select: { api_key_enc: true, api_secret_enc: true, delta_account_name: true },
      },
    },
  });

  cache.updateConfig({
    id: updated.id,
    userId: updated.userId,
    accountId: updated.accountId,
    script: updated.script,
    isActive: updated.isActive,
    userActive: updated.userActive,
    amount: updated.amount,
    leverage: updated.leverage,
    compoundMode: updated.compoundMode,
    api_key_enc: updated.account.api_key_enc,
    api_secret_enc: updated.account.api_secret_enc,
    mode: updated.mode,
    strategy: updated.strategy,
    delta_account_name: updated.account.delta_account_name ?? null,
    webhookToken: updated.webhookToken,
  });

  const { account: _acc, ...safe } = updated;
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
