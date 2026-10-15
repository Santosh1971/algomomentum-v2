# Live runner for ALM3 XRP T3 — design (draft for review, nothing built)

Status: **design only.** No live-order code exists. Nothing here is deployed.
Prepared 15 Oct 2026 from Delta's public API docs (docs.delta.exchange) and the
existing order code in `lib/deltaClient.ts` and the webhook routes. Items marked
**VERIFY** were not confirmable from the docs and must be tested on Delta's
testnet before relying on them.

## Goal

Run the strategy inside AlgoMomentum and place the orders itself, instead of
TradingView alert -> webhook -> orders. Same logic as `alm3XrpT3.ts`.

## What Delta offers (from the docs)

- Base URLs: production `https://api.india.delta.exchange` (what the app uses);
  **India testnet/demo `https://cdn-ind.testnet.deltaex.org`**. Demo-account keys
  work only on testnet, production keys only on production.
- `POST /v2/orders` accepts, besides the market/limit fields we already send:
  `stop_order_type` (`stop_loss_order` | `take_profit_order`), `stop_price`,
  `stop_trigger_method` (`mark_price` | `last_traded_price` | `spot_price`),
  `reduce_only`, and bracket fields (`bracket_stop_loss_price`,
  `bracket_take_profit_price`, `bracket_stop_trigger_method`, limit variants).
- `PUT /v2/orders` edits an order (`stop_price` included); `DELETE /v2/orders`
  cancels. `POST/PUT /v2/orders/bracket` places/edits a bracket on a position;
  "size need not be specified, it closes the entire position"; only one bracket
  per open position.
- Rate limit 20,000 per 5-minute window; place/edit/cancel cost 5 each. A 30-min
  strategy uses a few dozen units per bar — irrelevant.
- Candles (`/v2/history/candles`) are public, unauthenticated, not billed.

## How each Pine exit maps to a Delta order

