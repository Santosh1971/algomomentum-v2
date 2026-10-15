import fs from "fs"; import path from "path";
import { runALM3XrpT3, ALM3_XRP_T3_DEFAULTS } from "../lib/strategyEngine/alm3XrpT3";
const raw = JSON.parse(fs.readFileSync(path.join(__dirname,"..","backtest-data","xrpusd_30m.json"),"utf-8"));
const mode = (process.argv[2] ?? "intrabar") as any;
const t = runALM3XrpT3(raw.candles, { ...ALM3_XRP_T3_DEFAULTS, startTime: 0, stopMode: mode });
fs.writeFileSync(path.join(__dirname,"..","backtest-data","my_trades.json"), JSON.stringify(t));
console.log(mode, t.length);
