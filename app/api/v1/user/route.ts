import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { sendVerificationEmail } from "@/lib/email";

export async function POST(req: NextRequest) {
  const { email, password, name, phone, city, district, country, gender, age } = await req.json();

  if (!email || !password || !name) {
    return NextResponse.json({ error: "Name, email and password required" }, { status: 400 });
  }
  if (password.length < 6) {
    return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return NextResponse.json({ error: "Email already registered" }, { status: 400 });

  const hashed = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: {
      email, password: hashed, name,
      phone: phone ?? "",
      isVerified: false,
      isApproved: false,
      role: "user",
    },
  });

  // Save personal details
  if (phone || city) {
    await prisma.userDetails.create({
      data: {
        userId: user.id,
        name, email,
        phone: phone ?? "",
        city: city ?? "",
        district: district ?? "",
        country: country ?? "India",
        gender: gender ?? "",
        age: age ? parseInt(age) : 0,
      },
    }).catch(() => {}); // ignore if details already exist
  }

  // Generate 6-digit OTP
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const expires = new Date(Date.now() + 10 * 60 * 1000);
  await prisma.verificationToken.create({
    data: { identifier: email, token: otp, expires, userId: user.id },
  });

  try {
    await sendVerificationEmail(email, name, otp);
  } catch (e) {
    console.error("Email send failed:", e);
  }

  return NextResponse.json({ message: "OTP sent! Check your email.", userId: user.id }, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const { email, otp } = await req.json();
  if (!email || !otp) return NextResponse.json({ error: "Email and OTP required" }, { status: 400 });

  const token = await prisma.verificationToken.findFirst({
    where: { identifier: email, token: otp },
  });

  if (!token) return NextResponse.json({ error: "Invalid OTP" }, { status: 400 });
  if (token.expires < new Date()) return NextResponse.json({ error: "OTP expired. Please register again." }, { status: 400 });

  await prisma.user.update({
    where: { email },
    data: { isVerified: true },
  });
  await prisma.verificationToken.delete({ where: { id: token.id } });

  return NextResponse.json({ message: "Email verified! Your account is pending admin approval." });
}
