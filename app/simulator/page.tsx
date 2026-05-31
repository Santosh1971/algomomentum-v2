"use client";
import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import Navbar from "@/components/Navbar";

interface Script { symbol: string; }
interface LogEntry { time: string; msg: string; status: string; detail?: string; }

export default function SimulatorPage() {
  const [symbols, setSymbols] = useState<Script[]>([]);
  const [symbol, setSymbol] = useState("");
  const [customSymbol, setCustomSymbol] = useState("");
  const [price, setPrice] = useState("");
  const [livePrice, setLivePrice] = useState<number | null>(null);
  const [loadingPrice, setLoadingPrice] = useState(false);
  const [outboundIp, setOutboundIp] = useState<string | null>(null);
  const [ipWarning, setIpWarning] = useState<string | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [timerValue, setTimerValue] = useState("30");
  const [timerUnit, setTimerUnit] = useState("sec");
  const [timerRunning, setTimerRunning] = useState<"long"|"short"|null>(null);
  const [timerRemaining, setTimerRemaining] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    fetch("/api/v1/script").then(r => r.json()).then(data => {
      if (Array.isArray(data) && data.length > 0) { setSymbols(data); setSymbol(data[0].symbol); }
    });
    fetch("/api/v1/myip").then(r => r.json()).then(data => { if (data.ip) setOutboundIp(data.ip); });
  }, []);

  function fetchLivePrice(sym: string) {
    if (!sym) return;
    setLoadingPrice(true);
    setLivePrice(null);
    fetch(`/api/v1/ticker?symbol=${sym}`)
      .then(r => r.json())
      .then(data => { if (data.price) { setLivePrice(data.price); setPrice(String(data.price)); } setLoadingPrice(false); })
      .catch(() => setLoadingPrice(false));
  }

  useEffect(() => { fetchLivePrice(customSymbol.trim() || symbol); }, [symbol, customSymbol]);

  const activeSymbol = customSymbol.trim() || symbol;

  function addLog(entry: LogEntry) {
    setLog(prev => [entry, ...prev].slice(0, 50));
  }

  function getTimerSeconds() {
    const val = parseInt(timerValue) || 30;
    if (timerUnit === "min") return val * 60;
    if (timerUnit === "hr") return val * 3600;
    return val;
  }

  async function fireSignal(side: string, trade: string): Promise<boolean> {
    const time = new Date().toTimeString().slice(0, 8);
    addLog({ time, msg: `→ ${trade} ${side.toUpperCase()} ${activeSymbol} @ ${price}`, status: "pending" });
    setIpWarning(null);
    try {
      const res = await fetch(`/api/v1/webhook/${activeSymbol}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ side, trade, price, trigger_time: new Date().toISOString() }),
      });
      const data = await res.json();

      if (!res.ok) {
        addLog({ time, msg: `✗ Server error: ${data.error || res.status}`, status: "err" });
        toast.error("Server error");
        return false;
      }

      if (!data.success) {
        addLog({ time, msg: `✗ ${data.error || "No active configs"}`, status: "err" });
        toast.error(data.error || "No active configs");
        return false;
      }

      // Check individual order results in summary
      const summary: any[] = data.summary ?? [];
      let allOk = true;

      for (const s of summary) {
        if (s.status === "rejected") {
          addLog({ time, msg: `✗ Order FAILED for config ${s.configId?.slice(-6)}`, status: "err", detail: s.reason });
          toast.error("Order failed — check log");
          allOk = false;
          continue;
        }
        const val = s.value;
        if (val?.success === false) {
          const errCode = val?.error?.error?.code ?? val?.error?.code ?? "unknown";
          const clientIp = val?.error?.error?.context?.client_ip ?? val?.error?.context?.client_ip;
          if (errCode === "ip_not_whitelisted_for_api_key") {
            setIpWarning(clientIp ?? outboundIp);
            addLog({ time, msg: `🚫 IP NOT WHITELISTED — ${clientIp}`, status: "err", detail: `Go to Delta → API Keys → add ${clientIp} to whitelist` });
            toast.error(`IP blocked: ${clientIp}`);
          } else {
            addLog({ time, msg: `✗ Order rejected: ${errCode}`, status: "err", detail: JSON.stringify(val?.error) });
            toast.error(`Order rejected: ${errCode}`);
          }
          allOk = false;
        } else if (val?.result) {
          addLog({ time, msg: `✅ ${trade} ${side.toUpperCase()} ${activeSymbol} — ORDER PLACED on Delta`, status: "ok", detail: `Order ID: ${val.result.id ?? val.result.client_order_id}` });
          toast.success("Order placed on Delta!");
        }
      }

      if (summary.length === 0) {
        addLog({ time, msg: `✅ ${trade} ${side.toUpperCase()} ${activeSymbol} — processed ${data.processed} config(s)`, status: "ok" });
      }

      return allOk;
    } catch (e: any) {
      addLog({ time, msg: `✗ Network error: ${e.message}`, status: "err" });
      toast.error("Network error");
      return false;
    }
  }

  function startTimer(direction: "long"|"short") {
    if (timerRunning) { stopTimer(); return; }
    const secs = getTimerSeconds();
    setTimerRemaining(secs);
    setTimerRunning(direction);
    const side = direction === "long" ? "buy" : "sell";
    fireSignal(side, "ENTRY");
    let remaining = secs;
    timerRef.current = setInterval(() => {
      remaining -= 1;
      setTimerRemaining(remaining);
      if (remaining <= 0) {
        clearInterval(timerRef.current!);
        setTimerRunning(null);
        const exitSide = direction === "long" ? "sell" : "buy";
        fireSignal(exitSide, "EXIT");
      }
    }, 1000);
  }

  function stopTimer() {
    if (timerRef.current) clearInterval(timerRef.current);
    setTimerRunning(null);
    setTimerRemaining(0);
  }

  function formatRemaining(secs: number) {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    if (h > 0) return `${h}h ${m}m ${s}s`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  }

  const btnBase = "py-3 px-4 rounded-xl border-2 font-semibold text-sm transition-all active:scale-95 cursor-pointer";

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-3xl mx-auto p-6 space-y-5">

        {/* Header + IP Badge */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[#1E3A5F]">Signal Simulator</h1>
            <p className="text-sm text-gray-500 mt-1">Fire TradingView-style webhook signals to test your bridge</p>
          </div>
          {outboundIp && (
            <div className={`rounded-xl px-4 py-2 text-right border cursor-default ${ipWarning ? "bg-red-50 border-red-400 animate-pulse" : "bg-amber-50 border-amber-200"}`}>
              <p className={`text-xs font-medium uppercase tracking-wide ${ipWarning ? "text-red-600" : "text-amber-600"}`}>
                {ipWarning ? "⚠️ Whitelist This IP!" : "Server Outbound IP"}
              </p>
              <p className={`font-mono font-bold text-sm ${ipWarning ? "text-red-800" : "text-amber-800"}`}>{outboundIp}</p>
              <p className={`text-xs mt-0.5 ${ipWarning ? "text-red-500 font-semibold" : "text-amber-500"}`}>
                {ipWarning ? "Delta is blocking orders!" : "Add to Delta API Key whitelist"}
              </p>
            </div>
          )}
        </div>

        {/* IP Block Warning Banner */}
        {ipWarning && (
          <div className="bg-red-50 border-2 border-red-400 rounded-xl px-4 py-3 flex items-start gap-3">
            <span className="text-2xl mt-0.5">🚫</span>
            <div className="flex-1">
              <p className="font-bold text-red-700 text-sm">Orders blocked — IP not whitelisted on Delta</p>
              <p className="text-red-600 text-sm mt-1">
                Delta Exchange → Settings → API Keys → Edit your key → add <code className="bg-red-100 px-1.5 py-0.5 rounded font-mono font-bold">{ipWarning}</code> to Whitelisted IPs
              </p>
            </div>
            <button onClick={() => setIpWarning(null)} className="text-red-400 hover:text-red-600 text-xl font-bold">×</button>
          </div>
        )}

        {/* Symbol + Price Config */}
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
              Live Price {loadingPrice ? "⏳ fetching..." : livePrice ? `✅ $${livePrice}` : "❌ unavailable"}
            </label>
            <div className="flex gap-2">
              <input type="number" value={price} onChange={e => setPrice(e.target.value)}
                className="flex-1 border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]" />
              <button onClick={() => fetchLivePrice(customSymbol.trim() || symbol)}
                className="px-4 border rounded-xl text-xs text-blue-600 hover:bg-blue-50 border-blue-200 font-medium">
                🔄 Refresh
              </button>
            </div>
          </div>
        </div>

        {/* Manual Signals */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border space-y-3">
          <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold">Manual Signals</p>
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => fireSignal("buy", "ENTRY")} className={`${btnBase} border-green-500 text-green-700 hover:bg-green-50`}>📈 Long Entry</button>
            <button onClick={() => fireSignal("sell", "EXIT")} className={`${btnBase} border-green-300 text-green-600 hover:bg-green-50`}>⬜ Exit Long</button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => fireSignal("sell", "ENTRY")} className={`${btnBase} border-red-500 text-red-700 hover:bg-red-50`}>📉 Short Entry</button>
            <button onClick={() => fireSignal("buy", "EXIT")} className={`${btnBase} border-red-300 text-red-600 hover:bg-red-50`}>⬜ Exit Short</button>
          </div>
        </div>

        {/* Timer Trade */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border space-y-3">
          <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold">Timer Trade — Entry → Auto Exit</p>
          <div className="flex gap-3 items-center flex-wrap">
            <label className="text-sm text-gray-600 flex-shrink-0">Exit after:</label>
            <input type="number" value={timerValue} onChange={e => setTimerValue(e.target.value)}
              className="w-24 border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]"
              min="1" disabled={!!timerRunning} />
            <select value={timerUnit} onChange={e => setTimerUnit(e.target.value)}
              className="border rounded-xl px-3 py-2 text-sm focus:outline-none" disabled={!!timerRunning}>
              <option value="sec">Seconds</option>
              <option value="min">Minutes</option>
              <option value="hr">Hours</option>
            </select>
            {timerRunning && (
              <span className="text-sm font-mono font-bold text-blue-700 bg-blue-50 px-3 py-1.5 rounded-xl border border-blue-200">
                ⏱ {formatRemaining(timerRemaining)} remaining
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => startTimer("long")}
              className={`${btnBase} ${timerRunning === "long" ? "border-orange-500 text-orange-700 bg-orange-50" : "border-green-500 text-green-700 hover:bg-green-50"}`}>
              {timerRunning === "long" ? `⏱ Cancel (${formatRemaining(timerRemaining)})` : "📈 Long + Auto Exit"}
            </button>
            <button onClick={() => startTimer("short")}
              className={`${btnBase} ${timerRunning === "short" ? "border-orange-500 text-orange-700 bg-orange-50" : "border-red-500 text-red-700 hover:bg-red-50"}`}>
              {timerRunning === "short" ? `⏱ Cancel (${formatRemaining(timerRemaining)})` : "📉 Short + Auto Exit"}
            </button>
          </div>
        </div>

        {/* Activity Log */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border">
          <div className="flex justify-between items-center mb-3">
            <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold">Activity Log</p>
            <button onClick={() => setLog([])} className="text-xs text-gray-400 hover:text-red-500">Clear</button>
          </div>
          {log.length === 0 ? <p className="text-sm text-gray-400">Signals you fire will appear here...</p> : (
            <div className="space-y-1.5 font-mono text-xs max-h-64 overflow-y-auto">
              {log.map((l, i) => (
                <div key={i} className={`rounded-lg px-3 py-2 border ${
                  l.status === "err" ? "bg-red-50 border-red-200" :
                  l.status === "ok" ? "bg-green-50 border-green-200" :
                  "bg-yellow-50 border-yellow-200"}`}>
                  <div className="flex gap-2 items-start">
                    <span className="text-gray-400 flex-shrink-0">{l.time}</span>
                    <span className={`font-semibold ${l.status === "ok" ? "text-green-700" : l.status === "err" ? "text-red-700" : "text-yellow-700"}`}>
                      {l.msg}
                    </span>
                  </div>
                  {l.detail && <p className={`text-xs mt-1 ml-14 ${l.status === "err" ? "text-red-500" : "text-gray-500"}`}>{l.detail}</p>}
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
