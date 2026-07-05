"use client";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Navbar from "@/components/Navbar";
import Link from "next/link";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

interface DashboardStats {
  totalGrossPnl: number; totalNetPnl: number;
  monthlyGrossPnl: number; monthlyNetPnl: number;
  totalTrades: number; winRate: number;
  avgProfitLoss: number; avgTradeSize: number;
  equityCurve: { date: string; cumPnl: number }[];
}

function fmtP(n: number) {
  const sign = n >= 0 ? "+" : "";
  return `${sign}$${n.toFixed(2)}`;
}
function pnlColor(n: number) {
  return n >= 0 ? "text-green-600" : "text-red-600";
}

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);

  useEffect(() => { if (status === "unauthenticated") router.push("/Signup"); }, [status, router]);

  useEffect(() => {
    if (status !== "authenticated") return;
    setLoadingStats(true);
    fetch("/api/v1/user/dashboard-stats")
      .then(r => r.json())
      .then(d => setStats(d))
      .catch(() => setStats(null))
      .finally(() => setLoadingStats(false));
  }, [status]);

  if (status === "loading") return null;
  const isAdmin = session?.user?.role === "admin";

  const statCards = stats ? [
    { label: "Total Realized PnL", value: fmtP(stats.totalGrossPnl), color: pnlColor(stats.totalGrossPnl) },
    { label: "Total Net PnL", value: fmtP(stats.totalNetPnl), color: pnlColor(stats.totalNetPnl) },
    { label: "Monthly Realized PnL", value: fmtP(stats.monthlyGrossPnl), color: pnlColor(stats.monthlyGrossPnl) },
    { label: "Monthly Net PnL", value: fmtP(stats.monthlyNetPnl), color: pnlColor(stats.monthlyNetPnl) },
    { label: "Total Trades", value: String(stats.totalTrades), color: "text-gray-800" },
    { label: "Win Rate", value: `${stats.winRate}%`, color: stats.winRate >= 50 ? "text-green-600" : "text-red-600" },
    { label: "Avg Profit/Loss", value: fmtP(stats.avgProfitLoss), color: pnlColor(stats.avgProfitLoss) },
    { label: "Avg Trade Size", value: `$${stats.avgTradeSize.toFixed(2)}`, color: "text-gray-800" },
  ] : [];

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-5 sm:space-y-6">
        <div className="bg-white rounded-2xl p-5 sm:p-6 shadow-sm border">
          <h1 className="text-xl sm:text-2xl font-bold text-[#161B22]">Welcome back, {session?.user?.name || session?.user?.email} 👋</h1>
          <p className="text-gray-500 mt-1 text-sm">{isAdmin ? "Viewing as User — click Admin Panel to switch back" : "User Dashboard"}</p>
        </div>

        {/* PnL stats */}
        {loadingStats ? (
          <div className="bg-white rounded-2xl p-6 shadow-sm border text-center text-sm text-gray-400">Loading your stats…</div>
        ) : stats && stats.totalTrades > 0 ? (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {statCards.map(s => (
                <div key={s.label} className="bg-white rounded-xl p-4 shadow-sm border text-center">
                  <p className="text-[11px] sm:text-xs text-gray-400 uppercase font-medium">{s.label}</p>
                  <p className={`text-base sm:text-lg font-bold mt-1 ${s.color}`}>{s.value}</p>
                </div>
              ))}
            </div>

            {/* Equity curve */}
            {stats.equityCurve.length > 1 && (
              <div className="bg-white rounded-2xl p-4 sm:p-5 shadow-sm border">
                <p className="font-semibold text-gray-700 mb-3 text-sm sm:text-base">Equity Curve — Cumulative PnL</p>
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={stats.equityCurve}>
                    <defs>
                      <linearGradient id="equityFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#22c55e" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} minTickGap={30} />
                    <YAxis tick={{ fontSize: 10 }} width={50} />
                    <Tooltip formatter={(v: any) => [`$${Number(v).toFixed(2)}`, "Cumulative PnL"]} />
                    <Area type="monotone" dataKey="cumPnl" stroke="#22c55e" strokeWidth={2} fill="url(#equityFill)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </>
        ) : (
          <div className="bg-white rounded-2xl p-6 shadow-sm border text-center text-sm text-gray-400">
            No closed trades yet — stats and your equity curve will appear here once your bots have some trading history.
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          <Link href="/user/tradeconfig" className="bg-white rounded-2xl p-5 shadow-sm border hover:shadow-md transition block">
            <div className="text-3xl mb-3">🔗</div>
            <h2 className="font-semibold text-gray-800">Trading Accounts</h2>
            <p className="text-sm text-gray-500 mt-1">Connect Delta accounts & manage bot configs</p>
          </Link>
          <Link href="/user/pnl-report" className="bg-white rounded-2xl p-5 shadow-sm border hover:shadow-md transition block" style={{borderColor:"#e8f5e9"}}>
            <div className="text-3xl mb-3">📊</div>
            <h2 className="font-semibold text-gray-800">PnL Report</h2>
            <p className="text-sm text-gray-500 mt-1">View live PnL from Delta fills</p>
          </Link>
          <Link href="/marketplace" className="bg-white rounded-2xl p-5 shadow-sm border hover:shadow-md transition block" style={{borderColor:"#e0f7fa"}}>
            <div className="text-3xl mb-3">🏪</div>
            <h2 className="font-semibold text-gray-800">Marketplace</h2>
            <p className="text-sm text-gray-500 mt-1">Browse and subscribe to strategies</p>
          </Link>
          <Link href="/user/payments" className="bg-white rounded-2xl p-5 shadow-sm border hover:shadow-md transition block" style={{borderColor:"#f3e5f5"}}>
            <div className="text-3xl mb-3">💳</div>
            <h2 className="font-semibold text-gray-800">Payments</h2>
            <p className="text-sm text-gray-500 mt-1">View invoices and billing history</p>
          </Link>
        </div>
      </div>
    </div>
  );
}
