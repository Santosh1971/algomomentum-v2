// app/api/v1/accounts/route.ts
// CRUD for DeltaAccount (list, create, delete)

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { NEXT_AUTH } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET — list all DeltaAccounts for the user (with their TradeConfigs)
export async function GET(req: NextRequest) {
  const session = await getServerSession(NEXT_AUTH);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const isAdmin = session.user.role === "admin";
  const qUserId = new URL(req.url).searchParams.get("userId");
  const userId = isAdmin && qUserId ? qUserId : session.user.id;

  const accounts = await prisma.deltaAccount.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
    include: {
      tradeConfigs: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true, script: true, amount: true, initial_amount: true, equityBalance: true,
          isActive: true, userActive: true, mode: true, strategy: true,
          leverage: true, compoundMode: true, platformFeePercent: true, isSubscription: true,
          webhookToken: true, createdAt: true, lastToggledAt: true, strategyId: true,
          strategyRef: { select: { minCapital: true, orderSizeType: true, defaultOrderSizeValue: true } },
        },
      },
    },
  });

  // Never return api_key_enc / api_secret_enc
  const safe = accounts.map(({ api_key_enc, api_secret_enc, ...a }) => a);
  return NextResponse.json(safe);
}

// POST — create a new DeltaAccount (max 5 per user)
export async function POST(req: NextRequest) {
  const session = await getServerSession(NEXT_AUTH);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = session.user.id;
  const { accountName, accountType } = await req.json();

  if (!accountName || !accountType) {
    return NextResponse.json({ error: "accountName and accountType are required" }, { status: 400 });
  }

  const validTypes = ["main", "sub1", "sub2", "sub3", "sub4"];
  if (!validTypes.includes(accountType)) {
    return NextResponse.json({ error: `accountType must be one of: ${validTypes.join(", ")}` }, { status: 400 });
  }

  // Enforce max 5 accounts per user
  const count = await prisma.deltaAccount.count({ where: { userId } });
  if (count >= 5) {
    return NextResponse.json({ error: "Maximum 5 accounts allowed" }, { status: 400 });
  }

  const account = await prisma.deltaAccount.create({
    data: { userId, accountName, accountType },
  });

  const { api_key_enc, api_secret_enc, ...safe } = account;
  return NextResponse.json({ message: "Account created", account: safe }, { status: 201 });
}

// DELETE — delete a DeltaAccount (cascades to all its TradeConfigs)
export async function DELETE(req: NextRequest) {
  const session = await getServerSession(NEXT_AUTH);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  // Verify ownership
  const account = await prisma.deltaAccount.findFirst({
    where: { id, userId: session.user.id },
  });
  if (!account) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.deltaAccount.delete({ where: { id } });
  return NextResponse.json({ message: "Account deleted" });
}
