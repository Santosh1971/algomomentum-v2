// app/api/v1/pnl/[tradeConfigId]/export/route.ts
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
  const format = searchParams.get("format") ?? "csv";

  const config = await prisma.tradeConfig.findUnique({
    where: { id: tradeConfigId },
    select: { userId: true, script: true, account: { select: { api_key_enc: true, api_secret_enc: true } } },
  });
  if (!config) return NextResponse.json({ error: "Config not found" }, { status: 404 });
  if (config.userId !== session.user.id && session.user.role !== "admin")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const report = await computePnlReport(config.account.api_key_enc, config.account.api_secret_enc, config.script, from, to);

  const headers_row = ["Entry Time", "Exit Time", "Entry Price", "Exit Price", "Side", "Lot Size", "Gross PnL (USD)", "Delta Fee (USD)", "Net PnL (USD)", "Status"];
  const rows = report.trades.map(t => [
    t.entryTime, t.exitTime, t.entryPrice, t.exitPrice,
    t.side, t.size, t.grossPnl, t.commission, t.netPnl, t.status,
  ]);

  if (format === "csv") {
    const csv = [headers_row, ...rows].map(r => r.join(",")).join("\n");
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="pnl-${config.script}-${from}-${to}.csv"`,
      },
    });
  }

  // xlsx — use exceljs (lightweight, no native deps)
  try {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Trade Log");
    ws.addRow(headers_row);
    ws.getRow(1).font = { bold: true };
    rows.forEach(r => ws.addRow(r));
    ws.columns.forEach(col => { col.width = 18; });
    const buf = await wb.xlsx.writeBuffer();
    return new NextResponse(buf as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="pnl-${config.script}-${from}-${to}.xlsx"`,
      },
    });
  } catch {
    return NextResponse.json({ error: "exceljs not installed. Run: npm install exceljs" }, { status: 500 });
  }
}
