// app/user/pnl-report/page.tsx
"use client";
import { useState } from "react";
import { toast } from "sonner";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line } from "recharts";

interface DayRow { date: string; symbol: string; grossPnl: number; commissions: number; netPnl: number; fillsCount: number; }
interface CoinRow { symbol: string; grossPnl: number; commissions: number; netPnl: number; tradesCount: number; }
interface EquityPoint { date: string; cumPnl: number; }

interface Report {
  totalGrossPnl: number; totalCommissions: number; totalNetPnl: number; totalTrades: number;
  dailyBreakdown: DayRow[]; coinBreakdown: CoinRow[]; equityCurve: EquityPoint[];
}

export default function PnlReportPage() {
  const [tradeConfigId, setTradeConfigId] = useState("");
  const [from, setFrom] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10));
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);

  async function loadReport() {
    if (!tradeConfigId) { toast.error("Enter a Trade Config ID"); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/pnl/${tradeConfigId}?from=${from}&to=${to}`);
      const data = await res.json();
      if (!res.ok) { toast.error(data.error); return; }
      setReport(data);
    } catch { toast.error("Failed to load report"); }
    finally { setLoading(false); }
  }

  function pnlColor(val: number) { return val >= 0 ? "text-green-600" : "text-red-600"; }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <h1 className="text-2xl font-bold text-[#1E3A5F]">PnL Report</h1>

        {/* Filters */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border flex flex-wrap gap-4 items-end">
          <div>
            <label className="text-xs font-medium text-gray-500 block mb-1">Trade Config ID</label>
            <input value={tradeConfigId} onChange={(e) => setTradeConfigId(e.target.value)}
              placeholder="Paste config ID" className="border rounded-lg px-3 py-2 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 block mb-1">From (IST)</label>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 block mb-1">To (IST)</label>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]" />
          </div>
          <button onClick={loadReport} disabled={loading}
            className="bg-[#1E3A5F] text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-[#152c4a] disabled:opacity-50 transition">
            {loading ? "Loading..." : "Generate Report"}
          </button>
        </div>

        {report && (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: "Net PnL", value: `$${report.totalNetPnl.toFixed(2)}`, color: pnlColor(report.totalNetPnl) },
                { label: "Gross PnL", value: `$${report.totalGrossPnl.toFixed(2)}`, color: pnlColor(report.totalGrossPnl) },
                { label: "Commissions", value: `$${report.totalCommissions.toFixed(2)}`, color: "text-orange-600" },
                { label: "Total Trades", value: String(report.totalTrades), color: "text-blue-600" },
              ].map((card) => (
                <div key={card.label} className="bg-white rounded-2xl p-4 shadow-sm border text-center">
                  <p className="text-xs text-gray-400 mb-1">{card.label}</p>
                  <p className={`text-xl font-bold ${card.color}`}>{card.value}</p>
                </div>
              ))}
            </div>

            {/* Equity Curve */}
            <div className="bg-white rounded-2xl p-5 shadow-sm border">
              <h2 className="text-sm font-semibold text-gray-700 mb-4">Equity Curve</h2>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={report.equityCurve}>
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v: any) => `$${v.toFixed(2)}`} />
                  <Line type="monotone" dataKey="cumPnl" stroke="#1E3A5F" dot={false} strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Coin Breakdown */}
            <div className="bg-white rounded-2xl p-5 shadow-sm border">
              <h2 className="text-sm font-semibold text-gray-700 mb-3">Coin-wise Breakdown</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-[#1E3A5F] text-white text-xs">
                      {["Symbol", "Trades", "Gross PnL", "Commissions", "Net PnL"].map((h) => (
                        <th key={h} className="px-4 py-2 text-left font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {report.coinBreakdown.map((row, i) => (
                      <tr key={row.symbol} className={i % 2 === 0 ? "bg-gray-50" : "bg-white"}>
                        <td className="px-4 py-2 font-semibold">{row.symbol}</td>
                        <td className="px-4 py-2">{row.tradesCount}</td>
                        <td className={`px-4 py-2 font-medium ${pnlColor(row.grossPnl)}`}>${row.grossPnl.toFixed(2)}</td>
                        <td className="px-4 py-2 text-orange-600">${row.commissions.toFixed(2)}</td>
                        <td className={`px-4 py-2 font-bold ${pnlColor(row.netPnl)}`}>${row.netPnl.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Daily Breakdown */}
            <div className="bg-white rounded-2xl p-5 shadow-sm border">
              <h2 className="text-sm font-semibold text-gray-700 mb-3">Daily Breakdown (IST)</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-[#1E3A5F] text-white text-xs">
                      {["Date (IST)", "Symbol", "Trades", "Gross PnL", "Commissions", "Net PnL"].map((h) => (
                        <th key={h} className="px-4 py-2 text-left font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {report.dailyBreakdown.map((row, i) => (
                      <tr key={`${row.date}-${row.symbol}`} className={i % 2 === 0 ? "bg-gray-50" : "bg-white"}>
                        <td className="px-4 py-2 font-mono text-xs">{row.date}</td>
                        <td className="px-4 py-2 font-semibold">{row.symbol}</td>
                        <td className="px-4 py-2">{row.fillsCount}</td>
                        <td className={`px-4 py-2 ${pnlColor(row.grossPnl)}`}>${row.grossPnl.toFixed(2)}</td>
                        <td className="px-4 py-2 text-orange-600">${row.commissions.toFixed(2)}</td>
                        <td className={`px-4 py-2 font-bold ${pnlColor(row.netPnl)}`}>${row.netPnl.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
