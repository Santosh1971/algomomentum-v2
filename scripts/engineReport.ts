/**
 * What the ALM3 XRP engine would have traded recently, with P&L. Public Delta candles only: no account, no orders.
 *
 *   npx tsx scripts/engineReport.ts [days=14]
 *
 * Compare the entry/exit times and prices with your real Delta fills (Order History) to see where
 * the live bot and the engine agree. Times are IST; a bar's open time + 30 min is when the engine decides.
 */
import { fetchDeltaCandles } from "../lib/strategyEngine/fetchCandles";
import { runALM3XrpT3State, ALM3_XRP_T3_DEFAULTS } from "../lib/strategyEngine/alm3XrpT3";

const days = Number(process.argv[2] ?? 14);
const ist = (sec: number) => new Date(sec * 1000).toLocaleString("en-GB", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });

(async () => {
  const now = Math.floor(Date.now() / 1000);
  const warm = 31 * 86400; // the engine needs history to warm its indicators; only the last `days` are shown
  const all = await fetchDeltaCandles("XRPUSD", "30m", now - warm - days * 86400, now);
  const closed = all.filter((c) => c.time + 1800 <= now);
  const res = runALM3XrpT3State(closed, { ...ALM3_XRP_T3_DEFAULTS, startTime: 0 });
  const since = now - days * 86400;
  const rows = res.trades.filter((t) => t.exitTime >= since);
  console.log(`XRPUSD 30m, last ${days} days, engine defaults. Decision time = bar open + 30 min (IST).\n`);
  console.log("side  entered (IST)    price     exited (IST)     price     net %   how");
  let sum = 0;
  for (const t of rows) {
    sum += t.netPnlPct;
    console.log(`${t.side.padEnd(5)} ${ist(t.entryTime + 1800).padEnd(15)} ${t.entryPrice.toFixed(4)}   ${ist(t.exitTime + 1800).padEnd(15)} ${t.exitPrice.toFixed(4)}   ${t.netPnlPct.toFixed(2).padStart(6)}  ${t.exitReason}`);
  }
  const wins = rows.filter((t) => t.netPnlPct > 0).length;
  console.log(`\n${rows.length} closed trades, ${wins} winners, sum of net % per trade = ${sum.toFixed(2)}% (before position sizing)`);
  if (res.open) {
    const last = closed[closed.length - 1].close;
    const u = (res.open.side === "buy" ? last / res.open.entryPrice - 1 : res.open.entryPrice / last - 1) * 100;
    console.log(`open now: ${res.open.side} since ${ist(res.open.entryTime + 1800)} at ${res.open.entryPrice.toFixed(4)}, stop ${res.open.stopPrice.toFixed(4)}, last close ${last.toFixed(4)} (${u.toFixed(2)}%)`);
  } else console.log("flat now");
})().catch((e) => { console.error(e.message); process.exit(1); });
