"use client";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useParams } from "next/navigation";
import Navbar from "@/components/Navbar";
import { toast } from "sonner";
import Link from "next/link";
import ConnectDeltaModal from "@/components/ConnectDeltaModal";

function waLink(phone: string) {
  const digits = phone.replace(/\D/g, "");
  const withCountryCode = digits.length === 10 ? `91${digits}` : digits;
  return `https://wa.me/${withCountryCode}`;
}

const INR_PER_USD = 85;

interface TradeConfig {
  id: string; script: string; amount: number; initial_amount: number | null; strategyRef?: { minCapital: number | null } | null;
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
  const [strategies, setStrategies] = useState<any[]>([]);
  const [addBotFor, setAddBotFor] = useState<string | null>(null); // accountId or null
  const [addBotStrategyId, setAddBotStrategyId] = useState("");
  const [addBotAmount, setAddBotAmount] = useState("");
  const [addBotSide, setAddBotSide] = useState<"buy" | "sell" | "">("");
  const [addBotSaving, setAddBotSaving] = useState(false);
  const [showAddAccount, setShowAddAccount] = useState(false);
  const [newAccountName, setNewAccountName] = useState("");
  const [newAccountType, setNewAccountType] = useState("main");
  const [addAccountSaving, setAddAccountSaving] = useState(false);
  const [connectingAccount, setConnectingAccount] = useState<{ id: string; type: string } | null>(null);

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

  useEffect(() => {
    fetch("/api/v1/admin/strategies")
      .then(r => r.json())
      .then(d => setStrategies(d.strategies ?? []));
  }, []);

  function openAddBot(accountId: string) {
    setAddBotFor(accountId);
    setAddBotStrategyId("");
    setAddBotAmount("");
    setAddBotSide("");
  }

