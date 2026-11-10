// lib/strategyEngine/sizing.ts
//
// One place that turns "account balance" into "lots" (XRPUSD on Delta India: 1 lot = 1 XRP).
// Same rule the Pine strategy uses (100% of equity per trade) times the account leverage,
// rounded DOWN to whole lots. `fraction` is the share of the balance used as margin (1 = all of it;
// the current TradingView bot uses about 0.77 on the 30 Oct trade: 1815 lots on ~$1,470 equity at 2x). The shadow runner only previews this; the live executor will
// call the same function and then apply ENGINE_MAX_LOTS on top.

export interface Sizing {
  lots: number;
  balanceUsd: number;
  leverage: number;
  price: number;
  notionalUsd: number;
}

export function sizeLots(balanceUsd: number, price: number, leverage: number, maxLots?: number, fraction = 1): Sizing {
  const ok = Number.isFinite(balanceUsd) && balanceUsd > 0 && Number.isFinite(price) && price > 0 && Number.isFinite(leverage) && leverage > 0 && Number.isFinite(fraction) && fraction > 0 && fraction <= 1;
  let lots = ok ? Math.floor((balanceUsd * fraction * leverage) / price) : 0;
  if (maxLots !== undefined && Number.isFinite(maxLots)) lots = Math.min(lots, Math.max(0, Math.floor(maxLots)));
  return { lots, balanceUsd, leverage, price, notionalUsd: lots * price };
}
