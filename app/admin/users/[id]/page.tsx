"use client";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useParams } from "next/navigation";
import Navbar from "@/components/Navbar";
import { toast } from "sonner";
import Link from "next/link";

const INR_PER_USD = 85;

interface TradeConfig {
  id: string; script: string; amount: number; initial_amount: number | null;
  isActive: boolean; userActive: boolean; mode: string; strategy: string | null;
  leverage: number; compoundMode: string; platformFeePercent: number;
  webhookToken: string; createdAt: string;
}
interface DeltaAccount {
  id: string; accountName: string; accountType: string;
  delta_account_name: string | null; isActive: boolean;
  tradeConfigs: TradeConfig[];
}
interface UserDetail {
  id: string; email: string; name: string | null;
  role: string; isVerified: boolean; phone: string;
  deltaAccounts: DeltaAccount[];
}

export default function AdminUserDetailPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const params = useParams();
  const userId = params.id as string;

  const [user, setUser] = useState<UserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [currency, setCurrency] = useState<"USD" | "INR">("INR");

  useEffect(() => {
    if (status === "unauthenticated") router.push("/Signup");
    if (status === "authenticated" && session.user.role !== "admin") router.push("/user/dashboard");
  }, [status, session, router]);

  async function load() {
    const res = await fetch(`/api/v1/admin/users/${userId}`);
    if (res.ok) { const d = await res.json(); setUser(d); }
    setLoading(false);
  }

  useEffect(() => { if (userId) load(); }, [userId]);

  const fmt = (inr: number) =>
    currency === "INR"
      ? `₹${inr.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`
      : `$${(inr / INR_PER_USD).toFixed(2)}`;

  async function toggleActive(tcId: string, field: "isActive" | "userActive", value: boolean) {
    const res = await fetch("/api/v1/tradeconfig", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: tcId, [field]: value }),
    });
    if (res.ok) { toast.success(value ? "Activated" : "Deactivated"); load(); }
    else toast.error("Failed to update");
  }

  async function deleteConfig(tcId: string, script: string) {
    if (!confirm(`Delete ${script} bot? This cannot be undone.`)) return;
    const res = await fetch("/api/v1/tradeconfig", {
      method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: tcId }),
    });
    if (res.ok) { toast.success(`${script} deleted`); load(); }
    else toast.error("Failed to delete");
  }

  async function updateAmount(tcId: string, current: number) {
    const input = prompt(`New amount (₹) for this bot:`, String(current));
    if (!input || isNaN(parseFloat(input))) return;
    const res = await fetch("/api/v1/tradeconfig", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: tcId, amount: parseFloat(input) }),
    });
    if (res.ok) { toast.success("Amount updated"); load(); }
    else toast.error("Failed to update");
  }

  const totalConfigs = user?.deltaAccounts.flatMap(a => a.tradeConfigs) ?? [];
  const activeConfigs = totalConfigs.filter(c => c.isActive && c.userActive);
  const totalAllocated = totalConfigs.reduce((s, c) => s + c.amount, 0);

  if (loading) return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="flex justify-center py-20">
        <div className="w-8 h-8 border-4 border-[#1E3A5F] border-t-transparent rounded-full animate-spin" />
      </div>
    </div>
  );

  if (!user) return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-4xl mx-auto p-6">
        <p className="text-gray-500">User not found.</p>
        <Link href="/admin/users" className="text-blue-600 hover:underline text-sm mt-2 block">← Back to Users</Link>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-5xl mx-auto p-6 space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/admin/users"
              className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1">
              ← Users
            </Link>
            <div>
              <h1 className="text-xl font-bold text-[#1E3A5F]">{user.name ?? user.email}</h1>
              <p className="text-sm text-gray-500">{user.email} · {user.phone}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex bg-white border rounded-lg overflow-hidden text-sm">
              {(["INR", "USD"] as const).map(c => (
                <button key={c} onClick={() => setCurrency(c)}
                  className={`px-3 py-1.5 font-medium transition ${currency === c ? "bg-[#1E3A5F] text-white" : "text-gray-600 hover:bg-gray-50"}`}>
                  {c}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white rounded-xl p-4 shadow-sm border">
            <p className="text-xs text-gray-400 uppercase font-medium">Total Bots</p>
            <p className="text-2xl font-bold text-gray-800 mt-1">{totalConfigs.length}</p>
            <p className="text-xs text-green-600 mt-0.5">{activeConfigs.length} active</p>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm border">
            <p className="text-xs text-gray-400 uppercase font-medium">Total Allocated</p>
            <p className="text-2xl font-bold text-gray-800 mt-1">{fmt(totalAllocated)}</p>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm border">
            <p className="text-xs text-gray-400 uppercase font-medium">Accounts</p>
            <p className="text-2xl font-bold text-gray-800 mt-1">{user.deltaAccounts.length}</p>
            <p className="text-xs text-gray-400 mt-0.5">
              {user.deltaAccounts.map(a => a.accountName).join(", ")}
            </p>
          </div>
        </div>

        {/* Accounts + Bots */}
        {user.deltaAccounts.length === 0 ? (
          <div className="bg-white rounded-2xl p-10 text-center shadow-sm border">
            <p className="text-gray-400">No accounts or bots configured yet.</p>
          </div>
        ) : (
          <div className="space-y-5">
            {user.deltaAccounts.map(account => (
              <div key={account.id} className="bg-white rounded-2xl shadow-sm border overflow-hidden">

                {/* Account header */}
                <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-800">{account.accountName}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-200 text-gray-500">{account.accountType}</span>
                    {account.delta_account_name
                      ? <span className="text-xs text-green-600 font-medium">✓ {account.delta_account_name}</span>
                      : <span className="text-xs text-orange-500">⚠️ Not connected</span>
                    }
                  </div>
                  <span className="text-xs text-gray-400">{account.tradeConfigs.length} bots</span>
                </div>

                {/* Bots table */}
                {account.tradeConfigs.length === 0 ? (
                  <div className="px-5 py-4 text-sm text-gray-400">No bots in this account.</div>
                ) : (
                  <div>
                    <div className="grid grid-cols-12 gap-2 px-5 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wide border-b border-gray-50">
                      <div className="col-span-2">Symbol</div>
                      <div className="col-span-2">Amount</div>
                      <div className="col-span-1">Lev</div>
                      <div className="col-span-2">Mode</div>
                      <div className="col-span-2">Status</div>
                      <div className="col-span-3 text-right">Actions</div>
                    </div>
                    {account.tradeConfigs.map(tc => {
                      const isOn = tc.isActive && tc.userActive;
                      return (
                        <div key={tc.id} className="grid grid-cols-12 gap-2 px-5 py-3 items-center border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
                          <div className="col-span-2 font-bold text-gray-800">{tc.script}</div>
                          <div className="col-span-2 text-sm">
                            <div>{fmt(tc.amount)}</div>
                            {tc.initial_amount && tc.initial_amount !== tc.amount && (
                              <div className="text-xs text-gray-400">init: {fmt(tc.initial_amount)}</div>
                            )}
                          </div>
                          <div className="col-span-1 text-sm">{tc.leverage}x</div>
                          <div className="col-span-2">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${tc.mode === "standalone" ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"}`}>
                              {tc.mode === "standalone" ? `⚡ ${tc.strategy ?? "standalone"}` : "🔗 bridge"}
                            </span>
                          </div>
                          <div className="col-span-2 flex items-center gap-1.5">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${tc.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-400"}`}>
                              {tc.isActive ? "Active" : "Inactive"}
                            </span>
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${isOn ? "bg-blue-100 text-blue-700" : "bg-yellow-100 text-yellow-600"}`}>
                              {isOn ? "Running" : tc.userActive ? "Paused(admin)" : "Paused"}
                            </span>
                          </div>
                          <div className="col-span-3 flex items-center justify-end gap-1">
                            {/* Admin toggle isActive */}
                            <button onClick={() => toggleActive(tc.id, "isActive", !tc.isActive)}
                              className={`text-xs px-2 py-1 rounded font-medium transition ${tc.isActive ? "bg-red-50 text-red-600 hover:bg-red-100" : "bg-green-50 text-green-600 hover:bg-green-100"}`}>
                              {tc.isActive ? "Deactivate" : "Activate"}
                            </button>
                            {/* Edit amount */}
                            <button onClick={() => updateAmount(tc.id, tc.amount)}
                              className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-600 hover:bg-gray-200 font-medium">
                              ✎ Edit
                            </button>
                            {/* View trades */}
                            <Link href={`/admin/position/${tc.id}?userId=${userId}`}
                              className="text-xs px-2 py-1 rounded bg-blue-50 text-blue-600 hover:bg-blue-100 font-medium">
                              Trades
                            </Link>
                            {/* Delete */}
                            <button onClick={() => deleteConfig(tc.id, tc.script)}
                              className="text-xs px-2 py-1 rounded bg-red-50 text-red-500 hover:bg-red-100">
                              ✕
                            </button>
                          </div>
                        </div>
                      );
                    })}
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
