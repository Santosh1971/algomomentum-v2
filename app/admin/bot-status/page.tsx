"use client";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import Link from "next/link";

interface BotConfig {
  id: string;
  script: string;
  amount: number;
  isActive: boolean;
  userActive: boolean;
  leverage: number;
  mode: string;
  webhookToken: string;
  account: { accountName: string; delta_account_name: string | null };
  user: { id: string; name: string | null; email: string };
}

export default function BotStatusPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [bots, setBots] = useState<BotConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "active" | "inactive">("all");
  const [symbolFilter, setSymbolFilter] = useState<string>("all");

  useEffect(() => {
    if (status === "unauthenticated") router.push("/Signup");
    if (status === "authenticated" && session.user.role !== "admin") router.push("/user/dashboard");
  }, [status, session, router]);

  useEffect(() => {
    fetch("/api/v1/admin/bot-status")
      .then(r => r.json())
      .then(d => { setBots(d); setLoading(false); });
  }, []);

  const uniqueSymbols = Array.from(new Set(bots.map(b => b.script))).sort();

  const filtered = bots.filter(b => {
    if (symbolFilter !== "all" && b.script !== symbolFilter) return false;
    if (filter === "active") return b.isActive && b.userActive;
    if (filter === "inactive") return !b.isActive || !b.userActive;
    return true;
  });

  const activeCount = bots.filter(b => b.isActive && b.userActive).length;

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-6xl mx-auto p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[#161B22]">Bot Status</h1>
            <p className="text-sm text-gray-500 mt-1">
              {activeCount} active · {bots.length - activeCount} inactive · {bots.length} total
            </p>
          </div>
          <div className="flex items-center gap-3">
            <select value={symbolFilter} onChange={e => setSymbolFilter(e.target.value)}
              className="text-sm border border-border/40 rounded-lg px-3 py-1.5 bg-card text-foreground">
              <option value="all">All Symbols</option>
              {uniqueSymbols.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <div className="flex bg-muted/30 border border-border/40 rounded-lg overflow-hidden text-sm">
              {(["all", "active", "inactive"] as const).map(f => (
                <button key={f} onClick={() => setFilter(f)}
                  className={`px-3 py-1.5 font-medium capitalize transition ${filter === f ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted/50"}`}>
                  {f}
                </button>
              ))}
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-4 border-[#161B22] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-foreground text-background text-xs">
                  {["User", "Account", "Symbol", "Amount", "Lev", "Mode", "Status", "Actions"].map(h => (
                    <th key={h} className="px-4 py-3 text-left font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={8} className="px-5 py-10 text-center text-gray-400">No bots found</td></tr>
                ) : (
                  filtered.map((b, i) => {
                    const isOn = b.isActive && b.userActive;
                    return (
                      <tr key={b.id} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                        <td className="px-4 py-3">
                          <Link href={`/admin/users/${b.user.id}`}
                            className="text-blue-600 hover:underline font-medium text-xs">
                            {b.user.name ?? b.user.email}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500">
                          {b.account.accountName}
                          {b.account.delta_account_name && (
                            <div className="text-green-600">✓ {b.account.delta_account_name}</div>
                          )}
                        </td>
                        <td className="px-4 py-3 font-bold text-gray-800">{b.script}</td>
                        <td className="px-4 py-3 text-xs">₹{b.amount.toLocaleString("en-IN")}</td>
                        <td className="px-4 py-3 text-xs">{b.leverage}x</td>
                        <td className="px-4 py-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${b.mode === "standalone" ? "bg-purple-500/20 text-purple-600" : "bg-blue-500/20 text-blue-600"}`}>
                            {b.mode}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${b.isActive ? "bg-green-500/20 text-green-600" : "bg-gray-500/20 text-muted-foreground"}`}>
                              {b.isActive ? "Active" : "Inactive"}
                            </span>
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${b.userActive ? "bg-blue-500/20 text-blue-600" : "bg-yellow-500/20 text-yellow-600"}`}>
                              {b.userActive ? "On" : "Paused"}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <Link href={`/admin/users/${b.user.id}`}
                            className="text-xs bg-foreground text-background px-3 py-1.5 rounded-lg hover:opacity-80 transition-opacity">
                            Manage
                          </Link>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
