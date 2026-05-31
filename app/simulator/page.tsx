"use client";
import { useState, useEffect, useRef } from "react";
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
  const [outboundIp, setOutboundIp] = useState<string | null>(null);
  const [log, setLog] = useState<{time: string; msg: string; status: string; detail?: string}[]>([]);
  const [timerValue, setTimerValue] = useState("30");
  const [timerUnit, setTimerUnit] = useState("sec");
  const [timerRunning, setTimerRunning] = useState<"long"|"short"|null>(null);
  const [timerRemaining, setTimerRemaining] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const [ipWarning, setIpWarning] = useState<string | null>(null);

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
      .then(data => {
        if (data.price) { setLivePrice(data.price); setPrice(String(data.price)); }
        setLoadingPrice(false);
      })
      .catch(() => setLoadingPrice(false));
  }

  useEffect(() => {
    const sym = customSymbol.trim() || symbol;
    fetchLivePrice(sym);
  }, [symbol, customSymbol]);

  const activeSymbol = customSymbol.trim() || symbol;
  const webhookUrl = `/api/v1/webhook/${activeSymbol}`;

  function addLog(msg: string, status: string, detail?: string) {
    const time = new Date().toTimeString().slice(0, 8);
    setLog(prev => [{ time, msg, status, detail }, ...prev].slice(0, 30));
  }

  function getTimerSeconds() {
    const val = parseInt(timerValue) || 30;
    if (timerUnit === "min") return val * 60;
    if (timerUnit === "hr") return val * 3600;
    return val;
  }

  async function fireSignal(side: string, trade: string): Promise<boolean> {
    addLog(`→ ${trade} ${side.toUpperCase()} ${activeSymbol} @ ${price}`, "pending");
    setIpWarning(null);
    try {
      const res = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ side, trade, price, trigger_time: new Date().toISOString() }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        const summary = data.summary ?? [];
        const failed = summary.filter((s: any) => s.value?.success === false);
        if (failed.length > 0) {
          const errData = failed[0].value?.error?.error ?? failed[0].value?.error;
          const code = errData?.code ?? "unknown_error";
          const clientIp = errData?.context?.client_ip;
          if (code === "ip_not_whitelisted_for_api_key") {
            const msg = `⚠️ IP not whitelisted: ${clientIp}`;
            setIpWarning(clientIp ?? "unknown");
            addLog(`✗ ${trade} ${side.toUpperCase()} FAILED — ${msg}`, "err", `Add ${clientIp} to Delta API Key whitelist`);
            toast.error(`IP not whitelisted: ${clientIp}`);
          } else {
            addLog(`✗ Order failed: ${code}`, "err", JSON.stringify(errData));
            toast.error(`Order failed: ${code}`);
          }
          return false;
        }
        addLog(`✓ ${trade} ${side.toUpperCase()} ${activeSymbol} — ${data.processed} config(s) filled`, "ok");
        toast.success(`${trade} signal sent!`);
        return true;
      } else {
        addLog(`✗ ${data.error || JSON.stringify(data)}`, "err");
        toast.error(data.error || "Signal failed");
        return false;
      }
    } catch (e: any) {
      addLog(`✗ Network error: ${e.message}`, "err");
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
        toast.info(`Timer expired — exit ${direction} fired`);
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

        {/* Header + IP */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[#1E3A5F]">Signal Simulator</h1>
            <p className="text-sm text-gray-500 mt-1">Fire TradingView-style webhook signals to test your bridge</p>
          </div>
          {outboundIp && (
            <div className={`rounded-xl px-4 py-2 text-right border ${ipWarning ? "bg-red-50 border-red-300" : "bg-amber-50 border-amber-200"}`}>
              <p className={`text-xs font-medium uppercase tracking-wide ${ipWarning ? "text-red-600" : "text-amber-600"}`}>
                {ipWarning ? "⚠️ IP Not Whitelisted!" : "Server Outbound IP"}
              </p>
              <p className={`font-mono font-bold text-sm ${ipWarning ? "text-red-800" : "text-amber-800"}`}>{outboundIp}</p>
              <p className={`text-xs mt-0.5 ${ipWarning ? "text-red-500" : "text-amber-500"}`}>
                {ipWarning ? "Add to Delta API Key whitelist!" : "Whitelist in Delta API Keys"}
              </p>
            </div>
          )}
        </div>

        {/* IP Warning Banner */}
        {ipWarning && (
          <div className="bg-red-50 border border-red-300 rounded-xl px-4 py-3 flex items-start gap-3">
            <span className="text-2xl">🚫</span>
            <div>
              <p className="font-semibold text-red-700 text-sm">Trade blocked — IP not whitelisted</p>
              <p className="text-red-600 text-xs mt-1">
                Go to Delta Exchange → Settings → API Keys → Edit → Add <strong className="font-mono">{ipWarning}</strong> to Whitelisted IPs
              </p>
            </div>
            <button onClick={() => setIpWarning(null)} className="ml-auto text-red-400 hover:text-red-600 text-lg">×</button>
          </div>
        )}

        {/* Config */}
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
          <div className="col-span-2">
            <label className="text-xs text-gray-500 uppercase tracking-wide block mb-1">Webhook URL</label>
            <div className="border rounded-xl px-3 py-2 text-xs font-mono text-gray-500 bg-gray-50">{webhookUrl}</div>
          </div>
        </div>

        {/* Signal Buttons - Long row then Short row */}
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

        {/* Timer-based trade */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border space-y-3">
          <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold">Timer-Based Trade (Entry → Auto Exit)</p>
          <div className="flex gap-3 items-center">
            <label className="text-sm text-gray-600 flex-shrink-0">Exit after:</label>
            <input type="number" value={timerValue} onChange={e => setTimerValue(e.target.value)}
              className="w-24 border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]"
              min="1" disabled={!!timerRunning} />
            <select value={timerUnit} onChange={e => setTimerUnit(e.target.value)}
              className="border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]"
              disabled={!!timerRunning}>
              <option value="sec">Seconds</option>
              <option value="min">Minutes</option>
              <option value="hr">Hours</option>
            </select>
            {timerRunning && (
              <span className="text-sm font-mono font-bold text-blue-700 bg-blue-50 px-3 py-1 rounded-xl">
                ⏱ {formatRemaining(timerRemaining)}
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => startTimer("long")}
              className={`${btnBase} ${timerRunning === "long" ? "border-orange-500 text-orange-700 bg-orange-50" : "border-green-500 text-green-700 hover:bg-green-50"}`}>
              {timerRunning === "long" ? `⏱ Cancel Long (${formatRemaining(timerRemaining)})` : "📈 Long + Auto Exit"}
            </button>
            <button onClick={() => startTimer("short")}
              className={`${btnBase} ${timerRunning === "short" ? "border-orange-500 text-orange-700 bg-orange-50" : "border-red-500 text-red-700 hover:bg-red-50"}`}>
              {timerRunning === "short" ? `⏱ Cancel Short (${formatRemaining(timerRemaining)})` : "📉 Short + Auto Exit"}
            </button>
          </div>
        </div>

        {/* Activity Log */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border">
          <div className="flex justify-between items-center mb-3">
            <p className="text-xs text-gray-400 uppercase tracking-wide">Activity log</p>
            <button onClick={() => setLog([])} className="text-xs text-gray-400 hover:text-red-500">Clear</button>
          </div>
          {log.length === 0 ? <p className="text-sm text-gray-400">Signals you fire will appear here...</p> : (
            <div className="space-y-1.5 font-mono text-xs max-h-56 overflow-y-auto">
              {log.map((l, i) => (
                <div key={i} className={`rounded-lg px-2 py-1 ${l.status === "err" ? "bg-red-50" : l.status === "ok" ? "bg-green-50" : "bg-yellow-50"}`}>
                  <div className="flex gap-3">
                    <span className="text-gray-400 flex-shrink-0">{l.time}</span>
                    <span className={l.status === "ok" ? "text-green-700" : l.status === "err" ? "text-red-600 font-semibold" : "text-yellow-600"}>{l.msg}</span>
                  </div>
                  {l.detail && <p className="text-red-500 text-xs ml-14 mt-0.5">{l.detail}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
