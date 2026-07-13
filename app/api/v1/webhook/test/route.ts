import { NextRequest, NextResponse } from 'next/server'
import { placeOrder, placeOrderOAuth, getPositions, getPositionsOAuth, getBalances, getBalancesOAuth, getTicker, setLeverage, setLeverageOAuth } from '@/lib/deltaClient'
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
  const secret = req.nextUrl.searchParams.get('secret')
  if (secret !== process.env.BROADCAST_SECRET) {
    return NextResponse.json({ error: 'Invalid secret' }, { status: 401 })
  }

  // Email(s) come from query param only - NOT from message body.
  // Supports a single email, or a comma-separated list for multi-user test fires.
  const emailParam = req.nextUrl.searchParams.get('email') || 'jha.santosh.kr@gmail.com'
  const targetEmails = emailParam.split(',').map(e => e.trim()).filter(Boolean)
  const overrideAmount   = req.nextUrl.searchParams.get('amount')   ? parseFloat(req.nextUrl.searchParams.get('amount')!)   : undefined
  const overrideLeverage = req.nextUrl.searchParams.get('leverage') ? parseInt(req.nextUrl.searchParams.get('leverage')!)   : undefined

  const { symbol, side, trade, price } = await req.json()

  const isEntry = /ENTRY/i.test(trade)
  const isExit  = /EXIT/i.test(trade)
  if (!isEntry && !isExit) return NextResponse.json({ error: 'Invalid trade type' }, { status: 400 })

  const configs = await prisma.tradeConfig.findMany({
    where: {
      script: symbol?.toUpperCase(),
      isActive: true,
      userActive: true,
      user: { email: { in: targetEmails } },
    },
    include: {
      account: { select: { api_key_enc: true, api_secret_enc: true, is_oauth: true, oauth_access_token: true } },
      user: { select: { email: true } },
    },
  })

  if (!configs.length) return NextResponse.json({ error: `No active bot for ${symbol} on ${targetEmails.join(', ')}` }, { status: 404 })

  const script = await prisma.script.findUnique({ where: { symbol: symbol?.toUpperCase() } })
  if (!script) return NextResponse.json({ error: `Unknown symbol: ${symbol}` }, { status: 400 })

  const strategy = await prisma.strategy.findFirst({ where: { symbol: symbol?.toUpperCase(), isActive: true } })
  const orderSizeType = req.nextUrl.searchParams.get('orderSizeType') || strategy?.orderSizeType || 'currency'
  if (strategy) {
    await prisma.strategyTrade.create({
      data: {
        strategyId: strategy.id,
        side, trade,
        price:      price ? parseFloat(price) : null,
        symbol:     strategy.symbol,
        source:     'test',
        totalFired: configs.length,
      },
    })
  }

  const results = await Promise.allSettled(
    configs.map((config: any) => isEntry
      ? handleEntry({ config, side, script, overrideAmount, overrideLeverage, orderSizeType, defaultOrderSizeValue: strategy?.defaultOrderSizeValue })
      : handleExit({ config, side, script, orderSizeType }))
  )

  const success = results.filter(r => r.status === 'fulfilled').length
  const errors  = results.map((r, i) => r.status === 'rejected' ? { userId: configs[i].userId, email: configs[i].user.email, error: (r as any).reason?.message } : null).filter(Boolean)

  console.log(`🧪 TEST [${targetEmails.join(', ')}] ${symbol} ${trade} ${side}: ${success}/${configs.length}`)
  return NextResponse.json({ ok: true, test: true, targets: targetEmails, fired: success, total: configs.length, errors })
}

