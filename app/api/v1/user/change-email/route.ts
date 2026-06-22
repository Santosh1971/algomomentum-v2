import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { NEXT_AUTH } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const session = await getServerSession(NEXT_AUTH);
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { newEmail } = await req.json();
  if (!newEmail) return NextResponse.json({ error: "Email required" }, { status: 400 });

  const existing = await prisma.user.findUnique({ where: { email: newEmail.toLowerCase() } });
  if (existing) return NextResponse.json({ error: "Email already in use" }, { status: 409 });

  await prisma.user.update({
    where: { email: session.user.email },
    data: { email: newEmail.toLowerCase() },
  });

  return NextResponse.json({ ok: true });
}
