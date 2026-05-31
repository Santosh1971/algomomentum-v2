import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { NEXT_AUTH } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(_: NextRequest, context: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(NEXT_AUTH);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await context.params;
  if (session.user.id !== id && session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const billings = await prisma.billing.findMany({
    where: { userId: id },
    orderBy: { generatedAt: "desc" },
    include: {
      tradeConfig: {
        select: {
          script: true,
          account: { select: { delta_account_name: true } },
        },
      },
      Payment: { select: { id: true, amountPaid: true, method: true, paymentDate: true } },
    },
  });

  return NextResponse.json(billings);
}