async function handleEntry({ config, side, script, overrideAmount, overrideLeverage, orderSizeType, defaultOrderSizeValue }: any) {
  const amount   = overrideAmount ?? (orderSizeType === 'equity_pct' ? (defaultOrderSizeValue ?? 0) : config.amount)
  const leverage = overrideLeverage ?? config.leverage

  const marketPrice = await getTicker(script.exchange_symbol)
  if (!marketPrice) throw new Error(`No price for ${script.exchange_symbol}`)

  const isOAuth = config.account.is_oauth && config.account.oauth_access_token
  const balData = isOAuth
    ? await getBalancesOAuth(config.account.oauth_access_token!)
    : await getBalances(config.account.api_key_enc, config.account.api_secret_enc)
  const balances = balData?.result ?? []
  const wallet = balances.find((b: any) => b.asset_symbol === "USD") ?? balances[0]
  const totalBalanceUSD = parseFloat(wallet?.balance ?? "0")

  // equity_pct mode: apply the % to THIS bot's own tracked running balance
  // (compounds from its own realized P&L), not the whole Delta account balance.
  const equityBasis = (config.equityBalance ?? config.amount) / INR_TO_USD
  const quantity = computeQuantity(orderSizeType, amount, marketPrice, script.lot, orderSizeType === 'equity_pct' ? equityBasis : totalBalanceUSD)

  // Pre-trade margin check — only meaningful for 'currency' mode (see production webhook route)
  if (orderSizeType === 'currency') {
    try {
      const allBots = await prisma.tradeConfig.findMany({
        where: { accountId: config.accountId, isActive: true, userActive: true },
        select: { amount: true },
      })
      const totalAllocatedUSD = allBots.reduce((sum: number, b: any) => sum + b.amount / INR_TO_USD, 0)
        - (config.amount / INR_TO_USD) + (amount / INR_TO_USD) // swap real allocation for the test amount

      if (totalAllocatedUSD > totalBalanceUSD) {
        throw new Error(`Insufficient balance: Total balance $${totalBalanceUSD.toFixed(2)}, Total allocated across all bots $${totalAllocatedUSD.toFixed(2)} for ₹${amount} test allocation`)
      }
    } catch (e: any) {
      if (e.message?.includes('Insufficient')) throw e
      console.warn('Margin check failed, proceeding:', e.message)
    }
  }

  if (config.account.is_oauth && config.account.oauth_access_token) {
    const levResult = await setLeverageOAuth(config.account.oauth_access_token, script.productId, leverage)
    console.log(`setLeverageOAuth(productId=${script.productId}, requested=${leverage}) →`, JSON.stringify(levResult))
    return assertOrderSuccess(await placeOrderOAuth(config.account.oauth_access_token, {
      product_id: script.productId, product_symbol: script.exchange_symbol,
      size: quantity, side, order_type: 'market_order', time_in_force: 'ioc',
      client_order_id: `am-test-${config.id.slice(-6)}-${Date.now()}`,
    }))
  }
  const levResult = await setLeverage(config.account.api_key_enc, config.account.api_secret_enc, script.productId, leverage)
  console.log(`setLeverage(productId=${script.productId}, requested=${leverage}) →`, JSON.stringify(levResult))
  return assertOrderSuccess(await placeOrder(config.account.api_key_enc, config.account.api_secret_enc, {
    product_id: script.productId, product_symbol: script.exchange_symbol,
    size: quantity, side, order_type: 'market_order', time_in_force: 'ioc',
    client_order_id: `am-test-${config.id.slice(-6)}-${Date.now()}`,
  }))
}

async function handleExit({ config, side, script, orderSizeType }: any) {
  let openPos: any
  let orderResult: any

  if (config.account.is_oauth && config.account.oauth_access_token) {
    const posData = await getPositionsOAuth(config.account.oauth_access_token)
    openPos = (posData?.result ?? []).find((p: any) => p.product_symbol === script.exchange_symbol && Math.abs(p.size) > 0)
    if (!openPos) return { message: 'No open position to exit' }
    orderResult = assertOrderSuccess(await placeOrderOAuth(config.account.oauth_access_token, {
      product_id: script.productId, product_symbol: script.exchange_symbol,
      size: Math.abs(openPos.size), side, order_type: 'market_order', time_in_force: 'ioc',
      client_order_id: `am-test-${config.id.slice(-6)}-${Date.now()}`,
    }))
  } else {
    const posData = await getPositions(config.account.api_key_enc, config.account.api_secret_enc)
    openPos = (posData?.result ?? []).find((p: any) => p.product_symbol === script.exchange_symbol && Math.abs(p.size) > 0)
    if (!openPos) return { message: 'No open position to exit' }
    orderResult = assertOrderSuccess(await placeOrder(config.account.api_key_enc, config.account.api_secret_enc, {
      product_id: script.productId, product_symbol: script.exchange_symbol,
      size: Math.abs(openPos.size), side, order_type: 'market_order', time_in_force: 'ioc',
      client_order_id: `am-test-${config.id.slice(-6)}-${Date.now()}`,
    }))
  }

  // equity_pct mode: fold this exit's realized P&L into the bot's own tracked
  // running balance, so the NEXT entry's % is applied to a compounded figure
  // scoped to just this bot — never touches the whole Delta account balance.
  if (orderSizeType === 'equity_pct') {
    try {
      const realizedPnl = parseFloat(orderResult?.result?.meta_data?.pnl ?? '0')
      if (!isNaN(realizedPnl) && realizedPnl !== 0) {
        const basis = config.equityBalance ?? config.amount
        await prisma.tradeConfig.update({
          where: { id: config.id },
          data: { equityBalance: basis + (realizedPnl * INR_TO_USD) },
        })
      }
    } catch (e) {
      console.warn(`Could not update equityBalance for config ${config.id}:`, e)
    }
  }

  return orderResult
}
