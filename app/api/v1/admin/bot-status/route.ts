import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { NEXT_AUTH } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(NEXT_AUTH);
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const configs = await prisma.tradeConfig.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true, script: true, amount: true, isActive: true,
      userActive: true, leverage: true, mode: true, webhookToken: true,
      account: { select: { accountName: true, delta_account_name: true } },
      user: { select: { id: true, name: true, email: true } },
    },
  });

  return NextResponse.json(configs);
}
