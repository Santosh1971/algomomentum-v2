"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import { toast } from "sonner";

interface Candle { time: number; open: number; high: number; low: number; close: number; }
interface Signal { time: number; type: string; price: number; sl: number; tp: number; label: string; }
interface TradeResult {
  entryTime: number; exitTime: number; entryPrice: number; exitPrice: number;
  sl: number; tp: number; side: string; exitReason: string; pnlPct: number; pnlR: number;
}
interface Stats {
  totalTrades: number; wins: number; losses: number; winRate: number;
  totalPnlR: number; avgWinR: number; avgLossR: number; maxDrawdownR: number; profitFactor: number;
}
interface BacktestResult {
  candles: Candle[]; signals: Signal[]; trades: TradeResult[]; stats: Stats;
  pdh?: number; pdl?: number;
  emaFast?: number[]; emaSlow?: number[]; candleTimes?: number[];
}

const TIMEFRAMES = ["1m","3m","5m","15m","30m","1h","2h","4h"];
const STRATEGIES = [
  { value: "pdh_pdl", label: "PDH/PDL Breakout + Retest" },
  { value: "ema_cross", label: "EMA Crossover (9/21)" },
  { value: "alm3", label: "ALM3 (SuperTrend + T3 + ADX)" },
];

function fmt(n: number, dec = 4): string {
  if (!n || isNaN(n)) return "—";
  if (n >= 10000) return n.toFixed(0);
  if (n >= 1000) return n.toFixed(1);
  if (n >= 100) return n.toFixed(2);
  if (n >= 1) return n.toFixed(3);
  return n.toFixed(dec);
}

