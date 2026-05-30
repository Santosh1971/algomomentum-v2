// lib/cache.ts
import { prisma } from "@/lib/prisma";
import { Mutex } from "async-mutex";

const mutex = new Mutex();

export interface TradeConfigData {
  id: string;
  userId: string;
  script: string;
  isActive: boolean;
  userActive: boolean;
  amount: number;
  api_key_enc: string;
  api_secret_enc: string;
  mode: string;
  strategy: string | null;
  delta_account_name: string | null;
}

export interface ScriptData {
  symbol: string;
  exchange_symbol: string;
  algorithm: string | null;
  productId: number;
  lot: number;
  exchange: string | null;
  Max_pos_size: number;
  Pos_Per: number;
  gridEnabled: boolean;
  defaultStrategy: string | null;
}

let scriptMap = new Map<string, ScriptData>();
let configByScript = new Map<string, TradeConfigData[]>();
let configByUser = new Map<string, TradeConfigData[]>();

async function syncScripts() {
  const scripts = await prisma.script.findMany();
  const m = new Map<string, ScriptData>();
  scripts.forEach((s) =>
    m.set(s.symbol, {
      symbol: s.symbol,
      exchange_symbol: s.exchange_symbol,
      algorithm: s.algorithm,
      productId: s.productId,
      lot: s.lot ?? 1,
      exchange: s.exchange,
      Max_pos_size: s.Max_pos_size ?? 15000,
      Pos_Per: s.Pos_Per ?? 100,
      gridEnabled: s.gridEnabled,
      defaultStrategy: s.defaultStrategy ?? null,
    })
  );
  scriptMap = m;
}

async function syncTradeConfigs() {
  const configs = await prisma.tradeConfig.findMany({
    where: { isActive: true, userActive: true },
  });

  const byScript = new Map<string, TradeConfigData[]>();
  const byUser = new Map<string, TradeConfigData[]>();

  configs.forEach((c) => {
    const tc: TradeConfigData = {
      id: c.id,
      userId: c.userId,
      script: c.script,
      isActive: c.isActive,
      userActive: c.userActive,
      amount: c.amount,
      api_key_enc: c.api_key_enc,
      api_secret_enc: c.api_secret_enc,
      mode: c.mode,
      strategy: c.strategy,
      delta_account_name: c.delta_account_name,
    };
    if (!byScript.has(c.script)) byScript.set(c.script, []);
    byScript.get(c.script)!.push(tc);
    if (!byUser.has(c.userId)) byUser.set(c.userId, []);
    byUser.get(c.userId)!.push(tc);
  });

  configByScript = byScript;
  configByUser = byUser;
  console.log(`♻️ Cache synced: ${configs.length} active configs`);
}

async function initCache() {
  await mutex.runExclusive(() => Promise.all([syncScripts(), syncTradeConfigs()]));
  console.log("✅ Cache initialized");
}

const SYNC_INTERVAL = 60_000;
function startSync() {
  setInterval(async () => {
    try {
      await mutex.runExclusive(() => Promise.all([syncScripts(), syncTradeConfigs()]));
    } catch (e) {
      console.error("Cache sync error:", e);
    }
  }, SYNC_INTERVAL);
}

export function getScript(symbol: string) { return scriptMap.get(symbol); }
export function getConfigsByScript(symbol: string) { return configByScript.get(symbol) || []; }
export function getConfigsByUser(userId: string) { return configByUser.get(userId) || []; }

export function addConfig(c: TradeConfigData) {
  if (!configByScript.has(c.script)) configByScript.set(c.script, []);
  configByScript.get(c.script)!.push(c);
  if (!configByUser.has(c.userId)) configByUser.set(c.userId, []);
  configByUser.get(c.userId)!.push(c);
}

export function updateConfig(c: TradeConfigData) {
  if (!c.isActive || !c.userActive) { removeConfig(c.id); return; }
  [configByScript, configByUser].forEach((map) => {
    map.forEach((arr, key) => {
      const i = arr.findIndex((x) => x.id === c.id);
      if (i >= 0) arr[i] = c; else arr.push(c);
      map.set(key, arr);
    });
  });
}

export function removeConfig(id: string) {
  [configByScript, configByUser].forEach((map) => {
    map.forEach((arr, key) => map.set(key, arr.filter((x) => x.id !== id)));
  });
}

initCache();
startSync();

export default { getScript, getConfigsByScript, getConfigsByUser, addConfig, updateConfig, removeConfig };
