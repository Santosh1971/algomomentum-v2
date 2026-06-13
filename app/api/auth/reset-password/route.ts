import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

export async function POST(req: NextRequest) {
  const { email, token, password } = await req.json();
  if (!email || !token || !password) return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  if (password.length < 6) return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });

  const record = await prisma.verificationToken.findUnique({
    where: { identifier_token: { identifier: `reset-${email}`, token } },
  });

  if (!record) return NextResponse.json({ error: "Invalid or expired reset link" }, { status: 400 });
  if (record.expires < new Date()) {
    await prisma.verificationToken.delete({ where: { identifier_token: { identifier: `reset-${email}`, token } } });
    return NextResponse.json({ error: "Reset link has expired. Please request a new one." }, { status: 400 });
  }

  const hashed = await bcrypt.hash(password, 12);
  await prisma.user.update({ where: { email }, data: { password: hashed } });
  await prisma.verificationToken.delete({ where: { identifier_token: { identifier: `reset-${email}`, token } } });

  return NextResponse.json({ success: true });
}
