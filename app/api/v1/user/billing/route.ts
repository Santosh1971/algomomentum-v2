import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { NEXT_AUTH } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

// GET — current month profitable billings for user
export async function GET() {
  const session = await getServerSession(NEXT_AUTH);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const now = new Date();
  const monthIST = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const billings = await prisma.billing.findMany({
    where: {
      userId: session.user.id,
      month: monthIST,
      billableAmount: { gt: 0 },
      netPnl: { gt: 0 },
    },
    include: {
      tradeConfig: { select: { script: true } },
      Payment: {
        orderBy: { paymentDate: "desc" },
        take: 1,
        select: { id: true, amountPaid: true, confirmedByAdmin: true, screenshotUrl: true, paymentDate: true },
      },
    },
    orderBy: { generatedAt: "desc" },
  });

  const settings = await prisma.platformSettings.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", platformFeePercent: 20 },
    update: {},
  });

  return NextResponse.json({ billings, settings });
}

// POST — upload payment screenshot
export async function POST(req: NextRequest) {
  const session = await getServerSession(NEXT_AUTH);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await req.formData();
  const billingId = formData.get("billingId") as string;
  const amountPaid = parseFloat(formData.get("amountPaid") as string);
  const file = formData.get("screenshot") as File;

  if (!billingId || !file) return NextResponse.json({ error: "billingId and screenshot required" }, { status: 400 });

  const billing = await prisma.billing.findFirst({ where: { id: billingId, userId: session.user.id } });
  if (!billing) return NextResponse.json({ error: "Billing not found" }, { status: 404 });

  // Save file to public/uploads/screenshots/
  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);
  const uploadsDir = path.join(process.cwd(), "public", "uploads", "screenshots");
  await mkdir(uploadsDir, { recursive: true });
  const filename = `${session.user.id}-${billingId}-${Date.now()}${path.extname(file.name)}`;
  await writeFile(path.join(uploadsDir, filename), buffer);
  const screenshotUrl = `/uploads/screenshots/${filename}`;

  // Delete previous payment for this billing (keep only last)
  await prisma.payment.deleteMany({ where: { billingId, userId: session.user.id } });

  const payment = await prisma.payment.create({
    data: {
      userId: session.user.id,
      billingId,
      amountPaid: amountPaid || billing.billableAmount,
      method: "upi",
      screenshotUrl,
      confirmedByAdmin: false,
    },
  });

  await prisma.billing.update({ where: { id: billingId }, data: { status: "pending_confirmation" } });

  return NextResponse.json({ success: true, payment });
}
