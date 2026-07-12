// app/api/marketplace/route.js
// GET — public list of active strategies with subscriber count

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const strategies = await prisma.strategy.findMany({
    where: { isActive: true },
    orderBy: [{ isFeatured: 'desc' }, { totalPnlPct: 'desc' }],
    select: {
      id: true,
      name: true,
      symbol: true,
      timeframe: true,
      description: true,
      isFeatured: true,
      minCapital: true,
      equityData: true,
      totalPnlPct: true,
      winRate: true,
      maxDrawdown: true,
      profitFactor: true,
      totalTrades: true,
      createdAt: true,
      showSubscriberCount: true,
      orderSizeType: true,
      defaultOrderSizeValue: true,
      _count: { select: { subscribers: true } },
    },
  })

  return NextResponse.json({ strategies })
}
