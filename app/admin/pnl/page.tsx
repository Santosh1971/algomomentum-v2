"use client";
import { useEffect, useState, Suspense } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Navbar from "@/components/Navbar";
import { toast } from "sonner";
import { ComposedChart, Line, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid } from "recharts";

interface TradeRow {
  entryTime: string; exitTime: string; entryPrice: number; exitPrice: number;
  side: string; size: number; grossPnl: number; commission: number; netPnl: number;
  status: string; contractSize?: number; notionalValue?: number;
}
interface Report {
  totalGrossPnl: number; totalCommissions: number; totalNetPnl: number; totalTrades: number;
  winRate: number; maxDrawdown: number;
  equityCurve: { date: string; cumPnl: number; equity: number }[];
  trades: TradeRow[];
}

const INR = 85;

function AdminPnlInner() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const params = useSearchParams();
  const configId = params.get("configId") ?? "";
  const [from, setFrom] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10));
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [currency, setCurrency] = useState<"USD" | "INR">("INR");
  const [symbol, setSymbol] = useState("");
  const [quickRange, setQuickRange] = useState("custom");

  const CUR_FY_START = new Date().getMonth() >= 3 ? new Date().getFullYear() : new Date().getFullYear() - 1;

  function applyQuickRange(val: string) {
    setQuickRange(val);
    const today = new Date();
    if (val === "7d") { const f = new Date(); f.setDate(f.getDate()-6); setFrom(f.toISOString().slice(0,10)); setTo(today.toISOString().slice(0,10)); }
    else if (val === "30d") { const f = new Date(); f.setDate(f.getDate()-29); setFrom(f.toISOString().slice(0,10)); setTo(today.toISOString().slice(0,10)); }
    else if (val === "90d") { const f = new Date(); f.setDate(f.getDate()-89); setFrom(f.toISOString().slice(0,10)); setTo(today.toISOString().slice(0,10)); }
    else if (val === "fy0") { setFrom(`${CUR_FY_START}-04-01`); setTo(`${CUR_FY_START+1}-03-31`); }
    else if (val === "fy1") { setFrom(`${CUR_FY_START-1}-04-01`); setTo(`${CUR_FY_START}-03-31`); }
  }

  useEffect(() => {
    if (status === "unauthenticated") router.push("/Signup");
    if (status === "authenticated" && session?.user?.role !== "admin") router.push("/user/dashboard");
  }, [status, session, router]);

  useEffect(() => { if (configId) loadReport(); }, [configId]);

  const fmt = (usd: number) => currency === "USD" ? `$${usd.toFixed(2)}` : `₹${(usd * INR).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
  const pnlColor = (v: number) => v >= 0 ? "text-green-600" : "text-red-600";
  const fmtPrice = (p: number) => p === 0 ? "0" : p.toFixed(8).replace(/\.?0+$/, "");

  async function loadReport() {
    if (!configId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/pnl/${configId}?from=${from}&to=${to}`);
      const data = await res.json();
      if (!res.ok) { toast.error(data.error); return; }
      setReport(data);
      setSymbol(data.symbol ?? "");
    } catch { toast.error("Failed to load"); }
    finally { setLoading(false); }
  }

  async function downloadExcel() {
    if (!report) return;
    const res = await fetch(`/api/v1/pnl/${configId}/export?from=${from}&to=${to}&format=xlsx`);
    if (!res.ok) { toast.error("Export failed"); return; }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `pnl-${symbol}-${from}-${to}.xlsx`; a.click();
    URL.revokeObjectURL(url);
  }

  const chartData = report?.equityCurve.map(d => ({
    date: d.date,
    "Net PnL": currency === "INR" ? parseFloat((d.cumPnl * INR).toFixed(0)) : d.cumPnl,
    "Equity": currency === "INR" ? parseFloat((d.equity * INR).toFixed(0)) : d.equity,
  })) ?? [];

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <button onClick={() => router.back()} className="text-sm text-gray-400 hover:text-gray-600 mb-1 block">← Back</button>
            <h1 className="text-2xl font-bold text-[#161B22]">Trade History {symbol && `— ${symbol}`}</h1>
          </div>
          <div className="flex items-center gap-3">
            {report && <button onClick={downloadExcel} className="text-sm px-3 py-1.5 rounded-lg border text-gray-600 hover:bg-gray-50">⬇ Excel</button>}
            <div className="flex bg-background border border-border rounded-lg overflow-hidden text-sm">
              {(["USD", "INR"] as const).map(c => (
                <button key={c} onClick={() => setCurrency(c)}
                  className={`px-3 py-1.5 font-medium transition ${currency === c ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted"}`}>{c}</button>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 shadow-sm border flex flex-wrap gap-4 items-end">
          <div>
            <label className="text-xs font-medium text-gray-500 block mb-1">Quick range</label>
            <select value={quickRange} onChange={e => applyQuickRange(e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#161B22]">
              <option value="custom">Custom</option>
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
              <option value="90d">Last 90 days</option>
              <option value="fy0">FY {CUR_FY_START}-{CUR_FY_START+1}</option>
              <option value="fy1">FY {CUR_FY_START-1}-{CUR_FY_START}</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 block mb-1">From (IST)</label>
            <input type="date" value={from} onChange={e => { setFrom(e.target.value); setQuickRange("custom"); }}
              className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#161B22]" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 block mb-1">To (IST)</label>
            <input type="date" value={to} onChange={e => { setTo(e.target.value); setQuickRange("custom"); }}
              className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#161B22]" />
          </div>
          <button onClick={loadReport} disabled={loading}
            className="bg-[#161B22] text-white px-5 py-2 rounded-xl font-semibold text-sm hover:bg-[#161B22] disabled:opacity-50">
            {loading ? "Loading..." : "Load Report"}
          </button>
        </div>

        {report && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
              {[
                { label: "Gross PnL", value: fmt(report.totalGrossPnl), color: pnlColor(report.totalGrossPnl) },
                { label: "Commissions", value: fmt(report.totalCommissions), color: "text-orange-600" },
                { label: "Net PnL", value: fmt(report.totalNetPnl), color: pnlColor(report.totalNetPnl) },
                { label: "Total Trades", value: String(report.totalTrades), color: "text-gray-800" },
                { label: "Win Rate", value: `${report.winRate}%`, color: report.winRate >= 50 ? "text-green-600" : "text-red-600" },
                { label: "Max Drawdown", value: fmt(report.maxDrawdown), color: "text-red-600" },
              ].map(s => (
                <div key={s.label} className="bg-white rounded-xl p-4 shadow-sm border text-center">
                  <p className="text-xs text-gray-400 uppercase font-medium">{s.label}</p>
                  <p className={`text-lg font-bold mt-1 ${s.color}`}>{s.value}</p>
                </div>
              ))}
            </div>

            {chartData.length > 0 && (
              <div className="bg-white rounded-2xl p-5 shadow-sm border">
                <p className="font-semibold text-gray-700 mb-3">Equity Curve & Cumulative PnL</p>
                <ResponsiveContainer width="100%" height={240}>
                  <ComposedChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis yAxisId="equity" tick={{ fontSize: 11 }} />
                    <YAxis yAxisId="pnl" orientation="right" tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: any, name: any) => [currency === "INR" ? `₹${(Number(v)*INR).toLocaleString("en-IN")}` : `$${Number(v).toFixed(2)}`, name]} />
                    <Legend />
                    <Line yAxisId="equity" type="monotone" dataKey="Equity" stroke="#161B22" dot={false} strokeWidth={2} />
                    <Bar yAxisId="pnl" dataKey="Net PnL" fill="#22c55e" opacity={0.7} radius={[2,2,0,0]} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}

            {report.trades.length > 0 && (
              <div className="bg-white rounded-2xl p-5 shadow-sm border">
                <p className="font-semibold text-gray-700 mb-3">Trade Log ({report.trades.length} trades)</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-gray-400 uppercase border-b">
                        <th className="text-right py-2 pr-3">#</th>
                        <th className="text-left py-2 pr-3">Entry time</th>
                        <th className="text-left py-2 pr-3">Exit time</th>
                        <th className="text-right py-2 pr-3">Entry</th>
                        <th className="text-right py-2 pr-3">Exit</th>
                        <th className="text-center py-2 pr-3">Side</th>
                        <th className="text-right py-2 pr-3">Lot</th>
                        <th className="text-right py-2 pr-3">Gross PnL</th>
                        <th className="text-right py-2 pr-3">Delta fee</th>
                        <th className="text-right py-2 pr-3">Net PnL</th>
                        <th className="text-right py-2 pr-3">Cum PnL</th>
                        <th className="text-center py-2">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.trades.map((t, i) => (
                        <tr key={i} className="border-b border-gray-50 hover:bg-gray-50 text-xs">
                          <td className="py-2 pr-3 text-right text-gray-400 font-mono">{report.trades.length - i}</td>
                          <td className="py-2 pr-3 text-gray-500 whitespace-nowrap">{t.entryTime}</td>
                          <td className="py-2 pr-3 text-gray-500 whitespace-nowrap">{t.exitTime}</td>
                          <td className="py-2 pr-3 text-right font-mono">{fmtPrice(t.entryPrice)}</td>
                          <td className="py-2 pr-3 text-right font-mono">{fmtPrice(t.exitPrice)}</td>
                          <td className="py-2 pr-3 text-center">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${t.side === "buy" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"}`}>{t.side}</span>
                          </td>
                          <td className="py-2 pr-3 text-right text-gray-600">{t.size}</td>
                          <td className={`py-2 pr-3 text-right font-medium ${pnlColor(t.grossPnl)}`}>{fmt(t.grossPnl)}</td>
                          <td className="py-2 pr-3 text-right text-orange-500">{fmt(t.commission)}</td>
                          <td className={`py-2 pr-3 text-right font-bold ${pnlColor(t.netPnl)}`}>{fmt(t.netPnl)}</td>
                          <td className={`py-2 pr-3 text-right font-bold ${(() => { const cum = report.trades.slice(i).reduce((s,x) => s+x.netPnl,0); return cum>=0?"text-green-600":"text-red-600"; })()}`}>
                            {fmt(report.trades.slice(i).reduce((s,x) => s+x.netPnl,0))}
                          </td>
                          <td className="py-2 text-center">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${t.status === "win" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"}`}>{t.status}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default function AdminPnlPage() {
  return <Suspense><AdminPnlInner /></Suspense>;
}
