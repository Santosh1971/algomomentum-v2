// app/user/pnl-report/page.tsx
"use client";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import { toast } from "sonner";
import {
  ComposedChart, Line, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Legend, CartesianGrid,
} from "recharts";

interface TradeConfig { id: string; script: string; amount: number; webhookToken: string; }
interface DeltaAccount { id: string; accountName: string; tradeConfigs: TradeConfig[]; }
interface TradeRow {
  entryTime: string; exitTime: string; entryPrice: number; exitPrice: number;
  side: string; size: number; grossPnl: number; commission: number; netPnl: number; status: string;
  contractSize?: number; notionalValue?: number;
}
interface DayRow { date: string; symbol: string; grossPnl: number; commissions: number; netPnl: number; fillsCount: number; }
interface CoinRow { symbol: string; grossPnl: number; commissions: number; netPnl: number; tradesCount: number; }
interface Report {
  totalGrossPnl: number; totalCommissions: number; totalNetPnl: number; totalTrades: number;
  winRate: number; maxDrawdown: number;
  dailyBreakdown: DayRow[]; coinBreakdown: CoinRow[];
  equityCurve: { date: string; cumPnl: number; equity: number }[];
  trades: TradeRow[];
}

const INR = 85;
const CUR_FY_START = new Date().getMonth() >= 3 ? new Date().getFullYear() : new Date().getFullYear() - 1;

function fyRange(startYear: number) {
  return { from: `${startYear}-04-01`, to: `${startYear + 1}-03-31` };
}

function lastNDays(n: number) {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - n + 1);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