  async function submitAddBot() {
    if (!addBotFor || !addBotStrategyId) return;
    setAddBotSaving(true);
    try {
      const res = await fetch("/api/v1/admin/create-bot", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId, accountId: addBotFor, strategyId: addBotStrategyId,
          amount: addBotAmount ? parseFloat(addBotAmount) : undefined,
          activate: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || "Failed to add bot"); setAddBotSaving(false); return; }
      toast.success("Bot added");

      if (addBotSide) {
        const fireRes = await fetch("/api/v1/admin/manual-signal", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ strategyId: addBotStrategyId, side: addBotSide, trade: "ENTRY", userId }),
        });
        const fireData = await fireRes.json();
        if (fireData.fired > 0) toast.success("Trade initiated");
        else toast.error(fireData.error || fireData.errors?.[0]?.error || "Bot added, but trade did not fire — check manually");
      }
      setAddBotFor(null);
      load();
    } catch (e: any) {
      toast.error(e.message || "Failed to add bot");
    }
    setAddBotSaving(false);
  }

  function openAddAccount() {
    setNewAccountName("");
    setNewAccountType("main");
    setShowAddAccount(true);
  }

  async function submitCreateAccountShell() {
    if (!newAccountName) return;
    setAddAccountSaving(true);
    try {
      const createRes = await fetch("/api/v1/admin/create-account", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, accountName: newAccountName, accountType: newAccountType }),
      });
      const createData = await createRes.json();
      if (!createRes.ok) { toast.error(createData.error || "Failed to create account"); setAddAccountSaving(false); return; }

      setShowAddAccount(false);
      setConnectingAccount({ id: createData.account.id, type: newAccountType });
    } catch (e: any) {
      toast.error(e.message || "Failed to add account");
    }
    setAddAccountSaving(false);
  }

  const fmt = (inr: number) =>
    currency === "INR"
      ? `₹${inr.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`
      : `$${(inr / INR_PER_USD).toFixed(2)}`;

  async function toggleActive(tcId: string, field: "isActive" | "userActive", value: boolean) {
    if (!window.confirm(`${value ? "Activate" : "Deactivate"} this bot?`)) return;
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

  async function updateAmount(tcId: string, current: number, minCapital?: number | null) {
    const minHint = minCapital ? ` (Min: ₹${minCapital.toLocaleString('en-IN')})` : '';
    const input = prompt(`New amount (₹) for this bot${minHint}:`, String(current));
    if (!input || isNaN(parseFloat(input))) return;
    const newAmount = parseFloat(input);
    if (minCapital && newAmount < minCapital) {
      toast.error(`Minimum capital for this strategy is ₹${minCapital.toLocaleString('en-IN')}`);
      return;
    }
    const res = await fetch("/api/v1/tradeconfig", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: tcId, amount: newAmount }),
    });
    if (res.ok) { toast.success("Amount updated"); load(); }
    else { const d = await res.json(); toast.error(d.error ?? "Failed to update"); }
  }

  const totalConfigs = user?.deltaAccounts.flatMap(a => a.tradeConfigs) ?? [];
  const activeConfigs = totalConfigs.filter(c => c.isActive && c.userActive);
  const totalAllocated = totalConfigs.reduce((s, c) => s + c.amount, 0);

  if (loading) return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="flex justify-center py-20">
        <div className="w-8 h-8 border-4 border-[#161B22] border-t-transparent rounded-full animate-spin" />
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
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link href="/admin/users"
              className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1">
              ← Users
            </Link>
            <div>
              <h1 className="text-xl font-bold text-[#161B22]">{user.name ?? user.email}</h1>
              <p className="text-sm text-gray-500 break-all">{user.email} · {user.phone && <a href={waLink(user.phone)} target="_blank" rel="noopener noreferrer" className="hover:underline text-green-600">{user.phone}</a>}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex bg-background border border-border rounded-lg overflow-hidden text-sm">
              {(["INR", "USD"] as const).map(c => (
                <button key={c} onClick={() => setCurrency(c)}
                  className={`px-3 py-1.5 font-medium transition ${currency === c ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted"}`}>
                  {c}
                </button>
              ))}
            </div>
            <button onClick={openAddAccount}
              className="text-sm px-3 py-1.5 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 font-medium">+ Add Account</button>
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
                <div className="px-5 py-4 border-b border-gray-100 flex flex-wrap items-center justify-between gap-2 bg-gray-50">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-800">{account.accountName}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-200 text-gray-500">{account.accountType}</span>
                    {account.delta_account_name
                      ? <span className="text-xs text-green-600 font-medium">✓ {account.delta_account_name}</span>
                      : <span className="text-xs text-orange-500">⚠️ Not connected</span>
                    }
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-400">{account.tradeConfigs.length} bots</span>
                    <button onClick={() => openAddBot(account.id)}
                      className="text-xs px-2 py-1 rounded bg-blue-50 text-blue-600 hover:bg-blue-100 font-medium">+ Add Bot</button>
                  </div>
                </div>

                {/* Bots table */}
                {account.tradeConfigs.length === 0 ? (
                  <div className="px-5 py-4 text-sm text-gray-400">No bots in this account.</div>
                ) : (
                  <div>
                    <div className="hidden sm:grid grid-cols-12 gap-2 px-5 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wide border-b border-gray-50">
                      <div className="col-span-2">Symbol</div>
                      <div className="col-span-2">Amount</div>
                      <div className="col-span-1">Lev</div>
                      <div className="col-span-2">Mode</div>
                      <div className="col-span-2">Status</div>
                      <div className="col-span-3 text-right">Actions</div>
                    </div>
                    {account.tradeConfigs.map(tc => {
                      const isOn = tc.isActive && tc.userActive;
                      const actionButtons = (
                        <>
                          <button onClick={() => toggleActive(tc.id, "isActive", !tc.isActive)}
                            disabled={!tc.isActive && !user.isApproved}
                            title={!tc.isActive && !user.isApproved ? "Approve user first before activating bots" : ""}
                            className={`text-xs px-2 py-1 rounded font-medium transition disabled:opacity-40 disabled:cursor-not-allowed ${tc.isActive ? "bg-red-50 text-red-600 hover:bg-red-100" : "bg-green-50 text-green-600 hover:bg-green-100"}`}>
                            {tc.isActive ? "Deactivate" : "Activate"}
                          </button>
                          <button onClick={() => updateAmount(tc.id, tc.amount, tc.strategyRef?.minCapital)}
                            className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-600 hover:bg-gray-200 font-medium">
                            ✎ Edit
                          </button>
                          <Link href={`/admin/pnl?configId=${tc.id}&userId=${userId}`}
                            className="text-xs px-2 py-1 rounded bg-blue-50 text-blue-600 hover:bg-blue-100 font-medium">
                            Trades
                          </Link>
                          <button onClick={() => deleteConfig(tc.id, tc.script)}
                            className="text-xs px-2 py-1 rounded bg-red-50 text-red-500 hover:bg-red-100">
                            ✕
                          </button>
                        </>
                      );
                      return (
                        <div key={tc.id}>
                          {/* Mobile stacked card */}
                          <div className="sm:hidden px-4 py-2.5 border-b border-gray-50 last:border-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-bold text-gray-800">{tc.script}</span>
                              <span className={`text-[11px] px-1.5 py-0.5 rounded-full font-medium ${tc.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-400"}`}>
                                {tc.isActive ? "Active" : "Inactive"}
                              </span>
                              <span className={`text-[11px] px-1.5 py-0.5 rounded-full font-medium ${isOn ? "bg-blue-100 text-blue-700" : "bg-yellow-100 text-yellow-600"}`}>
                                {isOn ? "Running" : tc.userActive ? "Paused(admin)" : "Paused"}
                              </span>
                              <span className={`text-[11px] px-1.5 py-0.5 rounded-full font-medium ${tc.mode === "standalone" ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"}`}>
                                {tc.mode === "standalone" ? `⚡ ${tc.strategy ?? "standalone"}` : "🔗 bridge"}
                              </span>
                            </div>
                            <div className="flex items-center gap-4 mt-1.5 text-sm">
                              <div>
                                <span className="text-[11px] text-gray-400">Amount: </span>
                                <span className="font-medium">{fmt(tc.amount)}</span>
                                {tc.initial_amount && tc.initial_amount !== tc.amount && (
                                  <span className="text-[11px] text-gray-400"> (init: {fmt(tc.initial_amount)})</span>
                                )}
                              </div>
                              <div>
                                <span className="text-[11px] text-gray-400">Lev: </span>
                                <span className="font-medium">{tc.leverage}x</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 mt-2.5 flex-wrap">{actionButtons}</div>
                          </div>

                          {/* Desktop table row */}
                          <div className="hidden sm:grid grid-cols-12 gap-2 px-5 py-3 items-center border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
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
                          <div className="col-span-3 flex items-center justify-end gap-1">{actionButtons}</div>
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

      {addBotFor && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md mx-4 shadow-2xl">
            <h2 className="text-lg font-bold text-gray-800 mb-4">Add Bot for {user?.name ?? user?.email}</h2>
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium text-gray-700">Strategy</label>
                <select value={addBotStrategyId} onChange={e => setAddBotStrategyId(e.target.value)}
                  className="mt-1 w-full border rounded-lg px-3 py-2 text-sm">
                  <option value="">Select a strategy…</option>
                  {strategies.map((s: any) => <option key={s.id} value={s.id}>{s.name} ({s.symbol})</option>)}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Allocated Amount (₹) — optional, defaults to the strategy minimum</label>
                <input type="number" value={addBotAmount} onChange={e => setAddBotAmount(e.target.value)}
                  placeholder="e.g. 2000" className="mt-1 w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Initiate a trade now?</label>
                <select value={addBotSide} onChange={e => setAddBotSide(e.target.value as any)}
                  className="mt-1 w-full border rounded-lg px-3 py-2 text-sm">
                  <option value="">No — just add the bot, wait for the next signal</option>
                  <option value="buy">Yes — enter LONG right now</option>
                  <option value="sell">Yes — enter SHORT right now</option>
                </select>
                <p className="text-xs text-gray-400 mt-1">This fires a real trade for this user only — not a test, and not sent to any other subscriber.</p>
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setAddBotFor(null)} className="flex-1 border rounded-lg py-2 text-sm text-gray-600">Cancel</button>
              <button onClick={submitAddBot} disabled={!addBotStrategyId || addBotSaving}
                className="flex-1 bg-[#161B22] text-white rounded-lg py-2 text-sm font-medium disabled:opacity-50">
                {addBotSaving ? "Saving…" : "Add Bot"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showAddAccount && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md mx-4 shadow-2xl">
            <h2 className="text-lg font-bold text-gray-800 mb-4">Add Delta Account for {user?.name ?? user?.email}</h2>
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium text-gray-700">Account Name</label>
                <input type="text" value={newAccountName} onChange={e => setNewAccountName(e.target.value)}
                  placeholder="e.g. Main Account" className="mt-1 w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Account Type</label>
                <select value={newAccountType} onChange={e => setNewAccountType(e.target.value)}
                  className="mt-1 w-full border rounded-lg px-3 py-2 text-sm">
                  <option value="main">Main</option>
                  <option value="sub1">Sub1</option>
                  <option value="sub2">Sub2</option>
                  <option value="sub3">Sub3</option>
                  <option value="sub4">Sub4</option>
                </select>
              </div>
              <p className="text-xs text-gray-400">Next, you'll enter this user's Delta API key and secret to connect it — same verification a user goes through themselves.</p>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowAddAccount(false)} className="flex-1 border rounded-lg py-2 text-sm text-gray-600">Cancel</button>
              <button onClick={submitCreateAccountShell} disabled={!newAccountName || addAccountSaving}
                className="flex-1 bg-[#161B22] text-white rounded-lg py-2 text-sm font-medium disabled:opacity-50">
                {addAccountSaving ? "Creating…" : "Continue"}
              </button>
            </div>
          </div>
        </div>
      )}

      {connectingAccount && (
        <ConnectDeltaModal
          accountId={connectingAccount.id}
          accountType={connectingAccount.type}
          isAdmin
          onSuccess={() => { toast.success("Account connected"); setConnectingAccount(null); load(); }}
          onClose={() => { setConnectingAccount(null); load(); }}
        />
      )}
    </div>
  );
}
