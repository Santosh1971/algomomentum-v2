// Usage: npx tsx check-fill-source.mjs <userEmail> <symbol>
// Prints raw fields from real Delta fills for that user+symbol, so we can
// confirm client_order_id is actually present and what format it's in before
// building a bot-vs-manual trade filter based on it.
import path from 'path'
process.loadEnvFile(path.join(process.cwd(), '.env'))
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import { getAllFills, getAllFillsOAuth } from './lib/deltaClient.ts'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

const [, , email, symbol] = process.argv

if (!email || !symbol) {
  console.log('Usage: npx tsx check-fill-source.mjs <userEmail> <symbol>')
  process.exit(1)
}

const user = await prisma.user.findUnique({ where: { email } })
if (!user) { console.log(`No user found for ${email}`); process.exit(1) }

const tc = await prisma.tradeConfig.findFirst({
  where: { userId: user.id, script: symbol.toUpperCase() },
  include: { account: true },
})
if (!tc) { console.log(`No TradeConfig found for ${email} on ${symbol}`); process.exit(1) }

const now = Date.now()
const oneYearAgo = now - 365 * 24 * 60 * 60 * 1000

const fills = tc.account.is_oauth && tc.account.oauth_access_token
  ? await getAllFillsOAuth(tc.account.oauth_access_token, { product_symbol: symbol.toUpperCase(), start_time: oneYearAgo * 1000, end_time: now * 1000 })
  : await getAllFills(tc.account.api_key_enc, tc.account.api_secret_enc, { product_symbol: symbol.toUpperCase(), start_time: oneYearAgo * 1000, end_time: now * 1000 })

console.log(`Found ${fills.length} fills for ${email} on ${symbol} over the last year.\n`)

const earliestFill = fills.reduce((earliest, f) => {
  const t = new Date(f.created_at).getTime()
  return (!earliest || t < earliest.t) ? { t, f } : earliest
}, null)
if (earliestFill) {
  console.log('=== EARLIEST FILL (raw) ===')
  console.log(JSON.stringify(earliestFill.f, null, 2))
  console.log('')
}

console.log('=== First 5 fills, key fields only ===')
for (const f of fills.slice(0, 5)) {
  console.log({
    created_at: f.created_at,
    client_order_id: f.client_order_id,
    order_id: f.order_id,
    side: f.side,
    size: f.size,
  })
}

await prisma.$disconnect()