| Pine | Needs | Delta mechanism |
|---|---|---|
| `strategy.exit(stop=...)` — liquidation / drawdown SL | fills at the price level, intrabar | native stop-loss order, `reduce_only`, trigger on `last_traded_price` (**VERIFY** vs mark; TradingView's chart uses last/traded prices) |
| `strategy.exit(limit=...)` — target (8.3% short, 9999% long = never) | fills at level | native take-profit order / bracket TP |
| stop moves every bar (SuperTrend moves; after "switch SL" it follows slow T3) | re-price each bar | edit the stop (`PUT /orders`) once per bar, shortly after close |
| `strategy.close` — ribbon cross after switch SL | decided at bar close | runner computes at bar close, sends a reduce-only market order, then cancels leftover stop/TP |
| "close already beyond the new stop" (hybrid case) | exit at close | same as above: market reduce-only at bar close |

Open questions to answer on testnet before any real money (**VERIFY**):
1. Does editing a stop to a price already beyond the market get rejected, or fire
   immediately? (Affects the hybrid case.)
2. Stop-market vs stop-limit: which `order_type` gives a reliable fill at/near the
   stop price in fast moves, and what slippage is typical.
3. Do attached SL/TP orders auto-cancel when the position is closed by another
   order? (The docs excerpt does not say.)
4. Do OAuth tokens (`Authorization: <token>`) have permission to place stop and
   bracket orders, or only API keys? (Our accounts are OAuth.)
5. Behaviour on `last_traded_price` vs `mark_price` triggers around wicks.

## Runner design

- **Where:** a scheduled job in the existing Next/PM2 process (the app already runs
  node crons). Fires at :00:10 and :30:10 IST — a few seconds after each 30-min
  bar closes — fetches the latest *closed* candles, evaluates the strategy.
- **State:** persisted in the database, not memory (survives PM2 restarts):
  position side, entry price/time, switch-SL flag, current stop/target, last
  processed bar time, and the order IDs it placed.
- **Engine refactor:** `runALM3XrpT3` is a batch function over history. The live
  runner needs a *step* form (feed one new closed bar, get actions). The
  batch function is then rebuilt on top of the step, and a test asserts the two
  give identical trades on the full history — so live cannot drift from the
  backtest.
- **Indicator history:** feed ~20 days of candles each run (as the backtester
  does). Test that the signal does not change when more or less history is fed.
- **Source of truth:** Delta, not our DB. Each run first reads the account's
  actual position; if it disagrees with the runner's state, the runner stops and
  alerts rather than guessing.
- **Idempotency:** deterministic `client_order_id` per (strategy, bar, action) so a
  retry after a timeout cannot double-fire.
- **Fail-safe:** if the candle fetch or any order call fails, do nothing new and
  alert; never open a position without a stop confirmed on Delta. If an entry
  fills but the stop placement fails, close the position immediately.

## Safety switches (all required before the first real order)

1. `engineLive` flag per strategy/account, default **off**.
2. **Shadow mode** first: runner computes and logs the orders it *would* send, with
   no orders at all. Compare against TradingView alerts for 1–2 weeks.
3. Global kill switch, and a max size per order.
4. The TradingView webhook for the same account must be **off** while the runner
   is live on it, or both will trade.
5. Alerts (the app already has a Telegram/log path? — to confirm) on any mismatch
   or failure.

## Testing without touching your main account

Delta positions are per account, so a different account cannot clash with your
running XRP trade. Two options, in this order:

1. **Testnet (no real money).** Create a demo account on the India testnet
   (`cdn-ind.testnet.deltaex.org`), generate API keys there, and point a
   non-production copy of the code at that base URL. This is where the
   questions above get answered. Needs a small change: make `BASE_URL` in
   `lib/deltaClient.ts` configurable (default unchanged = production).
2. **Sub-account on production, minimum size.** Delta supports sub-accounts; an API
   key is created *for* a chosen account (Main or a sub-account). The app already
   supports API-key accounts alongside OAuth, so a sub-account key can be added as
   a separate account. Fund it with a small amount, run shadow mode, then live
   at the smallest lot. Notes: the key needs "Trading" permission and the VPS IP
   (87.76.191.157) allow-listed (**VERIFY** in Delta's key settings); whether
   *OAuth* login can target a sub-account is unknown — ask Delta.

## Phases

0. (done) Engine + backtest + admin preview.
1. **Decided 15 Oct: skip testnet, probe directly on a funded sub-account at 1 lot**
   (`scripts/deltaProbe.ts`: entry, reduce-only stop, target, stop edit, the
   edit-beyond-market edge case, then cancel + flatten). Answers the VERIFY list
   above with API-key auth. Whether *OAuth* tokens can place stop orders stays
   open (main account is OAuth) — only matters if the runner is ever used there.
2. Refactor engine into step form; equivalence test against the batch backtest.
3. Runner in **shadow mode** on production (logs only).
4. Sub-account live, minimum size, webhook off for that account.
5. Decide on main/subscriber accounts. Separate decision, not assumed.

## Probe results — 15 Oct 2026, sub-account, 1 lot, API-key auth

Run via `scripts/deltaProbe.ts` on the VPS (account Sub1_Santosh, 2x, XRPUSD).

| Question | Result |
|---|---|
| Market entry | OK. Filled 1.3024 vs last 1.3019. |
| Reduce-only stop-market stop-loss (`stop_order_type: stop_loss_order`, `stop_trigger_method: last_traded_price`) | Accepted. |
| Reduce-only limit target | Accepted. |
| Edit stop (`PUT /v2/orders` with `id`, `product_id`, `product_symbol`, `stop_price`) | OK. |
| Edit stop to a price already beyond the market | **Rejected**, HTTP 400, `immediate_execution_stop_order`. The old stop stays. So when the recomputed stop is already beyond the close (the "hybrid" case) the runner must close at market itself, not try to edit. |
| Cancel orders, flatten with market reduce-only | OK; account ended flat. |

| Position closed by another order (market reduce-only) while a stop and a limit target are open (`--scenario autocancel`) | The limit target was cancelled automatically; **the stop-loss stayed open** with no position. A leftover reduce-only stop would then hit the *next* position. **Runner rule: after every exit cancel all open stops on the product; before every entry verify there are none.** |

Not yet answered: actual stop fill slippage in a fast move and
`last_traded_price` vs `mark_price` behaviour (will only show up in live use on the
sub-account); whether OAuth tokens can place stop orders (only matters for OAuth accounts).