export default function PnlReportPage() {
  const [isDark, setIsDark] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    setIsDark(mq.matches);
    mq.addEventListener('change', e => setIsDark(e.matches));
    return () => mq.removeEventListener('change', e => setIsDark(e.matches));
  }, []);
  const selStyle = isDark ? { colorScheme: 'dark', backgroundColor: '#1f1f1f', color: '#ededed', borderColor: '#27272a' } : {};
  const { data: session, status } = useSession();
  const router = useRouter();
  const [accounts, setAccounts] = useState<DeltaAccount[]>([]);
  const [selectedConfigId, setSelectedConfigId] = useState("");
  const [from, setFrom] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10));
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [currency, setCurrency] = useState<"USD" | "INR">("USD");
  const [quickRange, setQuickRange] = useState("custom");

  useEffect(() => { if (status === "unauthenticated") router.push("/Signup"); }, [status, router]);

  useEffect(() => {
    fetch("/api/v1/accounts").then(r => r.json()).then(data => {
      if (Array.isArray(data)) {
        setAccounts(data);
        const first = data[0]?.tradeConfigs?.[0];
        if (first) setSelectedConfigId(first.id);
      }
    });
  }, []);

  const fmt = (usd: number) => currency === "USD"
    ? `$${usd.toFixed(4)}`
    : `₹${(usd * INR).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

  const fmtP = (usd: number) => currency === "USD"
    ? `$${usd.toFixed(2)}`
    : `₹${(usd * INR).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

  // Price: keep significant decimals, strip trailing zeros, max 8dp
  const fmtPrice = (p: number) => {
    if (p === 0) return "0";
    const s = p.toFixed(8).replace(/\.?0+$/, "");
    return s;
  };

  function pnlColor(val: number) { return val >= 0 ? "text-green-600" : "text-red-600"; }

  function applyQuickRange(val: string) {
    setQuickRange(val);
    if (val === "7d") { const r = lastNDays(7); setFrom(r.from); setTo(r.to); }
    else if (val === "30d") { const r = lastNDays(30); setFrom(r.from); setTo(r.to); }
    else if (val === "90d") { const r = lastNDays(90); setFrom(r.from); setTo(r.to); }
    else if (val === "fy0") { const r = fyRange(CUR_FY_START); setFrom(r.from); setTo(r.to); }
    else if (val === "fy1") { const r = fyRange(CUR_FY_START - 1); setFrom(r.from); setTo(r.to); }
    else if (val === "fy2") { const r = fyRange(CUR_FY_START - 2); setFrom(r.from); setTo(r.to); }
  }

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

  async function downloadExcel() {
    if (!report) return;
    const coin = allConfigs.find(c => c.id === selectedConfigId)?.script ?? "report";
    const res = await fetch(`/api/v1/pnl/${selectedConfigId}/export?from=${from}&to=${to}&format=xlsx`);
    if (!res.ok) { toast.error("Export failed"); return; }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pnl-${coin}-${from}-${to}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const allConfigs = accounts.flatMap(a => a.tradeConfigs.map(tc => ({ ...tc, accountName: a.accountName })));

  const chartData = report?.equityCurve.map(d => ({
    date: d.date,
    "Net PnL": currency === "INR" ? parseFloat((d.cumPnl * INR).toFixed(0)) : d.cumPnl,
    "Equity": currency === "INR" ? parseFloat((d.equity * INR).toFixed(0)) : d.equity,
  })) ?? [];

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-[#161B22]">PnL Report</h1>
          <div className="flex items-center gap-3 flex-wrap">
            {report && (
              <button onClick={downloadExcel}
                className="text-sm px-3 py-1.5 rounded-lg border text-gray-600 hover:bg-gray-50 font-medium">⬇ Excel</button>
            )}
            <div className="flex bg-white border rounded-lg overflow-hidden text-sm">
              {(["USD", "INR"] as const).map(c => (
                <button key={c} onClick={() => setCurrency(c)}
                  className={`px-3 py-1.5 font-medium transition ${currency === c ? "bg-[#161B22] text-white" : "text-gray-600 hover:bg-gray-50"}`}>{c}</button>
              ))}
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border space-y-4">
          <div className="flex flex-wrap gap-4 items-end">
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">Symbol</label>
              <select value={selectedConfigId} onChange={e => setSelectedConfigId(e.target.value)}
                className="border rounded-lg px-3 py-2 text-sm w-56 focus:outline-none focus:ring-2 focus:ring-[#161B22]" style={selStyle}>
                {allConfigs.map(c => <option key={c.id} value={c.id}>{c.accountName} — {c.script}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">Quick range</label>
              <select value={quickRange} onChange={e => applyQuickRange(e.target.value)}
                className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#161B22]" style={selStyle}>
                <option value="custom">Custom</option>
                <option value="7d">Last 7 days</option>
                <option value="30d">Last 30 days</option>
                <option value="90d">Last 90 days</option>
                <option value="fy0">FY {CUR_FY_START}-{CUR_FY_START + 1}</option>
                <option value="fy1">FY {CUR_FY_START - 1}-{CUR_FY_START}</option>
                <option value="fy2">FY {CUR_FY_START - 2}-{CUR_FY_START - 1}</option>
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
              className="bg-foreground text-background px-5 py-2 rounded-xl font-semibold text-sm hover:opacity-90 disabled:opacity-50 transition">
              {loading ? "Loading..." : "Load Report"}
            </button>
          </div>
        </div>

        {report && (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
              {[
                { label: "Gross PnL", value: fmtP(report.totalGrossPnl), color: pnlColor(report.totalGrossPnl) },
                { label: "Commissions", value: fmtP(report.totalCommissions), color: "text-orange-600" },
                { label: "Net PnL", value: fmtP(report.totalNetPnl), color: pnlColor(report.totalNetPnl) },
                { label: "Total Trades", value: String(report.totalTrades), color: "text-gray-800" },
                { label: "Win Rate", value: `${report.winRate}%`, color: report.winRate >= 50 ? "text-green-600" : "text-red-600" },
                { label: "Max Drawdown", value: fmtP(report.maxDrawdown), color: "text-red-600" },
              ].map(s => (
                <div key={s.label} className="bg-white rounded-xl p-4 shadow-sm border text-center">
                  <p className="text-xs text-gray-400 uppercase font-medium">{s.label}</p>
                  <p className={`text-lg font-bold mt-1 ${s.color}`}>{s.value}</p>
                </div>
              ))}
            </div>

            {/* Equity + PnL combined chart */}
            {chartData.length > 0 && (
              <div className="bg-white rounded-2xl p-5 shadow-sm border">
                <p className="font-semibold text-gray-700 mb-3">Equity Curve & Cumulative PnL</p>
                <div className="flex gap-4 text-xs text-gray-400 mb-1">
                  <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-[#161B22] inline-block"></span> Equity (notional $)</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-3 bg-green-400 opacity-70 inline-block rounded-sm"></span> Cumulative PnL ($)</span>
                </div>
                <ResponsiveContainer width="100%" height={240}>
                  <ComposedChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis yAxisId="equity" tick={{ fontSize: 11 }} label={{ value: "Equity $", angle: -90, position: "insideLeft", style: { fontSize: 10 } }} />
                    <YAxis yAxisId="pnl" orientation="right" tick={{ fontSize: 11 }} label={{ value: "PnL $", angle: 90, position: "insideRight", style: { fontSize: 10 } }} />
                    <Tooltip formatter={(v: any, name: any) => [currency === "INR" ? `₹${(Number(v)*INR).toLocaleString("en-IN")}` : `$${Number(v).toFixed(2)}`, name]} />
                    <Legend />
                    <Line yAxisId="equity" type="monotone" dataKey="Equity" stroke="#161B22" dot={false} strokeWidth={2} />
                    <Bar yAxisId="pnl" dataKey="Net PnL" fill="#22c55e" opacity={0.7} radius={[2, 2, 0, 0]} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Trade-wise table */}
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
                        <th className="text-right py-2 pr-3">Entry ₹</th>
                        <th className="text-right py-2 pr-3">Exit ₹</th>
                        <th className="text-center py-2 pr-3">Side</th>
                        <th className="text-right py-2 pr-3">Lot</th>
                        <th className="text-right py-2 pr-3">Position Size</th>
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
                          <td className="py-2 pr-3 text-right font-medium font-mono">{fmtPrice(t.entryPrice)}</td>
                          <td className="py-2 pr-3 text-right font-medium font-mono">{fmtPrice(t.exitPrice)}</td>
                          <td className="py-2 pr-3 text-center">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${t.side === "buy" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"}`}>
                              {t.side}
                            </span>
                          </td>
                          <td className="py-2 pr-3 text-right text-gray-600">{t.size}</td>
                          <td className="py-2 pr-3 text-right text-gray-600 font-mono">{fmtP(t.size * (t.contractSize ?? 1) * t.entryPrice)}</td>
                          <td className={`py-2 pr-3 text-right font-medium ${pnlColor(t.grossPnl)}`}>{fmtP(t.grossPnl)}</td>
                          <td className="py-2 pr-3 text-right text-orange-500">{fmtP(t.commission)}</td>
                          <td className={`py-2 pr-3 text-right font-bold ${pnlColor(t.netPnl)}`}>{fmtP(t.netPnl)}</td>
                          <td className={`py-2 pr-3 text-right font-bold ${(() => { const cum = report.trades.slice(i).reduce((s, x) => s + x.netPnl, 0); return cum >= 0 ? "text-green-600" : "text-red-600"; })()}`}>
                            {fmtP(report.trades.slice(i).reduce((s, x) => s + x.netPnl, 0))}
                          </td>
                          <td className="py-2 text-center">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${t.status === "win" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"}`}>
                              {t.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
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
