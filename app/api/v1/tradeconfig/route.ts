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
  const { amount, script, accountId, mode, strategy, platformFeePercent, leverage, compoundMode, userId: reqUserId, forceAccount } = body;

  const userId = isAdmin && reqUserId ? reqUserId : session.user.id;

  if (!userId || typeof amount !== "number" || !script || !accountId) {
    return NextResponse.json({ error: "amount, script and accountId are required" }, { status: 400 });
  }

  const upperScript = script.toUpperCase();

  // Verify account belongs to user
  const account = await prisma.deltaAccount.findFirst({ where: { id: accountId, userId } });
  if (!account) return NextResponse.json({ error: "Account not found" }, { status: 404 });

  // ── 1. Same-coin conflict check ──────────────────────────────────────────
  const existingInAccount = await prisma.tradeConfig.findFirst({
    where: { accountId, script: upperScript },
  });

  if (existingInAccount && !forceAccount) {
    const allAccounts = await prisma.deltaAccount.findMany({
      where: { userId, isActive: true },
      include: { tradeConfigs: { where: { script: upperScript }, select: { id: true } } },
      orderBy: { createdAt: "asc" },
    });
    const freeAccount = allAccounts.find(a => a.id !== accountId && a.tradeConfigs.length === 0);
    if (!freeAccount) {
      return NextResponse.json({
        error: `${upperScript} already exists in this account and no other account is available. Add a new sub-account first.`,
        conflict: true,
      }, { status: 409 });
    }
    return NextResponse.json({
      conflict: true,
      suggestedAccountId: freeAccount.id,
      suggestedAccountName: freeAccount.accountName,
      message: `${upperScript} already exists in "${account.accountName}". Assign to "${freeAccount.accountName}" instead?`,
    }, { status: 409 });
  }

  // ── 2. Live balance check ────────────────────────────────────────────────
  const targetAccountId = forceAccount ?? accountId;
  const targetAccount = forceAccount
    ? await prisma.deltaAccount.findFirst({ where: { id: forceAccount, userId } })
    : account;

  if (targetAccount && targetAccount.api_key_enc && targetAccount.api_key_enc !== "") {
    try {
      const { getBalances } = await import("@/lib/deltaClient");
      const INR_PER_USD = 85;
      const data = await getBalances(targetAccount.api_key_enc, targetAccount.api_secret_enc);
      const balances: any[] = data?.result ?? [];
      const wallet = balances.find((b: any) => b.asset_symbol === "USD")
        ?? balances.find((b: any) => b.asset_symbol === "USDT")
        ?? balances.find((b: any) => (b.available_balance ?? 0) > 0)
        ?? balances[0];
      const availableUSD = parseFloat(wallet?.available_balance ?? "0");
      const availableINR = availableUSD * INR_PER_USD;

      const existing = await prisma.tradeConfig.findMany({
        where: { accountId: targetAccountId },
        select: { amount: true },
      });
      const totalAllocated = existing.reduce((sum: number, c: any) => sum + c.amount, 0) + amount;

      if (totalAllocated > availableINR) {
        return NextResponse.json({
          error: `Insufficient balance. Available: ₹${availableINR.toFixed(0)}, Total allocated after adding: ₹${totalAllocated.toFixed(0)}. Please reduce the amount or top up your Delta account.`,
          balanceError: true,
          availableINR,
          totalAllocated,
        }, { status: 400 });
      }
    } catch (e) {
      console.warn("Balance check skipped:", e);
    }
  }

  // ── 3. Create config ─────────────────────────────────────────────────────
  const config = await prisma.tradeConfig.create({
    data: {
      userId,
      accountId: targetAccountId,
      amount,
      initial_amount: amount,
      script: upperScript,
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

  const updateData: any = { ...rest, lastEditAt: new Date(), ...(rest.amount !== undefined && { initial_amount: rest.amount }) };

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
