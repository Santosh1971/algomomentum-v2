// lib/strategies/types.ts

export interface Candle {
  time: number;   // unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
}

export type SignalType = "long_entry" | "short_entry" | "long_exit" | "short_exit";

export interface Signal {
  time: number;       // candle time
  type: SignalType;
  price: number;      // entry price
  sl: number;         // stop loss
  tp: number;         // take profit
  label: string;      // display label
}

export interface TradeResult {
  entryTime: number;
  exitTime: number;
  entryPrice: number;
  exitPrice: number;
  sl: number;
  tp: number;
  side: "long" | "short";
  exitReason: "tp" | "sl" | "signal" | "session_end";
  pnlPct: number;     // % gain/loss
  pnlR: number;       // in R multiples (1R = risk amount)
}

export interface BacktestStats {
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  totalPnlR: number;
  avgWinR: number;
  avgLossR: number;
  maxDrawdownR: number;
  profitFactor: number;
}

export interface StrategyConfig {
  symbol: string;
  timeframe: string;
  rr: number;               // reward:risk ratio e.g. 2
  sessionStart: string;     // "09:30" IST
  sessionEnd: string;       // "23:30" IST
  // PDH/PDL specific
  retestBuffer?: number;    // % buffer for retest zone e.g. 0.2
  // EMA specific
  emaFast?: number;         // 9
  emaSlow?: number;         // 21
}

export interface BacktestResult {
  signals: Signal[];
  trades: TradeResult[];
  stats: BacktestStats;
  // overlays for chart
  pdh?: number;
  pdl?: number;
  emaFast?: number[];       // one value per candle
  emaSlow?: number[];
  candleTimes?: number[];   // aligned with ema arrays
}
