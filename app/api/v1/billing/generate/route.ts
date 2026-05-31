import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { NEXT_AUTH } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { computeMonthlyPnl } from "@/lib/pnlEngine";
import { DateTime } from "luxon";

export async function POST(req: NextRequest) {
  const session = await getServerSession(NEXT_AUTH);
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const { userId, monthIST, tradeConfigId } = await req.json();
  if (!userId || !monthIST) {
    return NextResponse.json({ error: "userId and monthIST required" }, { status: 400 });
  }

  const config = await prisma.tradeConfig.findUnique({
    where: { id: tradeConfigId },
    select: {
      id: true, userId: true, script: true, platformFeePercent: true,
      account: { select: { api_key_enc: true, api_secret_enc: true } },
    },
  });

  if (!config || config.userId !== userId) {
    return NextResponse.json({ error: "Config not found" }, { status: 404 });
  }

  const existing = await prisma.billing.findUnique({
    where: { month_tradeConfigId_productId: { month: monthIST, tradeConfigId, productId: 0 } },
  });
  if (existing) {
    return NextResponse.json({ error: "Billing already exists for this period", existing });
  }

  const [prevYear, prevMonth] = monthIST.split("-").map(Number);
  const prevDate = DateTime.local(prevYear, prevMonth, 1, { zone: "Asia/Kolkata" }).minus({ months: 1 });
  const prevMonthIST = prevDate.toFormat("yyyy-MM");

  const prevBilling = await prisma.billing.findFirst({
    where: { tradeConfigId, month: prevMonthIST },
    select: { carryForward: true, netPnl: true },
  });

  const prevCarryForward = prevBilling
    ? Math.min(0, prevBilling.carryForward + prevBilling.netPnl)
    : 0;

  const netPnl = await computeMonthlyPnl(config.account.api_key_enc, config.account.api_secret_enc, [config.script], monthIST);

  const gross = prevCarryForward + netPnl;
  const billableAmount = Math.max(0, gross) * (config.platformFeePercent / 100);
  const newCarryForward = gross < 0 ? gross : 0;

  const billing = await prisma.billing.create({
    data: {
      userId, tradeConfigId, month: monthIST, productId: 0,
      netPnl, carryForward: prevCarryForward, billableAmount,
      platformFeePercent: config.platformFeePercent,
      status: billableAmount > 0 ? "unpaid" : "no_bill",
    },
  });

  return NextResponse.json({ success: true, billing });
}
