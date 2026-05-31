import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { NEXT_AUTH } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(_: NextRequest, context: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(NEXT_AUTH);
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const { id } = await context.params;

  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true, email: true, name: true, role: true,
      isVerified: true, createdAt: true, phone: true,
      deltaAccounts: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true, accountName: true, accountType: true,
          delta_account_name: true, isActive: true,
          tradeConfigs: {
            orderBy: { createdAt: "asc" },
            select: {
              id: true, script: true, amount: true, initial_amount: true,
              isActive: true, userActive: true, mode: true, strategy: true,
              leverage: true, compoundMode: true, platformFeePercent: true,
              webhookToken: true, createdAt: true, lastToggledAt: true,
            },
          },
        },
      },
    },
  });

  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
  return NextResponse.json(user);
}
