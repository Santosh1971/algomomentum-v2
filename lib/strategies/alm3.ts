// lib/strategies/alm3.ts
import { Candle, TradeResult, BacktestResult } from "./types";
import { computeStats, isInSession } from "./runner";

export interface ALM3Config {
  stTimeframe: number;
  atrPeriod: number;
  factor: number;
  t3Fast: number;
  t3Slow: number;
  switchSLPercent: number;
  drawdownPercent: number;
  liquidatePercent: number;
  targetLongPercent: number;
  targetShortPercent: number;
  useADX: boolean;
  adxThreshold: number;
  useHTF_ST: boolean;
  htfTimeframe: number;
  sessionStart: string;
  sessionEnd: string;
}

export interface ALM3Signal {
  time: number;
  type: "long_entry" | "short_entry";
  price: number;
  drawdownSL: number;
  liquidateSL: number;
  switchSLPrice: number;
  target: number;
  label: string;
}

export interface ALM3BacktestResult extends BacktestResult {
  alm3Signals: ALM3Signal[];
  t3Fast: number[];
  t3Slow: number[];
  stValues: number[];
  stDirection: number[];
  htfDirection: number[];
  candleTimes: number[];
}

export function aggregateBars(candles: Candle[], targetMinutes: number, sourceMinutes: number): Candle[] {
  const barsNeeded = Math.round(targetMinutes / sourceMinutes);
  const result: Candle[] = [];
  let i = 0;
  while (i < candles.length) {
    const group = candles.slice(i, i + barsNeeded);
    if (group.length === 0) break;
    result.push({
      time: group[0].time,
      open: group[0].open,
      high: Math.max(...group.map(c => c.high)),
      low: Math.min(...group.map(c => c.low)),
      close: group[group.length - 1].close,
    });
    i += barsNeeded;
  }
  return result;
}

function calcATR(candles: Candle[], period: number): number[] {
  const atr: number[] = new Array(candles.length).fill(0);
  const tr: number[] = candles.map((c, i) => {
    if (i === 0) return c.high - c.low;
    const p = candles[i - 1].close;
    return Math.max(c.high - c.low, Math.abs(c.high - p), Math.abs(c.low - p));
  });
  atr[period - 1] = tr.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < candles.length; i++) {
    atr[i] = (atr[i - 1] * (period - 1) + tr[i]) / period;
  }
  return atr;
}

export function calcSuperTrend(candles: Candle[], factor: number, atrPeriod: number): { st: number[]; dir: number[] } {
  const atr = calcATR(candles, atrPeriod);
  const st = new Array(candles.length).fill(0);
  const dir = new Array(candles.length).fill(1);
  for (let i = 1; i < candles.length; i++) {
    const hl2 = (candles[i].high + candles[i].low) / 2;
    const upper = hl2 + factor * atr[i];
    const lower = hl2 - factor * atr[i];
    const prevST = st[i - 1];
    const prevDir = dir[i - 1];
    let newST: number, newDir: number;
    if (prevDir <= 0) {
      const newLower = Math.max(lower, prevST);
      if (candles[i].close < newLower) { newST = upper; newDir = 1; }
      else { newST = newLower; newDir = -1; }
    } else {
      const newUpper = Math.min(upper, prevST);
      if (candles[i].close > newUpper) { newST = lower; newDir = -1; }
      else { newST = newUpper; newDir = 1; }
    }
    st[i] = newST; dir[i] = newDir;
  }
  return { st, dir };
}

function calcEMA(values: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const ema: number[] = [values[0]];
  for (let i = 1; i < values.length; i++) ema.push(values[i] * k + ema[i - 1] * (1 - k));
  return ema;
}

export function calcT3(candles: Candle[], length: number): number[] {
  const b = 0.7;
  const c1 = -b*b*b, c2 = 3*b*b + 3*b*b*b, c3 = -6*b*b - 3*b - 3*b*b*b, c4 = 1 + 3*b + b*b*b + 3*b*b;
  const closes = candles.map(c => c.close);
  const e1 = calcEMA(closes, length);
  const e2 = calcEMA(e1, length);
  const e3 = calcEMA(e2, length);
  const e4 = calcEMA(e3, length);
  const e5 = calcEMA(e4, length);
  const e6 = calcEMA(e5, length);
  return e6.map((_, i) => c1*e6[i] + c2*e5[i] + c3*e4[i] + c4*e3[i]);
}

