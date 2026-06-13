import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

export async function POST(req: NextRequest) {
  try {
    const { email, token, password } = await req.json();
    if (!email || !token || !password) return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    if (password.length < 6) return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });

    const record = await prisma.verificationToken.findFirst({
      where: { identifier: `reset-${email}`, token },
    });

    if (!record) return NextResponse.json({ error: "Invalid or expired reset link" }, { status: 400 });
    if (record.expires < new Date()) {
      await prisma.verificationToken.deleteMany({ where: { identifier: `reset-${email}` } });
      return NextResponse.json({ error: "Reset link has expired. Please request a new one." }, { status: 400 });
    }

    const hashed = await bcrypt.hash(password, 12);
    await prisma.user.update({ where: { email }, data: { password: hashed } });
    await prisma.verificationToken.deleteMany({ where: { identifier: `reset-${email}` } });

    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error("Reset password error:", e.message);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
