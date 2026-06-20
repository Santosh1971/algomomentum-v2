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

  const daysAgo = new Date()
  daysAgo.setDate(daysAgo.getDate() - parseInt(period))

  const trades = await prisma.strategyTrade.findMany({
    where: { strategyId: id, firedAt: { gte: daysAgo } },
    orderBy: { firedAt: 'asc' },
  })

  // Pair Entry + Exit into completed trades
  const pairedTrades: any[] = []
  let tradeNum = 0
  let pendingEntry: any = null
  let aggPnl = 0

  for (const t of trades) {
    if (/ENTRY/i.test(t.trade)) {
      pendingEntry = t
    } else if (/EXIT/i.test(t.trade) && pendingEntry) {
      tradeNum++
      const entryPrice = pendingEntry.price ?? 0
      const exitPrice  = t.price ?? 0
      const side       = pendingEntry.side
      const pnlPct     = side === 'buy'
        ? ((exitPrice - entryPrice) / entryPrice) * 100
        : ((entryPrice - exitPrice) / entryPrice) * 100
      aggPnl += pnlPct

      pairedTrades.push({
        tradeNum,
        symbol:      strategy.symbol,
        entrySide:   side,
        entryDate:   pendingEntry.firedAt,
        entryPrice,
        exitDate:    t.firedAt,
        exitPrice,
        pnlPct:      Math.round(pnlPct * 100) / 100,
        aggPnlPct:   Math.round(aggPnl * 100) / 100,
        firedTo:     pendingEntry.totalFired,
      })
      pendingEntry = null
    }
  }

  return NextResponse.json({
    strategy,
    trades,
    pairedTrades: pairedTrades.reverse(), // latest first
    entries: trades.filter(t => /ENTRY/i.test(t.trade)).length,
    exits:   trades.filter(t => /EXIT/i.test(t.trade)).length,
  })
}
