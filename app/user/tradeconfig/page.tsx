"use client";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import ConnectDeltaModal from "@/components/ConnectDeltaModal";

const INR_PER_USD = 85;

interface TradeConfig {
  id: string; script: string; amount: number; initial_amount: number | null; strategyRef?: { minCapital: number | null; orderSizeType?: string } | null;
  isActive: boolean; userActive: boolean; mode: string; strategy: string | null; isSubscription: boolean;
  leverage: number; compoundMode: string; platformFeePercent: number;
  webhookToken: string; createdAt: string;
}
interface DeltaAccount {
  id: string; accountType: string; accountName: string;
  delta_account_name: string | null; delta_user_id: string | null;
  isActive: boolean; createdAt: string; tradeConfigs: TradeConfig[];
}
interface Balance { availableUSD: number; totalUSD: number; availableINR: number; totalINR: number; }
interface Script { symbol: string; lot: number; }
interface Position {
  symbol: string; side: string; size: number; entryPrice: number;
  markPrice: number; upnlUSD: number; upnlINR: number;
  leverage: number; liquidationPrice: number;
}
interface PositionsData { positions: Position[]; totalUpnlUSD: number; totalUpnlINR: number; }
type CurrencyMode = "USD" | "INR";
type ModalType = "addAccount" | "addSymbol" | "connectKeys" | "editSymbol" | null;

const ACCOUNT_TYPES = [
  { value: "main", label: "Main Account" },
  { value: "sub1", label: "Sub Account 1" },
  { value: "sub2", label: "Sub Account 2" },
  { value: "sub3", label: "Sub Account 3" },
  { value: "sub4", label: "Sub Account 4" },
];

