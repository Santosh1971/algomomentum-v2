import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { NEXT_AUTH as authOptions } from '@/lib/auth'
import { placeOrder, placeOrderOAuth, getPositions, getPositionsOAuth, getBalances, getBalancesOAuth, getTicker, setLeverage, setLeverageOAuth } from '@/lib/deltaClient'
import cache from '@/lib/cache'
import { prisma } from '@/lib/prisma'

const INR_TO_USD = 85

function computeQuantity(orderSizeType: string, amount: number, marketPrice: number, lot: number, equityUSD = 0) {
  if (orderSizeType === 'lot') {
    return Math.max(1, Math.floor(amount))
  }
  if (orderSizeType === 'equity_pct') {
    return Math.max(1, Math.floor((equityUSD * amount / 100) / marketPrice / (lot || 1)))
  }
  return Math.max(1, Math.floor((amount / INR_TO_USD) / marketPrice / (lot || 1)))
}

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

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (session?.user?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { symbol, side, trade, price, userIds, amount, leverage, orderSizeType: overrideOrderSizeType } = await req.json()
  if (!symbol || !side || !trade) {
    return NextResponse.json({ error: 'symbol, side, trade are required' }, { status: 400 })
  }
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

  const targets = userIds === 'all' || !userIds
    ? strategy.subscribers
    : strategy.subscribers.filter((tc: any) => (userIds as string[]).includes(tc.userId))

  if (!targets.length) return NextResponse.json({ ok: false, error: 'No matching target users for this strategy', fired: 0, total: 0 })

  const script = cache.getScript(strategy.symbol)
  if (!script) return NextResponse.json({ error: `Unknown symbol: ${strategy.symbol}` }, { status: 400 })

  // Simulator can override the sizing mode for testing purposes, independent of
  // the strategy's saved default — this never touches the strategy record itself.
  const orderSizeType = overrideOrderSizeType || strategy.orderSizeType || 'currency'

  await prisma.strategyTrade.create({
    data: {
      strategyId: strategy.id,
      side,
      trade,
      price:      price ? parseFloat(price) : null,
      symbol:     strategy.symbol,
      source:     'test',
      totalFired: targets.length,
    },
  })

  const overrideAmount   = amount   ? parseFloat(amount)   : undefined
  const overrideLeverage = leverage ? parseInt(leverage)   : undefined

  const results = await Promise.allSettled(
    targets.map((tc: any) => isEntry
      ? handleEntry({ tc, side, script, overrideAmount, overrideLeverage, orderSizeType, defaultOrderSizeValue: strategy.defaultOrderSizeValue })
      : handleExit({ tc, side, script, orderSizeType }))
  )

  const success = results.filter(r => r.status === 'fulfilled').length
  const errors  = results.map((r, i) => r.status === 'rejected' ? { userId: targets[i].userId, error: (r as any).reason?.message } : null).filter(Boolean)

  console.log(`🧪 TEST fire "${strategy.name}" (${symbol}) [${orderSizeType}] → ${success}/${results.length} target(s)`)
  return NextResponse.json({ ok: true, fired: success, total: results.length, errors })
}

async function handleEntry({ tc, side, script, overrideAmount, overrideLeverage, orderSizeType, defaultOrderSizeValue }: any) {
  // 'equity_pct' mode uses the strategy's admin-set % for EVERY subscriber, unless
  // the Simulator explicitly overrides it for testing — same rule as the production
  // and test webhook routes.
  const amount   = overrideAmount ?? (orderSizeType === 'equity_pct' ? (defaultOrderSizeValue ?? 0) : tc.amount)
  const leverage = overrideLeverage ?? tc.leverage

  const marketPrice = await getTicker(script.exchange_symbol)
  if (!marketPrice) throw new Error(`No price for ${script.exchange_symbol}`)

  const isOAuth = tc.account.is_oauth && tc.account.oauth_access_token
  const balData = isOAuth
    ? await getBalancesOAuth(tc.account.oauth_access_token)
    : await getBalances(tc.account.api_key_enc, tc.account.api_secret_enc)
  const balList = balData?.result ?? []
  const walletEntry = balList.find((b: any) => b.asset_symbol === "USD") ?? balList[0]
  const totalBalanceUSD = parseFloat(walletEntry?.balance ?? "0")

  // equity_pct mode: apply the % to THIS bot's own tracked running balance
  // (compounds from its own realized P&L), not the whole Delta account balance.
  const equityBasis = (tc.equityBalance ?? tc.amount) / INR_TO_USD
  const quantity = computeQuantity(orderSizeType, amount, marketPrice, script.lot, orderSizeType === 'equity_pct' ? equityBasis : totalBalanceUSD)

  // Pre-trade allocation check — only meaningful for 'currency' mode
  if (orderSizeType === 'currency') {
    try {
      const allBots = await prisma.tradeConfig.findMany({
        where: { accountId: tc.accountId, isActive: true, userActive: true },
        select: { amount: true },
      })
      const totalAllocatedUSD = allBots.reduce((sum: number, b: any) => sum + b.amount / INR_TO_USD, 0)
        - (tc.amount / INR_TO_USD) + (amount / INR_TO_USD) // swap this bot's real allocation for the test amount

      if (totalAllocatedUSD > totalBalanceUSD) {
        throw new Error(`Insufficient balance: Total balance $${totalBalanceUSD.toFixed(2)}, Total allocated across all bots $${totalAllocatedUSD.toFixed(2)} for ₹${amount} test allocation`)
      }
    } catch (e: any) {
      if (e.message?.includes('Insufficient balance')) throw e
      console.warn('Balance check failed, proceeding:', e.message)
    }
  }

  if (tc.account.is_oauth && tc.account.oauth_access_token) {
    await setLeverageOAuth(tc.account.oauth_access_token, script.productId, leverage)
    return assertOrderSuccess(await placeOrderOAuth(tc.account.oauth_access_token, {
      product_id: script.productId, product_symbol: script.exchange_symbol,
      size: quantity, side, order_type: 'market_order', time_in_force: 'ioc',
      client_order_id: `am-test-${tc.id.slice(-6)}-${Date.now()}`,
    }))
  }

  await setLeverage(tc.account.api_key_enc, tc.account.api_secret_enc, script.productId, leverage)
  return assertOrderSuccess(await placeOrder(tc.account.api_key_enc, tc.account.api_secret_enc, {
    product_id: script.productId, product_symbol: script.exchange_symbol,
    size: quantity, side, order_type: 'market_order', time_in_force: 'ioc',
    client_order_id: `am-test-${tc.id.slice(-6)}-${Date.now()}`,
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
      client_order_id: `am-test-${tc.id.slice(-6)}-${Date.now()}`,
    }))
  } else {
    const posData = await getPositions(tc.account.api_key_enc, tc.account.api_secret_enc)
    openPos = (posData?.result ?? []).find((p: any) => p.product_symbol === script.exchange_symbol && Math.abs(p.size) > 0)
    if (!openPos) return { message: 'No open position' }
    orderResult = assertOrderSuccess(await placeOrder(tc.account.api_key_enc, tc.account.api_secret_enc, {
      product_id: script.productId, product_symbol: script.exchange_symbol,
      size: Math.abs(openPos.size), side, order_type: 'market_order', time_in_force: 'ioc',
      client_order_id: `am-test-${tc.id.slice(-6)}-${Date.now()}`,
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
          data: { equityBalance: basis + (realizedPnl * INR_TO_USD) },
        })
      }
    } catch (e) {
      console.warn(`Could not update equityBalance for tc ${tc.id}:`, e)
    }
  }

  return orderResult
}
