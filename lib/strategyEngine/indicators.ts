// lib/strategyEngine/indicators.ts
//
// Pure, dependency-free re-implementations of the Pine Script v6 built-ins
// used by the ALM3 strategy family (ta.ema, ta.atr/RMA, ta.supertrend) plus
// the T3 "ribbon" formula used throughout ALM3 scripts.
//
// These are written to match Pine's exact seeding/smoothing behavior, not
// just the textbook formula, since small seeding differences compound over
// thousands of bars and would make backtest numbers diverge from what
// TradingView shows.

export interface Candle {
  time: number; // unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

/**
 * Pine's ta.ema(source, length).
 * Seeds the first value with source[0] itself (there's no prior EMA to
 * smooth against on the first bar), then applies the standard
 * alpha = 2/(length+1) recursive smoothing from there.
 */
export function ema(source: number[], length: number): number[] {
  const alpha = 2 / (length + 1);
  const out = new Array(source.length).fill(NaN);
  if (source.length === 0) return out;
  out[0] = source[0];
  for (let i = 1; i < source.length; i++) {
    out[i] = alpha * source[i] + (1 - alpha) * out[i - 1];
  }
  return out;
}

/**
 * Pine's ta.rma(source, length) — Wilder's smoothing, used internally by
 * ta.atr. Seeds with a plain SMA over the first `length` values (Pine's
 * documented behavior), then recurses as rma[i] = (rma[i-1]*(length-1) +
 * source[i]) / length.
 */
export function rma(source: number[], length: number): number[] {
  const out = new Array(source.length).fill(NaN);
  if (source.length < length) return out;
  let seedSum = 0;
  for (let i = 0; i < length; i++) seedSum += source[i];
  out[length - 1] = seedSum / length;
  for (let i = length; i < source.length; i++) {
    out[i] = (out[i - 1] * (length - 1) + source[i]) / length;
  }
  return out;
}

/** True range per bar, with the standard gap-aware definition Pine's ta.tr(true) uses. */
export function trueRange(candles: Candle[]): number[] {
  const out = new Array(candles.length).fill(NaN);
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    if (i === 0) {
      out[i] = c.high - c.low;
    } else {
      const prevClose = candles[i - 1].close;
      out[i] = Math.max(c.high - c.low, Math.abs(c.high - prevClose), Math.abs(c.low - prevClose));
    }
  }
  return out;
}

export function atr(candles: Candle[], length: number): number[] {
  return rma(trueRange(candles), length);
}

export interface SupertrendResult {
  supertrend: number[];
  direction: number[]; // -1 = uptrend (bullish), 1 = downtrend (bearish) — matches Pine's ta.supertrend convention
}

/**
 * Pine's ta.supertrend(factor, atrPeriod), reimplemented from TradingView's
 * published built-in source (not the older community "basic/final band"
 * formulation, which has a subtly different flip condition).
 */
export function supertrend(candles: Candle[], factor: number, atrPeriod: number): SupertrendResult {
  const n = candles.length;
  const atrVals = atr(candles, atrPeriod);
  const upperBand = new Array(n).fill(NaN);
  const lowerBand = new Array(n).fill(NaN);
  const st = new Array(n).fill(NaN);
  const dir = new Array(n).fill(NaN);

  for (let i = 0; i < n; i++) {
    const hl2 = (candles[i].high + candles[i].low) / 2;
    if (isNaN(atrVals[i])) continue;

    let ub = hl2 + factor * atrVals[i];
    let lb = hl2 - factor * atrVals[i];

    const prevUB = i > 0 ? upperBand[i - 1] : NaN;
    const prevLB = i > 0 ? lowerBand[i - 1] : NaN;
    const prevClose = i > 0 ? candles[i - 1].close : NaN;

    if (!isNaN(prevLB)) {
      lb = lb > prevLB || prevClose < prevLB ? lb : prevLB;
    }
    if (!isNaN(prevUB)) {
      ub = ub < prevUB || prevClose > prevUB ? ub : prevUB;
    }
    upperBand[i] = ub;
    lowerBand[i] = lb;

    const prevATR = i > 0 ? atrVals[i - 1] : NaN;
    const prevST = i > 0 ? st[i - 1] : NaN;

    let direction: number;
    if (isNaN(prevATR)) {
      direction = 1;
    } else if (prevST === prevUB) {
      direction = candles[i].close > ub ? -1 : 1;
    } else {
      direction = candles[i].close < lb ? 1 : -1;
    }
    dir[i] = direction;
    st[i] = direction === -1 ? lb : ub;
  }

  return { supertrend: st, direction: dir };
}

/**
 * The T3 ribbon formula used throughout the ALM3 scripts: a 6-stage
 * cascaded EMA of the given length, combined with Tillson's T3
 * coefficients using a fixed b = 0.7.
 */
export function t3(source: number[], length: number): number[] {
  const e1 = ema(source, length);
  const e2 = ema(e1, length);
  const e3 = ema(e2, length);
  const e4 = ema(e3, length);
  const e5 = ema(e4, length);
  const e6 = ema(e5, length);

  const b = 0.7;
  const c1 = -b * b * b;
  const c2 = 3 * b * b + 3 * b * b * b;
  const c3 = -6 * b * b - 3 * b - 3 * b * b * b;
  const c4 = 1 + 3 * b + b * b * b + 3 * b * b;

  const out = new Array(source.length).fill(NaN);
  for (let i = 0; i < source.length; i++) {
    out[i] = c1 * e6[i] + c2 * e5[i] + c3 * e4[i] + c4 * e3[i];
  }
  return out;
}
