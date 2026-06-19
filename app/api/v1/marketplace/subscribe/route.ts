// app/api/marketplace/subscribe/route.js
// POST — user subscribes to a strategy (creates their TradeConfig)

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { NEXT_AUTH as authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST(req) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { strategyId, lotSize, capital } = await req.json()

  if (!strategyId) {
    return NextResponse.json({ error: 'strategyId is required' }, { status: 400 })
  }

  const strategy = await prisma.strategy.findUnique({
    where: { id: strategyId, isActive: true },
  })

  if (!strategy) {
    return NextResponse.json({ error: 'Strategy not found or inactive' }, { status: 404 })
  }

  // Check not already subscribed
  const existing = await prisma.tradeConfig.findFirst({
    where: { userId: session.user.id, strategyId, isSubscription: true },
  })

  if (existing) {
    return NextResponse.json({ error: 'Already subscribed to this strategy' }, { status: 409 })
  }

  // Create a locked TradeConfig for this user
  const tradeConfig = await prisma.tradeConfig.create({
    data: {
      userId:        session.user.id,
      strategyId,
      isSubscription: true,
      symbol:        strategy.symbol,   // locked — inherited from strategy
      lotSize:       lotSize ?? 1,
      capital:       capital ?? null,
      isActive:      true,
      // name shown in user's bot list
      name:          `${strategy.name} (subscribed)`,
    },
  })

  return NextResponse.json({ tradeConfig }, { status: 201 })
}
