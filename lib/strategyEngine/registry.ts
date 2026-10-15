// lib/strategyEngine/registry.ts
// Catalogue of native engines an admin can attach to a Strategy, including
// the metadata the admin UI needs to render an editable parameter form.

import { Candle } from "./indicators";
import { ALM3_XRP_T3_DEFAULTS, ALM3XrpT3Config, Trade, runALM3XrpT3 } from "./alm3XrpT3";

export interface ParamField {
  key: string;
  label: string;
  step?: number;
  min?: number;
}

export interface EngineDef {
  label: string;
  candleResolution: string; // the engine's native candle timeframe
  warmupDays: number; // history fetched before the requested start, for indicator warm-up
  defaults: Record<string, any>;
  fields: ParamField[];
  run: (candles: Candle[], cfg: any) => Trade[];
}

export const ENGINES: Record<string, EngineDef> = {
  alm3_xrp_t3: {
    label: "ALM3 XRP T3 (SuperTrend + T3 ribbon)",
    candleResolution: "30m",
    warmupDays: 20,
    defaults: ALM3_XRP_T3_DEFAULTS,
    fields: [
      { key: "atrPeriod", label: "SuperTrend ATR period", step: 1, min: 1 },
      { key: "factor", label: "SuperTrend factor", step: 0.1, min: 0.1 },
      { key: "t3FastLength", label: "T3 fast length", step: 1, min: 1 },
      { key: "t3SlowLength", label: "T3 slow length", step: 1, min: 1 },
      { key: "switchSlPercent", label: "Switch SL %", step: 0.1, min: 0 },
      { key: "drawdownPercent", label: "Drawdown SL %", step: 0.1, min: 0.1 },
      { key: "liquidatePercent", label: "Liquidity SL %", step: 0.1, min: 0.1 },
      { key: "targetLongPercent", label: "Buy target %", step: 0.1, min: 0.1 },
      { key: "targetShortPercent", label: "Sell target %", step: 0.1, min: 0.1 },
      { key: "commissionPercent", label: "Commission % per fill", step: 0.01, min: 0 },
    ],
    run: (candles, cfg: ALM3XrpT3Config) => runALM3XrpT3(candles, cfg),
  },
};

/** Merge saved config over defaults, keeping only known numeric param keys. */
export function resolveEngineConfig(engineType: string, saved: any): Record<string, any> {
  const def = ENGINES[engineType];
  if (!def) throw new Error(`Unknown engine: ${engineType}`);
  const out: Record<string, any> = { ...def.defaults };
  for (const f of def.fields) {
    const v = saved?.[f.key];
    if (v !== undefined && v !== null && v !== "" && Number.isFinite(Number(v))) out[f.key] = Number(v);
  }
  return out;
}
