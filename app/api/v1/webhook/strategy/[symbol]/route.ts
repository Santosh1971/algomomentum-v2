import { NextRequest, NextResponse } from 'next/server'
import { placeOrder, placeOrderOAuth, getPositions, getPositionsOAuth, getBalances, getBalancesOAuth, getTicker, setLeverage, setLeverageOAuth } from '@/lib/deltaClient'
import cache from '@/lib/cache'
import { prisma } from '@/lib/prisma'

const INR_TO_USD = 85

// placeOrder/placeOrderOAuth catch Delta-level rejections (e.g. insufficient margin)
// internally and RETURN {success:false, ...} rather than throwing — so a rejected
// order would otherwise be silently counted as "fired successfully". This makes a
// Delta-level rejection surface as a real thrown error, correctly excluded from the
// success count and shown in the errors array.
function assertOrderSuccess(result: any) {
  if (result?.success === false) {
    const msg = result.error?.error?.message || result.error?.error?.code || JSON.stringify(result.error) || 'Order rejected by Delta'
    throw new Error(msg)
  }
  return result
}

// Shared sizing logic — must match exactly between the reference-quantity capture
// below and the real order placement in handleEntry, so the two never drift apart.
function computeQuantity(orderSizeType: string, amount: number, marketPrice: number, lot: number, equityUSD = 0) {
  if (orderSizeType === 'lot') {
    return Math.max(1, Math.floor(amount))
  }
  if (orderSizeType === 'equity_pct') {
    return Math.max(1, Math.floor((equityUSD * amount / 100) / marketPrice / (lot || 1)))
  }
  // 'currency' (default) — amount is a ₹ figure
  return Math.max(1, Math.floor((amount / INR_TO_USD) / marketPrice / (lot || 1)))
}

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
        include: {
          account: { select: { api_key_enc: true, api_secret_enc: true, delta_account_name: true, is_oauth: true, oauth_access_token: true } },
          user: { select: { role: true } },
        },
      },
    },
  })

  if (!strategy) return NextResponse.json({ error: `No active strategy for ${symbol}` }, { status: 404 })
  if (!strategy.subscribers.length) return NextResponse.json({ ok: true, fired: 0, message: 'No active subscribers' })

  const script = cache.getScript(strategy.symbol)
  if (!script) return NextResponse.json({ error: `Unknown symbol: ${strategy.symbol}` }, { status: 400 })

  const orderSizeType = strategy.orderSizeType || 'currency'

  // Best-effort: record the admin's own reference quantity on this fire, purely for
  // the "hide test trades below X lot" filter on the marketplace — never blocks trading.
  let refQuantity: number | null = null
  if (isEntry) {
    try {
      const adminSub = strategy.subscribers.find((tc: any) => tc.user?.role === 'admin')
      if (adminSub) {
        const marketPrice = await getTicker(script.exchange_symbol)
        if (marketPrice) {
          let equityUSD = 0
          if (orderSizeType === 'equity_pct') {
            const isOAuth = adminSub.account.is_oauth && adminSub.account.oauth_access_token
            const balData = isOAuth
              ? await getBalancesOAuth(adminSub.account.oauth_access_token)
              : await getBalances(adminSub.account.api_key_enc, adminSub.account.api_secret_enc)
            const balList = balData?.result ?? []
            const walletEntry = balList.find((b: any) => b.asset_symbol === "USD") ?? balList[0]
            equityUSD = parseFloat(walletEntry?.balance ?? "0")
          }
          const refSizeValue = orderSizeType === 'equity_pct' ? (strategy.defaultOrderSizeValue ?? 0) : adminSub.amount
          refQuantity = computeQuantity(orderSizeType, refSizeValue, marketPrice, script.lot, equityUSD)
        }
      }
    } catch (e) {
      console.warn('Could not compute reference lot size for test-trade filter:', e)
    }
  }

  await prisma.strategyTrade.create({
    data: {
      strategyId: strategy.id,
      side,
      trade,
      price:      price ? parseFloat(price) : null,
      size:       refQuantity,
      symbol:     strategy.symbol,
      totalFired: strategy.subscribers.length,
    },
  })

  const results = await Promise.allSettled(
    strategy.subscribers.map((tc: any) => isEntry
      ? handleEntry({ tc, side, script, orderSizeType, defaultOrderSizeValue: strategy.defaultOrderSizeValue })
      : handleExit({ tc, side, script, orderSizeType }))
  )

  const success = results.filter(r => r.status === 'fulfilled').length
  const errors  = results.map((r, i) => r.status === 'rejected' ? { userId: strategy.subscribers[i].userId, error: (r as any).reason?.message } : null).filter(Boolean)

  console.log(`Strategy "${strategy.name}" (${symbol}) fired: ${success}/${results.length}`)
  return NextResponse.json({ ok: true, fired: success, total: results.length, errors })
}

