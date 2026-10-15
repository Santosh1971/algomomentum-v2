# Native strategy engine — ALM3 XRP T3 (work in progress)

Branch: `feature/native-strategy-backtester` (not merged to `main`, nothing deployed, no live trading affected).

## What this is

A TypeScript port of `ALM3_XRP_30_T3_1000_Feb9.pine` — the goal is to eventually
run this strategy natively in the app instead of relying on a TradingView
alert webhook, starting with a historical backtester (this phase) before any
live-trading runner is attempted.

## Files

- `indicators.ts` — EMA, Wilder's RMA/ATR, SuperTrend, and the T3 ribbon
  formula, as standalone reusable functions.
- `alm3XrpT3.ts` — the strategy's entry/exit state machine, bar-by-bar.
- `backtestRunner.ts` — turns a trade list into the same stats shape
  (`equityData`, `winRate`, `maxDrawdown`, `profitFactor`, `totalTrades`,
  `backtestTrades`) that `lib/parseBacktest.ts` already produces from a
  TradingView CSV/XLSX export, so a native backtest can populate the
  existing `Strategy`/`StrategyTrade` rows and render in the existing admin
  UI unchanged.
- `scripts/validateALM3XrpT3.ts` (repo root `scripts/`) — standalone runner
  against real XRPUSD history, for eyeballing trade output and stats.
- `scripts/dumpIndicators.ts` + `scripts/cross_check.py` — cross-validation
  harness used to verify the indicator math independently (see below).

## What's been validated so far

Run against real XRPUSD candles pulled from Delta (30-min, Jan 10 2026 –
Oct 14 2026, 13,344 bars):

- **T3 ribbon (both lengths)**: matches an independent pandas EMA-cascade
  implementation to **0.00000000** absolute difference across 500 bars.
- **SuperTrend**: matches an independent, hand-coded-from-scratch Python
  implementation of Pine's own documented `ta.supertrend` source to
  **zero** direction mismatches and **zero** line-value difference across
  500 bars. (It does *not* match `pandas_ta`'s `supertrend()` — that
  library implements a different seeding/variant of SuperTrend, which is a
  known cross-library inconsistency, not evidence of a bug here. Pine's own
  documented source is the ground truth we're targeting, not pandas_ta.)
- Engine sanity run over the full 8+ months: 332 trades, diverse exit-reason
  mix (not collapsed into one reason, which would indicate a bug), ~50.9%
  win rate, 1.538 profit factor, ~11.9h average holding time — all
  structurally plausible for this kind of mean-reversion-with-trend-filter
  strategy.

## Cross-check against a real TradingView export (done 15 Oct 2026)

Compared against TV's Strategy Tester export for this exact script
(XRPUSD.P, 30m, 367 trades, +72.29% from Jan 10 to Oct 14 2026). Run with
`npx tsx scripts/compareTV.ts hybrid && python3 scripts/compareTV.py`
(needs the TV CSV saved as `backtest-data/tv_export.csv`; the TV export
timestamps are IST).

| stop handling | exit bar matched | exit price matched |
|---|---|---|
| intrabar fill at stop level | 313 | 305 |
| close-based only | 199 | 82 |
| **hybrid (default)** | **352** | **344** |

Hybrid = the stop placed at the previous bar's close fills intrabar at its
level; then, after the stop is recomputed on the current bar (SuperTrend
moves), if the close is already beyond the new stop the trade exits at that
close. That second case is what TV does on bars where SuperTrend jumps
through price.

Result: 357 of 367 TV entries reproduced with identical entry prices, 352
of those exit on the same bar, and compounded return is +74.8% vs TV's
+72.3%.

### Still open

- ~10 trades where this engine takes a fresh entry a few bars *before* TV
  does after a stop-out (e.g. 13 Apr 03:30 vs TV 07:30); both then exit
  together. Cause not identified — would need TV's own indicator values for
  those bars. Suspects: indicator warm-up/seeding differences, or an
  entry-flag detail in the Pine source.
- A few early-January differences are expected: the fetched history starts
  9 Jan, so indicators are less warmed up than in TV.
- Position sizing: TV rounds quantity and uses ~100% of equity; the runner
  here compounds the percentage return. Not compared in detail.

## Known, deliberate simplifications

- The `ref_tf` (5-min) "gap boost target" feature from the Pine source is
  **not implemented**. It's gated behind `IncreseTargetEnable`, which
  defaults to `false` in the deployed script — so it has zero effect on the
  parameters actually used in production. If that input is ever turned on,
  this engine will not reproduce its effect.
- Commission is a flat 0.03% per fill (matches the Pine `strategy()`
  declaration) applied against full position value per trade — a
  non-compounding approximation at the single-trade level; equity
  compounding between trades is handled by `backtestRunner.ts`.

## Next steps (not started)

- `StrategyConfig` parameter model (DB + admin form) so the constants in
  `ALM3_XRP_T3_DEFAULTS` become editable per-strategy instead of hardcoded.
- Wire `backtestRunner.ts`'s output into an actual API route that creates/
  updates a `Strategy` row + `StrategyTrade` rows, reusing
  `app/api/v1/admin/strategies/[id]/route.ts`'s existing persistence shape.
- A "Run native backtest" button in `/admin/strategies` alongside the
  existing "upload TV export" flow.
- Only after the above is reviewed and the TV-export cross-check is done:
  a live runner (separate, much more cautious phase — not started, not
  scheduled).
