import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { NEXT_AUTH } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const session = await getServerSession(NEXT_AUTH);
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = await prisma.user.findUnique({ where: { email: session.user.email } });
  if (admin?.role !== "admin") return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const { userId, accountName, accountType } = await req.json();
  if (!userId || !accountName || !accountType) {
    return NextResponse.json({ error: "userId, accountName, and accountType are required" }, { status: 400 });
  }

  const targetUser = await prisma.user.findUnique({ where: { id: userId } });
  if (!targetUser) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const validTypes = ["main", "sub1", "sub2", "sub3", "sub4"];
  if (!validTypes.includes(accountType)) {
    return NextResponse.json({ error: `accountType must be one of: ${validTypes.join(", ")}` }, { status: 400 });
  }

  const count = await prisma.deltaAccount.count({ where: { userId } });
  if (count >= 5) {
    return NextResponse.json({ error: "This user already has the maximum of 5 accounts" }, { status: 400 });
  }

  const account = await prisma.deltaAccount.create({
    data: { userId, accountName, accountType },
  });

  const { api_key_enc, api_secret_enc, ...safe } = account;
  return NextResponse.json({ message: "Account created", account: safe }, { status: 201 });
}
