import { NextRequest, NextResponse } from 'next/server'
import { placeOrder, placeOrderOAuth, getPositions, getPositionsOAuth, getBalances, getBalancesOAuth, getTicker, setLeverage, setLeverageOAuth } from '@/lib/deltaClient'
import { prisma } from '@/lib/prisma'

const INR_TO_USD = 85

export async function POST(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('secret')
  if (secret !== process.env.BROADCAST_SECRET) {
    return NextResponse.json({ error: 'Invalid secret' }, { status: 401 })
  }

  // Email comes from query param only - NOT from message body
  const targetEmail = req.nextUrl.searchParams.get('email') || 'jha.santosh.kr@gmail.com'

  const { symbol, side, trade, price } = await req.json()

  const isEntry = /ENTRY/i.test(trade)
  const isExit  = /EXIT/i.test(trade)
  if (!isEntry && !isExit) return NextResponse.json({ error: 'Invalid trade type' }, { status: 400 })

  const config = await prisma.tradeConfig.findFirst({
    where: {
      script: symbol?.toUpperCase(),
      isActive: true,
      userActive: true,
      user: { email: targetEmail },
    },
    include: {
      account: { select: { api_key_enc: true, api_secret_enc: true, is_oauth: true, oauth_access_token: true } },
    },
  })

  if (!config) return NextResponse.json({ error: `No active bot for ${symbol} on ${targetEmail}` }, { status: 404 })

  const script = await prisma.script.findUnique({ where: { symbol: symbol?.toUpperCase() } })
  if (!script) return NextResponse.json({ error: `Unknown symbol: ${symbol}` }, { status: 400 })

  try {
    let result
    if (isEntry) {
      const marketPrice = await getTicker(script.exchange_symbol)
      if (!marketPrice) throw new Error(`No price for ${script.exchange_symbol}`)
      const quantity = Math.max(1, Math.floor((config.amount / INR_TO_USD) / marketPrice / (script.lot || 1)))

      // Pre-trade margin check (identical to strategy webhook)
      try {
        const isOAuth = config.account.is_oauth && config.account.oauth_access_token
        const balData = isOAuth
          ? await getBalancesOAuth(config.account.oauth_access_token!)
          : await getBalances(config.account.api_key_enc, config.account.api_secret_enc)
        const posData = isOAuth
          ? await getPositionsOAuth(config.account.oauth_access_token!)
          : await getPositions(config.account.api_key_enc, config.account.api_secret_enc)

        const balances = balData?.result ?? []
        const wallet = balances.find((b: any) => b.asset_symbol === "USD") ?? balances[0]
        const availableUSD = parseFloat(wallet?.available_balance ?? "0")
        const totalPositionMargin = (posData?.result ?? []).reduce((sum: number, p: any) => sum + parseFloat(p.margin ?? "0"), 0)
        const effectiveAvailable = availableUSD - totalPositionMargin
        const requiredUSD = config.amount / INR_TO_USD

        if (effectiveAvailable < requiredUSD) {
          throw new Error(`Insufficient margin: Available $${availableUSD.toFixed(2)}, Used in positions $${totalPositionMargin.toFixed(2)}, Effective $${effectiveAvailable.toFixed(2)}, Required $${requiredUSD.toFixed(2)} for ₹${config.amount} allocation`)
        }
      } catch (e: any) {
        if (e.message?.includes('Insufficient margin')) throw e
        console.warn('Margin check failed, proceeding:', e.message)
      }

      if (config.account.is_oauth && config.account.oauth_access_token) {
        await setLeverageOAuth(config.account.oauth_access_token, script.productId, config.leverage)
        result = await placeOrderOAuth(config.account.oauth_access_token, {
          product_id: script.productId, product_symbol: script.exchange_symbol,
          size: quantity, side, order_type: 'market_order', time_in_force: 'ioc',
          client_order_id: `am-test-${config.id.slice(-6)}-${Date.now()}`,
        })
      } else {
        await setLeverage(config.account.api_key_enc, config.account.api_secret_enc, script.productId, config.leverage)
        result = await placeOrder(config.account.api_key_enc, config.account.api_secret_enc, {
          product_id: script.productId, product_symbol: script.exchange_symbol,
          size: quantity, side, order_type: 'market_order', time_in_force: 'ioc',
          client_order_id: `am-test-${config.id.slice(-6)}-${Date.now()}`,
        })
      }
    } else {
      if (config.account.is_oauth && config.account.oauth_access_token) {
        const posData = await getPositionsOAuth(config.account.oauth_access_token)
        const openPos = (posData?.result ?? []).find((p: any) => p.product_symbol === script.exchange_symbol && Math.abs(p.size) > 0)
        if (!openPos) return NextResponse.json({ ok: true, message: 'No open position to exit' })
        result = await placeOrderOAuth(config.account.oauth_access_token, {
          product_id: script.productId, product_symbol: script.exchange_symbol,
          size: Math.abs(openPos.size), side, order_type: 'market_order', time_in_force: 'ioc',
          client_order_id: `am-test-${config.id.slice(-6)}-${Date.now()}`,
        })
      } else {
        const posData = await getPositions(config.account.api_key_enc, config.account.api_secret_enc)
        const openPos = (posData?.result ?? []).find((p: any) => p.product_symbol === script.exchange_symbol && Math.abs(p.size) > 0)
        if (!openPos) return NextResponse.json({ ok: true, message: 'No open position to exit' })
        result = await placeOrder(config.account.api_key_enc, config.account.api_secret_enc, {
          product_id: script.productId, product_symbol: script.exchange_symbol,
          size: Math.abs(openPos.size), side, order_type: 'market_order', time_in_force: 'ioc',
          client_order_id: `am-test-${config.id.slice(-6)}-${Date.now()}`,
        })
      }
    }
    console.log(`🧪 TEST [${targetEmail}] ${symbol} ${trade} ${side}:`, JSON.stringify(result))
    return NextResponse.json({ ok: true, test: true, target: targetEmail, symbol, trade, side, result })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  }
}
