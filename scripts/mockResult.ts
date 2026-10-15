import fs from "fs"; import path from "path";
import { ENGINES, resolveEngineConfig } from "../lib/strategyEngine/registry";
import { computeBacktestStats } from "../lib/strategyEngine/backtestRunner";
const all = JSON.parse(fs.readFileSync(path.join(__dirname,"..","backtest-data","xrpusd_30m.json"),"utf-8")).candles;
const cfg = resolveEngineConfig("alm3_xrp_t3", null); cfg.startTime = Date.parse("2026-01-10T00:00:00+05:30")/1000;
const trades = ENGINES.alm3_xrp_t3.run(all, cfg); const stats = computeBacktestStats(trades, 1000);
const eng = ENGINES.alm3_xrp_t3;
fs.writeFileSync("/tmp/uitest/mock.json", JSON.stringify({
  engines: [{ key:"alm3_xrp_t3", label: eng.label, candleResolution: eng.candleResolution, fields: eng.fields, defaults: eng.defaults }],
  config: cfg,
  result: { applied:false, candles: all.length, config: cfg, stats: { ...stats, backtestTrades: undefined }, trades: stats.backtestTrades },
}));
