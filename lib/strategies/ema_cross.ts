// lib/strategies/ema_cross.ts
// 9/21 EMA Crossover strategy

import { Candle, Signal, StrategyConfig, BacktestResult, TradeResult } from "./types";
import { computeStats, isInSession, simulateTrades } from "./runner";

function calcEMA(closes: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const ema: number[] = [];
  let prev = closes[0];
  for (let i = 0; i < closes.length; i++) {
    const val = i === 0 ? closes[0] : closes[i] * k + prev * (1 - k);
    ema.push(val);
    prev = val;
  }
  return ema;
}

export function runEmaCross(candles: Candle[], config: StrategyConfig): BacktestResult {
  if (candles.length < 30) {
    return { signals: [], trades: [], stats: computeStats([]) };
  }

  const fast = config.emaFast ?? 9;
  const slow = config.emaSlow ?? 21;
  const rr = config.rr ?? 2;

  const closes = candles.map(c => c.close);
  const emaFastArr = calcEMA(closes, fast);
  const emaSlowArr = calcEMA(closes, slow);

  const signals: Signal[] = [];
  let inTrade = false;

  for (let i = slow + 1; i < candles.length; i++) {
    const c = candles[i];
    if (!isInSession(c.time, config.sessionStart, config.sessionEnd)) continue;
    if (inTrade) continue;

    const prevFast = emaFastArr[i - 1];
    const prevSlow = emaSlowArr[i - 1];
    const curFast = emaFastArr[i];
    const curSlow = emaSlowArr[i];

    // Golden cross — fast crosses above slow → LONG
    if (prevFast <= prevSlow && curFast > curSlow) {
      // SL = lowest low of last 3 candles
      const sl = Math.min(candles[i - 2].low, candles[i - 1].low, c.low);
      const risk = c.close - sl;
      if (risk <= 0) continue;
      const tp = c.close + risk * rr;
      signals.push({ time: c.time, type: "long_entry", price: c.close, sl, tp, label: `EMA ${fast}/${slow} Cross Up` });
      inTrade = true;
    }
    // Death cross — fast crosses below slow → SHORT
    else if (prevFast >= prevSlow && curFast < curSlow) {
      const sl = Math.max(candles[i - 2].high, candles[i - 1].high, c.high);
      const risk = sl - c.close;
      if (risk <= 0) continue;
      const tp = c.close - risk * rr;
      signals.push({ time: c.time, type: "short_entry", price: c.close, sl, tp, label: `EMA ${fast}/${slow} Cross Down` });
      inTrade = true;
    }
  }

  const trades = simulateTrades(signals, candles, config);
  const stats = computeStats(trades);

  return {
    signals, trades, stats,
    emaFast: emaFastArr,
    emaSlow: emaSlowArr,
    candleTimes: candles.map(c => c.time),
  };
}
