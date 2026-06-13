import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendPasswordResetEmail } from "@/lib/email";
import crypto from "crypto";

export async function POST(req: NextRequest) {
  const { email } = await req.json();
  if (!email) return NextResponse.json({ error: "Email required" }, { status: 400 });

  const user = await prisma.user.findUnique({ where: { email } });
  // Always return success to prevent email enumeration
  if (!user) return NextResponse.json({ success: true });

  // Generate token
  const token = crypto.randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  // Store in VerificationToken table (reusing existing table)
  await prisma.verificationToken.deleteMany({ where: { identifier: `reset-${email}` } });
  await prisma.verificationToken.create({
    data: { identifier: `reset-${email}`, token, expires },
  });

  const resetUrl = `${process.env.NEXTAUTH_URL}/ResetPassword?token=${token}&email=${encodeURIComponent(email)}`;
  await sendPasswordResetEmail(email, user.name ?? "User", resetUrl);

  return NextResponse.json({ success: true });
}
