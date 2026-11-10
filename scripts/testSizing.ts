// npx tsx scripts/testSizing.ts
import { sizeLots } from "../lib/strategyEngine/sizing";

let bad = 0;
const check = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) bad++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : ` got ${JSON.stringify(got)} want ${JSON.stringify(want)}`}`);
};

// the real bot on 30 Oct: 1815 lots at 1.2529 with ~$1,475 equity at 2x, i.e. ~77% of equity used as margin
check("full balance x2 is bigger than the bot", sizeLots(1475, 1.2529, 2).lots, 2354);
check("0.77 fraction reproduces the bot", sizeLots(1475, 1.2529, 2, undefined, 0.77).lots, 1812);
check("fraction above 1 refused", sizeLots(1475, 1.2529, 2, undefined, 1.5).lots, 0);
check("small shadow account", sizeLots(25, 1.2543, 2).lots, 39);
check("rounds down, never up", sizeLots(100, 3, 1).lots, 33);
check("cap applies", sizeLots(1475, 1.2543, 2, 50).lots, 50);
check("cap above size does nothing", sizeLots(25, 1.2543, 2, 500).lots, 39);
check("zero balance", sizeLots(0, 1.25, 2).lots, 0);
check("negative balance", sizeLots(-5, 1.25, 2).lots, 0);
check("NaN balance", sizeLots(NaN, 1.25, 2).lots, 0);
check("zero price", sizeLots(100, 0, 2).lots, 0);
check("notional", sizeLots(100, 2, 2).notionalUsd, 200);
if (bad) { console.error(`${bad} failed`); process.exit(1); }
console.log("all sizing checks passed");