async function handleEntry({ tc, side, script, orderSizeType, defaultOrderSizeValue }: any) {
  const marketPrice = await getTicker(script.exchange_symbol)
  if (!marketPrice) throw new Error(`No price for ${script.exchange_symbol}`)

  // Balance is needed both for '% of equity' sizing and the pre-trade allocation
  // check below, so fetch it once up front regardless of mode.
  const isOAuth = tc.account.is_oauth && tc.account.oauth_access_token
  const balData = isOAuth
    ? await getBalancesOAuth(tc.account.oauth_access_token)
    : await getBalances(tc.account.api_key_enc, tc.account.api_secret_enc)
  const balList = balData?.result ?? []
  const walletEntry = balList.find((b: any) => b.asset_symbol === "USD") ?? balList[0]
  const totalBalanceUSD = parseFloat(walletEntry?.balance ?? "0")

  // 'equity_pct' mode uses the strategy's admin-set % applied to THIS bot's own
  // tracked running balance (compounds from its own realized P&L) — not the whole
  // Delta account balance, which may be shared across multiple bots on one account.
  // 'currency' mode still uses each subscriber's own fixed ₹ amount, no compounding.
  const sizeValue = orderSizeType === 'equity_pct' ? (defaultOrderSizeValue ?? 0) : tc.amount
  const equityBasis = tc.equityBalance ?? tc.amount
  const quantity = computeQuantity(orderSizeType, sizeValue, marketPrice, script.lot, orderSizeType === 'equity_pct' ? equityBasis : totalBalanceUSD)

  // Pre-trade check: total allocated across all bots <= total account balance.
  // Only meaningful for 'currency' mode, where amount is a real ₹ allocation —
  // 'lot' and '% of equity' modes don't map onto a comparable allocated-₹ figure,
  // so this check is skipped for those (Delta's own margin check still applies
  // at order time either way).
  if (orderSizeType === 'currency') {
    try {
      const allBots = await prisma.tradeConfig.findMany({
        where: { accountId: tc.accountId, isActive: true, userActive: true },
        select: { amount: true },
      })
      const totalAllocatedUSD = allBots.reduce((sum: number, b: any) => sum + b.amount / INR_TO_USD, 0)

      if (totalAllocatedUSD > totalBalanceUSD) {
        throw new Error(`Insufficient balance: Total balance $${totalBalanceUSD.toFixed(2)}, Total allocated across all bots $${totalAllocatedUSD.toFixed(2)} for ₹${tc.amount} allocation`)
      }
    } catch (e: any) {
      if (e.message?.includes('Insufficient balance')) throw e
      console.warn('Balance check failed, proceeding:', e.message)
    }
  }

  if (tc.account.is_oauth && tc.account.oauth_access_token) {
    await setLeverageOAuth(tc.account.oauth_access_token, script.productId, tc.leverage)
    return assertOrderSuccess(await placeOrderOAuth(tc.account.oauth_access_token, {
      product_id: script.productId, product_symbol: script.exchange_symbol,
      size: quantity, side, order_type: 'market_order', time_in_force: 'ioc',
      client_order_id: `am-${tc.id.slice(-6)}-${Date.now()}`,
    }))
  }

  await setLeverage(tc.account.api_key_enc, tc.account.api_secret_enc, script.productId, tc.leverage)
  return assertOrderSuccess(await placeOrder(tc.account.api_key_enc, tc.account.api_secret_enc, {
    product_id: script.productId, product_symbol: script.exchange_symbol,
    size: quantity, side, order_type: 'market_order', time_in_force: 'ioc',
    client_order_id: `am-${tc.id.slice(-6)}-${Date.now()}`,
  }))
}

async function handleExit({ tc, side, script, orderSizeType }: any) {
  let openPos: any
  let orderResult: any

  if (tc.account.is_oauth && tc.account.oauth_access_token) {
    const posData = await getPositionsOAuth(tc.account.oauth_access_token)
    openPos = (posData?.result ?? []).find((p: any) => p.product_symbol === script.exchange_symbol && Math.abs(p.size) > 0)
    if (!openPos) return { message: 'No open position' }
    orderResult = assertOrderSuccess(await placeOrderOAuth(tc.account.oauth_access_token, {
      product_id: script.productId, product_symbol: script.exchange_symbol,
      size: Math.abs(openPos.size), side, order_type: 'market_order', time_in_force: 'ioc',
      client_order_id: `am-${tc.id.slice(-6)}-${Date.now()}`,
    }))
  } else {
    const posData = await getPositions(tc.account.api_key_enc, tc.account.api_secret_enc)
    openPos = (posData?.result ?? []).find((p: any) => p.product_symbol === script.exchange_symbol && Math.abs(p.size) > 0)
    if (!openPos) return { message: 'No open position' }
    orderResult = assertOrderSuccess(await placeOrder(tc.account.api_key_enc, tc.account.api_secret_enc, {
      product_id: script.productId, product_symbol: script.exchange_symbol,
      size: Math.abs(openPos.size), side, order_type: 'market_order', time_in_force: 'ioc',
      client_order_id: `am-${tc.id.slice(-6)}-${Date.now()}`,
    }))
  }

  // equity_pct mode: fold this exit's realized P&L into the bot's own tracked
  // running balance, so the NEXT entry's % is applied to a compounded figure
  // scoped to just this bot — never touches the whole Delta account balance.
  if (orderSizeType === 'equity_pct') {
    try {
      const realizedPnl = parseFloat(orderResult?.result?.meta_data?.pnl ?? '0')
      if (!isNaN(realizedPnl) && realizedPnl !== 0) {
        const basis = tc.equityBalance ?? tc.amount
        await prisma.tradeConfig.update({
          where: { id: tc.id },
          data: { equityBalance: basis + realizedPnl },
        })
      }
    } catch (e) {
      console.warn(`Could not update equityBalance for tc ${tc.id}:`, e)
    }
  }

  return orderResult
}
