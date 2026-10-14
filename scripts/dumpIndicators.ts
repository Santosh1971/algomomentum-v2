import fs from "fs";
import path from "path";
import { supertrend, t3, Candle } from "../lib/strategyEngine/indicators";

const dataPath = path.join(__dirname, "..", "backtest-data", "xrpusd_30m.json");
const raw = JSON.parse(fs.readFileSync(dataPath, "utf-8"));
const candles: Candle[] = raw.candles.slice(0, 500); // first 500 bars is plenty to validate

const { supertrend: st, direction } = supertrend(candles, 3, 15);
const t3Fast = t3(candles.map((c) => c.close), 4);
const t3Slow = t3(candles.map((c) => c.close), 7);

const out = candles.map((c, i) => ({
  time: c.time,
  close: c.close,
  st: st[i],
  direction: direction[i],
  t3Fast: t3Fast[i],
  t3Slow: t3Slow[i],
}));

fs.writeFileSync(path.join(__dirname, "..", "backtest-data", "ts_indicators_check.json"), JSON.stringify(out));
console.log(`Dumped ${out.length} rows for cross-check`);
