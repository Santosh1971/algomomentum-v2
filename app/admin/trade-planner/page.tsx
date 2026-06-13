"use client";
import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import Navbar from "@/components/Navbar";

interface Script { symbol: string; }

export default function TradePlannerPage() {
  const [symbols, setSymbols] = useState<Script[]>([]);
  const [symbol, setSymbol] = useState("");
  const [livePrice, setLivePrice] = useState<number | null>(null);
  const [entry, setEntry] = useState("");
  const [sl, setSl] = useState("");
  const [tp, setTp] = useState("");
  const [side, setSide] = useState<"buy"|"sell">("buy");
  const [loadingChart, setLoadingChart] = useState(false);
  const [chartLoaded, setChartLoaded] = useState(false);
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<any>(null);
  const candleSeriesRef = useRef<any>(null);
  const entryLineRef = useRef<any>(null);
  const slLineRef = useRef<any>(null);
  const tpLineRef = useRef<any>(null);

  const entryN = parseFloat(entry);
  const slN = parseFloat(sl);
  const tpN = parseFloat(tp);
  const risk = entry && sl ? Math.abs(entryN - slN) : null;
  const reward = entry && tp ? Math.abs(tpN - entryN) : null;
  const rr = risk && reward ? (reward / risk).toFixed(2) : null;
  const rrColor = rr ? (parseFloat(rr) >= 2 ? "text-green-600" : parseFloat(rr) >= 1 ? "text-yellow-600" : "text-red-600") : "text-gray-400";

  useEffect(() => {
    fetch("/api/v1/script").then(r => r.json()).then(data => {
      if (Array.isArray(data) && data.length > 0) { setSymbols(data); setSymbol(data[0].symbol); }
    });
    // Load lightweight-charts dynamically
    const script = document.createElement("script");
    script.src = "https://unpkg.com/lightweight-charts@4.1.3/dist/lightweight-charts.standalone.production.js";
    script.onload = () => setChartLoaded(true);
    document.head.appendChild(script);
  }, []);

  useEffect(() => {
    if (!symbol) return;
    fetch(`/api/v1/ticker?symbol=${symbol}`).then(r => r.json()).then(d => {
      if (d.price) { setLivePrice(d.price); setEntry(String(d.price)); }
    });
  }, [symbol]);

  useEffect(() => {
    if (!chartLoaded || !chartRef.current || chartInstanceRef.current) return;
    const LW = (window as any).LightweightCharts;
    if (!LW) return;
    const chart = LW.createChart(chartRef.current, {
      width: chartRef.current.clientWidth,
      height: 400,
      layout: { background: { color: "#ffffff" }, textColor: "#1E3A5F" },
      grid: { vertLines: { color: "#f0f0f0" }, horzLines: { color: "#f0f0f0" } },
      timeScale: { timeVisible: true, secondsVisible: false },
      rightPriceScale: { borderColor: "#e5e7eb" },
    });
    chartInstanceRef.current = chart;
    candleSeriesRef.current = chart.addCandlestickSeries({
      upColor: "#22c55e", downColor: "#ef4444",
      borderUpColor: "#22c55e", borderDownColor: "#ef4444",
      wickUpColor: "#22c55e", wickDownColor: "#ef4444",
    });
    const ro = new ResizeObserver(() => {
      if (chartRef.current) chart.applyOptions({ width: chartRef.current.clientWidth });
    });
    if (chartRef.current) ro.observe(chartRef.current);
  }, [chartLoaded]);

  useEffect(() => {
    if (!chartLoaded || !symbol) return;
    loadCandles(symbol);
  }, [chartLoaded, symbol]);

  async function loadCandles(sym: string) {
    setLoadingChart(true);
    try {
      const res = await fetch(`/api/v1/candles?symbol=${sym}&resolution=15&limit=120`);
      const data = await res.json();
      if (candleSeriesRef.current && Array.isArray(data.candles) && data.candles.length > 0) {
        candleSeriesRef.current.setData(data.candles);
        chartInstanceRef.current?.timeScale().fitContent();
      }
    } catch (e) { console.error(e); }
    setLoadingChart(false);
  }

  useEffect(() => { if (chartLoaded) updateLines(); }, [entry, sl, tp, chartLoaded]);

  function updateLines() {
    const chart = chartInstanceRef.current;
    if (!chart) return;
    const LW = (window as any).LightweightCharts;
    if (!LW) return;
    if (entryLineRef.current) { try { chart.removeSeries(entryLineRef.current); } catch {} entryLineRef.current = null; }
    if (slLineRef.current) { try { chart.removeSeries(slLineRef.current); } catch {} slLineRef.current = null; }
    if (tpLineRef.current) { try { chart.removeSeries(tpLineRef.current); } catch {} tpLineRef.current = null; }
    const now = Math.floor(Date.now() / 1000);
    const past = now - 86400 * 7;
    if (entry && entryN && !isNaN(entryN)) {
      entryLineRef.current = chart.addLineSeries({ color: "#3b82f6", lineWidth: 2, lineStyle: 1, title: `Entry ${entryN}` });
      entryLineRef.current.setData([{ time: past, value: entryN }, { time: now, value: entryN }]);
    }
    if (sl && slN && !isNaN(slN)) {
      slLineRef.current = chart.addLineSeries({ color: "#ef4444", lineWidth: 2, lineStyle: 1, title: `SL ${slN}` });
      slLineRef.current.setData([{ time: past, value: slN }, { time: now, value: slN }]);
    }
    if (tp && tpN && !isNaN(tpN)) {
      tpLineRef.current = chart.addLineSeries({ color: "#22c55e", lineWidth: 2, lineStyle: 1, title: `TP ${tpN}` });
      tpLineRef.current.setData([{ time: past, value: tpN }, { time: now, value: tpN }]);
    }
  }

  async function fireSignal(trade: string) {
    const res = await fetch(`/api/v1/webhook/${symbol}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ side, trade, price: entry, trigger_time: new Date().toISOString() }),
    });
    const data = await res.json();
    if (data.success) toast.success(`${trade} signal fired!`);
    else toast.error(data.error || "Failed");
  }

  function refreshAll() {
    fetch(`/api/v1/ticker?symbol=${symbol}`).then(r => r.json()).then(d => { if (d.price) setLivePrice(d.price); });
    loadCandles(symbol);
  }

  const inp = "w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A5F] placeholder-gray-500";

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-7xl mx-auto p-6 space-y-5">
        <h1 className="text-2xl font-bold text-[#1E3A5F]">Trade Planner</h1>
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">

          {/* Left Panel */}
          <div className="space-y-4">
            <div className="bg-white rounded-2xl p-4 shadow-sm border space-y-3">
              <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold">Symbol</p>
              <select value={symbol} onChange={e => setSymbol(e.target.value)} className={inp}>
                {symbols.map(s => <option key={s.symbol} value={s.symbol}>{s.symbol}</option>)}
              </select>
              {livePrice && (
                <div className="bg-blue-50 rounded-xl px-3 py-2 text-center">
                  <p className="text-xs text-blue-500">Live Price</p>
                  <p className="text-2xl font-bold text-blue-700 font-mono">${livePrice}</p>
                </div>
              )}
            </div>

            <div className="bg-white rounded-2xl p-4 shadow-sm border space-y-2">
              <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold">Direction</p>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setSide("buy")}
                  className={`py-2 rounded-xl border-2 text-sm font-semibold transition ${side === "buy" ? "bg-green-500 border-green-500 text-white" : "border-green-300 text-green-700 hover:bg-green-50"}`}>
                  📈 Long
                </button>
                <button onClick={() => setSide("sell")}
                  className={`py-2 rounded-xl border-2 text-sm font-semibold transition ${side === "sell" ? "bg-red-500 border-red-500 text-white" : "border-red-300 text-red-700 hover:bg-red-50"}`}>
                  📉 Short
                </button>
              </div>
            </div>

            <div className="bg-white rounded-2xl p-4 shadow-sm border space-y-3">
              <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold">Levels</p>
              <div>
                <label className="text-xs text-blue-600 font-semibold block mb-1">🎯 Entry Price</label>
                <input type="number" value={entry} onChange={e => setEntry(e.target.value)} placeholder="Entry" className={inp} />
              </div>
              <div>
                <label className="text-xs text-red-600 font-semibold block mb-1">🛑 Stop Loss</label>
                <input type="number" value={sl} onChange={e => setSl(e.target.value)} placeholder="Stop Loss" className={inp} />
              </div>
              <div>
                <label className="text-xs text-green-600 font-semibold block mb-1">✅ Take Profit</label>
                <input type="number" value={tp} onChange={e => setTp(e.target.value)} placeholder="Take Profit" className={inp} />
              </div>
              {rr && (
                <div className={`rounded-xl px-3 py-3 text-center border ${parseFloat(rr) >= 2 ? "bg-green-50 border-green-200" : parseFloat(rr) >= 1 ? "bg-yellow-50 border-yellow-200" : "bg-red-50 border-red-200"}`}>
                  <p className="text-xs text-gray-500 mb-1">Risk : Reward</p>
                  <p className={`text-3xl font-bold ${rrColor}`}>1 : {rr}</p>
                  <div className="flex justify-around mt-2 text-xs text-gray-500">
                    <span>Risk: <strong className="text-red-600">${risk?.toFixed(5)}</strong></span>
                    <span>Target: <strong className="text-green-600">${reward?.toFixed(5)}</strong></span>
                  </div>
                </div>
              )}
            </div>

            <div className="bg-white rounded-2xl p-4 shadow-sm border space-y-2">
              <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold">Fire Signal</p>
              <button onClick={() => fireSignal("ENTRY")}
                className={`w-full py-3 rounded-xl border-2 font-semibold text-sm transition active:scale-95 ${side === "buy" ? "border-green-500 text-green-700 hover:bg-green-50" : "border-red-500 text-red-700 hover:bg-red-50"}`}>
                {side === "buy" ? "📈 Enter Long" : "📉 Enter Short"}
              </button>
              <button onClick={() => fireSignal("EXIT")}
                className="w-full py-3 rounded-xl border-2 border-gray-400 text-gray-600 font-semibold text-sm hover:bg-gray-50 transition active:scale-95">
                ⬜ Exit Position
              </button>
              <button onClick={refreshAll}
                className="w-full py-2 rounded-xl border text-xs text-gray-500 hover:bg-gray-50 transition">
                🔄 Refresh Chart & Price
              </button>
            </div>
          </div>

          {/* Chart */}
          <div className="lg:col-span-3 bg-white rounded-2xl shadow-sm border overflow-hidden">
            <div className="px-4 py-3 border-b flex items-center justify-between">
              <div className="flex items-center gap-3">
                <p className="font-semibold text-[#1E3A5F]">{symbol} — 15m</p>
                {loadingChart && <span className="text-xs text-gray-400 animate-pulse">Loading chart...</span>}
              </div>
              <div className="flex items-center gap-4 text-xs text-gray-500">
                <span>— <span className="text-blue-500 font-semibold">Entry</span></span>
                <span>— <span className="text-red-500 font-semibold">SL</span></span>
                <span>— <span className="text-green-500 font-semibold">TP</span></span>
              </div>
            </div>
            <div ref={chartRef} className="w-full" />
            {!chartLoaded && (
              <div className="flex items-center justify-center h-96 text-gray-400">
                <p>Loading chart library...</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
