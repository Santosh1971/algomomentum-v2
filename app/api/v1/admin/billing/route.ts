import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { NEXT_AUTH } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET — last 6 months billing summary for all users
export async function GET() {
  const session = await getServerSession(NEXT_AUTH);
  if (!session || session.user.role !== "admin")
    return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const billings = await prisma.billing.findMany({
    orderBy: { generatedAt: "desc" },
    take: 500,
    include: {
      user: { select: { id: true, email: true, name: true } },
      tradeConfig: { select: { script: true } },
      Payment: { select: { id: true, amountPaid: true, confirmedByAdmin: true, screenshotUrl: true, paymentDate: true } },
    },
  });

  // Filter last 6 months
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - 6);
  const filtered = billings.filter(b => new Date(b.generatedAt) >= cutoff);

  return NextResponse.json(filtered);
}

// PUT — confirm payment
export async function PUT(req: NextRequest) {
  const session = await getServerSession(NEXT_AUTH);
  if (!session || session.user.role !== "admin")
    return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const { paymentId, billingId } = await req.json();

  await prisma.payment.update({
    where: { id: paymentId },
    data: { confirmedByAdmin: true, confirmedAt: new Date() },
  });
  await prisma.billing.update({
    where: { id: billingId },
    data: { status: "paid" },
  });
  return NextResponse.json({ success: true });
}
