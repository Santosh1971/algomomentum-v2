import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { NEXT_AUTH } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST(req: NextRequest) {
  const session = await getServerSession(NEXT_AUTH)
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (admin?.role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const { userId, accountId, strategyId, amount, activate } = await req.json()
  if (!userId || !strategyId) {
    return NextResponse.json({ error: 'userId and strategyId are required' }, { status: 400 })
  }

  const targetUser = await prisma.user.findUnique({ where: { id: userId } })
  if (!targetUser) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const strategy = await prisma.strategy.findUnique({ where: { id: strategyId, isActive: true } })
  if (!strategy) return NextResponse.json({ error: 'Strategy not found or inactive' }, { status: 404 })

  const existing = await prisma.tradeConfig.findFirst({
    where: { userId, strategyId, isSubscription: true },
  })
  if (existing) return NextResponse.json({ error: 'This user is already subscribed to this strategy' }, { status: 409 })

  let account
  if (accountId) {
    account = await prisma.deltaAccount.findFirst({ where: { id: accountId, userId, isActive: true } })
    if (!account) return NextResponse.json({ error: 'That account was not found for this user' }, { status: 404 })
  } else {
    const allAccounts = await prisma.deltaAccount.findMany({ where: { userId, isActive: true } })
    account = allAccounts.find(a => a.accountType === 'main') ?? allAccounts[0]
    if (!account) return NextResponse.json({ error: 'This user has no active Delta account connected.' }, { status: 400 })
  }

  const scriptExists = await prisma.tradeConfig.findFirst({
    where: { accountId: account.id, script: strategy.symbol },
  })
  if (scriptExists) return NextResponse.json({ error: `This user already has a bot for ${strategy.symbol} on that account.` }, { status: 409 })

  const bootAmount = amount ?? strategy.minCapital ?? 1000

  const tradeConfig = await prisma.tradeConfig.create({
    data: {
      userId,
      accountId:      account.id,
      strategyId,
      isSubscription: true,
      script:         strategy.symbol,
      amount:         bootAmount,
      equityBalance:  bootAmount,
      isActive:       !!activate,
      userActive:     true,
      mode:           'bridge',
      strategy:       strategy.name,
      timeframe:      strategy.timeframe,
      leverage:        strategy.defaultLeverage ?? 1,
    },
  })

  return NextResponse.json({ tradeConfig }, { status: 201 })
}
