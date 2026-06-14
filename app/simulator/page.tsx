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
  const [symbol, setSymbol] = useState(() => { try { return localStorage.getItem("am_sim_symbol") || ""; } catch { return ""; } });
  const [customSymbol, setCustomSymbol] = useState(() => { try { return localStorage.getItem("am_sim_custom") || ""; } catch { return ""; } });
  const [livePrice, setLivePrice] = useState<number | null>(null);
  const [loadingPrice, setLoadingPrice] = useState(false);
  const [outboundIp, setOutboundIp] = useState<string | null>(null);
  const [ipWarning, setIpWarning] = useState<string | null>(null);
  const [log, setLog] = useState<LogEntry[]>(() => {
    if (typeof window === "undefined") return [];
    try { return JSON.parse(localStorage.getItem("am_sim_log") || "[]"); } catch { return []; }
  });
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
  const chartInstanceRef = useRef<any>(null);
  const candleSeriesRef = useRef<any>(null);
  const entryLineRef = useRef<any>(null);
  const slLineRef = useRef<any>(null);
  const tpLineRef = useRef<any>(null);
  const entryRef = useRef(entry);
  const slRef = useRef(sl);
  const tpRef = useRef(tp);
  const dragModeRef = useRef(false);
  const activeDragRef = useRef<"entry"|"sl"|"tp"|null>(null);
  const priceDec = useRef(5);

  useEffect(() => { entryRef.current = entry; }, [entry]);
  useEffect(() => { slRef.current = sl; }, [sl]);
  useEffect(() => { tpRef.current = tp; }, [tp]);
  useEffect(() => { dragModeRef.current = dragMode; }, [dragMode]);
  useEffect(() => { activeDragRef.current = activeDrag; }, [activeDrag]);

  const entryN = parseFloat(entry);
  const slN = parseFloat(sl);
  const tpN = parseFloat(tp);
  const risk = !isNaN(entryN) && !isNaN(slN) && sl ? Math.abs(entryN - slN) : null;
  const reward = !isNaN(entryN) && !isNaN(tpN) && tp ? Math.abs(tpN - entryN) : null;
  const rr = risk && reward && risk > 0 ? (reward / risk).toFixed(2) : null;
  const rrColor = rr ? (parseFloat(rr) >= 2 ? "text-green-600" : parseFloat(rr) >= 1 ? "text-yellow-600" : "text-red-600") : "";

  useEffect(() => {
    fetch("/api/v1/script").then(r => r.json()).then(data => {
      if (Array.isArray(data) && data.length > 0) {
        setSymbols(data);
        const saved = localStorage.getItem("am_sim_symbol");
        setSymbol(saved && data.find((s: Script) => s.symbol === saved) ? saved : data[0].symbol);
      }
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
      layout: { background: { color: "#ffffff" }, textColor: "#161B22" },
      grid: { vertLines: { color: "#f3f4f6" }, horzLines: { color: "#f3f4f6" } },
      timeScale: { timeVisible: true, secondsVisible: false },
      crosshair: { mode: 1 },
    });
    chartInstanceRef.current = chart;
    candleSeriesRef.current = chart.addCandlestickSeries({
      upColor: "#22c55e", downColor: "#ef4444",
      borderUpColor: "#22c55e", borderDownColor: "#ef4444",
      wickUpColor: "#22c55e", wickDownColor: "#ef4444",
    });
    new ResizeObserver(() => {
      if (chartRef.current) chart.applyOptions({ width: chartRef.current.clientWidth });
    }).observe(chartRef.current);

    // Native mouse events directly on the chart div
    const el = chartRef.current;

    el.addEventListener("mousedown", (e: MouseEvent) => {
      if (!dragModeRef.current) return;
      const series = candleSeriesRef.current;
      if (!series) return;
      const rect = el.getBoundingClientRect();
      const y = e.clientY - rect.top;
      const price = series.coordinateToPrice(y);
      if (price === null || price === undefined) return;

      const eN = parseFloat(entryRef.current);
      const sN = parseFloat(slRef.current);
      const tN = parseFloat(tpRef.current);
      const threshold = Math.abs(price) * 0.015;
      const dists: [number, "entry"|"sl"|"tp"][] = [];
      if (!isNaN(eN) && entryRef.current) dists.push([Math.abs(price - eN), "entry"]);
      if (!isNaN(sN) && slRef.current) dists.push([Math.abs(price - sN), "sl"]);
      if (!isNaN(tN) && tpRef.current) dists.push([Math.abs(price - tN), "tp"]);
      if (!dists.length) return;
      dists.sort((a, b) => a[0] - b[0]);
      if (dists[0][0] < threshold) {
        e.stopPropagation();
        e.preventDefault();
        activeDragRef.current = dists[0][1];
        setActiveDrag(dists[0][1]);
      }
    }, true);

    el.addEventListener("mousemove", (e: MouseEvent) => {
      if (!dragModeRef.current) return;
      const series = candleSeriesRef.current;
      if (!series) return;
      const rect = el.getBoundingClientRect();
      const y = e.clientY - rect.top;
      const price = series.coordinateToPrice(y);
      if (price === null || price === undefined) return;

      if (!activeDragRef.current) {
        const eN = parseFloat(entryRef.current);
        const sN = parseFloat(slRef.current);
        const tN = parseFloat(tpRef.current);
        const threshold = Math.abs(price) * 0.015;
        const near = [eN, sN, tN].filter(n => !isNaN(n)).some(n => Math.abs(price - n) < threshold);
        el.style.cursor = near ? "ns-resize" : "crosshair";
        return;
      }
      e.stopPropagation();
      e.preventDefault();
      const p = fmt(price);
      if (activeDragRef.current === "entry") setEntry(p);
      else if (activeDragRef.current === "sl") setSl(p);
      else if (activeDragRef.current === "tp") setTp(p);
    }, true);

    const stopDrag = () => {
      if (activeDragRef.current) {
        activeDragRef.current = null;
        setActiveDrag(null);
      }
    };
    el.addEventListener("mouseup", stopDrag, true);
    el.addEventListener("mouseleave", stopDrag, true);

    setChartReady(true);
  }

  useEffect(() => {
    if (!chartInstanceRef.current) return;
    chartInstanceRef.current.applyOptions({
      handleScroll: !dragMode,
      handleScale: !dragMode,
    });
    if (chartRef.current) chartRef.current.style.cursor = dragMode ? "crosshair" : "default";
  }, [dragMode]);

  useEffect(() => {
    const sym = customSymbol.trim() || symbol;
    if (!sym || !chartReady) return;
    fetchPriceAndLoad(sym);
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

  function updatePriceLines() {
    const series = candleSeriesRef.current;
    if (!series) return;
    if (entryLineRef.current) { try { series.removePriceLine(entryLineRef.current); } catch {} entryLineRef.current = null; }
    if (slLineRef.current) { try { series.removePriceLine(slLineRef.current); } catch {} slLineRef.current = null; }
    if (tpLineRef.current) { try { series.removePriceLine(tpLineRef.current); } catch {} tpLineRef.current = null; }
    if (!isNaN(entryN) && entry) {
      entryLineRef.current = series.createPriceLine({ price: entryN, color: "#3b82f6", lineWidth: 2, lineStyle: 1, axisLabelVisible: true, title: `🎯 ${fmt(entryN)}` });
    }
    if (!isNaN(slN) && sl) {
      slLineRef.current = series.createPriceLine({ price: slN, color: "#ef4444", lineWidth: 2, lineStyle: 1, axisLabelVisible: true, title: `🛑 ${fmt(slN)}` });
    }
    if (!isNaN(tpN) && tp) {
      tpLineRef.current = series.createPriceLine({ price: tpN, color: "#22c55e", lineWidth: 2, lineStyle: 1, axisLabelVisible: true, title: `✅ ${fmt(tpN)}` });
    }
  }

  async function fetchPriceAndLoad(sym: string) {
    setLoadingPrice(true);
    const d = await fetch(`/api/v1/ticker?symbol=${sym}`).then(r => r.json()).catch(() => null);
    if (d?.price) {
      setLivePrice(d.price);
      priceDec.current = decimals(d.price);
      setEntry(fmt(d.price));
      // Update price format on existing series (don't recreate)
      if (candleSeriesRef.current) {
        const dec = decimals(d.price);
        candleSeriesRef.current.applyOptions({
          priceFormat: { type: "price", precision: dec, minMove: Math.pow(10, -dec) }
        });
      }
    }
    setLoadingPrice(false);
    await loadCandles(sym);
  }

  async function loadCandles(sym: string) {
    if (!candleSeriesRef.current) return;
    setLoadingChart(true);
    try {
      const res = await fetch(`/api/v1/candles?symbol=${sym}&resolution=${resolution}&limit=120`);
      const data = await res.json();
      if (Array.isArray(data.candles) && data.candles.length > 0) {
        candleSeriesRef.current.setData(data.candles);
        chartInstanceRef.current?.timeScale().fitContent();
      }
    } catch (e) { console.error(e); }
    setLoadingChart(false);
  }

  const activeSymbol = customSymbol.trim() || symbol;
  function addLog(e: LogEntry) {
    setLog(prev => {
      const next = [e, ...prev].slice(0, 50);
      try { localStorage.setItem("am_sim_log", JSON.stringify(next)); } catch {}
      return next;
    });
  }

  async function fireSignal(tradeSide: string, trade: string): Promise<boolean> {
    const time = new Date().toTimeString().slice(0, 8);
    const marketPrice = livePrice;
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
          const fillPrice = parseFloat(val.result.avg_fill_price ?? val.result.average_fill_price ?? "0");
          const slippage = marketPrice && fillPrice ? fillPrice - marketPrice : null;
          const slippageStr = slippage !== null && Math.abs(slippage) > 0
            ? ` | Slippage: ${slippage > 0 ? "+" : ""}${fmt(slippage)}`
            : "";
          const fillStr = fillPrice > 0 ? ` | Filled @ ${fmt(fillPrice)}` : "";
          const mktStr = marketPrice ? ` | Mkt @ ${fmt(marketPrice)}` : "";
          addLog({ time, msg: `✅ ${trade} ${tradeSide.toUpperCase()} ${activeSymbol} — ORDER PLACED`, status: "ok", detail: `Order ID: ${val.result.id ?? "placed"}${mktStr}${fillStr}${slippageStr}` });
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

  const inp = "w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#161B22] placeholder-gray-500";
  const btnBase = "py-3 px-4 rounded-xl border-2 font-semibold text-sm transition-all active:scale-95 cursor-pointer";

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-7xl mx-auto p-6 space-y-5">

        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[#161B22]">Signal Simulator & Trade Planner</h1>
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
              <select value={symbol} onChange={e => { setSymbol(e.target.value); try { localStorage.setItem("am_sim_symbol", e.target.value); } catch {} }} className={inp}>
                {symbols.map(s => <option key={s.symbol} value={s.symbol}>{s.symbol}</option>)}
              </select>
              <input value={customSymbol} onChange={e => { setCustomSymbol(e.target.value); try { localStorage.setItem("am_sim_custom", e.target.value); } catch {} }} placeholder="Custom e.g. PIUSD" className={inp} />
              {livePrice && (
                <div className="bg-blue-50 rounded-xl px-3 py-2 text-center">
                  <p className="text-xs text-blue-500">{loadingPrice ? "Fetching..." : "Live Price"}</p>
                  <p className="text-2xl font-bold text-blue-700 font-mono">${fmt(livePrice)}</p>
                </div>
              )}
              <div className="flex gap-2">
                <button onClick={() => fetchPriceAndLoad(customSymbol.trim() || symbol)}
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
              <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold">Levels — auto SL 2% / TP 4%</p>
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
              <button onClick={() => fireSignal(side, "ENTRY")}
                className={`w-full py-4 rounded-xl font-bold text-lg transition-all active:scale-95 shadow-md ${side === "buy" ? "bg-green-500 hover:bg-green-600 text-white" : "bg-red-500 hover:bg-red-600 text-white"}`}>
                🚀 GO — {side === "buy" ? "Enter Long" : "Enter Short"}
                {entry && <span className="block text-xs font-normal opacity-80 mt-0.5">@ {entry} · SL {sl} · TP {tp}</span>}
              </button>
              <button onClick={() => fireSignal(side === "buy" ? "sell" : "buy", "EXIT")}
                className="w-full py-3 rounded-xl border-2 border-gray-400 text-gray-600 font-semibold text-sm hover:bg-gray-50 transition">
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
                  <option value="sec">Sec</option><option value="min">Min</option><option value="hr">Hr</option>
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
                  <p className="font-semibold text-[#161B22]">{activeSymbol} — {resolution}</p>
                  {loadingChart && <span className="text-xs text-gray-400 animate-pulse">Loading...</span>}
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-3 text-xs">
                    <span className="text-blue-600 font-semibold">— Entry</span>
                    <span className="text-red-500 font-semibold">— SL</span>
                    <span className="text-green-500 font-semibold">— TP</span>
                  </div>
                  <button onClick={() => setDragMode(d => !d)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${dragMode ? "bg-cyan-500 text-white border-blue-600" : "bg-gray-100 text-gray-600 border-gray-300 hover:bg-gray-200"}`}>
                    {dragMode ? `✋ Drag ON${activeDrag ? ` (${activeDrag})` : " — hover line"}` : "🖱 Drag Levels"}
                  </button>
                </div>
              </div>
              <div ref={chartRef} className="w-full" />
            </div>

            <div className="bg-white rounded-2xl p-5 shadow-sm border">
              <div className="flex justify-between items-center mb-3">
                <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold">Activity Log</p>
                <button onClick={() => { setLog([]); try { localStorage.removeItem("am_sim_log"); } catch {} }} className="text-xs text-gray-400 hover:text-red-500">Clear</button>
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
