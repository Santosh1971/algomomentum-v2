// app/api/admin/strategies/[id]/route.js

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { NEXT_AUTH as authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { parseBacktestFile } from '@/lib/parseBacktest'

// PATCH /api/admin/strategies/:id — update strategy
export async function PATCH(req, { params }) {
  const session = await getServerSession(authOptions)
  if (session?.user?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const formData = await req.formData()
  const file = formData.get('backtestFile')

  const data = {}
  for (const [key, val] of formData.entries()) {
    if (key === 'backtestFile') continue
    if (key === 'isFeatured' || key === 'isActive') { data[key] = val === 'true'; continue }
    if (val !== '') data[key] = val
  }

  if (file && file.size > 0) {
    const buffer = Buffer.from(await file.arrayBuffer())
    try {
      const parsed = parseBacktestFile(buffer, file.name)
      const { backtestTrades, properties, ...parsedStats } = parsed
      if (properties) parsedStats.properties = properties
      parsedStats.backtestFileName = file.name
      Object.assign(data, parsedStats)

      // Store backtest trades
      if (backtestTrades?.length) {
        await prisma.strategyTrade.deleteMany({ where: { strategyId: params.id, source: 'backtest' } })
        await prisma.strategyTrade.createMany({
          data: backtestTrades.map((t) => ({
            strategyId:       params.id,
            source:           'backtest',
            side:             t.side,
            trade:            t.type,
            signal:           t.signal,
            price:            t.price,
            size:             t.size,
            netPnlUsd:        t.netPnlUsd,
            netPnlPct:        t.netPnlPct,
            cumulativePnlUsd: t.cumulativePnlUsd,
            tradeNumber:      t.tradeNumber,
            symbol:           data.symbol ?? 'XRPUSDT',
            firedAt:          isNaN(new Date(t.firedAt).getTime()) ? new Date() : new Date(t.firedAt),
            totalFired:       0,
          }))
        })
      }
    } catch (e) {
      return NextResponse.json({ error: e.message }, { status: 422 })
    }
  }

  const strategy = await prisma.strategy.update({
    where: { id: params.id },
    data,
  })

  return NextResponse.json({ strategy })
}

// DELETE /api/admin/strategies/:id
export async function DELETE(req, { params }) {
  const session = await getServerSession(authOptions)
  if (session?.user?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Remove subscriber TradeConfigs first
  await prisma.tradeConfig.deleteMany({
    where: { strategyId: params.id },
  })

  await prisma.strategy.delete({ where: { id: params.id } })

  return NextResponse.json({ ok: true })
}
