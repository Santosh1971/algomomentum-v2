// app/user/tradeconfig/page.tsx
"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import ConnectDeltaModal from "@/components/ConnectDeltaModal";

interface TradeConfig {
  id: string;
  script: string;
  amount: number;
  isActive: boolean;
  userActive: boolean;
  mode: string;
  strategy: string | null;
  delta_account_name: string | null;
  platformFeePercent: number;
  createdAt: string;
}

export default function TradeConfigPage() {
  const [configs, setConfigs] = useState<TradeConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [pendingConfigId, setPendingConfigId] = useState<string | null>(null);

  // New config form state
  const [form, setForm] = useState({ amount: "", script: "", mode: "bridge", strategy: "" });

  async function load() {
    const res = await fetch("/api/v1/tradeconfig");
    const data = await res.json();
    setConfigs(data);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function createConfig() {
    if (!form.amount || !form.script) { toast.error("Amount and symbol required"); return; }
    const res = await fetch("/api/v1/tradeconfig", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: parseFloat(form.amount),
        script: form.script.toUpperCase(),
        mode: form.mode,
        strategy: form.strategy || null,
        api_key: "PENDING",
        api_secret: "PENDING",
      }),
    });
    const data = await res.json();
    if (res.ok) {
      toast.success("Config created! Now connect your Delta account.");
      setPendingConfigId(data.config.id);
      setShowModal(true);
      setShowForm(false);
      load();
    } else {
      toast.error(data.error ?? "Failed to create config");
    }
  }

  async function toggleActive(id: string, field: "isActive" | "userActive", value: boolean) {
    await fetch("/api/v1/tradeconfig", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, [field]: value }),
    });
    toast.success(value ? "Activated" : "Paused");
    load();
  }

  async function deleteConfig(id: string) {
    if (!confirm("Delete this config?")) return;
    await fetch("/api/v1/tradeconfig", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    toast.success("Deleted");
    load();
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-[#1E3A5F]">Trading Accounts</h1>
            <p className="text-sm text-gray-500 mt-1">Manage your Delta Exchange connections and bot configurations</p>
          </div>
          <button onClick={() => setShowForm(true)}
            className="bg-[#1E3A5F] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#152c4a] transition">
            + Add Config
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-4 border-[#1E3A5F] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : configs.length === 0 ? (
          <div className="bg-white rounded-2xl p-12 text-center shadow-sm border">
            <p className="text-4xl mb-3">📡</p>
            <p className="text-gray-600 font-medium">No trading configs yet</p>
            <p className="text-sm text-gray-400 mt-1">Add your first config to start algo trading</p>
          </div>
        ) : (
          <div className="space-y-4">
            {configs.map((c) => (
              <div key={c.id} className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-bold text-lg text-gray-800">{c.script}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${c.mode === "standalone" ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"}`}>
                        {c.mode === "standalone" ? `⚡ ${c.strategy ?? "standalone"}` : "🔗 bridge"}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${c.isActive && c.userActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                        {c.isActive && c.userActive ? "● Active" : "○ Inactive"}
                      </span>
                    </div>

                    {c.delta_account_name ? (
                      <p className="text-sm text-gray-600">
                        <span className="text-green-600 font-medium">✓ Connected:</span> {c.delta_account_name}
                      </p>
                    ) : (
                      <button onClick={() => { setPendingConfigId(c.id); setShowModal(true); }}
                        className="text-sm text-orange-600 font-medium hover:underline">
                        ⚠️ Click to connect Delta account
                      </button>
                    )}

                    <p className="text-sm text-gray-500 mt-1">Capital: <span className="font-semibold">₹{c.amount.toLocaleString()}</span> · Fee: {c.platformFeePercent}% of profit</p>
                  </div>

                  <div className="flex items-center gap-2">
                    {c.delta_account_name && (
                      <button onClick={() => toggleActive(c.id, "userActive", !c.userActive)}
                        className={`text-xs px-3 py-1.5 rounded-lg font-medium transition ${c.userActive ? "bg-yellow-100 text-yellow-700 hover:bg-yellow-200" : "bg-green-100 text-green-700 hover:bg-green-200"}`}>
                        {c.userActive ? "Pause" : "Resume"}
                      </button>
                    )}
                    <button onClick={() => { setPendingConfigId(c.id); setShowModal(true); }}
                      className="text-xs px-3 py-1.5 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 font-medium">
                      Reconnect
                    </button>
                    <button onClick={() => deleteConfig(c.id)}
                      className="text-xs px-3 py-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 font-medium">
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* New Config Form */}
        {showForm && (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50">
            <div className="bg-white rounded-2xl p-6 w-full max-w-md mx-4 shadow-2xl">
              <h2 className="text-lg font-bold text-gray-800 mb-4">New Trading Config</h2>
              <div className="space-y-3">
                <div>
                  <label className="text-sm font-medium text-gray-700">Symbol</label>
                  <input value={form.script} onChange={(e) => setForm({ ...form, script: e.target.value })}
                    placeholder="e.g. BTCUSD" className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]" />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Capital (₹)</label>
                  <input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })}
                    placeholder="e.g. 50000" className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]" />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Mode</label>
                  <select value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value })}
                    className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]">
                    <option value="bridge">Bridge (TradingView signals)</option>
                    <option value="standalone">Standalone (Built-in strategy)</option>
                  </select>
                </div>
                {form.mode === "standalone" && (
                  <div>
                    <label className="text-sm font-medium text-gray-700">Strategy</label>
                    <select value={form.strategy} onChange={(e) => setForm({ ...form, strategy: e.target.value })}
                      className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]">
                      <option value="">Select strategy</option>
                      <option value="pdh_pdl">PDH/PDL Breakout</option>
                    </select>
                  </div>
                )}
              </div>
              <div className="flex gap-3 mt-5">
                <button onClick={() => setShowForm(false)} className="flex-1 border rounded-lg py-2 text-sm text-gray-600">Cancel</button>
                <button onClick={createConfig} className="flex-1 bg-[#1E3A5F] text-white rounded-lg py-2 text-sm font-semibold">
                  Create & Connect
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Delta Connect Modal */}
        {showModal && (
          <ConnectDeltaModal
            tradeConfigId={pendingConfigId ?? undefined}
            onSuccess={(name) => { toast.success(`Connected: ${name}`); load(); }}
            onClose={() => { setShowModal(false); setPendingConfigId(null); }}
          />
        )}
      </div>
    </div>
  );
}