export default function TradeConfigPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  useEffect(() => { if (status === "unauthenticated") router.push("/Signup"); }, [status, router]);

  const [accounts, setAccounts] = useState<DeltaAccount[]>([]);
  const [balances, setBalances] = useState<Record<string, Balance>>({});
  const [positions, setPositions] = useState<Record<string, PositionsData>>({});
  const [loading, setLoading] = useState(true);
  const [currency, setCurrency] = useState<CurrencyMode>("USD");
  const [expandedAccounts, setExpandedAccounts] = useState<Set<string>>(new Set());
  const [modal, setModal] = useState<ModalType>(null);
  const [scripts, setScripts] = useState<Script[]>([]);
  const [activeBalance, setActiveBalance] = useState<Balance | null>(null);
  const [activeAccountId, setActiveAccountId] = useState<string | null>(null);
  const [activeConfig, setActiveConfig] = useState<TradeConfig | null>(null);
  const [accountForm, setAccountForm] = useState({ accountName: "", accountType: "main" });
  const [symbolForm, setSymbolForm] = useState({ script: "", amount: "", leverage: "1", compoundMode: "fixed", mode: "bridge" });

  const fmt = useCallback((usd: number) =>
    currency === "USD"
      ? `$${usd.toFixed(2)}`
      : `₹${(usd * INR_PER_USD).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`,
    [currency]);

  async function loadAccounts() {
    const res = await fetch("/api/v1/accounts");
    const data = await res.json();
    setAccounts(data);
    setLoading(false);
    setExpandedAccounts(new Set(data.map((a: DeltaAccount) => a.id)));
  }

  async function loadBalance(accountId: string) {
    try {
      const res = await fetch(`/api/v1/accounts/${accountId}/balance`);
      if (res.ok) {
        const data = await res.json();
        setBalances(prev => ({ ...prev, [accountId]: data }));
      }
    } catch {}
  }

  async function loadPositions(accountId: string) {
    try {
      const res = await fetch(`/api/v1/accounts/${accountId}/positions`);
      if (res.ok) {
        const data = await res.json();
        setPositions(prev => ({ ...prev, [accountId]: data }));
      }
    } catch {}
  }

  useEffect(() => { loadAccounts(); }, []);
  useEffect(() => {
    fetch("/api/v1/script").then(r => r.json()).then(d => setScripts(Array.isArray(d) ? d : []));
  }, []);
  useEffect(() => {
    accounts.forEach(a => { if (a.delta_account_name) { loadBalance(a.id); loadPositions(a.id); } });
  }, [accounts]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("delta_connected");
    const error = params.get("delta_error");
    if (connected === "1") {
      toast.success("Delta Exchange connected successfully!");
      loadAccounts();
      window.history.replaceState({}, "", "/user/tradeconfig");
    } else if (error) {
      toast.error("Failed to connect Delta Exchange. Please try again.");
      window.history.replaceState({}, "", "/user/tradeconfig");
    }
  }, []);

  function closeModal() {
    setModal(null); setActiveAccountId(null); setActiveConfig(null);
    setAccountForm({ accountName: "", accountType: "main" });
    setSymbolForm({ script: "", amount: "", leverage: "1", compoundMode: "fixed", mode: "bridge" });
  }

  async function createAccount() {
    if (!accountForm.accountName) { toast.error("Account name required"); return; }
    const res = await fetch("/api/v1/accounts", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(accountForm),
    });
    const data = await res.json();
    if (res.ok) {
      toast.success("Account created — connect your Delta API keys");
      closeModal(); await loadAccounts();
      setActiveAccountId(data.account.id); setModal("connectKeys");
    } else toast.error(data.error ?? "Failed to create account");
  }

  async function deleteAccount(id: string) {
    if (!confirm("Delete this account and ALL its symbols?")) return;
    const res = await fetch("/api/v1/accounts", {
      method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (res.ok) { toast.success("Account deleted"); loadAccounts(); }
    else toast.error("Failed to delete");
  }

  async function addSymbol(overrideAccountId?: string) {
    if (!symbolForm.script || !symbolForm.amount) { toast.error("Symbol and amount required"); return; }
    const targetAccountId = overrideAccountId ?? activeAccountId;
    if (!targetAccountId) return;
    const res = await fetch("/api/v1/tradeconfig", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accountId: targetAccountId,
        script: symbolForm.script.toUpperCase(),
        amount: parseFloat(symbolForm.amount),
        leverage: 1,
        compoundMode: "fixed",
        mode: "bridge",
        forceAccount: overrideAccountId ?? undefined,
      }),
    });
    const data = await res.json();
    if (res.status === 409 && data.conflict && data.suggestedAccountId) {
      const confirmed = confirm(data.message);
      if (confirmed) await addSymbol(data.suggestedAccountId);
      return;
    }
    if (res.status === 409 && data.conflict && !data.suggestedAccountId) {
      toast.error(data.error); return;
    }
    if (!res.ok) { toast.error(data.error ?? "Failed to add symbol"); return; }
    toast.success("Symbol added");
    closeModal();
    loadAccounts();
  }

  async function updateSymbol() {
    if (!activeConfig) return;
    const minCap = activeConfig.strategyRef?.minCapital;
    if (minCap && parseFloat(symbolForm.amount) < minCap) {
      toast.error(`Minimum capital for this strategy is ₹${minCap.toLocaleString('en-IN')}`);
      return;
    }
    const res = await fetch("/api/v1/tradeconfig", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: activeConfig.id,
        amount: parseFloat(symbolForm.amount) || activeConfig.amount,
        leverage: parseInt(symbolForm.leverage) || activeConfig.leverage,
        compoundMode: symbolForm.compoundMode,
      }),
    });
    if (res.ok) { toast.success("Updated"); closeModal(); loadAccounts(); }
    else toast.error("Failed to update");
  }

  async function toggleSymbol(tc: TradeConfig) {
    const newActive = !tc.userActive;
    if (!newActive && !confirm(`Deactivate ${tc.script}? Open trade will be closed immediately.`)) return;
    const res = await fetch("/api/v1/tradeconfig", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: tc.id, userActive: newActive }),
    });
    if (res.ok) { toast.success(newActive ? "Activated" : "Deactivated"); loadAccounts(); }
  }

  async function deleteSymbol(id: string, script: string) {
    if (!confirm(`Remove ${script}?`)) return;
    const res = await fetch("/api/v1/tradeconfig", {
      method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (res.ok) { toast.success("Removed"); loadAccounts(); }
  }

  async function exitPosition(accountId: string, tcId: string, script: string) {
    if (!confirm(`Close ${script} position NOW at market price?`)) return;
    const res = await fetch(`/api/v1/accounts/${accountId}/symbols/${tcId}/exit`, { method: "POST" });
    const data = await res.json();
    if (res.ok) { toast.success(`${script} position closed`); loadPositions(accountId); }
    else toast.error(data.error ?? "Exit failed");
  }

  function copyWebhook(token: string) {
    navigator.clipboard.writeText(`${window.location.origin}/api/v1/webhook/token/${token}`);
    toast.success("Webhook URL copied!");
  }

  const usedTypes = accounts.map(a => a.accountType);
  const availableTypes = ACCOUNT_TYPES.filter(t => !usedTypes.includes(t.value));

  return (
<>
      <Navbar />
      <div className="min-h-screen bg-gray-50 p-3 sm:p-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-[#161B22]">Subscriptions</h1>
            <p className="text-sm text-gray-500 mt-1">Manage your strategy subscriptions and Delta Exchange account</p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex bg-white border rounded-lg overflow-hidden text-sm">
              {(["USD", "INR"] as CurrencyMode[]).map(c => (
                <button key={c} onClick={() => setCurrency(c)}
                  className={`px-3 py-1.5 font-medium transition ${currency === c ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted"}`}>
                  {c}
                </button>
              ))}
            </div>
            {availableTypes.length > 0 && (session as any)?.user?.role === "admin" && (
              <button onClick={() => { const available = ACCOUNT_TYPES.filter(t => !accounts.map(a => a.accountType).includes(t.value)); setAccountForm({ accountName: "", accountType: available[0]?.value ?? "sub1" }); setModal("addAccount"); }}
                className="bg-foreground text-background px-4 py-2 rounded-lg text-sm font-semibold hover:opacity-90 transition">
                + Add Account
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-4 border-[#161B22] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : accounts.length === 0 ? (
          <div className="bg-white rounded-2xl p-12 text-center shadow-sm border">
            <p className="text-4xl mb-3">📡</p>
            <p className="text-gray-600 font-medium">No accounts yet</p>
            <p className="text-sm text-gray-400 mt-1">Add your first Delta Exchange account to start trading</p>
            {(session as any)?.user?.role === "admin" && <button onClick={() => { const available = ACCOUNT_TYPES.filter(t => !accounts.map(a => a.accountType).includes(t.value)); setAccountForm({ accountName: "", accountType: available[0]?.value ?? "sub1" }); setModal("addAccount"); }} className="mt-4 bg-[#161B22] text-white px-5 py-2 rounded-lg text-sm font-semibold">
              + Add Account
            </button>}
          </div>
        ) : (
          <div className="space-y-6">
            {accounts.map(account => {
              const bal = balances[account.id];
              const pos = positions[account.id];
              const isExpanded = expandedAccounts.has(account.id);
              return (
                <div key={account.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                  <div className="p-4 sm:p-5 border-b border-gray-100">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <button onClick={() => setExpandedAccounts(prev => {
                          const next = new Set(prev);
                          isExpanded ? next.delete(account.id) : next.add(account.id);
                          return next;
                        })} className="text-gray-400 hover:text-gray-600 text-lg">
                          {isExpanded ? "▾" : "▸"}
                        </button>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-base sm:text-lg text-gray-800">{account.accountName}</span>
                            <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 font-medium">{account.accountType}</span>
                            {account.delta_account_name ? (
                              <span className="text-xs text-green-600 font-medium">✓ {account.delta_account_name}</span>
                            ) : (
                              <button onClick={() => { setActiveAccountId(account.id); setModal("connectKeys"); }}
                                className="text-xs text-orange-600 font-medium hover:underline">⚠️ Connect API keys</button>
                            )}
                          </div>
                          {bal && (
                            <p className="text-sm text-gray-500 mt-0.5">
                              Balance: <span className="font-semibold text-gray-700">{fmt(bal.totalUSD)}</span>
                              <span className="text-gray-400 mx-1">·</span>
                              Available: <span className="font-semibold text-green-600">{fmt(bal.availableUSD)}</span>
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        {account.delta_account_name && (
                          <button onClick={() => { loadBalance(account.id); loadPositions(account.id); }}
                            className="text-xs px-2 py-1 rounded-lg bg-gray-100 text-gray-500 hover:bg-gray-200" title="Refresh">↻</button>
                        )}
                        <button onClick={() => { setActiveAccountId(account.id); setModal("connectKeys"); }}
                          className="text-xs px-3 py-1.5 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 font-medium">
                          {account.delta_account_name ? "Reconnect" : "Connect"}
                        </button>
                        {(session as any)?.user?.role === "admin" && <button onClick={() => deleteAccount(account.id)}
                          className="text-xs px-3 py-1.5 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 font-medium">Delete</button>}
                      </div>
                    </div>
                    {pos && pos.positions.length > 0 && (
                      <div className={`mt-3 text-sm font-semibold ${pos.totalUpnlUSD >= 0 ? "text-green-600" : "text-red-500"}`}>
                        Total UPNL: {fmt(pos.totalUpnlUSD)}
                      </div>
                    )}
                  </div>

                  {isExpanded && (
                    <div>
                      {account.tradeConfigs.length === 0 ? (
                        <div className="p-6 text-center text-sm text-gray-400">
                          No symbols yet — <a href="/marketplace" className="ml-1 text-blue-500 hover:underline">go to Marketplace to subscribe a strategy</a>
                        </div>
                      ) : (
                        <div>
                        <div className="overflow-x-auto">
                          <div className="min-w-[720px]">
                          {/* Table header */}
                          <div className="grid grid-cols-12 gap-2 px-5 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wide border-b border-gray-50">
                            <div className="col-span-2">Symbol</div>
                            <div className="col-span-2">Allocated</div>
                            <div className="col-span-1">Lev</div>
                            <div className="col-span-2">Mode</div>
                            <div className="col-span-2">Position / UPNL</div>
                            <div className="col-span-1">Status</div>
                            <div className="col-span-2 text-right">Actions</div>
                          </div>
                          {account.tradeConfigs.map(tc => {
                            const tcPos = pos?.positions.find(p => p.symbol === tc.script);
                            const isOn = tc.isActive && tc.userActive;
                            const actionButtons = (
                              <>
                                <button onClick={() => toggleSymbol(tc)}
                                  className={`text-xs px-2 py-1 rounded font-medium transition ${tc.userActive ? "bg-yellow-50 text-yellow-600 hover:bg-yellow-100" : "bg-green-50 text-green-600 hover:bg-green-100"}`}>
                                  {tc.userActive ? "Pause" : "On"}
                                </button>
                                {tcPos && (
                                  <button onClick={() => exitPosition(account.id, tc.id, tc.script)}
                                    className="text-xs px-2 py-1 rounded bg-red-50 text-red-500 hover:bg-red-100 font-medium">Exit</button>
                                )}
                                <button onClick={() => {
                                  setActiveConfig(tc);
                                  setSymbolForm({ script: tc.script, amount: String(tc.amount), leverage: String(tc.leverage), compoundMode: tc.compoundMode, mode: tc.mode });
                                  setModal("editSymbol");
                                }} className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-500 hover:bg-gray-200">✎</button>
                                <button onClick={() => deleteSymbol(tc.id, tc.script)}
                                  className="text-xs px-2 py-1 rounded bg-red-50 text-red-400 hover:bg-red-100">✕</button>
                              </>
                            );
                            return (
                              <div key={tc.id} className="grid grid-cols-12 gap-2 px-5 py-3 items-center border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
                                <div className="col-span-2">
                                  <span className="font-bold text-gray-800">{tc.script}</span>
                                  <div className="text-xs text-gray-400 mt-0.5">{tc.compoundMode}</div>
                                  {tc.isSubscription && <span className="text-xs px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 font-medium mt-0.5 inline-block">📊 {tc.strategy ?? "Strategy"}</span>}
                                </div>
                                <div className="col-span-2 text-sm">
                                  <div className="font-medium">{fmt(tc.amount / INR_PER_USD)}</div>
                                  {tc.initial_amount && tc.initial_amount !== tc.amount && (
                                    <div className="text-xs text-gray-400">init: {fmt(tc.initial_amount / INR_PER_USD)}</div>
                                  )}
                                </div>
                                <div className="col-span-1 text-sm font-medium">{tc.leverage}x</div>
                                <div className="col-span-2">
                                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${tc.mode === "standalone" ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"}`}>
                                    {tc.mode === "standalone" ? `⚡ ${tc.strategy ?? "standalone"}` : "🔗 bridge"}
                                  </span>
                                </div>
                                <div className="col-span-2 text-sm">
                                  {tcPos ? (
                                    <div>
                                      <div className="font-medium capitalize">{tcPos.side} {tcPos.size}</div>
                                      <div className={`text-xs font-semibold ${tcPos.upnlUSD >= 0 ? "text-green-600" : "text-red-500"}`}>{fmt(tcPos.upnlUSD)}</div>
                                    </div>
                                  ) : <span className="text-gray-300 text-xs">—</span>}
                                </div>
                                <div className="col-span-1">
                                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${isOn ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-400"}`}>
                                    {isOn ? "●" : "○"}
                                  </span>
                                </div>
                                <div className="col-span-2 flex items-center justify-end gap-1">{actionButtons}</div>
                              </div>
                            );
                          })}
                          </div>
                          </div>
                          {pos && pos.positions.length > 0 && (
                            <div className="px-4 sm:px-5 py-3 bg-gray-50 border-t border-gray-100">
                              <p className="text-xs font-semibold text-gray-400 uppercase mb-2">Open Positions</p>
                              <div className="space-y-2">
                                {pos.positions.map((p, i) => (
                                  <div key={i} className="text-sm border-b border-gray-100 last:border-0 pb-2 last:pb-0 sm:flex sm:items-center sm:justify-between sm:border-0 sm:pb-0">
                                    <div className="flex items-center justify-between sm:contents">
                                      <span className="font-medium text-gray-700">{p.symbol}</span>
                                      <span className={`font-semibold sm:order-last ${p.upnlUSD >= 0 ? "text-green-600" : "text-red-500"}`}>{fmt(p.upnlUSD)}</span>
                                    </div>
                                    <div className="flex items-center gap-3 text-xs text-gray-500 mt-0.5 sm:text-sm sm:mt-0 sm:contents">
                                      <span className="capitalize">{p.side} {p.size} @ {p.entryPrice}</span>
                                      <span className="text-gray-400">Mark: {p.markPrice}</span>
                                      <span className="text-gray-400">Liq: {p.liquidationPrice}</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                              <div className={`mt-2 text-sm font-bold text-right ${pos.totalUpnlUSD >= 0 ? "text-green-600" : "text-red-500"}`}>
                                Total UPNL: {fmt(pos.totalUpnlUSD)}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {modal === "addAccount" && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md mx-4 shadow-2xl">
            <h2 className="text-lg font-bold text-gray-800 mb-4">Add Delta Account</h2>
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium text-gray-700">Account Type</label>
                <select value={accountForm.accountType} onChange={e => setAccountForm({ ...accountForm, accountType: e.target.value })}
                  className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#161B22]">
                  {availableTypes.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Display Name</label>
                <input value={accountForm.accountName} onChange={e => setAccountForm({ ...accountForm, accountName: e.target.value })}
                  placeholder="e.g. My Main Account"
                  className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#161B22]" />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={closeModal} className="flex-1 border rounded-lg py-2 text-sm text-gray-600">Cancel</button>
              <button onClick={createAccount} className="flex-1 bg-[#161B22] text-white rounded-lg py-2 text-sm font-semibold">Create & Connect Keys</button>
            </div>
          </div>
        </div>
      )}

      {modal === "addSymbol" && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md mx-4 shadow-2xl">
            <h2 className="text-lg font-bold text-gray-800 mb-1">Add Symbol</h2>
            <p className="text-xs text-gray-400 mb-4">Bot settings (leverage, mode, compound) are configured by the admin.</p>
            <div className="space-y-3">
              {activeBalance && (
                <div className="bg-blue-50 rounded-lg px-3 py-2 text-sm">
                  <span className="text-gray-500">Available: </span>
                  <span className="font-semibold text-blue-700">₹{activeBalance.availableINR.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</span>
                  <span className="text-gray-400 mx-2">·</span>
                  <span className="text-gray-500">Total: </span>
                  <span className="font-medium text-gray-700">₹{activeBalance.totalINR.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</span>
                </div>
              )}
              <div>
                <label className="text-sm font-medium text-gray-700">Symbol</label>
                <select value={symbolForm.script} onChange={e => setSymbolForm({ ...symbolForm, script: e.target.value })}
                  className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#161B22]">
                  <option value="">Select symbol...</option>
                  {scripts
                    .filter(s => !accounts
                      .find(a => a.id === activeAccountId)
                      ?.tradeConfigs.some(tc => tc.script === s.symbol))
                    .map(s => (
                      <option key={s.symbol} value={s.symbol}>{s.symbol}</option>
                    ))}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Allocated Amount (₹)</label>
                <input type="number" value={symbolForm.amount} onChange={e => setSymbolForm({ ...symbolForm, amount: e.target.value })}
                  placeholder="e.g. 5000"
                  className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#161B22]" />
                <p className="text-xs text-gray-400 mt-1">Must be within your available Delta account balance.</p>
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={closeModal} className="flex-1 border rounded-lg py-2 text-sm text-gray-600">Cancel</button>
              <button onClick={() => addSymbol()} className="flex-1 bg-foreground text-background rounded-lg py-2 text-sm font-semibold">Add Symbol</button>
            </div>
          </div>
        </div>
      )}

      {modal === "editSymbol" && activeConfig && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md mx-4 shadow-2xl">
            <h2 className="text-lg font-bold text-gray-800 mb-1">Edit {activeConfig.script}</h2>

            <div className="space-y-3">
              <div>
                {(() => {
                  const t = activeConfig.strategyRef?.orderSizeType;
                  const label = t === "lot" ? "Lot / Quantity" : t === "equity_pct" ? "% of Equity" : "Allocated Amount (₹)";
                  const hint = t === "lot" ? "Fixed lot size, used the same on every trade (no compounding)."
                    : t === "equity_pct" ? "Percentage of your live account balance, recalculated fresh on every trade (compounds automatically)."
                    : "Fixed ₹ amount, used the same on every trade (no compounding).";
                  return (
                    <>
                      <label className="text-sm font-medium text-gray-700">
                        {label}
                        {t !== "equity_pct" && t !== "lot" && activeConfig.strategyRef?.minCapital ? <span className="text-xs text-gray-400 ml-2">Min: ₹{activeConfig.strategyRef.minCapital.toLocaleString('en-IN')}</span> : null}
                      </label>
                      <input type="number" value={symbolForm.amount} onChange={e => setSymbolForm({ ...symbolForm, amount: e.target.value })}
                        min={t === "currency" || !t ? (activeConfig.strategyRef?.minCapital ?? 100) : 0}
                        className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#161B22]" />
                      <p className="text-xs text-gray-400 mt-1">{hint}</p>
                      {(t === "currency" || !t) && activeConfig.strategyRef?.minCapital && parseFloat(symbolForm.amount) < activeConfig.strategyRef.minCapital && (
                        <p className="text-xs text-red-400 mt-1">⚠️ Amount cannot be less than ₹{activeConfig.strategyRef.minCapital.toLocaleString('en-IN')}</p>
                      )}
                    </>
                  );
                })()}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-gray-500 text-xs">Leverage (set by admin)</label>
                  <div className="mt-1 w-full border rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-400">{activeConfig.leverage}x</div>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500 text-xs">P&L Mode (set by admin)</label>
                  <div className="mt-1 w-full border rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-400 capitalize">{activeConfig.compoundMode}</div>
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={closeModal} className="flex-1 border rounded-lg py-2 text-sm text-gray-600">Cancel</button>
              <button onClick={updateSymbol} className="flex-1 bg-foreground text-background rounded-lg py-2 text-sm font-semibold">Save Changes</button>
            </div>
          </div>
        </div>
      )}

      {modal === "connectKeys" && activeAccountId && (
        <ConnectDeltaModal
          isAdmin={(session as any)?.user?.role === "admin"}
          accountId={activeAccountId}
          accountType={accounts.find(a => a.id === activeAccountId)?.accountType ?? "main"}
          onSuccess={(name) => { toast.success(`Connected: ${name}`); closeModal(); loadAccounts(); }}
          onClose={closeModal}
        />
      )}
    </div>
  </>
  );
}
