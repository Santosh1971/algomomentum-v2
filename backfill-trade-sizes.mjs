// Run on VPS: cd /var/www/algomomentum && npx tsx backfill-trade-sizes.mjs <strategyId>
// For existing source='live' ENTRY rows with a recorded price but no size, computes
// an estimated lot size using the admin's CURRENT subscription amount (not the amount
// at the time the trade actually fired, since we have no history of that) and writes
// it back. This is an extrapolation for display purposes only — it does not touch
// price, PnL, or any trading-critical field.

import path from 'path'
process.loadEnvFile(path.join(process.cwd(), '.env'))
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

const INR_TO_USD = 85

function computeQuantity(orderSizeType, amount, marketPrice, lot) {
  if (orderSizeType === 'lot') return Math.max(1, Math.floor(amount))
  // 'equity_pct' can't be extrapolated without historical balance data — skipped, left as null
  if (orderSizeType === 'equity_pct') return null
  return Math.max(1, Math.floor((amount / INR_TO_USD) / marketPrice / (lot || 1)))
}

const strategyId = process.argv[2]
if (!strategyId) {
  console.error('Usage: npx tsx backfill-trade-sizes.mjs <strategyId>')
  process.exit(1)
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

const strategy = await prisma.strategy.findUnique({ where: { id: strategyId } })
if (!strategy) { console.error(`No strategy with id ${strategyId}`); process.exit(1) }

const adminSub = await prisma.tradeConfig.findFirst({
  where: { script: strategy.symbol, isActive: true, userActive: true, user: { role: 'admin' } },
  select: { amount: true },
})
if (!adminSub) { console.error(`No active admin subscriber found for ${strategy.symbol}`); process.exit(1) }

const script = await prisma.script.findUnique({ where: { symbol: strategy.symbol } })
if (!script) { console.error(`No Script config for ${strategy.symbol}`); process.exit(1) }

const orderSizeType = strategy.orderSizeType || 'currency'

const rows = await prisma.strategyTrade.findMany({
  where: { strategyId, source: 'live', size: null, price: { not: null } },
})

console.log(`Found ${rows.length} row(s) missing size. Using admin amount=${adminSub.amount}, orderSizeType=${orderSizeType}, lot=${script.lot}`)

let updated = 0, skipped = 0
for (const row of rows) {
  const qty = computeQuantity(orderSizeType, adminSub.amount, row.price, script.lot)
  if (qty == null) { skipped++; continue }
  await prisma.strategyTrade.update({ where: { id: row.id }, data: { size: qty } })
  updated++
}

console.log(`✓ Backfilled ${updated} row(s). Skipped ${skipped} (equity_pct mode, can't extrapolate).`)
await prisma.$disconnect()
