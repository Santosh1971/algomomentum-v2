import { NextRequest, NextResponse } from 'next/server'
import { placeOrder, placeOrderOAuth, getPositions, getPositionsOAuth, getTicker, setLeverage, setLeverageOAuth } from '@/lib/deltaClient'
import cache from '@/lib/cache'
import { prisma } from '@/lib/prisma'

const INR_TO_USD = 85

export async function POST(req: NextRequest, context: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await context.params
  const secret = req.nextUrl.searchParams.get('secret')

  if (secret !== process.env.BROADCAST_SECRET) {
    return NextResponse.json({ error: 'Invalid secret' }, { status: 401 })
  }

  const { side, trade, price } = await req.json()
  const isEntry = /ENTRY/i.test(trade)
  const isExit  = /EXIT/i.test(trade)
  if (!isEntry && !isExit) return NextResponse.json({ error: 'Invalid trade type' }, { status: 400 })

  const strategy = await prisma.strategy.findFirst({
    where: { symbol: symbol.toUpperCase(), isActive: true },
    include: {
      subscribers: {
        where: { isActive: true, userActive: true },
        include: { account: { select: { api_key_enc: true, api_secret_enc: true, delta_account_name: true, is_oauth: true, oauth_access_token: true } } },
      },
    },
  })

  if (!strategy) return NextResponse.json({ error: `No active strategy for ${symbol}` }, { status: 404 })
  if (!strategy.subscribers.length) return NextResponse.json({ ok: true, fired: 0, message: 'No active subscribers' })

  const script = cache.getScript(strategy.symbol)
  if (!script) return NextResponse.json({ error: `Unknown symbol: ${strategy.symbol}` }, { status: 400 })

  await prisma.strategyTrade.create({
    data: {
      strategyId: strategy.id,
      side,
      trade,
      price:      price ? parseFloat(price) : null,
      symbol:     strategy.symbol,
      totalFired: strategy.subscribers.length,
    },
  })

  const results = await Promise.allSettled(
    strategy.subscribers.map((tc: any) => isEntry ? handleEntry({ tc, side, script }) : handleExit({ tc, side, script }))
  )

  const success = results.filter(r => r.status === 'fulfilled').length
  const errors  = results.map((r, i) => r.status === 'rejected' ? { userId: strategy.subscribers[i].userId, error: (r as any).reason?.message } : null).filter(Boolean)

  console.log(`Strategy "${strategy.name}" (${symbol}) fired: ${success}/${results.length}`)
  return NextResponse.json({ ok: true, fired: success, total: results.length, errors })
}

async function handleEntry({ tc, side, script }: any) {
  const marketPrice = await getTicker(script.exchange_symbol)
  if (!marketPrice) throw new Error(`No price for ${script.exchange_symbol}`)
  const quantity = Math.max(1, Math.floor((tc.amount / INR_TO_USD) / marketPrice / (script.lot || 1)))

  if (tc.account.is_oauth && tc.account.oauth_access_token) {
    await setLeverageOAuth(tc.account.oauth_access_token, script.productId, tc.leverage)
    return placeOrderOAuth(tc.account.oauth_access_token, {
      product_id: script.productId, product_symbol: script.exchange_symbol,
      size: quantity, side, order_type: 'market_order', time_in_force: 'ioc',
      client_order_id: `am-${tc.id.slice(-6)}-${Date.now()}`,
    })
  }

  await setLeverage(tc.account.api_key_enc, tc.account.api_secret_enc, script.productId, tc.leverage)
  return placeOrder(tc.account.api_key_enc, tc.account.api_secret_enc, {
    product_id: script.productId, product_symbol: script.exchange_symbol,
    size: quantity, side, order_type: 'market_order', time_in_force: 'ioc',
    client_order_id: `am-${tc.id.slice(-6)}-${Date.now()}`,
  })
}

async function handleExit({ tc, side, script }: any) {
  let openPos: any

  if (tc.account.is_oauth && tc.account.oauth_access_token) {
    const posData = await getPositionsOAuth(tc.account.oauth_access_token)
    openPos = (posData?.result ?? []).find((p: any) => p.product_symbol === script.exchange_symbol && Math.abs(p.size) > 0)
    if (!openPos) return { message: 'No open position' }
    return placeOrderOAuth(tc.account.oauth_access_token, {
      product_id: script.productId, product_symbol: script.exchange_symbol,
      size: Math.abs(openPos.size), side, order_type: 'market_order', time_in_force: 'ioc',
      client_order_id: `am-${tc.id.slice(-6)}-${Date.now()}`,
    })
  }

  const posData = await getPositions(tc.account.api_key_enc, tc.account.api_secret_enc)
  openPos = (posData?.result ?? []).find((p: any) => p.product_symbol === script.exchange_symbol && Math.abs(p.size) > 0)
  if (!openPos) return { message: 'No open position' }
  return placeOrder(tc.account.api_key_enc, tc.account.api_secret_enc, {
    product_id: script.productId, product_symbol: script.exchange_symbol,
    size: Math.abs(openPos.size), side, order_type: 'market_order', time_in_force: 'ioc',
    client_order_id: `am-${tc.id.slice(-6)}-${Date.now()}`,
  })
}
