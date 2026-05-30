"use client";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import Navbar from "@/components/Navbar";

interface Script { symbol: string; }

export default function SimulatorPage() {
  const [symbols, setSymbols] = useState<Script[]>([]);
  const [symbol, setSymbol] = useState("");
  const [customSymbol, setCustomSymbol] = useState("");
  const [price, setPrice] = useState("");
  const [livePrice, setLivePrice] = useState<number | null>(null);
  const [loadingPrice, setLoadingPrice] = useState(false);
  const [log, setLog] = useState<{time: string; msg: string; status: string}[]>([]);

  useEffect(() => {
    fetch("/api/v1/script").then(r => r.json()).then(data => {
      if (Array.isArray(data) && data.length > 0) {
        setSymbols(data);
        setSymbol(data[0].symbol);
      }
    });
  }, []);

  useEffect(() => {
    const sym = customSymbol.trim() || symbol;
    if (!sym) return;
    setLoadingPrice(true);
    setLivePrice(null);
    fetch(`/api/v1/ticker?symbol=${sym}`)
      .then(r => r.json())
      .then(data => {
        if (data.price) { setLivePrice(data.price); setPrice(String(data.price)); }
        setLoadingPrice(false);
      })
      .catch(() => setLoadingPrice(false));
  }, [symbol, customSymbol]);

  const activeSymbol = customSymbol.trim() || symbol;
  const webhookUrl = `/api/v1/webhook/${activeSymbol}`;

  function addLog(msg: string, status: string) {
    const time = new Date().toTimeString().slice(0, 8);
    setLog(prev => [{ time, msg, status }, ...prev].slice(0, 30));
  }

  async function fireSignal(side: string, trade: string) {
    addLog(`→ ${trade} ${side.toUpperCase()} ${activeSymbol} @ ${price}`, "pending");
    try {
      const res = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ side, trade, price, trigger_time: new Date().toISOString() }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        addLog(`✓ ${trade} ${side.toUpperCase()} ${activeSymbol} — processed ${data.processed ?? 1} config(s)`, "ok");
        toast.success(`${trade} signal sent!`);
      } else {
        addLog(`✗ ${data.error || JSON.stringify(data)}`, "err");
        toast.error(data.error || "Signal failed");
      }
    } catch (e: any) {
      addLog(`✗ Network error: ${e.message}`, "err");
    }
  }

  const btnBase = "py-4 px-6 rounded-xl border-2 font-semibold text-sm transition-all active:scale-95 cursor-pointer";

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-3xl mx-auto p-6 space-y-5">
        <div>
          <h1 className="text-2xl font-bold text-[#1E3A5F]">Signal Simulator</h1>
          <p className="text-sm text-gray-500 mt-1">Fire TradingView-style webhook signals to test your bridge</p>
        </div>

        <div className="bg-white rounded-2xl p-5 shadow-sm border grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-gray-500 uppercase tracking-wide block mb-1">Symbol</label>
            <select value={symbol} onChange={e => setSymbol(e.target.value)}
              className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]">
              {symbols.map(s => <option key={s.symbol} value={s.symbol}>{s.symbol}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 uppercase tracking-wide block mb-1">Custom symbol</label>
            <input value={customSymbol} onChange={e => setCustomSymbol(e.target.value)}
              placeholder="Override e.g. PIUSD"
              className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]" />
          </div>
          <div className="col-span-2">
            <label className="text-xs text-gray-500 uppercase tracking-wide block mb-1">
              Live Price {loadingPrice ? "⏳ fetching..." : livePrice ? `✅ $${livePrice}` : "❌ not available"}
            </label>
            <div className="flex gap-2">
              <input type="number" value={price} onChange={e => setPrice(e.target.value)}
                className="flex-1 border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]" />
              <button onClick={() => { if (livePrice) setPrice(String(livePrice)); }}
                className="px-4 border rounded-xl text-xs text-blue-600 hover:bg-blue-50 border-blue-200">
                Refresh
              </button>
            </div>
          </div>
          <div className="col-span-2">
            <label className="text-xs text-gray-500 uppercase tracking-wide block mb-1">Webhook URL</label>
            <div className="border rounded-xl px-3 py-2 text-xs font-mono text-gray-500 bg-gray-50">{webhookUrl}</div>
          </div>
        </div>

        {livePrice && (
          <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-2 text-sm text-green-700">
            📈 <strong>{activeSymbol}</strong> current price: <strong>${livePrice}</strong>
          </div>
        )}

        <div className="grid grid-cols-3 gap-3">
          <button onClick={() => fireSignal("buy", "ENTRY")} className={`${btnBase} border-green-500 text-green-700 hover:bg-green-50`}>📈 Long Entry</button>
          <button onClick={() => fireSignal("sell", "ENTRY")} className={`${btnBase} border-red-500 text-red-700 hover:bg-red-50`}>📉 Short Entry</button>
          <button onClick={() => fireSignal("sell", "EXIT")} className={`${btnBase} border-gray-400 text-gray-600 hover:bg-gray-50`}>⬜ Exit Long</button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <button onClick={() => fireSignal("buy", "EXIT")} className={`${btnBase} border-gray-400 text-gray-600 hover:bg-gray-50`}>⬜ Exit Short</button>
          <button onClick={async () => { await fireSignal("buy", "ENTRY"); setTimeout(() => fireSignal("sell", "EXIT"), 3000); }}
            className={`${btnBase} border-blue-400 text-blue-700 hover:bg-blue-50 text-xs`}>🧪 Test: Entry → Exit (3s)</button>
        </div>

        <div className="bg-white rounded-2xl p-5 shadow-sm border">
          <div className="flex justify-between items-center mb-3">
            <p className="text-xs text-gray-400 uppercase tracking-wide">Activity log</p>
            <button onClick={() => setLog([])} className="text-xs text-gray-400 hover:text-red-500">Clear</button>
          </div>
          {log.length === 0 ? <p className="text-sm text-gray-400">Signals you fire will appear here...</p> : (
            <div className="space-y-1 font-mono text-xs max-h-48 overflow-y-auto">
              {log.map((l, i) => (
                <div key={i} className="flex gap-3">
                  <span className="text-gray-400 flex-shrink-0">{l.time}</span>
                  <span className={l.status === "ok" ? "text-green-700" : l.status === "err" ? "text-red-600" : "text-yellow-600"}>{l.msg}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
