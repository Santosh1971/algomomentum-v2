import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { NEXT_AUTH } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const scripts = await prisma.script.findMany({ orderBy: { symbol: "asc" } });
  return NextResponse.json(scripts);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(NEXT_AUTH);
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }
  const data = await req.json();
  const script = await prisma.script.create({ data });
  return NextResponse.json(script, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(NEXT_AUTH);
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }
  const { symbol } = await req.json();
  await prisma.script.delete({ where: { symbol } });
  return NextResponse.json({ message: "Deleted" });
}
