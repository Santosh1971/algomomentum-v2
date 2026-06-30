import { NextResponse } from "next/server";

export async function POST(req: Request) {
  console.warn("⚠️ DEPRECATED webhook route called:", req.url);
  return NextResponse.json({
    error: "This webhook endpoint is deprecated. Use /api/v1/webhook/strategy/{symbol} instead.",
  }, { status: 410 });
}
