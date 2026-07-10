import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { NEXT_AUTH } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getBalances, getBalancesOAuth } from '@/lib/deltaClient'

export async function POST(req: NextRequest) {
  const session = await getServerSession(NEXT_AUTH)
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { strategyId, amount } = await req.json()
  if (!strategyId) return NextResponse.json({ error: 'strategyId is required' }, { status: 400 })

  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const strategy = await prisma.strategy.findUnique({ where: { id: strategyId, isActive: true } })
  if (!strategy) return NextResponse.json({ error: 'Strategy not found or inactive' }, { status: 404 })

  // Validate minimum capital — only meaningful for 'currency' mode
  const orderSizeType = strategy.orderSizeType || 'currency'
  if (orderSizeType === 'currency' && strategy.minCapital && amount && amount < strategy.minCapital) {
    return NextResponse.json({ error: `Minimum capital for this strategy is ₹${strategy.minCapital.toLocaleString('en-IN')}` }, { status: 400 })
  }

  const existing = await prisma.tradeConfig.findFirst({
    where: { userId: user.id, strategyId, isSubscription: true },
  })
  if (existing) return NextResponse.json({ error: 'Already subscribed' }, { status: 409 })

  const allAccounts = await prisma.deltaAccount.findMany({
    where: { userId: user.id, isActive: true },
  })
  const account = allAccounts.find(a => a.accountType === 'main') ?? allAccounts[0]
  if (!account) return NextResponse.json({ error: 'No active Delta account found. Please connect one first.' }, { status: 400 })

  const scriptExists = await prisma.tradeConfig.findFirst({
    where: { accountId: account.id, script: strategy.symbol },
  })
  if (scriptExists) return NextResponse.json({ error: `You already have a bot for ${strategy.symbol} on this account.` }, { status: 409 })

  // Check available balance vs total allocated across all active bots + new subscription
  // — only meaningful for 'currency' mode, where amount is a real ₹ figure
  if (orderSizeType === 'currency') {
  try {
    const INR_TO_USD = 85
    const balData = account.is_oauth && account.oauth_access_token
      ? await getBalancesOAuth(account.oauth_access_token)
      : await getBalances(account.api_key_enc, account.api_secret_enc)
    const balances = balData?.result ?? []
    const wallet = balances.find((b: any) => b.asset_symbol === "USD") ?? balances[0]
    const totalBalanceUSD = parseFloat(wallet?.balance ?? "0")

    // Sum all existing active bot allocations on this account
    const existingBots = await prisma.tradeConfig.findMany({
      where: { accountId: account.id, isActive: true, userActive: true },
      select: { amount: true },
    })
    const totalAllocatedUSD = existingBots.reduce((sum, b) => sum + b.amount / INR_TO_USD, 0)
    const newAmountUSD = (amount ?? strategy.minCapital ?? 1000) / INR_TO_USD
    const totalAfterSubscription = totalAllocatedUSD + newAmountUSD

    if (totalAfterSubscription > totalBalanceUSD) {
      return NextResponse.json({
        error: `Insufficient balance. Total balance: $${totalBalanceUSD.toFixed(2)}, Already allocated: $${totalAllocatedUSD.toFixed(2)}, New subscription: $${newAmountUSD.toFixed(2)}, Total required: $${totalAfterSubscription.toFixed(2)}`
      }, { status: 400 })
    }
  } catch (e: any) {
    if (e.message?.includes('Insufficient balance')) throw e
    console.warn('Balance check failed, proceeding:', e.message)
  }
  }

  const tradeConfig = await prisma.tradeConfig.create({
    data: {
      userId:         user.id,
      accountId:      account.id,
      strategyId,
      isSubscription: true,
      script:         strategy.symbol,
      amount:         amount ?? 1000,
      isActive:       false,
      mode:           'bridge',
      strategy:       strategy.name,
      timeframe:      strategy.timeframe,
      leverage:      strategy.defaultLeverage ?? 1,
    },
  })

  return NextResponse.json({ tradeConfig }, { status: 201 })
}
