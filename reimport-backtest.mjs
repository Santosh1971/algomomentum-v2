// Run on VPS: cd /var/www/algomomentum && npx tsx reimport-backtest.mjs <strategyId>
// Re-parses the Excel file already stored on disk (from a previous upload) using
// the current parseBacktestFile logic, and refreshes that strategy's source='backtest'
// StrategyTrade rows. Does not touch anything else on the Strategy record.

import fs from 'fs'
import path from 'path'
process.loadEnvFile(path.join(process.cwd(), '.env'))
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import { parseBacktestFile } from './lib/parseBacktest.ts'

const strategyId = process.argv[2]
if (!strategyId) {
  console.error('Usage: npx tsx reimport-backtest.mjs <strategyId>')
  process.exit(1)
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

const strategy = await prisma.strategy.findUnique({ where: { id: strategyId } })
if (!strategy) {
  console.error(`No strategy found with id ${strategyId}`)
  process.exit(1)
}
if (!strategy.backtestFileUrl) {
  console.error(`Strategy ${strategy.name} has no backtestFileUrl on record`)
  process.exit(1)
}

const filePath = path.join(process.cwd(), 'public', strategy.backtestFileUrl)
if (!fs.existsSync(filePath)) {
  console.error(`File not found on disk: ${filePath}`)
  process.exit(1)
}

console.log(`Reading ${filePath} for strategy "${strategy.name}" (${strategy.symbol})...`)
const buffer = fs.readFileSync(filePath)
const parsed = parseBacktestFile(buffer, path.basename(filePath))
const { backtestTrades, initialCapitalUsd } = parsed

if (initialCapitalUsd != null) {
  await prisma.strategy.update({ where: { id: strategyId }, data: { initialCapitalUsd } })
  console.log(`✓ Saved initialCapitalUsd = ${initialCapitalUsd} for ${strategy.name}.`)
}

console.log(`Parsed ${backtestTrades?.length ?? 0} backtest trades.`)

if (!backtestTrades?.length) {
  console.error('Zero trades parsed — check the console.warn diagnostic above (or lack thereof) for header mismatch details. Nothing was changed in the database.')
  await prisma.$disconnect()
  process.exit(1)
}

await prisma.strategyTrade.deleteMany({ where: { strategyId, source: 'backtest' } })
await prisma.strategyTrade.createMany({
  data: backtestTrades.map((t) => ({
    strategyId,
    source: 'backtest',
    side: t.side,
    trade: t.type,
    signal: t.signal,
    price: t.price,
    size: t.size,
    netPnlUsd: t.netPnlUsd,
    netPnlPct: t.netPnlPct,
    cumulativePnlUsd: t.cumulativePnlUsd,
    tradeNumber: t.tradeNumber,
    symbol: strategy.symbol,
    firedAt: isNaN(new Date(t.firedAt).getTime()) ? new Date() : new Date(t.firedAt),
    totalFired: 0,
  })),
})

console.log(`✓ Inserted ${backtestTrades.length} backtest trades for ${strategy.name}.`)
await prisma.$disconnect()
