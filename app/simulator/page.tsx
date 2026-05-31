"use client";
import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import Navbar from "@/components/Navbar";

interface Script { symbol: string; }
interface LogEntry { time: string; msg: string; status: string; detail?: string; }

function decimals(price: number): number {
  if (!price || isNaN(price)) return 2;
  if (price >= 10000) return 0;
  if (price >= 1000) return 1;
  if (price >= 100) return 2;
  if (price >= 1) return 3;
  if (price >= 0.1) return 4;
  if (price >= 0.01) return 5;
  return 6;
}

function fmt(n: number): string {
  if (isNaN(n) || n === null || n === undefined) return "";
  return n.toFixed(decimals(n));
}

export default function SimulatorPage() {
  const [symbols, setSymbols] = useState<Script[]>([]);
  const [symbol, setSymbol] = useState("");
  const [customSymbol, setCustomSymbol] = useState("");
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
  const [side, setSide] = useState<"buy"|"sell">("buy");
  const [entry, setEntry] = useState("");
  const [sl, setSl] = useState("");
  const [tp, setTp] = useState("");
  const [resolution, setResolution] = useState("15m");
  const [loadingChart, setLoadingChart] = useState(false);
  const [chartReady, setChartReady] = useState(false);
  const [dragMode, setDragMode] = useState(false);
  const [activeDrag, setActiveDrag] = useState<"entry"|"sl"|"tp"|null>(null);

  const chartRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<any>(null);
  const candleSeriesRef = useRef<any>(null);
  const entryLineRef = useRef<any>(null);
  const slLineRef = useRef<any>(null);
  const tpLineRef = useRef<any>(null);
  const entryRef = useRef(entry);
  const slRef = useRef(sl);
  const tpRef = useRef(tp);
  const priceDec = useRef(5);

  useEffect(() => { entryRef.current = entry; }, [entry]);
  useEffect(() => { slRef.current = sl; }, [sl]);
  useEffect(() => { tpRef.current = tp; }, [tp]);

  const entryN = parseFloat(entry);
  const slN = parseFloat(sl);
  const tpN = parseFloat(tp);
  const risk = !isNaN(entryN) && !isNaN(slN) && sl ? Math.abs(entryN - slN) : null;
  const reward = !isNaN(entryN) && !isNaN(tpN) && tp ? Math.abs(tpN - entryN) : null;
  const rr = risk && reward && risk > 0 ? (reward / risk).toFixed(2) : null;
  const rrColor = rr ? (parseFloat(rr) >= 2 ? "text-green-600" : parseFloat(rr) >= 1 ? "text-yellow-600" : "text-red-600") : "";

  useEffect(() => {
    fetch("/api/v1/script").then(r => r.json()).then(data => {
      if (Array.isArray(data) && data.length > 0) { setSymbols(data); setSymbol(data[0].symbol); }
    });
    fetch("/api/v1/myip").then(r => r.json()).then(d => { if (d.ip) setOutboundIp(d.ip); });
    if ((window as any).LightweightCharts) { setTimeout(initChart, 100); return; }
    const s = document.createElement("script");
    s.src = "https://unpkg.com/lightweight-charts@4.1.3/dist/lightweight-charts.standalone.production.js";
    s.onload = () => setTimeout(initChart, 100);
    document.head.appendChild(s);
  }, []);

  function initChart() {
    if (!chartRef.current || chartInstanceRef.current) return;
    const LW = (window as any).LightweightCharts;
    if (!LW) return;
    const chart = LW.createChart(chartRef.current, {
      width: chartRef.current.clientWidth, height: 400,
      layout: { background: { color: "#ffffff" }, textColor: "#1E3A5F" },
      grid: { vertLines: { color: "#f3f4f6" }, horzLines: { color: "#f3f4f6" } },
      timeScale: { timeVisible: true, secondsVisible: false },
      crosshair: { mode: 1 },
      handleScroll: true,
      handleScale: true,
    });
    chartInstanceRef.current = chart;
    new ResizeObserver(() => {
      if (chartRef.current) chart.applyOptions({ width: chartRef.current.clientWidth });
    }).observe(chartRef.current);
    setChartReady(true);
  }

  function createCandleSeries(dec: number) {
    if (!chartInstanceRef.current) return;
    if (candleSeriesRef.current) {
      try { chartInstanceRef.current.removeSeries(candleSeriesRef.current); } catch {}
    }
    const minMove = Math.pow(10, -dec);
    candleSeriesRef.current = chartInstanceRef.current.addCandlestickSeries({
      upColor: "#22c55e", downColor: "#ef4444",
      borderUpColor: "#22c55e", borderDownColor: "#ef4444",
      wickUpColor: "#22c55e", wickDownColor: "#ef4444",
      priceFormat: { type: "price", precision: dec, minMove },
    });
  }

  useEffect(() => {
    const sym = customSymbol.trim() || symbol;
    if (!sym) return;
    fetchPrice(sym);
    if (chartReady) loadCandles(sym);
  }, [symbol, customSymbol, chartReady, resolution]);

  useEffect(() => {
    if (!entry || isNaN(entryN)) return;
    const dec = decimals(entryN);
    priceDec.current = dec;
    if (side === "buy") {
      setSl((entryN * 0.98).toFixed(dec));
      setTp((entryN * 1.04).toFixed(dec));
    } else {
      setSl((entryN * 1.02).toFixed(dec));
      setTp((entryN * 0.96).toFixed(dec));
    }
  }, [entry, side]);

  useEffect(() => { if (chartReady) updatePriceLines(); }, [entry, sl, tp, chartReady]);

  // Toggle drag mode — disable/enable chart scroll
  useEffect(() => {
    if (!chartInstanceRef.current) return;
    chartInstanceRef.current.applyOptions({
      handleScroll: !dragMode,
      handleScale: !dragMode,
    });
  }, [dragMode]);

  function updatePriceLines() {
    const series = candleSeriesRef.current;
    if (!series) return;
    if (entryLineRef.current) { try { series.removePriceLine(entryLineRef.current); } catch {} entryLineRef.current = null; }
    if (slLineRef.current) { try { series.removePriceLine(slLineRef.current); } catch {} slLineRef.current = null; }
    if (tpLineRef.current) { try { series.removePriceLine(tpLineRef.current); } catch {} tpLineRef.current = null; }
    const dec = priceDec.current;
    const minMove = Math.pow(10, -dec);
    if (!isNaN(entryN) && entry) {
      entryLineRef.current = series.createPriceLine({ price: entryN, color: "#3b82f6", lineWidth: 2, lineStyle: 1, axisLabelVisible: true, title: `🎯 Entry ${fmt(entryN)}` });
    }
    if (!isNaN(slN) && sl) {
      slLineRef.current = series.createPriceLine({ price: slN, color: "#ef4444", lineWidth: 2, lineStyle: 1, axisLabelVisible: true, title: `🛑 SL ${fmt(slN)}` });
    }
    if (!isNaN(tpN) && tp) {
      tpLineRef.current = series.createPriceLine({ price: tpN, color: "#22c55e", lineWidth: 2, lineStyle: 1, axisLabelVisible: true, title: `✅ TP ${fmt(tpN)}` });
    }
  }

  // Drag handlers on overlay
  function handleOverlayMouseDown(e: React.MouseEvent<HTMLDivElement>) {
    if (!dragMode || !candleSeriesRef.current) return;
    const rect = overlayRef.current!.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const price = candleSeriesRef.current.coordinateToPrice(y);
    if (price === null) return;
    const eN = parseFloat(entryRef.current);
    const sN = parseFloat(slRef.current);
    const tN = parseFloat(tpRef.current);
    const threshold = Math.abs(price) * 0.008;
    const dists: [number, "entry"|"sl"|"tp"][] = [];
    if (!isNaN(eN) && entryRef.current) dists.push([Math.abs(price - eN), "entry"]);
    if (!isNaN(sN) && slRef.current) dists.push([Math.abs(price - sN), "sl"]);
    if (!isNaN(tN) && tpRef.current) dists.push([Math.abs(price - tN), "tp"]);
    if (!dists.length) return;
    dists.sort((a, b) => a[0] - b[0]);
    if (dists[0][0] < threshold) setActiveDrag(dists[0][1]);
  }

  function handleOverlayMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    if (!dragMode || !candleSeriesRef.current) return;
    const rect = overlayRef.current!.getBoundingClientRect();
    const price = candleSeriesRef.current.coordinateToPrice(e.clientY - rect.top);
    if (price === null) return;
    // Show cursor
    if (!activeDrag) {
      const eN = parseFloat(entryRef.current);
      const sN = parseFloat(slRef.current);
      const tN = parseFloat(tpRef.current);
      const threshold = Math.abs(price) * 0.008;
      const near = [eN, sN, tN].filter(n => !isNaN(n)).some(n => Math.abs(price - n) < threshold);
      overlayRef.current!.style.cursor = near ? "ns-resize" : "crosshair";
      return;
    }
    const p = fmt(price);
    if (activeDrag === "entry") setEntry(p);
    else if (activeDrag === "sl") setSl(p);
    else if (activeDrag === "tp") setTp(p);
  }

  function handleOverlayMouseUp() { setActiveDrag(null); }

  function fetchPrice(sym: string) {
    setLoadingPrice(true);
    fetch(`/api/v1/ticker?symbol=${sym}`).then(r => r.json()).then(d => {
      if (d.price) {
        setLivePrice(d.price);
        priceDec.current = decimals(d.price);
        setEntry(fmt(d.price));
        if (chartReady) createCandleSeries(decimals(d.price));
      }
      setLoadingPrice(false);
    }).catch(() => setLoadingPrice(false));
  }

  async function loadCandles(sym: string) {
    setLoadingChart(true);
    try {
      const res = await fetch(`/api/v1/candles?symbol=${sym}&resolution=${resolution}&limit=120`);
      const data = await res.json();
      if (candleSeriesRef.current && Array.isArray(data.candles) && data.candles.length > 0) {
        candleSeriesRef.current.setData(data.candles);
        chartInstanceRef.current?.timeScale().fitContent();
      }
    } catch (e) { console.error(e); }
    setLoadingChart(false);
  }

  const activeSymbol = customSymbol.trim() || symbol;
  function addLog(e: LogEntry) { setLog(prev => [e, ...prev].slice(0, 50)); }

  async function fireSignal(tradeSide: string, trade: string): Promise<boolean> {
    const time = new Date().toTimeString().slice(0, 8);
    addLog({ time, msg: `→ ${trade} ${tradeSide.toUpperCase()} ${activeSymbol} @ ${entry || fmt(livePrice!)}`, status: "pending" });
    setIpWarning(null);
    try {
      const res = await fetch(`/api/v1/webhook/${activeSymbol}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ side: tradeSide, trade, price: entry || livePrice, trigger_time: new Date().toISOString() }),
      });
      const data = await res.json();
      if (!res.ok) { addLog({ time, msg: `✗ Server error: ${data.error || res.status}`, status: "err" }); return false; }
      if (!data.success) { addLog({ time, msg: `✗ ${data.error || "No active configs"}`, status: "err" }); return false; }
      const summary: any[] = data.summary ?? [];
      let allOk = true;
      for (const s of summary) {
        if (s.status === "rejected") {
          let reason = s.reason || "Unknown";
          if (reason.includes("401")) reason = "Authentication failed — IP may not be whitelisted";
          addLog({ time, msg: `✗ Order FAILED`, status: "err", detail: reason }); allOk = false; continue;
        }
        const val = s.value;
        if (val?.success === false) {
          const errCode = val?.error?.error?.code ?? val?.error?.code ?? "unknown";
          const clientIp = val?.error?.error?.context?.client_ip ?? val?.error?.context?.client_ip;
          if (errCode === "ip_not_whitelisted_for_api_key") {
            setIpWarning(clientIp ?? outboundIp);
            addLog({ time, msg: `🚫 IP NOT WHITELISTED — ${clientIp}`, status: "err", detail: `Delta → API Keys → add ${clientIp}` });
          } else { addLog({ time, msg: `✗ Order rejected: ${errCode}`, status: "err" }); }
          allOk = false;
        } else if (val?.result) {
          addLog({ time, msg: `✅ ${trade} ${tradeSide.toUpperCase()} ${activeSymbol} — ORDER PLACED`, status: "ok", detail: `Order ID: ${val.result.id ?? "placed"}` });
          toast.success("Order placed on Delta!");
        } else if (val?.message === "No open position") {
          addLog({ time, msg: `⚠️ No open position to exit`, status: "err" });
        }
      }
      if (summary.length === 0) addLog({ time, msg: `✅ ${trade} ${tradeSide.toUpperCase()} ${activeSymbol} — processed`, status: "ok" });
      return allOk;
    } catch (e: any) { addLog({ time, msg: `✗ Network error: ${e.message}`, status: "err" }); return false; }
  }

  function getTimerSeconds() {
    const val = parseInt(timerValue) || 30;
    if (timerUnit === "min") return val * 60;
    if (timerUnit === "hr") return val * 3600;
    return val;
  }

  function startTimer(direction: "long"|"short") {
    if (timerRunning) { stopTimer(); return; }
    const secs = getTimerSeconds();
    setTimerRemaining(secs); setTimerRunning(direction);
    fireSignal(direction === "long" ? "buy" : "sell", "ENTRY");
    let remaining = secs;
    timerRef.current = setInterval(() => {
      remaining -= 1; setTimerRemaining(remaining);
      if (remaining <= 0) { clearInterval(timerRef.current!); setTimerRunning(null); fireSignal(direction === "long" ? "sell" : "buy", "EXIT"); }
    }, 1000);
  }

  function stopTimer() { if (timerRef.current) clearInterval(timerRef.current); setTimerRunning(null); setTimerRemaining(0); }

  function formatRemaining(secs: number) {
    const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60), s = secs % 60;
    if (h > 0) return `${h}h ${m}m ${s}s`; if (m > 0) return `${m}m ${s}s`; return `${s}s`;
  }

  const inp = "w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]";
  const btnBase = "py-3 px-4 rounded-xl border-2 font-semibold text-sm transition-all active:scale-95 cursor-pointer";

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-7xl mx-auto p-6 space-y-5">

        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[#1E3A5F]">Signal Simulator & Trade Planner</h1>
            <p className="text-sm text-gray-500 mt-1">Plan trades with live chart · fire signals to your bridge</p>
          </div>
          {outboundIp && (
            <div className={`rounded-xl px-4 py-2 text-right border flex-shrink-0 ${ipWarning ? "bg-red-50 border-red-400 animate-pulse" : "bg-amber-50 border-amber-200"}`}>
              <p className={`text-xs font-medium uppercase tracking-wide ${ipWarning ? "text-red-600" : "text-amber-600"}`}>{ipWarning ? "⚠️ Whitelist This IP!" : "Server IP"}</p>
              <p className={`font-mono font-bold text-sm ${ipWarning ? "text-red-800" : "text-amber-800"}`}>{outboundIp}</p>
              <p className={`text-xs ${ipWarning ? "text-red-500 font-semibold" : "text-amber-500"}`}>{ipWarning ? "Delta blocking orders!" : "Whitelist in Delta API Keys"}</p>
            </div>
          )}
        </div>

        {ipWarning && (
          <div className="bg-red-50 border-2 border-red-400 rounded-xl px-4 py-3 flex items-start gap-3">
            <span className="text-2xl">🚫</span>
            <div className="flex-1">
              <p className="font-bold text-red-700 text-sm">Orders blocked — IP not whitelisted on Delta</p>
              <p className="text-red-600 text-sm mt-1">Delta Exchange → Settings → API Keys → Edit → add <code className="bg-red-100 px-1.5 py-0.5 rounded font-mono font-bold">{ipWarning}</code></p>
            </div>
            <button onClick={() => setIpWarning(null)} className="text-red-400 hover:text-red-600 text-xl font-bold">×</button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
          {/* LEFT */}
          <div className="space-y-4">
            <div className="bg-white rounded-2xl p-4 shadow-sm border space-y-3">
              <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold">Symbol</p>
              <select value={symbol} onChange={e => setSymbol(e.target.value)} className={inp}>
                {symbols.map(s => <option key={s.symbol} value={s.symbol}>{s.symbol}</option>)}
              </select>
              <input value={customSymbol} onChange={e => setCustomSymbol(e.target.value)} placeholder="Custom e.g. PIUSD" className={inp} />
              {livePrice && (
                <div className="bg-blue-50 rounded-xl px-3 py-2 text-center">
                  <p className="text-xs text-blue-500">{loadingPrice ? "Fetching..." : "Live Price"}</p>
                  <p className="text-2xl font-bold text-blue-700 font-mono">${fmt(livePrice)}</p>
                </div>
              )}
              <div className="flex gap-2">
                <button onClick={() => fetchPrice(customSymbol.trim() || symbol)}
                  className="flex-1 py-2 border rounded-xl text-xs text-blue-600 hover:bg-blue-50 border-blue-200 font-medium">🔄 Refresh</button>
                <select value={resolution} onChange={e => setResolution(e.target.value)} className="border rounded-xl px-2 py-2 text-xs focus:outline-none">
                  {["1m","5m","15m","30m","1h","4h","1d"].map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
            </div>

            <div className="bg-white rounded-2xl p-4 shadow-sm border space-y-2">
              <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold">Direction</p>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setSide("buy")} className={`py-2 rounded-xl border-2 text-sm font-semibold transition ${side === "buy" ? "bg-green-500 border-green-500 text-white" : "border-green-300 text-green-700 hover:bg-green-50"}`}>📈 Long</button>
                <button onClick={() => setSide("sell")} className={`py-2 rounded-xl border-2 text-sm font-semibold transition ${side === "sell" ? "bg-red-500 border-red-500 text-white" : "border-red-300 text-red-700 hover:bg-red-50"}`}>📉 Short</button>
              </div>
            </div>

            <div className="bg-white rounded-2xl p-4 shadow-sm border space-y-3">
              <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold">
                Levels <span className="text-gray-300 text-xs font-normal">— auto SL 2% / TP 4%</span>
              </p>
              <div>
                <label className="text-xs text-blue-600 font-semibold block mb-1">🎯 Entry</label>
                <input type="number" value={entry} onChange={e => setEntry(e.target.value)} className={inp} />
              </div>
              <div>
                <label className="text-xs text-red-600 font-semibold block mb-1">🛑 Stop Loss</label>
                <input type="number" value={sl} onChange={e => setSl(e.target.value)} className={inp} />
              </div>
              <div>
                <label className="text-xs text-green-600 font-semibold block mb-1">✅ Take Profit</label>
                <input type="number" value={tp} onChange={e => setTp(e.target.value)} className={inp} />
              </div>
              {rr && (
                <div className={`rounded-xl px-3 py-2 text-center border ${parseFloat(rr) >= 2 ? "bg-green-50 border-green-200" : parseFloat(rr) >= 1 ? "bg-yellow-50 border-yellow-200" : "bg-red-50 border-red-200"}`}>
                  <p className="text-xs text-gray-500">Risk : Reward</p>
                  <p className={`text-2xl font-bold ${rrColor}`}>1 : {rr}</p>
                  <div className="flex justify-around mt-1 text-xs">
                    <span>Risk: <strong className="text-red-600">${fmt(risk!)}</strong></span>
                    <span>Target: <strong className="text-green-600">${fmt(reward!)}</strong></span>
                  </div>
                </div>
              )}
              {/* GO BUTTON */}
              <button
                onClick={() => fireSignal(side, "ENTRY")}
                className={`w-full py-4 rounded-xl font-bold text-lg transition-all active:scale-95 shadow-md ${
                  side === "buy"
                    ? "bg-green-500 hover:bg-green-600 text-white border-2 border-green-600"
                    : "bg-red-500 hover:bg-red-600 text-white border-2 border-red-600"
                }`}>
                🚀 GO — {side === "buy" ? "Enter Long" : "Enter Short"}
                {entry && <span className="block text-xs font-normal opacity-80 mt-0.5">@ {entry} · SL {sl} · TP {tp}</span>}
              </button>
              <button onClick={() => fireSignal(side === "buy" ? "sell" : "buy", "EXIT")}
                className="w-full py-3 rounded-xl border-2 border-gray-400 text-gray-600 font-semibold text-sm hover:bg-gray-50 transition active:scale-95">
                ⬜ Exit Position
              </button>
            </div>

            <div className="bg-white rounded-2xl p-4 shadow-sm border space-y-2">
              <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold">Quick Signals</p>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => fireSignal("buy", "ENTRY")} className={`${btnBase} border-green-500 text-green-700 hover:bg-green-50`}>📈 Long</button>
                <button onClick={() => fireSignal("sell", "EXIT")} className={`${btnBase} border-green-300 text-green-600 hover:bg-green-50`}>⬜ Exit L</button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => fireSignal("sell", "ENTRY")} className={`${btnBase} border-red-500 text-red-700 hover:bg-red-50`}>📉 Short</button>
                <button onClick={() => fireSignal("buy", "EXIT")} className={`${btnBase} border-red-300 text-red-600 hover:bg-red-50`}>⬜ Exit S</button>
              </div>
            </div>

            <div className="bg-white rounded-2xl p-4 shadow-sm border space-y-3">
              <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold">Timer Trade</p>
              <div className="flex gap-2">
                <input type="number" value={timerValue} onChange={e => setTimerValue(e.target.value)}
                  className="w-20 border rounded-xl px-2 py-2 text-sm focus:outline-none" min="1" disabled={!!timerRunning} />
                <select value={timerUnit} onChange={e => setTimerUnit(e.target.value)}
                  className="flex-1 border rounded-xl px-2 py-2 text-sm focus:outline-none" disabled={!!timerRunning}>
                  <option value="sec">Sec</option>
                  <option value="min">Min</option>
                  <option value="hr">Hr</option>
                </select>
              </div>
              {timerRunning && (
                <div className="bg-blue-50 rounded-xl px-3 py-2 text-center border border-blue-200">
                  <p className="text-xs text-blue-500">Auto exit in</p>
                  <p className="font-mono font-bold text-blue-700 text-lg">{formatRemaining(timerRemaining)}</p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => startTimer("long")} className={`${btnBase} ${timerRunning === "long" ? "border-orange-500 text-orange-700 bg-orange-50" : "border-green-500 text-green-700 hover:bg-green-50"}`}>
                  {timerRunning === "long" ? "⏱ Cancel" : "📈 Long+Exit"}
                </button>
                <button onClick={() => startTimer("short")} className={`${btnBase} ${timerRunning === "short" ? "border-orange-500 text-orange-700 bg-orange-50" : "border-red-500 text-red-700 hover:bg-red-50"}`}>
                  {timerRunning === "short" ? "⏱ Cancel" : "📉 Short+Exit"}
                </button>
              </div>
            </div>
          </div>

          {/* RIGHT */}
          <div className="lg:col-span-3 space-y-4">
            <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
              <div className="px-4 py-3 border-b flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <p className="font-semibold text-[#1E3A5F]">{activeSymbol} — {resolution}</p>
                  {loadingChart && <span className="text-xs text-gray-400 animate-pulse">Loading...</span>}
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-3 text-xs">
                    <span className="text-blue-600 font-semibold">— Entry</span>
                    <span className="text-red-500 font-semibold">— SL</span>
                    <span className="text-green-500 font-semibold">— TP</span>
                  </div>
                  <button
                    onClick={() => setDragMode(d => !d)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${dragMode ? "bg-blue-500 text-white border-blue-600" : "bg-gray-100 text-gray-600 border-gray-300 hover:bg-gray-200"}`}>
                    {dragMode ? "✋ Drag ON — click to pan" : "🖱 Drag Levels"}
                  </button>
                </div>
              </div>
              <div className="relative">
                <div ref={chartRef} className="w-full" />
                {/* Overlay for drag — sits on top of chart when drag mode on */}
                <div
                  ref={overlayRef}
                  onMouseDown={handleOverlayMouseDown}
                  onMouseMove={handleOverlayMouseMove}
                  onMouseUp={handleOverlayMouseUp}
                  onMouseLeave={handleOverlayMouseUp}
                  className="absolute inset-0"
                  style={{ cursor: dragMode ? "crosshair" : "default", pointerEvents: dragMode ? "all" : "none" }}
                />
                {dragMode && (
                  <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-blue-500 text-white text-xs px-3 py-1 rounded-full shadow">
                    {activeDrag ? `Dragging ${activeDrag.toUpperCase()} line...` : "Hover near a line and drag"}
                  </div>
                )}
              </div>
            </div>

            <div className="bg-white rounded-2xl p-5 shadow-sm border">
              <div className="flex justify-between items-center mb-3">
                <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold">Activity Log</p>
                <button onClick={() => setLog([])} className="text-xs text-gray-400 hover:text-red-500">Clear</button>
              </div>
              {log.length === 0 ? <p className="text-sm text-gray-400">Signals you fire will appear here...</p> : (
                <div className="space-y-1.5 font-mono text-xs max-h-48 overflow-y-auto">
                  {log.map((l, i) => (
                    <div key={i} className={`rounded-lg px-3 py-2 border ${l.status === "err" ? "bg-red-50 border-red-200" : l.status === "ok" ? "bg-green-50 border-green-200" : "bg-yellow-50 border-yellow-200"}`}>
                      <div className="flex gap-2">
                        <span className="text-gray-400 flex-shrink-0">{l.time}</span>
                        <span className={`font-semibold ${l.status === "ok" ? "text-green-700" : l.status === "err" ? "text-red-700" : "text-yellow-700"}`}>{l.msg}</span>
                      </div>
                      {l.detail && <p className={`text-xs mt-1 ml-14 ${l.status === "err" ? "text-red-500" : "text-gray-500"}`}>{l.detail}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