function calcADX(candles: Candle[], period: number): { adx: number[] } {
  const n = candles.length;
  const adx = new Array(n).fill(0);
  const trArr: number[] = [], dmP: number[] = [], dmM: number[] = [];
  for (let i = 0; i < n; i++) {
    if (i === 0) { trArr.push(candles[i].high - candles[i].low); dmP.push(0); dmM.push(0); continue; }
    const h = candles[i].high, l = candles[i].low, ph = candles[i-1].high, pl = candles[i-1].low, pc = candles[i-1].close;
    trArr.push(Math.max(h-l, Math.abs(h-pc), Math.abs(l-pc)));
    const up = h-ph, dn = pl-l;
    dmP.push(up > dn && up > 0 ? up : 0);
    dmM.push(dn > up && dn > 0 ? dn : 0);
  }
  function ws(arr: number[], p: number): number[] {
    const out = new Array(arr.length).fill(0);
    out[p-1] = arr.slice(0, p).reduce((a,b) => a+b, 0);
    for (let i = p; i < arr.length; i++) out[i] = out[i-1] - out[i-1]/p + arr[i];
    return out;
  }
  const sTR = ws(trArr, period), sDP = ws(dmP, period), sDM = ws(dmM, period);
  for (let i = period; i < n; i++) {
    const dp = sTR[i] > 0 ? (sDP[i]/sTR[i])*100 : 0;
    const dm = sTR[i] > 0 ? (sDM[i]/sTR[i])*100 : 0;
    const dx = (dp+dm) > 0 ? (Math.abs(dp-dm)/(dp+dm))*100 : 0;
    adx[i] = i === period ? dx : (adx[i-1]*(period-1)+dx)/period;
  }
  return { adx };
}

function mapHTF(chartCandles: Candle[], htfCandles: Candle[], htfValues: number[]): number[] {
  return chartCandles.map(c => {
    let last = htfValues[0] ?? 0;
    for (let i = 0; i < htfCandles.length; i++) {
      if (htfCandles[i].time <= c.time) last = htfValues[i];
      else break;
    }
    return last;
  });
}

function makeTrade(side: "long"|"short", entry: number, exit: number, exitTime: number, entryTime: number, sl: number, tp: number, reason: string): TradeResult {
  const pnl = side === "long" ? exit - entry : entry - exit;
  // Risk = distance from entry to SL (always positive)
  const risk = Math.abs(entry - sl);
  const exitReason = reason === "tp" ? "tp" : reason === "sl" ? "sl" : "signal";
  return {
    entryTime, exitTime, entryPrice: entry, exitPrice: exit, sl, tp, side,
    exitReason,
    pnlPct: entry > 0 ? (pnl/entry)*100 : 0,
    pnlR: risk > 0 ? pnl/risk : 0,
  };
}

