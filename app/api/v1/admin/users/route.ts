import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { NEXT_AUTH } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(NEXT_AUTH);
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true, email: true, name: true, role: true,
      isVerified: true, isApproved: true, createdAt: true, phone: true,
      details: {
        select: {
          age: true, gender: true, city: true, district: true,
          country: true, deltaUserId: true, deltaAccountName: true,
        },
      },
    },
  });
  return NextResponse.json(users);
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(NEXT_AUTH);
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }
  const { userId, isApproved } = await req.json();
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

  const user = await prisma.user.update({
    where: { id: userId },
    data: { isApproved },
    select: { id: true, email: true, name: true, isApproved: true },
  });
  // Send welcome email on approval
  if (isApproved) {
    try {
      const { sendWelcomeEmail } = await import("@/lib/email");
      await sendWelcomeEmail(user.email ?? "", user.name ?? "User");
    } catch (e) {
      console.error("Welcome email failed:", e);
    }
  }
  return NextResponse.json(user);
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(NEXT_AUTH);
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }
  const { userId } = await req.json();
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });
  // Prevent deleting yourself
  if (userId === session.user.id) return NextResponse.json({ error: "Cannot delete yourself" }, { status: 400 });
  await prisma.user.delete({ where: { id: userId } });
  return NextResponse.json({ message: "User deleted" });
}
