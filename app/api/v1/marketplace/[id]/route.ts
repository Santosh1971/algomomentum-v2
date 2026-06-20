import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const period = req.nextUrl.searchParams.get('period') ?? '30'

  const strategy = await prisma.strategy.findUnique({
    where: { id, isActive: true },
    include: { _count: { select: { subscribers: true } } },
  })

  if (!strategy) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Get trades for selected period
  const daysAgo = new Date()
  daysAgo.setDate(daysAgo.getDate() - parseInt(period))

  const trades = await prisma.strategyTrade.findMany({
    where: { strategyId: id, firedAt: { gte: daysAgo } },
    orderBy: { firedAt: 'desc' },
  })

  // Calculate live stats from trades
  const entries = trades.filter(t => /ENTRY/i.test(t.trade))
  const exits   = trades.filter(t => /EXIT/i.test(t.trade))

  return NextResponse.json({ strategy, trades, entries: entries.length, exits: exits.length })
}
