import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const { email, name, phone, city, district, country, gender, age } = await req.json();
  if (!email) return NextResponse.json({ error: "Email required" }, { status: 400 });

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  // Upsert personal details
  await prisma.userDetails.upsert({
    where: { userId: user.id },
    update: { phone: phone ?? "", city: city ?? "", district: district ?? "", country: country ?? "India", gender: gender ?? "", age: age ? parseInt(age) : 0 },
    create: { userId: user.id, name: name ?? user.name ?? "", email, phone: phone ?? "", city: city ?? "", district: district ?? "", country: country ?? "India", gender: gender ?? "", age: age ? parseInt(age) : 0 },
  });

  // Update phone on user record too
  if (phone) await prisma.user.update({ where: { id: user.id }, data: { phone } });

  return NextResponse.json({ message: "Details saved" });
}
