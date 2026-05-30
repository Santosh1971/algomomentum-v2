import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

export async function POST(req: NextRequest) {
  const { email, password } = await req.json();
  
  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return NextResponse.json({ step: "user_not_found" });
    
    const valid = await bcrypt.compare(password, user.password!);
    return NextResponse.json({ 
      step: "password_check",
      valid,
      hasPassword: !!user.password,
      isVerified: user.isVerified,
      role: user.role,
      passwordStart: user.password?.substring(0, 7)
    });
  } catch (e: any) {
    return NextResponse.json({ step: "error", message: e.message });
  }
}
