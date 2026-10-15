// GET: latest engine runner log rows (admin only, read-only).
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { NEXT_AUTH } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(NEXT_AUTH);
  if (session?.user?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const rows = await prisma.engineRunLog.findMany({ orderBy: { barTime: "desc" }, take: 150 });
  return NextResponse.json({ rows });
}
