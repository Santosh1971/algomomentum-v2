"use client";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import { toast } from "sonner";

interface Position {
  symbol: string; side: string; size: number; entryPrice: number;
  markPrice: number; upnlUSD: number; leverage: number; liquidationPrice: number;
}
interface AccountData {
  accountId: string; accountName: string; accountType: string;
  userName: string; userEmail: string;
  positions: Position[]; totalUpnlUSD: number;
  balance?: { availableUSD: number; totalUSD: number };
  error?: string;
}

const INR = 85;

export default function AdminPositionsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [data, setData] = useState<AccountData[]>([]);
  const [loading, setLoading] = useState(true);
  const [currency, setCurrency] = useState<"USD" | "INR">("INR");

  useEffect(() => {
    if (status === "unauthenticated") router.push("/Signup");
    if (status === "authenticated" && session?.user?.role !== "admin") router.push("/user/dashboard");
  }, [status, session, router]);

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    const res = await fetch("/api/v1/admin/positions");
    const d = await res.json();
    setData(Array.isArray(d) ? d : []);
    setLoading(false);
  }

  const fmt = (usd: number) => currency === "USD"
    ? `$${usd.toFixed(2)}`
    : `₹${(usd * INR).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

  const totalUpnl = data.reduce((s, a) => s + a.totalUpnlUSD, 0);

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[#161B22]">All Positions</h1>
            <p className="text-sm text-gray-500 mt-1">Live positions across all user accounts</p>
          </div>
          <div className="flex items-center gap-3">
            <div className={`text-lg font-bold ${totalUpnl >= 0 ? "text-green-600" : "text-red-600"}`}>
              Total UPNL: {fmt(totalUpnl)}
            </div>
            <div className="flex bg-background border border-border rounded-lg overflow-hidden text-sm">
              {(["USD", "INR"] as const).map(c => (
                <button key={c} onClick={() => setCurrency(c)}
                  className={`px-3 py-1.5 font-medium transition ${currency === c ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted"}`}>{c}</button>
              ))}
            </div>
            <button onClick={loadAll} className="text-xs px-3 py-1.5 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200">↻ Refresh</button>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-4 border-[#161B22] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : data.length === 0 ? (
          <div className="bg-white rounded-2xl p-12 text-center shadow-sm border">
            <p className="text-3xl mb-3">📊</p>
            <p className="text-gray-600 font-medium">No accounts connected yet</p>
          </div>
        ) : (
          <div className="space-y-4">
            {data.map(a => (
              <div key={a.accountId} className="bg-white rounded-2xl shadow-sm border overflow-hidden">
                <div className="px-5 py-3 bg-gray-50 border-b flex items-center justify-between">
                  <div>
                    <span className="font-semibold text-gray-800">{a.userName || a.userEmail}</span>
                    <span className="text-xs text-gray-400 mx-2">·</span>
                    <span className="text-sm text-gray-600">{a.accountName}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 ml-2">{a.accountType}</span>
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    {a.balance && (
                      <span className="text-gray-500">Balance: <span className="font-medium text-gray-700">{fmt(a.balance.totalUSD)}</span>
                      <span className="text-gray-400 mx-1">·</span>Available: <span className="font-medium text-green-600">{fmt(a.balance.availableUSD)}</span></span>
                    )}
                    {a.totalUpnlUSD !== 0 && (
                      <span className={`font-bold ${a.totalUpnlUSD >= 0 ? "text-green-600" : "text-red-600"}`}>
                        UPNL: {fmt(a.totalUpnlUSD)}
                      </span>
                    )}
                  </div>
                </div>
                {a.error ? (
                  <div className="px-5 py-3 text-sm text-red-500">{a.error}</div>
                ) : a.positions.length === 0 ? (
                  <div className="px-5 py-3 text-sm text-gray-400">No open positions</div>
                ) : (
                  <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-gray-400 uppercase border-b bg-gray-50">
                        <th className="text-left px-5 py-2">Symbol</th>
                        <th className="text-center px-3 py-2">Side</th>
                        <th className="text-right px-3 py-2">Size</th>
                        <th className="text-right px-3 py-2">Entry</th>
                        <th className="text-right px-3 py-2">Mark</th>
                        <th className="text-right px-3 py-2">Liq.</th>
                        <th className="text-right px-3 py-2">Lev</th>
                        <th className="text-right px-5 py-2">UPNL</th>
                      </tr>
                    </thead>
                    <tbody>
                      {a.positions.map((p, i) => (
                        <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                          <td className="px-5 py-2.5 font-bold text-gray-800">{p.symbol}</td>
                          <td className="px-3 py-2.5 text-center">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${p.side === "buy" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"}`}>{p.side}</span>
                          </td>
                          <td className="px-3 py-2.5 text-right text-gray-600">{p.size}</td>
                          <td className="px-3 py-2.5 text-right font-mono text-gray-700">{p.entryPrice}</td>
                          <td className="px-3 py-2.5 text-right font-mono text-gray-700">{p.markPrice}</td>
                          <td className="px-3 py-2.5 text-right font-mono text-orange-500">{p.liquidationPrice}</td>
                          <td className="px-3 py-2.5 text-right text-gray-500">{p.leverage}x</td>
                          <td className={`px-5 py-2.5 text-right font-bold ${p.upnlUSD >= 0 ? "text-green-600" : "text-red-600"}`}>{fmt(p.upnlUSD)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
