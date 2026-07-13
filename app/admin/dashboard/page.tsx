"use client";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

interface SymbolStats {
  activeBots: number; inactiveBots: number;
  activeBotsAllocInr: number; inactiveBotsAllocInr: number;
  totalRealizedPnl: number; totalNetPnl: number;
  monthlyRealizedPnl: number; monthlyNetPnl: number;
  totalDeltaCharge: number; monthlyDeltaCharge: number;
  equityCurve: { date: string; cumPnl: number }[];
  updatedAt: string;
}

function pnlColor(n: number) {
  return n >= 0 ? "text-green-600" : "text-red-600";
}
function minutesAgo(iso: string) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins === 1) return "1 minute ago";
  return `${mins} minutes ago`;
}

export default function AdminDashboard() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [symbols, setSymbols] = useState<string[]>([]);
  const [bySymbol, setBySymbol] = useState<Record<string, SymbolStats>>({});
  const [selected, setSelected] = useState("ALL");
  const [statsPending, setStatsPending] = useState(false);
  const [currency, setCurrency] = useState<"USD" | "INR">("INR");
  const INR_PER_USD = 85;

  // usd-native values (PnL figures) — show as-is in USD mode, converted in INR mode
  function fmtUsd(n: number) {
    if (currency === "USD") {
      const sign = n >= 0 ? "" : "-";
      return `${sign}$${Math.abs(n).toFixed(2)}`;
    }
    const sign = n >= 0 ? "" : "-";
    return `${sign}₹${Math.abs(n * INR_PER_USD).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
  }
  // inr-native values (bot capital allocation) — show as-is in INR mode, converted in USD mode
  function fmtInr(n: number) {
    return currency === "INR"
      ? `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`
      : `$${(n / INR_PER_USD).toFixed(2)}`;
  }
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  useEffect(() => {
    if (status === "unauthenticated") router.push("/Signup");
    if (status === "authenticated" && session.user.role !== "admin") router.push("/user/dashboard");
  }, [status, session, router]);

  useEffect(() => {
    fetch("/api/v1/admin/dashboard-stats")
      .then(r => r.json())
      .then(d => {
        if (d.pending) { setStatsPending(true); return; }
        setSymbols(d.symbols ?? []);
        setBySymbol(d.bySymbol ?? {});
      })
      .catch(() => setStatsPending(true));
  }, []);

  const p = bySymbol[selected];
  const statCards = p ? [
    { label: "Active Bots", value: String(p.activeBots), sub: fmtInr(p.activeBotsAllocInr), subColor: "text-green-600" },
    { label: "Inactive Bots", value: String(p.inactiveBots), sub: fmtInr(p.inactiveBotsAllocInr), subColor: "text-red-500" },
    { label: "Total Realized PnL", value: fmtUsd(p.totalRealizedPnl), color: pnlColor(p.totalRealizedPnl), sub: "Gross PnL from all closed trades" },
    { label: "Total Net PnL", value: fmtUsd(p.totalNetPnl), color: pnlColor(p.totalNetPnl), sub: "After commissions/fees" },
    { label: "Total Delta Charge", value: fmtUsd(p.totalDeltaCharge), sub: "All-time collected commission by Delta" },
    { label: "Monthly Delta Charge", value: fmtUsd(p.monthlyDeltaCharge), sub: "Commission earned this month by Delta" },
    { label: "Monthly Gross PnL", value: fmtUsd(p.monthlyRealizedPnl), color: pnlColor(p.monthlyRealizedPnl), sub: "PnL realized this month before fees" },
    { label: "Monthly Net PnL", value: fmtUsd(p.monthlyNetPnl), color: pnlColor(p.monthlyNetPnl), sub: "Net profit/loss this month" },
  ] : [];

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-5 sm:space-y-6">
        <div className="bg-white rounded-2xl p-5 sm:p-6 shadow-sm border flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-[#161B22]">Admin Dashboard</h1>
            <p className="text-gray-500 text-sm mt-1">AlgoMomentum Bridge v2 — Platform Overview</p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex bg-white border rounded-lg overflow-hidden text-sm">
              <button onClick={() => setCurrency("USD")} className={`px-3 py-1.5 font-medium transition ${currency === "USD" ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted"}`}>USD</button>
              <button onClick={() => setCurrency("INR")} className={`px-3 py-1.5 font-medium transition ${currency === "INR" ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted"}`}>INR</button>
            </div>
            {symbols.length > 0 && (
              <select value={selected} onChange={e => setSelected(e.target.value)}
                className="border rounded-lg px-3 py-2 text-sm bg-white">
              <option value="ALL">All Strategies</option>
              {symbols.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          )}
          </div>
        </div>

        {/* Platform-wide stats (cached, refreshed every 15 min) */}
        {statsPending ? (
          <div className="bg-white rounded-2xl p-6 shadow-sm border text-center text-sm text-gray-400">
            Platform stats haven't been computed yet — first refresh runs shortly after server start, check back in a minute.
          </div>
        ) : p ? (
          <>
            <div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {statCards.map(s => (
                  <div key={s.label} className="bg-white rounded-xl p-4 shadow-sm border">
                    <p className="text-[11px] sm:text-xs text-gray-400 uppercase font-medium">{s.label}</p>
                    <p className={`text-lg sm:text-xl font-bold mt-1 ${s.color ?? "text-gray-800"}`}>{s.value}</p>
                    <p className={`text-[11px] mt-1 ${s.subColor ?? "text-gray-400"}`}>{s.sub}</p>
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-400 text-right mt-2">Updated {minutesAgo(p.updatedAt)}</p>
            </div>

            {p.equityCurve.length > 1 && (() => {
              const firstTradeDate = (p.equityCurve[0]?.date ?? "").slice(0, 10);
              const effectiveFrom = dateFrom || firstTradeDate;
              const filteredCurve = p.equityCurve.filter(d =>
                (!effectiveFrom || d.date >= effectiveFrom) && (!dateTo || d.date <= dateTo)
              );
              if (filteredCurve.length < 2) {
                return (
                  <div className="bg-white rounded-2xl p-4 sm:p-5 shadow-sm border">
                    <p className="font-semibold text-gray-700 mb-3 text-sm sm:text-base">
                      Equity Curve — {selected === "ALL" ? "All Strategies" : selected}
                    </p>
                    <p className="text-sm text-gray-400 text-center py-8">No data in this date range.</p>
                  </div>
                );
              }
              const values = filteredCurve.map(d => d.cumPnl);
              const dataMax = Math.max(...values);
              const dataMin = Math.min(...values);
              const gradientOffset = dataMax <= 0 ? 0 : dataMin >= 0 ? 1 : dataMax / (dataMax - dataMin);
              return (
                <div className="bg-white rounded-2xl p-4 sm:p-5 shadow-sm border">
                  <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                    <p className="font-semibold text-gray-700 text-sm sm:text-base">
                      Equity Curve — {selected === "ALL" ? "All Strategies" : selected}
                    </p>
                    <div className="flex items-center gap-2 text-xs">
                      <label className="text-gray-500">From</label>
                      <input type="date" value={effectiveFrom} min={firstTradeDate} onChange={e => setDateFrom(e.target.value)}
                        className="border rounded-lg px-2 py-1 bg-white text-gray-700" />
                      <label className="text-gray-500">To</label>
                      <input type="date" value={dateTo} min={firstTradeDate} onChange={e => setDateTo(e.target.value)}
                        className="border rounded-lg px-2 py-1 bg-white text-gray-700" />
                      {(dateFrom || dateTo) && (
                        <button onClick={() => { setDateFrom(""); setDateTo(""); }} className="text-blue-600 hover:underline">Reset</button>
                      )}
                    </div>
                  </div>
                  <ResponsiveContainer width="100%" height={220}>
                    <AreaChart data={filteredCurve}>
                      <defs>
                        <linearGradient id="platformEquityFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset={gradientOffset} stopColor="#3b82f6" stopOpacity={0.4} />
                          <stop offset={gradientOffset} stopColor="#ef4444" stopOpacity={0.4} />
                        </linearGradient>
                        <linearGradient id="platformEquityStroke" x1="0" y1="0" x2="0" y2="1">
                          <stop offset={gradientOffset} stopColor="#3b82f6" />
                          <stop offset={gradientOffset} stopColor="#ef4444" />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} minTickGap={30} />
                      <YAxis tick={{ fontSize: 10 }} width={50} />
                      <Tooltip
                        formatter={(v: any) => [fmtUsd(Number(v)), "Cumulative PnL"]}
                        contentStyle={{ backgroundColor: "var(--background)", color: "var(--foreground)", border: "1px solid var(--border)", borderRadius: 8 }}
                        labelStyle={{ color: "var(--foreground)" }}
                        itemStyle={{ color: "var(--foreground)" }}
                      />
                      <Area type="monotone" dataKey="cumPnl" stroke="url(#platformEquityStroke)" strokeWidth={2} fill="url(#platformEquityFill)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              );
            })()}
          </>
        ) : (
          <div className="bg-white rounded-2xl p-6 shadow-sm border text-center text-sm text-gray-400">Loading platform stats…</div>
        )}
      </div>
    </div>
  );
}
