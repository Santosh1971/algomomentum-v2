import fs from "fs"; import path from "path";
import { ENGINES, resolveEngineConfig } from "../lib/strategyEngine/registry";
import { computeBacktestStats } from "../lib/strategyEngine/backtestRunner";
const all = JSON.parse(fs.readFileSync(path.join(__dirname,"..","backtest-data","xrpusd_30m.json"),"utf-8")).candles;
const eng = ENGINES.alm3_xrp_t3;
function run(startDate: string, endDate: string|null, saved: any) {
  const startSec = Math.floor(new Date(startDate).getTime()/1000);
  const endSec = endDate ? Math.floor(new Date(endDate).getTime()/1000) : Math.floor(Date.now()/1000);
  const cfg = resolveEngineConfig("alm3_xrp_t3", saved);
  cfg.startTime = startSec; if (endDate) { cfg.endTime = endSec; cfg.useDateRange = true; }
  const candles = all.filter((c: any) => c.time >= startSec - eng.warmupDays*86400 && c.time <= endSec);
  const trades = eng.run(candles, cfg);
  return { n: candles.length, trades, stats: computeBacktestStats(trades, 1000) };
}
const a = run("2026-01-10T00:00:00+05:30", null, null);
console.log("full:", a.trades.length, a.stats.totalPnlPct, a.stats.winRate, a.stats.profitFactor);
const b = run("2026-02-09T19:30:00+05:30", "2026-06-30T00:00:00+05:30", null);
const f = b.trades[0], l = b.trades[b.trades.length-1];
console.log("window:", b.trades.length, new Date(f.entryTime*1000).toISOString(), new Date(l.exitTime*1000).toISOString());
const c = run("2026-01-10T00:00:00+05:30", null, { drawdownPercent: "2", junk: 5, factor: "" });
console.log("param override changes result:", c.trades.length !== a.trades.length || c.stats.totalPnlPct !== a.stats.totalPnlPct, "factor kept default:", resolveEngineConfig("alm3_xrp_t3",{factor:""}).factor);
