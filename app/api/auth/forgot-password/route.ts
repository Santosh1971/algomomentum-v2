import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendPasswordResetEmail } from "@/lib/email";
import crypto from "crypto";

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();
    if (!email) return NextResponse.json({ error: "Email required" }, { status: 400 });

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return NextResponse.json({ success: true });

    const token = crypto.randomBytes(32).toString("hex");
    const expires = new Date(Date.now() + 60 * 60 * 1000);

    await prisma.verificationToken.deleteMany({ where: { identifier: `reset-${email}` } });
    await prisma.verificationToken.create({
      data: { identifier: `reset-${email}`, token, expires },
    });

    const resetUrl = `${process.env.NEXTAUTH_URL}/ResetPassword?token=${token}&email=${encodeURIComponent(email)}`;
    await sendPasswordResetEmail(email, user.name ?? "User", resetUrl);

    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error("Forgot password error:", e.message);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
