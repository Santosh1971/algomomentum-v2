"use client";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import { toast } from "sonner";

interface Script {
  symbol: string; exchange_symbol: string; productId: number;
  lot: number; exchange: string; Max_pos_size: number; Pos_Per: number;
}

const blank = { symbol: "", exchange_symbol: "", productId: "", lot: "1", Max_pos_size: "15000", Pos_Per: "100" };

export default function ManageSymbolsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [scripts, setScripts] = useState<Script[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(blank);
  const [editSymbol, setEditSymbol] = useState<string | null>(null);
  const [broadcastSecret, setBroadcastSecret] = useState("");

  useEffect(() => {
    if (status === "unauthenticated") router.push("/Signup");
    if (status === "authenticated" && session.user.role !== "admin") router.push("/user/dashboard");
  }, [status, session, router]);

  useEffect(() => {
    load();
    fetch("/api/v1/broadcast-secret").then(r => r.json()).then(d => setBroadcastSecret(d.secret ?? ""));
  }, []);

  async function load() {
    const res = await fetch("/api/v1/script");
    const data = await res.json();
    setScripts(Array.isArray(data) ? data : []);
    setLoading(false);
  }

  function startEdit(s: Script) {
    setEditSymbol(s.symbol);
    setForm({ symbol: s.symbol, exchange_symbol: s.exchange_symbol, productId: String(s.productId), lot: String(s.lot), Max_pos_size: String(s.Max_pos_size), Pos_Per: String(s.Pos_Per) });
  }

  function cancelEdit() { setEditSymbol(null); setForm(blank); }

  async function saveScript() {
    if (!form.symbol || !form.exchange_symbol || !form.productId) {
      toast.error("Symbol, exchange symbol and productId required"); return;
    }
    const body = { symbol: form.symbol.toUpperCase(), exchange_symbol: form.exchange_symbol.toUpperCase(), productId: parseInt(form.productId), lot: parseFloat(form.lot), Max_pos_size: parseInt(form.Max_pos_size), Pos_Per: parseInt(form.Pos_Per), exchange: "delta" };
    const method = editSymbol ? "PUT" : "POST";
    const res = await fetch("/api/v1/script", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(editSymbol ? { ...body, originalSymbol: editSymbol } : body) });
    const data = await res.json();
    if (res.ok) { toast.success(editSymbol ? "Updated!" : "Added!"); setEditSymbol(null); setForm(blank); load(); }
    else toast.error(data.error ?? "Failed");
  }

  async function deleteScript(symbol: string) {
    if (!confirm("Delete " + symbol + "?")) return;
    await fetch("/api/v1/script", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ symbol }) });
    toast.success("Deleted"); load();
  }

  function getBroadcastUrl(symbol: string) {
    return `${window.location.origin}/api/v1/webhook/broadcast/${symbol}?secret=${broadcastSecret}`;
  }

  function copyText(text: string, label: string) {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied!`);
  }

  const strategyPayload = `{"symbol":"{{ticker}}","side":"{{strategy.order.action}}","trade":"{{strategy.order.comment}}","price":"{{strategy.order.price}}","trigger_time":"{{timenow}}"}`;

  function hLinePayload(symbol: string, side: "buy" | "sell", trade: "entry" | "exit") {
    return `{"symbol":"${symbol}","side":"${side}","trade":"${trade}","price":"{{close}}","trigger_time":"{{timenow}}"}`;
  }

  const inp = "w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]";

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        <h1 className="text-2xl font-bold text-[#1E3A5F]">Manage Symbols</h1>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white rounded-2xl p-5 shadow-sm border space-y-3">
            <h2 className="font-semibold text-gray-700">{editSymbol ? `Editing: ${editSymbol}` : "Add Symbol"}</h2>
            {[
              { label: "Symbol", key: "symbol", placeholder: "e.g. BTCUSD" },
              { label: "Exchange Symbol", key: "exchange_symbol", placeholder: "e.g. BTCUSD" },
              { label: "Product ID", key: "productId", placeholder: "e.g. 84" },
              { label: "Lot size", key: "lot", placeholder: "e.g. 1" },
              { label: "Max Position Size", key: "Max_pos_size", placeholder: "e.g. 15000" },
              { label: "Pos %", key: "Pos_Per", placeholder: "100" },
            ].map((f) => (
              <div key={f.key}>
                <label className="text-xs text-gray-500 block mb-1">{f.label}</label>
                <input value={(form as any)[f.key]}
                  onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                  placeholder={f.placeholder}
                  disabled={f.key === "symbol" && !!editSymbol}
                  className={inp + (f.key === "symbol" && editSymbol ? " bg-gray-100" : "")} />
              </div>
            ))}
            <div className="flex gap-2">
              <button onClick={saveScript}
                className="flex-1 bg-[#1E3A5F] text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-[#152c4a] transition">
                {editSymbol ? "Save Changes" : "Add Symbol"}
              </button>
              {editSymbol && (
                <button onClick={cancelEdit}
                  className="px-4 border border-gray-300 text-gray-600 py-2.5 rounded-xl text-sm hover:bg-gray-50 transition">
                  Cancel
                </button>
              )}
            </div>
          </div>

          <div className="md:col-span-2 bg-white rounded-2xl shadow-sm border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#1E3A5F] text-white text-xs">
                  {["Symbol", "Exch Symbol", "Product ID", "Lot", "Max Pos", "Actions"].map((h) => (
                    <th key={h} className="px-3 py-3 text-left font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Loading...</td></tr>
                ) : scripts.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">No symbols yet</td></tr>
                ) : scripts.map((s, i) => (
                  <tr key={s.symbol} className={`${i % 2 === 0 ? "bg-white" : "bg-gray-50"} ${editSymbol === s.symbol ? "ring-2 ring-inset ring-blue-300" : ""}`}>
                    <td className="px-3 py-2 font-semibold">{s.symbol}</td>
                    <td className="px-3 py-2 text-gray-600">{s.exchange_symbol}</td>
                    <td className="px-3 py-2 font-mono text-xs">{s.productId}</td>
                    <td className="px-3 py-2">{s.lot}</td>
                    <td className="px-3 py-2">{s.Max_pos_size}</td>
                    <td className="px-3 py-2 flex gap-2">
                      <button onClick={() => startEdit(s)} className="text-xs bg-blue-50 text-blue-600 px-3 py-1 rounded-lg hover:bg-blue-100">Edit</button>
                      <button onClick={() => deleteScript(s.symbol)} className="text-xs bg-red-50 text-red-600 px-3 py-1 rounded-lg hover:bg-red-100">Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Broadcast Webhook Section */}
        <div className="bg-white rounded-2xl shadow-sm border p-5 space-y-4">
          <div>
            <h2 className="text-lg font-bold text-[#1E3A5F]">📡 Broadcast Webhooks</h2>
            <p className="text-sm text-gray-500 mt-1">One URL fires trades for ALL active users on that symbol simultaneously.</p>
          </div>

          {/* Strategy Payload — common for all symbols */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-2">
            <p className="text-sm font-semibold text-blue-800">📈 Pine Script Strategy Alert — Message (same for all symbols)</p>
            <p className="text-xs text-blue-600 mb-1">Use this when alert is triggered from a Pine Script strategy. Side and trade are dynamic.</p>
            <code className="text-xs text-gray-700 block break-all bg-white border rounded-lg px-3 py-2">{strategyPayload}</code>
            <button onClick={() => copyText(strategyPayload, "Strategy payload")}
              className="text-xs text-blue-600 hover:text-blue-800 font-medium">Copy Message</button>
          </div>

          {loading ? (
            <p className="text-sm text-gray-400">Loading...</p>
          ) : scripts.length === 0 ? (
            <p className="text-sm text-gray-400">No symbols configured yet.</p>
          ) : (
            <div className="space-y-4">
              {scripts.map((s) => {
                const url = getBroadcastUrl(s.symbol);
                return (
                  <div key={s.symbol} className="border rounded-xl p-4 space-y-3 bg-gray-50">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-[#1E3A5F] text-sm">{s.symbol}</span>
                      <span className="text-xs text-gray-400 bg-white border px-2 py-0.5 rounded-full">broadcast</span>
                    </div>

                    {/* Webhook URL */}
                    <div>
                      <p className="text-xs text-gray-500 mb-1 font-medium">Webhook URL (use for both Strategy & H-Line alerts)</p>
                      <div className="flex items-center gap-2">
                        <code className="flex-1 text-xs bg-white border rounded-lg px-3 py-2 text-gray-700 truncate">{url}</code>
                        <button onClick={() => copyText(url, "URL")}
                          className="text-xs bg-[#1E3A5F] text-white px-3 py-2 rounded-lg hover:bg-[#152c4a] whitespace-nowrap">
                          Copy URL
                        </button>
                      </div>
                    </div>

                    {/* H-Line Payloads */}
                    <div>
                      <p className="text-xs font-semibold text-gray-600 mb-2">📏 Horizontal Line Alert — Messages (hardcoded side)</p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {[
                          { label: "📈 Long Entry", side: "buy" as const, trade: "entry" as const },
                          { label: "📉 Short Entry", side: "sell" as const, trade: "entry" as const },
                          { label: "🚪 Long Exit", side: "sell" as const, trade: "exit" as const },
                          { label: "🚪 Short Exit", side: "buy" as const, trade: "exit" as const },
                        ].map(({ label, side, trade }) => {
                          const payload = hLinePayload(s.symbol, side, trade);
                          return (
                            <div key={`${side}-${trade}`} className="bg-white border rounded-lg p-3 space-y-1">
                              <p className="text-xs font-medium text-gray-600">{label}</p>
                              <code className="text-xs text-gray-500 block break-all">{payload}</code>
                              <button onClick={() => copyText(payload, `${label} message`)}
                                className="text-xs text-blue-600 hover:text-blue-800 font-medium">Copy Message</button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