export function runALM3(chartCandles: Candle[], stCandles5m: Candle[], htfCandles: Candle[], config: ALM3Config): ALM3BacktestResult {
  const n = chartCandles.length;
  const empty = { signals: [], trades: [], stats: computeStats([]), alm3Signals: [], t3Fast: [], t3Slow: [], stValues: [], stDirection: [], htfDirection: [], candleTimes: [] };
  if (n < 50) return empty;

  const stBars = aggregateBars(stCandles5m, config.stTimeframe, 5);
  const { st: stST, dir: stDir } = calcSuperTrend(stBars, config.factor, config.atrPeriod);
  const chartST = mapHTF(chartCandles, stBars, stST);
  const chartSTDir = mapHTF(chartCandles, stBars, stDir);
  const { dir: htfDir } = calcSuperTrend(htfCandles, config.factor, config.atrPeriod);
  const chartHTFDir = mapHTF(chartCandles, htfCandles, htfDir);
  const t3FastArr = calcT3(chartCandles, config.t3Fast);
  const t3SlowArr = calcT3(chartCandles, config.t3Slow);
  const { adx: adxArr } = calcADX(chartCandles, 14);

  const alm3Signals: ALM3Signal[] = [];
  const trades: TradeResult[] = [];
  let inTrade: "long"|"short"|null = null;
  let entryPrice = 0, drawdownSL = 0, liquidateSL = 0, switchSLPrice = 0, target = 0;
  let switchAchieved = false, entryIdx = -1;

  for (let i = 2; i < n; i++) {
    const c = chartCandles[i];
    if (!isInSession(c.time, config.sessionStart, config.sessionEnd)) continue;

    const positiveTrend = chartSTDir[i] < 0;
    const negativeTrend = chartSTDir[i] > 0;
    const htfBullish = chartHTFDir[i] < 0;
    const htfBearish = chartHTFDir[i] > 0;
    const adxOk = !config.useADX || adxArr[i] >= config.adxThreshold;
    const htfOkLong = !config.useHTF_ST || htfBullish;
    const htfOkShort = !config.useHTF_ST || htfBearish;

    const f = t3FastArr[i], s = t3SlowArr[i];
    const f1 = t3FastArr[i-1], s1 = t3SlowArr[i-1];
    const f2 = t3FastArr[i-2], s2 = t3SlowArr[i-2];

    const greenRibbon = s < f, redRibbon = s > f;
    const greenRibbon1 = s1 < f1, redRibbon1 = s1 > f1;
    const greenRibbon2 = s2 < f2, redRibbon2 = s2 > f2;

    const close = c.close, open = c.open;

    if (inTrade === "long") {
      // Update liquidateSL dynamically from current ST (trailing)
      if (chartST[i] > 0) {
        const newLiqSL = chartST[i] * (1 - config.liquidatePercent/100);
        // For long: liquidateSL trails up with ST — only move it UP (tighter)
        if (newLiqSL > liquidateSL) liquidateSL = newLiqSL;
      }

      if (!switchAchieved && close >= switchSLPrice) switchAchieved = true;
      if (switchAchieved && close < s) {
        trades.push(makeTrade("long", entryPrice, close, c.time, chartCandles[entryIdx].time, drawdownSL, target, "switchSL"));
        inTrade = null; switchAchieved = false; continue;
      }
      // Pine: stopPrice = math.max(liquidatePrice, drawdownPrice) for long
      const stop = Math.max(liquidateSL, drawdownSL);
      if (c.low <= stop) {
        trades.push(makeTrade("long", entryPrice, stop, c.time, chartCandles[entryIdx].time, drawdownSL, target, "sl"));
        inTrade = null; switchAchieved = false; continue;
      }
      if (c.high >= target) {
        trades.push(makeTrade("long", entryPrice, target, c.time, chartCandles[entryIdx].time, drawdownSL, target, "tp"));
        inTrade = null; switchAchieved = false; continue;
      }
    }

    if (inTrade === "short") {
      // Update liquidateSL dynamically from current ST (trailing)
      if (chartST[i] > 0) {
        const newLiqSL = chartST[i] * (1 + config.liquidatePercent/100);
        // For short: liquidateSL trails down with ST — only move it DOWN (tighter)
        if (newLiqSL < liquidateSL) liquidateSL = newLiqSL;
      }

      if (!switchAchieved && close <= switchSLPrice) switchAchieved = true;
      if (switchAchieved && close > s) {
        trades.push(makeTrade("short", entryPrice, close, c.time, chartCandles[entryIdx].time, drawdownSL, target, "switchSL"));
        inTrade = null; switchAchieved = false; continue;
      }
      // stop = the LOWER of the two SL levels (nearer to current price for short going down)
      // Actually Pine uses: stopPrice = math.min(liquidatePrice, drawdownPrice)
      // For short both are above entry, min = the one closer to entry = tighter stop
      const stop = Math.min(liquidateSL, drawdownSL);
      if (c.high >= stop) {
        trades.push(makeTrade("short", entryPrice, stop, c.time, chartCandles[entryIdx].time, drawdownSL, target, "sl"));
        inTrade = null; switchAchieved = false; continue;
      }
      if (c.low <= target) {
        trades.push(makeTrade("short", entryPrice, target, c.time, chartCandles[entryIdx].time, drawdownSL, target, "tp"));
        inTrade = null; switchAchieved = false; continue;
      }
    }

    if (inTrade) continue;

    const longCond = positiveTrend && adxOk && htfOkLong && close >= open &&
      ((close >= f && close >= s && redRibbon) ||
       (close >= f && close >= s && greenRibbon && redRibbon1 && redRibbon2));

    const shortCond = negativeTrend && adxOk && htfOkShort && close <= open &&
      ((close <= f && close <= s && greenRibbon) ||
       (close <= f && close <= s && redRibbon && greenRibbon1 && greenRibbon2));

    if (longCond) {
      entryPrice = close;
      drawdownSL = entryPrice * (1 - config.drawdownPercent/100);
      liquidateSL = chartST[i] * (1 - config.liquidatePercent/100);
      switchSLPrice = entryPrice * (1 + config.switchSLPercent/100);
      target = entryPrice * (1 + config.targetLongPercent/100);
      alm3Signals.push({ time: c.time, type: "long_entry", price: entryPrice, drawdownSL, liquidateSL, switchSLPrice, target, label: "ALM3 Long" });
      inTrade = "long"; entryIdx = i; switchAchieved = false;
    } else if (shortCond) {
      entryPrice = close;
      drawdownSL = entryPrice * (1 + config.drawdownPercent/100);
      liquidateSL = chartST[i] * (1 + config.liquidatePercent/100);
      switchSLPrice = entryPrice * (1 - config.switchSLPercent/100);
      target = entryPrice * (1 - config.targetShortPercent/100);
      alm3Signals.push({ time: c.time, type: "short_entry", price: entryPrice, drawdownSL, liquidateSL, switchSLPrice, target, label: "ALM3 Short" });
      inTrade = "short"; entryIdx = i; switchAchieved = false;
    }
  }

  if (inTrade && entryIdx >= 0) {
    const last = chartCandles[n-1];
    trades.push(makeTrade(inTrade, entryPrice, last.close, last.time, chartCandles[entryIdx].time, drawdownSL, target, "session_end"));
  }

  const stats = computeStats(trades);
  return {
    signals: alm3Signals.map(s => ({ time: s.time, type: s.type, price: s.price, sl: s.drawdownSL, tp: s.target, label: s.label })),
    trades, stats, alm3Signals,
    t3Fast: t3FastArr, t3Slow: t3SlowArr,
    stValues: chartST, stDirection: chartSTDir,
    htfDirection: chartHTFDir,
    candleTimes: chartCandles.map(c => c.time),
  };
}
