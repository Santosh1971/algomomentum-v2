import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { NEXT_AUTH } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

export async function POST(req: NextRequest) {
  const session = await getServerSession(NEXT_AUTH);
  if (!session || session.user.role !== "admin")
    return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const formData = await req.formData();
  const file = formData.get("qr") as File;
  if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });

  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);
  const uploadsDir = path.join(process.cwd(), "public", "uploads", "qr");
  await mkdir(uploadsDir, { recursive: true });
  const filename = `upi-qr${path.extname(file.name)}`;
  await writeFile(path.join(uploadsDir, filename), buffer);
  const url = `/uploads/qr/${filename}`;

  await prisma.platformSettings.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", upiQrImageUrl: url },
    update: { upiQrImageUrl: url },
  });

  return NextResponse.json({ url });
}
