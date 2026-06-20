import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { NEXT_AUTH } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

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

  const existing = await prisma.tradeConfig.findFirst({
    where: { userId: user.id, strategyId, isSubscription: true },
  })
  if (existing) return NextResponse.json({ error: 'Already subscribed' }, { status: 409 })

  const account = await prisma.deltaAccount.findFirst({
    where: { userId: user.id, isActive: true },
  })
  if (!account) return NextResponse.json({ error: 'No active Delta account found. Please connect one first.' }, { status: 400 })

  const scriptExists = await prisma.tradeConfig.findFirst({
    where: { accountId: account.id, script: strategy.symbol },
  })
  if (scriptExists) return NextResponse.json({ error: `You already have a bot for ${strategy.symbol} on this account.` }, { status: 409 })

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
    },
  })

  return NextResponse.json({ tradeConfig }, { status: 201 })
}
