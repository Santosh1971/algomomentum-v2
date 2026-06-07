import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { NEXT_AUTH } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const session = await getServerSession(NEXT_AUTH);
  if (!session || session.user.role !== "admin")
    return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const formData = await req.formData();
  const file = formData.get("qr") as File;
  if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });

  // Store as base64 data URL in DB — survives Railway redeploys
  const bytes = await file.arrayBuffer();
  const base64 = Buffer.from(bytes).toString("base64");
  const mimeType = file.type || "image/png";
  const dataUrl = `data:${mimeType};base64,${base64}`;

  await prisma.platformSettings.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", upiQrImageUrl: dataUrl },
    update: { upiQrImageUrl: dataUrl },
  });

  return NextResponse.json({ url: dataUrl });
}
