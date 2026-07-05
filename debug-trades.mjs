// Run on VPS: cd /var/www/algomomentum && node --env-file=.env debug-trades.mjs <strategyId>
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

const strategyId = process.argv[2]
if (!strategyId) {
  console.error('Usage: node --env-file=.env debug-trades.mjs <strategyId>')
  process.exit(1)
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

const trades = await prisma.strategyTrade.findMany({
  where: { strategyId, source: 'live' },
  orderBy: { firedAt: 'asc' },
})

const paired = []
let pendingEntry = null
for (const t of trades) {
  const isEntry = /entry/i.test(t.trade) || /entry/i.test(t.signal ?? '')
  const isExit  = /exit/i.test(t.trade)  || /exit/i.test(t.signal ?? '')
  if (isEntry && !pendingEntry) {
    pendingEntry = t
  } else if (isExit && pendingEntry) {
    const pnlPct = t.netPnlPct ?? (pendingEntry.side === 'buy'
      ? ((t.price - pendingEntry.price) / pendingEntry.price) * 100
      : ((pendingEntry.price - t.price) / pendingEntry.price) * 100)
    paired.push({
      entryAt: pendingEntry.firedAt, exitAt: t.firedAt,
      entryPrice: pendingEntry.price, exitPrice: t.price,
      side: pendingEntry.side,
      pnlPct: Math.round(pnlPct * 100) / 100,
      holdSeconds: (new Date(t.firedAt) - new Date(pendingEntry.firedAt)) / 1000,
    })
    pendingEntry = null
  }
}

const total = paired.length
const wins = paired.filter(t => t.pnlPct > 0).length
const losses = paired.filter(t => t.pnlPct < 0).length
const breakeven = paired.filter(t => t.pnlPct === 0)

console.log(`Total raw StrategyTrade rows (live): ${trades.length}`)
console.log(`Unpaired trailing entry (no exit yet): ${pendingEntry ? 'YES - ' + pendingEntry.firedAt : 'no'}`)
console.log(`Total paired trades: ${total}`)
console.log(`Wins: ${wins}  Losses: ${losses}  Breakeven (pnlPct===0): ${breakeven.length}`)
console.log(`Check: wins + losses + breakeven = ${wins + losses + breakeven.length} (should equal total)`)
console.log('')
console.log('--- Breakeven trades detail (likely test fires) ---')
for (const t of breakeven) {
  console.log(JSON.stringify(t))
}
console.log('')
console.log('--- Trades held under 5 minutes (likely test fires regardless of pnl) ---')
for (const t of paired.filter(t => t.holdSeconds < 300)) {
  console.log(JSON.stringify(t))
}

await prisma.$disconnect()
