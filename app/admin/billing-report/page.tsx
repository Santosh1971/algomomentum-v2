"use client";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import { toast } from "sonner";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

interface TradeConfig {
  id: string;
  script: string;
  amount: number;
  account: { delta_account_name: string | null } | null;
  platformFeePercent: number;
}

interface DayRow {
  date: string; symbol: string; grossPnl: number;
  commissions: number; netPnl: number; fillsCount: number;
}

interface CoinRow {
  symbol: string; grossPnl: number;
  commissions: number; netPnl: number; tradesCount: number;
}

interface Report {
  totalGrossPnl: number; totalCommissions: number;
  totalNetPnl: number; totalTrades: number;
  dailyBreakdown: DayRow[]; coinBreakdown: CoinRow[];
  equityCurve: { date: string; cumPnl: number }[];
}

export default function AdminBillingReport() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [users, setUsers] = useState<{ id: string; email: string; name: string | null }[]>([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [configs, setConfigs] = useState<TradeConfig[]>([]);
  const [selectedConfigId, setSelectedConfigId] = useState("");
  const [from, setFrom] = useState(() =>
    new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10)
  );
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/Signup");
    if (status === "authenticated" && session.user.role !== "admin") router.push("/user/dashboard");
  }, [status, session, router]);

  useEffect(() => {
    fetch("/api/v1/admin/users").then((r) => r.json()).then(setUsers);
  }, []);

  useEffect(() => {
    if (!selectedUserId) return;
    fetch(`/api/v1/tradeconfig?userId=${selectedUserId}`)
      .then((r) => r.json()).then((d) => { setConfigs(d); setSelectedConfigId(""); setReport(null); });
  }, [selectedUserId]);

  async function loadReport() {
    if (!selectedConfigId) { toast.error("Select a trade config"); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/pnl/${selectedConfigId}?from=${from}&to=${to}`);
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "Failed"); return; }
      setReport(data);
    } catch { toast.error("Failed to load report"); }
    finally { setLoading(false); }
  }

  async function generateBill() {
    if (!report || !selectedConfigId || !selectedUserId) return;
    setGenerating(true);
    const monthIST = to.slice(0, 7); // Use end date month for billing
    try {
      const res = await fetch("/api/v1/billing/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: selectedUserId, tradeConfigId: selectedConfigId, monthIST }),
      });
      const data = await res.json();
      if (res.ok && data.billing) {
        toast.success(`Bill generated! Platform fee: $${data.billing.billableAmount.toFixed(2)}`);
      } else {
        toast.error(data.error ?? "Failed to generate bill");
      }
    } catch (e: any) {
      toast.error(e.message ?? "Network error");
    } finally {
      setGenerating(false);
    }
  }

  const selectedConfig = configs.find((c) => c.id === selectedConfigId);
  const feePercent = selectedConfig?.platformFeePercent ?? 20;
  const billableAmount = report ? Math.max(0, report.totalNetPnl) * (feePercent / 100) : 0;
  const pnlColor = (v: number) => v >= 0 ? "text-green-600" : "text-red-600";

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-6xl mx-auto p-6 space-y-5">
        <h1 className="text-2xl font-bold text-[#1E3A5F]">Billing Report</h1>

        {/* Filters */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border space-y-4">
          <h2 className="text-sm font-semibold text-gray-600">Select Account & Period</h2>
          <div className="flex flex-wrap gap-4 items-end">
            <div>
              <label className="text-xs text-gray-500 block mb-1">Client</label>
              <select value={selectedUserId} onChange={(e) => setSelectedUserId(e.target.value)}
                className="border rounded-xl px-3 py-2 text-sm w-56 focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]">
                <option value="">Select client...</option>
                {users.filter(u => u.id !== session?.user?.id || session?.user?.role === "admin").map((u) => (
                  <option key={u.id} value={u.id}>{u.name ?? u.email}</option>
                ))}
              </select>
            </div>
            {configs.length > 0 && (
              <div>
                <label className="text-xs text-gray-500 block mb-1">Trade Config</label>
                <select value={selectedConfigId} onChange={(e) => setSelectedConfigId(e.target.value)}
                  className="border rounded-xl px-3 py-2 text-sm w-56 focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]">
                  <option value="">Select config...</option>
                  {configs.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.script} — {c.account?.delta_account_name ?? "Not connected"}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className="text-xs text-gray-500 block mb-1">From (IST)</label>
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
                className="border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]" />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">To (IST)</label>
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
                className="border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]" />
            </div>
            <button onClick={loadReport} disabled={loading || !selectedConfigId}
              className="bg-[#1E3A5F] text-white px-5 py-2 rounded-xl text-sm font-semibold hover:bg-[#152c4a] disabled:opacity-40 transition">
              {loading ? "Loading..." : "Generate Report"}
            </button>
          </div>
        </div>

        {report && (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              {[
                { label: "Net PnL", value: `$${report.totalNetPnl.toFixed(2)}`, color: pnlColor(report.totalNetPnl), bg: "bg-white" },
                { label: "Gross PnL", value: `$${report.totalGrossPnl.toFixed(2)}`, color: pnlColor(report.totalGrossPnl), bg: "bg-white" },
                { label: "Commissions", value: `$${report.totalCommissions.toFixed(2)}`, color: "text-orange-600", bg: "bg-white" },
                { label: "Total Trades", value: String(report.totalTrades), color: "text-blue-600", bg: "bg-white" },
                { label: `Platform Fee (${feePercent}%)`, value: `$${billableAmount.toFixed(2)}`, color: billableAmount > 0 ? "text-green-700" : "text-gray-400", bg: "bg-green-50" },
              ].map((card) => (
                <div key={card.label} className={`${card.bg} rounded-2xl p-4 shadow-sm border text-center`}>
                  <p className="text-xs text-gray-400 mb-1">{card.label}</p>
                  <p className={`text-xl font-bold ${card.color}`}>{card.value}</p>
                </div>
              ))}
            </div>

            {/* Equity Curve */}
            {report.equityCurve.length > 0 && (
              <div className="bg-white rounded-2xl p-5 shadow-sm border">
                <h2 className="text-sm font-semibold text-gray-700 mb-4">Equity Curve</h2>
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={report.equityCurve}>
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip formatter={(v: any) => `$${Number(v).toFixed(2)}`} />
                    <Line type="monotone" dataKey="cumPnl" stroke="#1E3A5F" dot={false} strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Coin Breakdown */}
            <div className="bg-white rounded-2xl p-5 shadow-sm border">
              <h2 className="text-sm font-semibold text-gray-700 mb-3">Coin-wise Breakdown</h2>
              {report.coinBreakdown.length === 0 ? (
                <p className="text-sm text-gray-400 py-4 text-center">No closing trades found in this period</p>
              ) : (
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
              )}
            </div>

            {/* Daily Breakdown */}
            <div className="bg-white rounded-2xl p-5 shadow-sm border">
              <h2 className="text-sm font-semibold text-gray-700 mb-3">Daily Breakdown (IST)</h2>
              {report.dailyBreakdown.length === 0 ? (
                <p className="text-sm text-gray-400 py-4 text-center">No trades in this period</p>
              ) : (
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
              )}
            </div>

            {/* Generate Bill */}
            <div className="bg-white rounded-2xl p-5 shadow-sm border flex items-center justify-between">
              <div>
                <p className="font-semibold text-gray-800">Ready to generate invoice?</p>
                <p className="text-sm text-gray-500 mt-0.5">
                  Platform fee: <span className="font-medium text-green-700">${billableAmount.toFixed(2)}</span>
                  {billableAmount <= 0 && " — No bill (net loss period)"}
                </p>
              </div>
              <button onClick={generateBill} disabled={generating || billableAmount <= 0}
                className="bg-green-600 hover:bg-green-700 text-white px-6 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-40 transition">
                {generating ? "Generating..." : "Generate Bill"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
