"use client";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import { toast } from "sonner";

interface Script {
  symbol: string; exchange_symbol: string; productId: number;
  lot: number; exchange: string; Max_pos_size: number; Pos_Per: number; gridEnabled: boolean;
}

export default function ManageSymbolsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [scripts, setScripts] = useState<Script[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ symbol: "", exchange_symbol: "", productId: "", lot: "1", Max_pos_size: "15000", Pos_Per: "100" });

  useEffect(() => {
    if (status === "unauthenticated") router.push("/Signup");
    if (status === "authenticated" && session.user.role !== "admin") router.push("/user/dashboard");
  }, [status, session, router]);

  useEffect(() => { load(); }, []);

  async function load() {
    const res = await fetch("/api/v1/script");
    const data = await res.json();
    setScripts(Array.isArray(data) ? data : []);
    setLoading(false);
  }

  async function createScript() {
    if (!form.symbol || !form.exchange_symbol || !form.productId) {
      toast.error("Symbol, exchange symbol and productId required");
      return;
    }
    const res = await fetch("/api/v1/script", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        symbol: form.symbol.toUpperCase(),
        exchange_symbol: form.exchange_symbol.toUpperCase(),
        productId: parseInt(form.productId),
        lot: parseFloat(form.lot),
        Max_pos_size: parseInt(form.Max_pos_size),
        Pos_Per: parseInt(form.Pos_Per),
        exchange: "delta",
      }),
    });
    const data = await res.json();
    if (res.ok) { toast.success("Symbol added!"); setForm({ symbol: "", exchange_symbol: "", productId: "", lot: "1", Max_pos_size: "15000", Pos_Per: "100" }); load(); }
    else toast.error(data.error ?? "Failed");
  }

  async function deleteScript(symbol: string) {
    if (!confirm("Delete " + symbol + "?")) return;
    await fetch("/api/v1/script", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ symbol }) });
    toast.success("Deleted");
    load();
  }

  const inp = "w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]";

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        <h1 className="text-2xl font-bold text-[#1E3A5F]">Manage Symbols</h1>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white rounded-2xl p-5 shadow-sm border space-y-3">
            <h2 className="font-semibold text-gray-700">Add Symbol</h2>
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
                <input value={(form as any)[f.key]} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                  placeholder={f.placeholder} className={inp} />
              </div>
            ))}
            <button onClick={createScript}
              className="w-full bg-[#1E3A5F] text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-[#152c4a] transition">
              Add Symbol
            </button>
          </div>
          <div className="md:col-span-2 bg-white rounded-2xl shadow-sm border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#1E3A5F] text-white text-xs">
                  {["Symbol", "Exchange Symbol", "Product ID", "Lot", "Max Pos", "Actions"].map((h) => (
                    <th key={h} className="px-4 py-3 text-left font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Loading...</td></tr>
                ) : scripts.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">No symbols yet</td></tr>
                ) : scripts.map((s, i) => (
                  <tr key={s.symbol} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                    <td className="px-4 py-2 font-semibold">{s.symbol}</td>
                    <td className="px-4 py-2 text-gray-600">{s.exchange_symbol}</td>
                    <td className="px-4 py-2 font-mono text-xs">{s.productId}</td>
                    <td className="px-4 py-2">{s.lot}</td>
                    <td className="px-4 py-2">{s.Max_pos_size}</td>
                    <td className="px-4 py-2">
                      <button onClick={() => deleteScript(s.symbol)}
                        className="text-xs bg-red-50 text-red-600 px-3 py-1 rounded-lg hover:bg-red-100">
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
