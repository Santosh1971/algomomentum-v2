// scripts/validateALM3XrpT3.ts
// Standalone validation runner — not part of the Next.js app.
// Usage: npx tsx scripts/validateALM3XrpT3.ts

import fs from "fs";
import path from "path";
import { runALM3XrpT3, ALM3_XRP_T3_DEFAULTS } from "../lib/strategyEngine/alm3XrpT3";
import { computeBacktestStats } from "../lib/strategyEngine/backtestRunner";
import { Candle } from "../lib/strategyEngine/indicators";

const dataPath = path.join(__dirname, "..", "backtest-data", "xrpusd_30m.json");
const raw = JSON.parse(fs.readFileSync(dataPath, "utf-8"));
const candles: Candle[] = raw.candles;

console.log(`Loaded ${candles.length} candles for ${raw.symbol} @ ${raw.resolution}`);
console.log(`Range: ${new Date(candles[0].time * 1000).toISOString()} -> ${new Date(candles[candles.length - 1].time * 1000).toISOString()}`);

const trades = runALM3XrpT3(candles, ALM3_XRP_T3_DEFAULTS);
console.log(`\nTotal trades: ${trades.length}`);

const stats = computeBacktestStats(trades, 1000);
console.log("\n--- Stats (compounding $1000 start) ---");
console.log("Total trades:", stats.totalTrades);
console.log("Win rate:", stats.winRate, "%");
console.log("Max drawdown:", stats.maxDrawdown, "%");
console.log("Profit factor:", stats.profitFactor);
console.log("Total PnL %:", stats.totalPnlPct);
console.log("Final equity:", stats.equityData[stats.equityData.length - 1]?.equity.toFixed(2));

console.log("\n--- First 10 trades ---");
for (const t of trades.slice(0, 10)) {
  console.log(
    `#${t.tradeNumber} ${t.side.toUpperCase()} entry ${new Date(t.entryTime * 1000).toISOString()} @ ${t.entryPrice.toFixed(5)}` +
      ` -> exit ${new Date(t.exitTime * 1000).toISOString()} @ ${t.exitPrice.toFixed(5)} [${t.exitReason}] net ${t.netPnlPct.toFixed(2)}%`
  );
}

console.log("\n--- Last 10 trades ---");
for (const t of trades.slice(-10)) {
  console.log(
    `#${t.tradeNumber} ${t.side.toUpperCase()} entry ${new Date(t.entryTime * 1000).toISOString()} @ ${t.entryPrice.toFixed(5)}` +
      ` -> exit ${new Date(t.exitTime * 1000).toISOString()} @ ${t.exitPrice.toFixed(5)} [${t.exitReason}] net ${t.netPnlPct.toFixed(2)}%`
  );
}

// Breakdown of exit reasons, as a sanity signal (e.g. if 100% of exits are
// one single reason, that usually means a bug, not a real result)
const reasonCounts: Record<string, number> = {};
for (const t of trades) reasonCounts[t.exitReason] = (reasonCounts[t.exitReason] ?? 0) + 1;
console.log("\n--- Exit reason breakdown ---");
console.log(reasonCounts);

// Average holding time, another sanity signal
const avgHoldHours =
  trades.reduce((sum, t) => sum + (t.exitTime - t.entryTime), 0) / trades.length / 3600;
console.log("\nAverage holding time (hours):", avgHoldHours.toFixed(2));
