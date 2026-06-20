import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const period = req.nextUrl.searchParams.get('period') ?? 'all'

  const strategy = await prisma.strategy.findUnique({
    where: { id, isActive: true },
    include: { _count: { select: { subscribers: true } } },
  })
  if (!strategy) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Build date filter
  let dateFilter: any = {}
  if (period !== 'all') {
    const daysAgo = new Date()
    daysAgo.setDate(daysAgo.getDate() - parseInt(period))
    dateFilter = { firedAt: { gte: daysAgo } }
  }

  // Get ALL trades (backtest + live) for history table
  const allTrades = await prisma.strategyTrade.findMany({
    where: { strategyId: id },
    orderBy: { firedAt: 'asc' },
  })

  // Get period-filtered trades for stats
  const periodTrades = period === 'all' ? allTrades : allTrades.filter(t => {
    const daysAgo = new Date()
    daysAgo.setDate(daysAgo.getDate() - parseInt(period))
    return new Date(t.firedAt) >= daysAgo
  })

  // Pair Entry+Exit into completed trades
  function pairTrades(trades: any[]) {
    const paired: any[] = []
    let tradeNum = 0
    let pendingEntry: any = null
    let aggPnl = 0

    for (const t of trades) {
      const isEntry = /entry/i.test(t.trade) || /entry/i.test(t.signal ?? '')
      const isExit  = /exit/i.test(t.trade)  || /exit/i.test(t.signal ?? '')

      if (isEntry && !pendingEntry) {
        pendingEntry = t
      } else if (isExit && pendingEntry) {
        tradeNum++
        const pnlPct = t.netPnlPct ?? (pendingEntry.side === 'buy'
          ? ((t.price - pendingEntry.price) / pendingEntry.price) * 100
          : ((pendingEntry.price - t.price) / pendingEntry.price) * 100)
        aggPnl += pnlPct

        paired.push({
          tradeNum,
          symbol:          t.symbol,
          entrySide:       pendingEntry.side,
          entryDate:       pendingEntry.firedAt,
          entryPrice:      pendingEntry.price,
          entrySignal:     pendingEntry.signal ?? pendingEntry.trade,
          exitDate:        t.firedAt,
          exitPrice:       t.price,
          exitSignal:      t.signal ?? t.trade,
          netPnlUsd:       t.netPnlUsd,
          pnlPct:          Math.round(pnlPct * 100) / 100,
          aggPnlPct:       Math.round(aggPnl * 100) / 100,
          source:          t.source,
          firedTo:         t.totalFired,
        })
        pendingEntry = null
      }
    }
    return paired.reverse()
  }

  const allPaired    = pairTrades(allTrades)
  const periodPaired = period === 'all' ? allPaired : pairTrades(periodTrades)

  // Build equity curve for live tab (period filtered)
  const liveEquity = periodPaired.slice().reverse().map((t, i) => ({
    date:   t.exitDate,
    equity: 1000 + (1000 * t.aggPnlPct / 100),
  }))

  // Period stats
  const wins   = periodPaired.filter(t => t.pnlPct > 0).length
  const losses = periodPaired.filter(t => t.pnlPct < 0).length
  const totalPnlPct = periodPaired.length > 0 ? periodPaired[0].aggPnlPct - (periodPaired[periodPaired.length-1]?.aggPnlPct ?? 0) : 0

  return NextResponse.json({
    strategy,
    allPaired,
    periodPaired,
    liveEquity,
    stats: {
      total:      periodPaired.length,
      wins,
      losses,
      winRate:    periodPaired.length > 0 ? Math.round(wins / periodPaired.length * 1000) / 10 : 0,
      entries:    periodTrades.filter(t => /entry/i.test(t.trade)).length,
      exits:      periodTrades.filter(t => /exit/i.test(t.trade)).length,
    }
  })
}
