// app/user/pnl-report/page.tsx
"use client";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import { toast } from "sonner";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line } from "recharts";

interface TradeConfig { id: string; script: string; amount: number; webhookToken: string; }
interface DeltaAccount { id: string; accountName: string; tradeConfigs: TradeConfig[]; }
interface DayRow { date: string; symbol: string; grossPnl: number; commissions: number; netPnl: number; fillsCount: number; }
interface CoinRow { symbol: string; grossPnl: number; commissions: number; netPnl: number; tradesCount: number; }
interface Report {
  totalGrossPnl: number; totalCommissions: number; totalNetPnl: number; totalTrades: number;
  dailyBreakdown: DayRow[]; coinBreakdown: CoinRow[]; equityCurve: { date: string; cumPnl: number }[];
}

export default function PnlReportPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [accounts, setAccounts] = useState<DeltaAccount[]>([]);
  const [selectedConfigId, setSelectedConfigId] = useState("");
  const [from, setFrom] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10));
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [currency, setCurrency] = useState<"USD" | "INR">("USD");

  useEffect(() => {
    if (status === "unauthenticated") router.push("/Signup");
  }, [status, router]);

  useEffect(() => {
    fetch("/api/v1/accounts").then(r => r.json()).then(data => {
      if (Array.isArray(data)) {
        setAccounts(data);
        // Auto-select first config
        const first = data[0]?.tradeConfigs?.[0];
        if (first) setSelectedConfigId(first.id);
      }
    });
  }, []);

  const INR = 85;
  const fmt = (usd: number) => currency === "USD"
    ? `$${usd.toFixed(4)}`
    : `₹${(usd * INR).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

  function pnlColor(val: number) { return val >= 0 ? "text-green-600" : "text-red-600"; }

  async function loadReport() {
    if (!selectedConfigId) { toast.error("Select a symbol"); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/pnl/${selectedConfigId}?from=${from}&to=${to}`);
      const data = await res.json();
      if (!res.ok) { toast.error(data.error); return; }
      setReport(data);
    } catch { toast.error("Failed to load report"); }
    finally { setLoading(false); }
  }

  // All configs flat list for selector
  const allConfigs = accounts.flatMap(a => a.tradeConfigs.map(tc => ({ ...tc, accountName: a.accountName })));

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-5xl mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-[#1E3A5F]">PnL Report</h1>
          <div className="flex bg-white border rounded-lg overflow-hidden text-sm">
            {(["USD", "INR"] as const).map(c => (
              <button key={c} onClick={() => setCurrency(c)}
                className={`px-3 py-1.5 font-medium transition ${currency === c ? "bg-[#1E3A5F] text-white" : "text-gray-600 hover:bg-gray-50"}`}>
                {c}
              </button>
            ))}
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border flex flex-wrap gap-4 items-end">
          <div>
            <label className="text-xs font-medium text-gray-500 block mb-1">Symbol</label>
            <select value={selectedConfigId} onChange={e => setSelectedConfigId(e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm w-56 focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]">
              {allConfigs.map(c => (
                <option key={c.id} value={c.id}>{c.accountName} — {c.script}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 block mb-1">From (IST)</label>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 block mb-1">To (IST)</label>
            <input type="date" value={to} onChange={e => setTo(e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]" />
          </div>
          <button onClick={loadReport} disabled={loading}
            className="bg-[#1E3A5F] text-white px-5 py-2 rounded-xl font-semibold text-sm hover:bg-[#152c4a] disabled:opacity-50 transition">
            {loading ? "Loading..." : "Load Report"}
          </button>
        </div>

        {report && (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: "Gross PnL", value: fmt(report.totalGrossPnl), color: pnlColor(report.totalGrossPnl) },
                { label: "Commissions", value: fmt(report.totalCommissions), color: "text-orange-600" },
                { label: "Net PnL", value: fmt(report.totalNetPnl), color: pnlColor(report.totalNetPnl) },
                { label: "Total Trades", value: report.totalTrades.toString(), color: "text-gray-800" },
              ].map(s => (
                <div key={s.label} className="bg-white rounded-xl p-4 shadow-sm border text-center">
                  <p className="text-xs text-gray-400 uppercase font-medium">{s.label}</p>
                  <p className={`text-xl font-bold mt-1 ${s.color}`}>{s.value}</p>
                </div>
              ))}
            </div>

            {/* Equity curve */}
            {report.equityCurve.length > 0 && (
              <div className="bg-white rounded-2xl p-5 shadow-sm border">
                <p className="font-semibold text-gray-700 mb-3">Equity Curve</p>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={report.equityCurve.map(d => ({ ...d, cumPnl: currency === "INR" ? d.cumPnl * INR : d.cumPnl }))}>
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: number) => fmt(currency === "INR" ? v / INR : v)} />
                    <Line type="monotone" dataKey="cumPnl" stroke="#1E3A5F" dot={false} strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Daily breakdown */}
            {report.dailyBreakdown.length > 0 && (
              <div className="bg-white rounded-2xl p-5 shadow-sm border">
                <p className="font-semibold text-gray-700 mb-3">Daily Breakdown</p>
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={report.dailyBreakdown.map(d => ({ ...d, netPnl: currency === "INR" ? d.netPnl * INR : d.netPnl }))}>
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip formatter={(v: number) => fmt(currency === "INR" ? v / INR : v)} />
                    <Bar dataKey="netPnl" fill="#1E3A5F" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
                <table className="w-full text-sm mt-4">
                  <thead>
                    <tr className="text-xs text-gray-400 uppercase border-b">
                      <th className="text-left py-2">Date</th>
                      <th className="text-right py-2">Gross PnL</th>
                      <th className="text-right py-2">Commission</th>
                      <th className="text-right py-2">Net PnL</th>
                      <th className="text-right py-2">Trades</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.dailyBreakdown.map((d, i) => (
                      <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="py-2 text-gray-600">{d.date}</td>
                        <td className={`py-2 text-right font-medium ${pnlColor(d.grossPnl)}`}>{fmt(d.grossPnl)}</td>
                        <td className="py-2 text-right text-orange-500">{fmt(d.commissions)}</td>
                        <td className={`py-2 text-right font-bold ${pnlColor(d.netPnl)}`}>{fmt(d.netPnl)}</td>
                        <td className="py-2 text-right text-gray-500">{d.fillsCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Coin breakdown */}
            {report.coinBreakdown.length > 0 && (
              <div className="bg-white rounded-2xl p-5 shadow-sm border">
                <p className="font-semibold text-gray-700 mb-3">By Symbol</p>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-gray-400 uppercase border-b">
                      <th className="text-left py-2">Symbol</th>
                      <th className="text-right py-2">Gross PnL</th>
                      <th className="text-right py-2">Commission</th>
                      <th className="text-right py-2">Net PnL</th>
                      <th className="text-right py-2">Trades</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.coinBreakdown.map((c, i) => (
                      <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="py-2 font-bold text-gray-800">{c.symbol}</td>
                        <td className={`py-2 text-right font-medium ${pnlColor(c.grossPnl)}`}>{fmt(c.grossPnl)}</td>
                        <td className="py-2 text-right text-orange-500">{fmt(c.commissions)}</td>
                        <td className={`py-2 text-right font-bold ${pnlColor(c.netPnl)}`}>{fmt(c.netPnl)}</td>
                        <td className="py-2 text-right text-gray-500">{c.tradesCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {report.totalTrades === 0 && (
              <div className="bg-white rounded-2xl p-10 text-center shadow-sm border">
                <p className="text-2xl mb-2">📊</p>
                <p className="text-gray-600 font-medium">No trades found for this period</p>
                <p className="text-sm text-gray-400 mt-1">Try a wider date range</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
