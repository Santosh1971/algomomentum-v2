// app/api/v1/pnl/[tradeConfigId]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { NEXT_AUTH } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { computePnlReport } from "@/lib/pnlEngine";
import { DateTime } from "luxon";

export async function GET(req: NextRequest, context: { params: Promise<{ tradeConfigId: string }> }) {
  const session = await getServerSession(NEXT_AUTH);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { tradeConfigId } = await context.params;
  const { searchParams } = new URL(req.url);

  const from = searchParams.get("from") ?? DateTime.now().setZone("Asia/Kolkata").startOf("month").toFormat("yyyy-MM-dd");
  const to = searchParams.get("to") ?? DateTime.now().setZone("Asia/Kolkata").toFormat("yyyy-MM-dd");

  const config = await prisma.tradeConfig.findUnique({
    where: { id: tradeConfigId },
    select: { userId: true, script: true, api_key_enc: true, api_secret_enc: true },
  });

  if (!config) return NextResponse.json({ error: "Config not found" }, { status: 404 });

  // Auth: only owner or admin
  if (config.userId !== session.user.id && session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const report = await computePnlReport(config.api_key_enc, config.api_secret_enc, config.script, from, to);
    return NextResponse.json({ tradeConfigId, symbol: config.script, from, to, ...report });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
