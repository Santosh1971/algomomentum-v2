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

  // Price: strip trailing zeros, keep up to 8dp
  const fmtPrice = (p: number) => parseFloat(p.toFixed(8)).toString();
  const f2 = (n: number) => parseFloat(n.toFixed(2));

  const headers_row = ["Entry Time", "Exit Time", "Entry Price", "Exit Price", "Side", "Lot Size", "Gross PnL (USD)", "Delta Fee (USD)", "Net PnL (USD)", "Status"];
  const rows = report.trades.map(t => [
    t.entryTime, t.exitTime, fmtPrice(t.entryPrice), fmtPrice(t.exitPrice),
    t.side, t.size, f2(t.grossPnl), f2(t.commission), f2(t.netPnl), t.status,
  ]);

  // Excel only
  try {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Trade Log");

    // Header row with style
    ws.addRow(headers_row);
    const headerRow = ws.getRow(1);
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
    headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A5F" } };
    headerRow.alignment = { horizontal: "center" };

    // Data rows
    rows.forEach((r, i) => {
      const row = ws.addRow(r);
      const netPnl = r[8] as number;
      row.getCell(9).font = { color: { argb: netPnl >= 0 ? "FF16a34a" : "FFdc2626" }, bold: true };
      row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: i % 2 === 0 ? "FFFFFFFF" : "FFF9FAFB" } };
    });

    // Column widths
    const colWidths = [20, 20, 12, 12, 8, 8, 14, 14, 14, 8];
    ws.columns.forEach((col, i) => { col.width = colWidths[i] ?? 14; });

    // Summary sheet
    const ws2 = wb.addWorksheet("Summary");
    ws2.addRow(["Metric", "Value"]);
    ws2.getRow(1).font = { bold: true };
    ws2.addRow(["Symbol", config.script]);
    ws2.addRow(["Period", `${from} to ${to}`]);
    ws2.addRow(["Total Trades", report.totalTrades]);
    ws2.addRow(["Win Rate %", report.winRate]);
    ws2.addRow(["Gross PnL (USD)", f2(report.totalGrossPnl)]);
    ws2.addRow(["Delta Fees (USD)", f2(report.totalCommissions)]);
    ws2.addRow(["Net PnL (USD)", f2(report.totalNetPnl)]);
    ws2.addRow(["Max Drawdown (USD)", f2(report.maxDrawdown)]);
    ws2.columns = [{ width: 22 }, { width: 18 }];

    const buf = await wb.xlsx.writeBuffer();
    return new NextResponse(buf as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="pnl-${config.script}-${from}-${to}.xlsx"`,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Excel export failed" }, { status: 500 });
  }
}
