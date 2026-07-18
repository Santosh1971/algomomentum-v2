"use client";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, Suspense } from "react";
import Navbar from "@/components/Navbar";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

interface SymbolStats {
  totalRealizedPnl: number; totalNetPnl: number;
  monthlyRealizedPnl: number; monthlyNetPnl: number;
  totalTrades: number; winRate: number;
  avgProfitLoss: number; avgTradeSize: number;
  equityCurve: { date: string; cumPnl: number }[];
  updatedAt: string;
}

const INR_PER_USD = 85;

function pnlColor(n: number) {
  return n >= 0 ? "text-green-600" : "text-red-600";
}
function minutesAgo(iso: string) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins === 1) return "1 minute ago";
  return `${mins} minutes ago`;
}

function DashboardContent() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const viewUserId = searchParams.get("userId");
  const [symbols, setSymbols] = useState<string[]>([]);
  const [bySymbol, setBySymbol] = useState<Record<string, SymbolStats>>({});
  const [selected, setSelected] = useState("ALL");
  const [statsPending, setStatsPending] = useState(false);
  const [currency, setCurrency] = useState<"USD" | "INR">("INR");

  function fmtP(n: number) {
    const sign = n >= 0 ? "+" : "";
    return currency === "USD" ? `${sign}$${n.toFixed(2)}` : `${sign}₹${(n * INR_PER_USD).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
  }
  function fmt(n: number) {
    return currency === "USD" ? `$${n.toFixed(2)}` : `₹${(n * INR_PER_USD).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
  }

  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [viewUserName, setViewUserName] = useState<string | null>(null);

  useEffect(() => { if (status === "unauthenticated") router.push("/Signup"); }, [status, router]);

  useEffect(() => {
    if (status !== "authenticated" || !viewUserId) { setViewUserName(null); return; }
    fetch(`/api/v1/admin/users/${viewUserId}`)
      .then(r => r.json())
      .then(d => setViewUserName(d.name || d.email || null))
      .catch(() => setViewUserName(null));
  }, [status, viewUserId]);

  useEffect(() => {
    if (status !== "authenticated") return;
    const url = viewUserId ? `/api/v1/user/dashboard-stats?userId=${viewUserId}` : "/api/v1/user/dashboard-stats";
    fetch(url)
      .then(r => r.json())
      .then(d => {
        if (d.pending) { setStatsPending(true); return; }
        setSymbols(d.symbols ?? []);
        setBySymbol(d.bySymbol ?? {});
      })
      .catch(() => setStatsPending(true));
  }, [status, viewUserId]);

  if (status === "loading") return null;
  const isAdmin = session?.user?.role === "admin";
  const stats = bySymbol[selected];

  const statCards = stats ? [
    { label: "Total Realized PnL", value: `${fmtP(stats.totalRealizedPnl)}${stats.allocatedUsd > 0 ? ` (${(stats.totalRealizedPnl / stats.allocatedUsd * 100).toFixed(2)}%)` : ""}`, color: pnlColor(stats.totalRealizedPnl) },
    { label: "Total Net PnL", value: `${fmtP(stats.totalNetPnl)}${stats.allocatedUsd > 0 ? ` (${(stats.totalNetPnl / stats.allocatedUsd * 100).toFixed(2)}%)` : ""}`, color: pnlColor(stats.totalNetPnl) },
    { label: "Monthly Realized PnL", value: `${fmtP(stats.monthlyRealizedPnl)}${stats.allocatedUsd > 0 ? ` (${(stats.monthlyRealizedPnl / stats.allocatedUsd * 100).toFixed(2)}%)` : ""}`, color: pnlColor(stats.monthlyRealizedPnl) },
    { label: "Monthly Net PnL", value: `${fmtP(stats.monthlyNetPnl)}${stats.allocatedUsd > 0 ? ` (${(stats.monthlyNetPnl / stats.allocatedUsd * 100).toFixed(2)}%)` : ""}`, color: pnlColor(stats.monthlyNetPnl) },
    { label: "Total Trades", value: String(stats.totalTrades), color: "text-gray-800" },
    { label: "Win Rate", value: `${stats.winRate}%`, color: stats.winRate >= 50 ? "text-green-600" : "text-red-600" },
    { label: "Avg Profit/Loss", value: fmtP(stats.avgProfitLoss), color: pnlColor(stats.avgProfitLoss) },
    { label: "Avg Trade Size", value: fmt(stats.avgTradeSize), color: "text-gray-800" },
  ] : [];

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-5 sm:space-y-6">
        <div className="bg-white rounded-2xl p-5 sm:p-6 shadow-sm border flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-[#161B22]">{viewUserId ? `${viewUserName ?? "…"}'s Dashboard` : `Welcome back, ${session?.user?.name || session?.user?.email} 👋`}</h1>
            <p className="text-gray-500 mt-1 text-sm">{viewUserId ? "Viewing another user's dashboard (admin) — click Admin Panel to return" : isAdmin ? "Viewing as User — click Admin Panel to switch back" : "User Dashboard"}</p>
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

        {/* PnL stats */}
        {statsPending ? (
          <div className="bg-white rounded-2xl p-6 shadow-sm border text-center text-sm text-gray-400">
            Your stats haven't been computed yet — first refresh runs shortly after server start, check back in a minute.
          </div>
        ) : stats && stats.totalTrades > 0 ? (
          <>
            <div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {statCards.map(s => (
                  <div key={s.label} className="bg-white rounded-xl p-4 shadow-sm border text-center">
                    <p className="text-[11px] sm:text-xs text-gray-400 uppercase font-medium">{s.label}</p>
                    <p className={`text-base sm:text-lg font-bold mt-1 ${s.color}`}>{s.value}</p>
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-400 text-right mt-2">Updated {minutesAgo(stats.updatedAt)}</p>
            </div>

            {/* Equity curve */}
            {stats.equityCurve.length > 1 && (() => {
              const firstTradeDate = (stats.equityCurve[0]?.date ?? "").slice(0, 10);
              const effectiveFrom = dateFrom || firstTradeDate;
              const todayDate = new Date().toISOString().slice(0, 10);
              const effectiveTo = dateTo || todayDate;
              const filteredCurve = stats.equityCurve.filter(d =>
                (!effectiveFrom || d.date >= effectiveFrom) && (!effectiveTo || d.date <= effectiveTo)
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
                      <input type="date" value={effectiveTo} min={firstTradeDate} onChange={e => setDateTo(e.target.value)}
                        className="border rounded-lg px-2 py-1 bg-white text-gray-700" />
                      {(dateFrom || dateTo) && (
                        <button onClick={() => { setDateFrom(""); setDateTo(""); }} className="text-blue-600 hover:underline">Reset</button>
                      )}
                    </div>
                  </div>
                  <ResponsiveContainer width="100%" height={220}>
                    <AreaChart data={filteredCurve}>
                      <defs>
                        <linearGradient id="equityFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset={gradientOffset} stopColor="#22c55e" stopOpacity={0.4} />
                          <stop offset={gradientOffset} stopColor="#ef4444" stopOpacity={0.4} />
                        </linearGradient>
                        <linearGradient id="equityStroke" x1="0" y1="0" x2="0" y2="1">
                          <stop offset={gradientOffset} stopColor="#22c55e" />
                          <stop offset={gradientOffset} stopColor="#ef4444" />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} minTickGap={30} />
                      <YAxis tick={{ fontSize: 10 }} width={50} />
                      <Tooltip
                        formatter={(v: any) => [fmt(Number(v)), "Cumulative PnL"]}
                        contentStyle={{ backgroundColor: "var(--background)", color: "var(--foreground)", border: "1px solid var(--border)", borderRadius: 8 }}
                        labelStyle={{ color: "var(--foreground)" }}
                        itemStyle={{ color: "var(--foreground)" }}
                      />
                      <Area type="monotone" dataKey="cumPnl" stroke="url(#equityStroke)" strokeWidth={2} fill="url(#equityFill)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              );
            })()}
          </>
        ) : (
          <div className="bg-white rounded-2xl p-6 shadow-sm border text-center text-sm text-gray-400">
            No closed trades yet — stats and your equity curve will appear here once your bots have some trading history.
          </div>
        )}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50 flex items-center justify-center"><div className="w-8 h-8 border-4 border-[#161B22] border-t-transparent rounded-full animate-spin" /></div>}>
      <DashboardContent />
    </Suspense>
  );
}