export default function StrategyPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "unauthenticated") router.push("/Signup");
  }, [status, router]);

  const [symbols, setSymbols] = useState<string[]>([]);
  const [symbol, setSymbol] = useState(() => { try { return localStorage.getItem("am_strat_symbol") || ""; } catch { return ""; } });
  const [strategy, setStrategy] = useState(() => { try { return localStorage.getItem("am_strat_name") || "pdh_pdl"; } catch { return "pdh_pdl"; } });
  const [timeframe, setTimeframe] = useState(() => { try { return localStorage.getItem("am_strat_tf") || "15m"; } catch { return "15m"; } });
  const [rr, setRr] = useState("2");
  const [sessionStart, setSessionStart] = useState("09:30");
  const [sessionEnd, setSessionEnd] = useState("23:30");
  const [emaFast, setEmaFast] = useState("9");
  const [emaSlow, setEmaSlow] = useState("21");
  // ALM3 params
  const [stTimeframe, setStTimeframe] = useState("35");
  const [atrPeriod, setAtrPeriod] = useState("15");
  const [factor, setFactor] = useState("3.0");
  const [t3Fast, setT3Fast] = useState("4");
  const [t3Slow, setT3Slow] = useState("7");
  const [switchSLPct, setSwitchSLPct] = useState("10");
  const [drawdownPct, setDrawdownPct] = useState("10");
  const [liquidatePct, setLiquidatePct] = useState("0.6");
  const [targetLongPct, setTargetLongPct] = useState("15");
  const [targetShortPct, setTargetShortPct] = useState("15");
  const [useADX, setUseADX] = useState(true);
  const [adxThreshold, setAdxThreshold] = useState("25");
  const [useHTF_ST, setUseHTF_ST] = useState(true);
  const [htfTimeframe, setHtfTimeframe] = useState("120");
  const [retestBuffer, setRetestBuffer] = useState("0.2");
  const [loading, setLoading] = useState(false);
  const [useDateRange, setUseDateRange] = useState(false);
  const [startDate, setStartDate] = useState("2026-01-01");
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0,10));
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [selectedTrade, setSelectedTrade] = useState<TradeResult | null>(null);
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<any>(null);
  const seriesRefs = useRef<any[]>([]);

  useEffect(() => {
    fetch("/api/v1/script").then(r => r.json()).then(data => {
      if (Array.isArray(data)) {
        const syms = data.map((s: any) => s.symbol);
        setSymbols(syms);
        if (!symbol && syms.length > 0) setSymbol(syms[0]);
      }
    });
  }, []);

  function persist(key: string, val: string) {
    try { localStorage.setItem(key, val); } catch {}
  }

  async function runBacktest() {
    if (!symbol) { toast.error("Select a symbol"); return; }
    setLoading(true); setResult(null);
    try {
      const res = await fetch("/api/v1/strategy/backtest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol, strategy, timeframe,
          rr: parseFloat(rr),
          sessionStart, sessionEnd,
          emaFast: parseInt(emaFast),
          emaSlow: parseInt(emaSlow),
          retestBuffer: parseFloat(retestBuffer),
          // ALM3
          stTimeframe: parseInt(stTimeframe),
          atrPeriod: parseInt(atrPeriod),
          factor: parseFloat(factor),
          t3Fast: parseInt(t3Fast),
          t3Slow: parseInt(t3Slow),
          switchSLPercent: parseFloat(switchSLPct),
          drawdownPercent: parseFloat(drawdownPct),
          liquidatePercent: parseFloat(liquidatePct),
          targetLongPercent: parseFloat(targetLongPct),
          targetShortPercent: parseFloat(targetShortPct),
          useADX, adxThreshold: parseInt(adxThreshold),
          useDateRange, startDate, endDate,
          useHTF_ST, htfTimeframe: parseInt(htfTimeframe),
        }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "Backtest failed"); return; }
      setResult(data);
      toast.success(`Backtest complete — ${data.stats.totalTrades} trades found`);
    } catch (e: any) {
      toast.error(e.message ?? "Network error");
    } finally {
      setLoading(false);
    }
  }

  // Draw chart when result changes
  useEffect(() => {
    if (!result || !chartRef.current) return;
    const LW = (window as any).LightweightCharts;
    if (!LW) return;

    // Destroy previous chart
    if (chartInstance.current) { chartInstance.current.remove(); chartInstance.current = null; seriesRefs.current = []; }

    const chart = LW.createChart(chartRef.current, {
      width: chartRef.current.clientWidth,
      height: 420,
      layout: { background: { color: "#ffffff" }, textColor: "#1E3A5F" },
      grid: { vertLines: { color: "#f3f4f6" }, horzLines: { color: "#f3f4f6" } },
      timeScale: { timeVisible: true, secondsVisible: false },
      crosshair: { mode: 1 },
    });
    chartInstance.current = chart;

    // Candles
    const candleSeries = chart.addCandlestickSeries({
      upColor: "#22c55e", downColor: "#ef4444",
      borderUpColor: "#22c55e", borderDownColor: "#ef4444",
      wickUpColor: "#22c55e", wickDownColor: "#ef4444",
    });
    candleSeries.setData(result.candles.map(c => ({ time: c.time, open: c.open, high: c.high, low: c.low, close: c.close })));

    // PDH/PDL lines
    if (result.pdh) {
      const pdhLine = chart.addLineSeries({ color: "#f97316", lineWidth: 1, lineStyle: 2, title: "PDH" });
      pdhLine.setData(result.candles.map(c => ({ time: c.time, value: result.pdh! })));
    }
    if (result.pdl) {
      const pdlLine = chart.addLineSeries({ color: "#ef4444", lineWidth: 1, lineStyle: 2, title: "PDL" });
      pdlLine.setData(result.candles.map(c => ({ time: c.time, value: result.pdl! })));
    }

    // EMA lines
    if (result.emaFast && result.candleTimes) {
      const emaFastSeries = chart.addLineSeries({ color: "#3b82f6", lineWidth: 1, title: `EMA${emaFast}` });
      emaFastSeries.setData(result.candleTimes.map((t, i) => ({ time: t, value: result.emaFast![i] })));
      const emaSlowSeries = chart.addLineSeries({ color: "#f97316", lineWidth: 1, title: `EMA${emaSlow}` });
      emaSlowSeries.setData(result.candleTimes.map((t, i) => ({ time: t, value: result.emaSlow![i] })));
    }

    // T3 Fast and Slow lines (ALM3)
    if ((result as any).t3Fast && (result as any).candleTimes) {
      const t3f = (result as any).t3Fast as number[];
      const t3s = (result as any).t3Slow as number[];
      const times = (result as any).candleTimes as number[];
      const t3FastSeries = chart.addLineSeries({ color: "#22c55e", lineWidth: 1, title: "T3 Fast" });
      t3FastSeries.setData(times.map((t, i) => ({ time: t, value: t3f[i] })));
      const t3SlowSeries = chart.addLineSeries({ color: "#ef4444", lineWidth: 1, title: "T3 Slow" });
      t3SlowSeries.setData(times.map((t, i) => ({ time: t, value: t3s[i] })));
    }
    // ST line (ALM3)
    if ((result as any).stValues && (result as any).candleTimes) {
      const stVals = (result as any).stValues as number[];
      const stDirs = (result as any).stDirection as number[];
      const times = (result as any).candleTimes as number[];
      const stBull = chart.addLineSeries({ color: "#22c55e", lineWidth: 2, lineStyle: 0, title: "ST Bull" });
      const stBear = chart.addLineSeries({ color: "#ef4444", lineWidth: 2, lineStyle: 0, title: "ST Bear" });
      stBull.setData(times.map((t, i) => ({ time: t, value: stDirs[i] < 0 ? stVals[i] : null })).filter((d: any) => d.value !== null));
      stBear.setData(times.map((t, i) => ({ time: t, value: stDirs[i] > 0 ? stVals[i] : null })).filter((d: any) => d.value !== null));
    }

    // Signal markers
    const markers = result.signals.map(s => ({
      time: s.time,
      position: s.type.includes("long") ? "belowBar" : "aboveBar",
      color: s.type === "long_entry" ? "#22c55e" : s.type === "short_entry" ? "#ef4444" : "#94a3b8",
      shape: s.type === "long_entry" ? "arrowUp" : "arrowDown",
      text: s.label,
    }));
    if (markers.length > 0) candleSeries.setMarkers(markers);

    chart.timeScale().fitContent();
  }, [result]);

  // Load LW charts script
  useEffect(() => {
    if ((window as any).LightweightCharts) return;
    const s = document.createElement("script");
    s.src = "https://unpkg.com/lightweight-charts@4.1.3/dist/lightweight-charts.standalone.production.js";
    document.head.appendChild(s);
  }, []);

  const stats = result?.stats;

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-6xl mx-auto p-6 space-y-5">
        <div>
          <h1 className="text-2xl font-bold text-[#1E3A5F]">Strategy Backtester</h1>
          <p className="text-sm text-gray-500 mt-1">Test built-in strategies on historical data before going live</p>
        </div>

        {/* Config panel */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border">
          {/* Row 1: Symbol, Strategy, TF, RR */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase">Symbol</label>
              <select value={symbol} onChange={e => { setSymbol(e.target.value); persist("am_strat_symbol", e.target.value); }}
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]">
                {symbols.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase">Strategy</label>
              <select value={strategy} onChange={e => { setStrategy(e.target.value); persist("am_strat_name", e.target.value); }}
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]">
                {STRATEGIES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase">Timeframe</label>
              <select value={timeframe} onChange={e => { setTimeframe(e.target.value); persist("am_strat_tf", e.target.value); }}
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]">
                {TIMEFRAMES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            {strategy !== "alm3" && (
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase">R:R Ratio</label>
                <input type="number" value={rr} onChange={e => setRr(e.target.value)} step="0.5" min="1"
                  className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]" />
              </div>
            )}
          </div>
          {/* Row 2: Session + Date Range */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4 pb-4 border-b border-gray-100">
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase">Session Start (IST)</label>
              <input type="time" value={sessionStart} onChange={e => setSessionStart(e.target.value)}
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase">Session End (IST)</label>
              <input type="time" value={sessionEnd} onChange={e => setSessionEnd(e.target.value)}
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase">Start Date</label>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                disabled={!useDateRange}
                className={`mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A5F] ${!useDateRange ? "opacity-40" : ""}`} />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase">End Date</label>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                disabled={!useDateRange}
                className={`mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A5F] ${!useDateRange ? "opacity-40" : ""}`} />
            </div>
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={useDateRange} onChange={e => setUseDateRange(e.target.checked)} className="w-4 h-4" />
                <span className="font-medium text-gray-700">Date Range</span>
              </label>
            </div>
          </div>
          {/* Row 3: Strategy-specific params */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {strategy === "pdh_pdl" && (
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase">Retest Buffer %</label>
                <input type="number" value={retestBuffer} onChange={e => setRetestBuffer(e.target.value)} step="0.05" min="0.05"
                  className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]" />
              </div>
            )}
            {strategy === "pdh_pdl" || strategy === "ema_cross" ? null : null}
            {strategy === "ema_cross" && (<>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase">Fast EMA</label>
                <input type="number" value={emaFast} onChange={e => setEmaFast(e.target.value)} min="2"
                  className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase">Slow EMA</label>
                <input type="number" value={emaSlow} onChange={e => setEmaSlow(e.target.value)} min="3"
                  className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]" />
              </div>
            </>)}
            {strategy === "alm3" && (<>
              <div><label className="text-xs font-semibold text-gray-500 uppercase">ST Timeframe (min)</label>
                <input type="number" value={stTimeframe} onChange={e => setStTimeframe(e.target.value)} min="1"
                  className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]" /></div>
              <div><label className="text-xs font-semibold text-gray-500 uppercase">ATR Period</label>
                <input type="number" value={atrPeriod} onChange={e => setAtrPeriod(e.target.value)} min="1"
                  className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]" /></div>
              <div><label className="text-xs font-semibold text-gray-500 uppercase">ST Factor</label>
                <input type="number" value={factor} onChange={e => setFactor(e.target.value)} step="0.1" min="0.1"
                  className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]" /></div>
              <div><label className="text-xs font-semibold text-gray-500 uppercase">T3 Fast</label>
                <input type="number" value={t3Fast} onChange={e => setT3Fast(e.target.value)} min="1"
                  className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]" /></div>
              <div><label className="text-xs font-semibold text-gray-500 uppercase">T3 Slow</label>
                <input type="number" value={t3Slow} onChange={e => setT3Slow(e.target.value)} min="1"
                  className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]" /></div>
              <div><label className="text-xs font-semibold text-gray-500 uppercase">Switch SL %</label>
                <input type="number" value={switchSLPct} onChange={e => setSwitchSLPct(e.target.value)} step="0.1" min="0"
                  className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]" /></div>
              <div><label className="text-xs font-semibold text-gray-500 uppercase">Drawdown SL %</label>
                <input type="number" value={drawdownPct} onChange={e => setDrawdownPct(e.target.value)} step="0.1" min="0.1"
                  className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]" /></div>
              <div><label className="text-xs font-semibold text-gray-500 uppercase">Liquidate SL %</label>
                <input type="number" value={liquidatePct} onChange={e => setLiquidatePct(e.target.value)} step="0.1" min="0.1"
                  className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]" /></div>
              <div><label className="text-xs font-semibold text-gray-500 uppercase">Target Long %</label>
                <input type="number" value={targetLongPct} onChange={e => setTargetLongPct(e.target.value)} step="0.1" min="0.1"
                  className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]" /></div>
              <div><label className="text-xs font-semibold text-gray-500 uppercase">Target Short %</label>
                <input type="number" value={targetShortPct} onChange={e => setTargetShortPct(e.target.value)} step="0.1" min="0.1"
                  className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]" /></div>
              <div><label className="text-xs font-semibold text-gray-500 uppercase">HTF ST TF (min)</label>
                <input type="number" value={htfTimeframe} onChange={e => setHtfTimeframe(e.target.value)} min="1"
                  className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]" /></div>
              <div><label className="text-xs font-semibold text-gray-500 uppercase">ADX Threshold</label>
                <input type="number" value={adxThreshold} onChange={e => setAdxThreshold(e.target.value)} min="5"
                  className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]" /></div>
              <div className="flex items-center gap-3 mt-4 col-span-2">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={useADX} onChange={e => setUseADX(e.target.checked)} className="w-4 h-4" />
                  <span className="font-medium text-gray-700">Use ADX Filter</span>
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={useHTF_ST} onChange={e => setUseHTF_ST(e.target.checked)} className="w-4 h-4" />
                  <span className="font-medium text-gray-700">Use HTF SuperTrend</span>
                </label>
              </div>
            </>)}
          </div>
          <div className="mt-4">
            <button onClick={runBacktest} disabled={loading}
              className="bg-[#1E3A5F] text-white px-6 py-2.5 rounded-xl font-semibold text-sm hover:bg-[#152c4a] disabled:opacity-50 transition flex items-center gap-2">
              {loading ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Running...</> : "▶ Run Backtest"}
            </button>
          </div>
        </div>

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
            {[
              { label: "Trades", value: stats.totalTrades.toString(), color: "text-gray-800" },
              { label: "Win Rate", value: `${stats.winRate.toFixed(1)}%`, color: stats.winRate >= 50 ? "text-green-600" : "text-red-500" },
              { label: "Total P&L", value: strategy === "alm3" ? `${stats.totalPnlR >= 0 ? "+" : ""}${stats.totalPnlR.toFixed(2)}%` : `${stats.totalPnlR >= 0 ? "+" : ""}${stats.totalPnlR.toFixed(2)}R`, color: stats.totalPnlR >= 0 ? "text-green-600" : "text-red-500" },
              { label: "Profit Factor", value: stats.profitFactor >= 999 ? "∞" : stats.profitFactor.toFixed(2), color: stats.profitFactor >= 1.5 ? "text-green-600" : "text-red-500" },
              { label: "Avg Win", value: strategy === "alm3" ? `+${stats.avgWinR.toFixed(2)}%` : `+${stats.avgWinR.toFixed(2)}R`, color: "text-green-600" },
              { label: "Max DD", value: strategy === "alm3" ? `-${stats.maxDrawdownR.toFixed(2)}%` : `-${stats.maxDrawdownR.toFixed(2)}R`, color: "text-red-500" },
            ].map(s => (
              <div key={s.label} className="bg-white rounded-xl p-3 shadow-sm border text-center">
                <p className="text-xs text-gray-400 uppercase font-medium">{s.label}</p>
                <p className={`text-lg font-bold mt-1 ${s.color}`}>{s.value}</p>
              </div>
            ))}
          </div>
        )}

        {/* Chart */}
        {result && (
          <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
              <p className="font-semibold text-gray-700">{symbol} — {timeframe} — {STRATEGIES.find(s => s.value === strategy)?.label}</p>
              <div className="flex items-center gap-3 text-xs text-gray-500">
                {result.pdh && <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-orange-400 inline-block" />PDH {fmt(result.pdh)}</span>}
                {result.pdl && <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-red-400 inline-block" />PDL {fmt(result.pdl)}</span>}
                {result.emaFast && <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-blue-400 inline-block" />EMA{emaFast}</span>}
                {result.emaSlow && <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-orange-400 inline-block" />EMA{emaSlow}</span>}
                <span className="flex items-center gap-1">▲ Long entry</span>
                <span className="flex items-center gap-1">▼ Short entry</span>
              </div>
            </div>
            <div ref={chartRef} className="w-full" />
          </div>
        )}

        {/* Trades table */}
        {result && result.trades.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100">
              <p className="font-semibold text-gray-700">Trade Log — {result.trades.length} trades</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-xs text-gray-400 uppercase">
                    {["#", "Side", "Entry Time", "Entry", "SL", "TP", "Exit", "Exit Reason", "P&L (R)"].map(h => (
                      <th key={h} className="px-4 py-2 text-left font-semibold">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.trades.map((t, i) => (
                    <tr key={i} onClick={() => setSelectedTrade(selectedTrade?.entryTime === t.entryTime ? null : t)}
                      className={`border-b border-gray-50 cursor-pointer hover:bg-gray-50 ${selectedTrade?.entryTime === t.entryTime ? "bg-blue-50" : ""}`}>
                      <td className="px-4 py-2 text-gray-400">{i + 1}</td>
                      <td className="px-4 py-2">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${t.side === "long" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                          {t.side}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-gray-500 text-xs">{new Date(t.entryTime * 1000).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "short", timeStyle: "short" })}</td>
                      <td className="px-4 py-2 font-mono">{fmt(t.entryPrice)}</td>
                      <td className="px-4 py-2 font-mono text-red-500">{fmt(t.sl)}</td>
                      <td className="px-4 py-2 font-mono text-green-600">{fmt(t.tp)}</td>
                      <td className="px-4 py-2 font-mono">{fmt(t.exitPrice)}</td>
                      <td className="px-4 py-2">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          t.exitReason === "tp" ? "bg-green-100 text-green-700" :
                          t.exitReason === "sl" ? "bg-red-100 text-red-700" :
                          "bg-gray-100 text-gray-500"}`}>
                          {t.exitReason}
                        </span>
                      </td>
                      <td className={`px-4 py-2 font-bold ${t.pnlR >= 0 ? "text-green-600" : "text-red-500"}`}>
                        {t.pnlR >= 0 ? "+" : ""}{t.pnlR.toFixed(2)}R
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {result && result.trades.length === 0 && (
          <div className="bg-white rounded-2xl p-10 text-center shadow-sm border">
            <p className="text-2xl mb-2">🔍</p>
            <p className="text-gray-600 font-medium">No trades found</p>
            <p className="text-sm text-gray-400 mt-1">Try adjusting the session window, timeframe, or retest buffer</p>
          </div>
        )}
      </div>
    </div>
  );
}
