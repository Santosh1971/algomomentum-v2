import fs from 'fs'
import path from 'path'
// app/api/admin/strategies/[id]/route.js

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { NEXT_AUTH as authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { parseBacktestFile } from '@/lib/parseBacktest'

// PATCH /api/admin/strategies/:id — update strategy
export async function PATCH(req, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (session?.user?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const formData = await req.formData()
  const file = formData.get('backtestFile')

  const data = {}
  for (const [key, val] of formData.entries()) {
    if (key === 'backtestFile') continue
    if (key === 'isFeatured' || key === 'isActive' || key === 'showSubscriberCount') { data[key] = val === 'true'; continue }
    if (key === 'minCapital') { data[key] = parseFloat(val); continue }
    if (key === 'defaultLeverage') { data[key] = parseInt(val); continue }
    if (val !== '') data[key] = val
  }

  if (file && file.size > 0) {
    const buffer = Buffer.from(await file.arrayBuffer())
    try {
      const parsed = parseBacktestFile(buffer, file.name)
      const { backtestTrades, properties, equityData, ...parsedStats } = parsed
      if (equityData) parsedStats.equityData = equityData
      if (properties) parsedStats.properties = properties
      parsedStats.backtestFileName = file.name
      // Save file to disk
      const uploadDir = path.join(process.cwd(), 'public', 'backtest-files')
      if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true })
      const safeName = `${id}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
      fs.writeFileSync(path.join(uploadDir, safeName), buffer)
      parsedStats.backtestFileUrl = `/backtest-files/${safeName}`
      Object.assign(data, parsedStats)

      // Store backtest trades
      if (backtestTrades?.length) {
        await prisma.strategyTrade.deleteMany({ where: { strategyId: id, source: 'backtest' } })
        await prisma.strategyTrade.createMany({
          data: backtestTrades.map((t) => ({
            strategyId:       id,
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
    where: { id },
    data,
  })

  // If defaultLeverage changed, propagate to all subscriber TradeConfigs
  if (data.defaultLeverage !== undefined) {
    await prisma.tradeConfig.updateMany({
      where: { strategyId: id, isSubscription: true },
      data: { leverage: data.defaultLeverage },
    })
  }

  return NextResponse.json({ strategy })
}

// DELETE /api/admin/strategies/:id
export async function DELETE(req, { params }: { params: Promise<{ id: string }> }) {
  const { id: deleteId } = await params
  const session = await getServerSession(authOptions)
  if (session?.user?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Remove subscriber TradeConfigs first
  await prisma.tradeConfig.deleteMany({
    where: { strategyId: deleteId },
  })

  await prisma.strategy.delete({ where: { id: params.id } })

  return NextResponse.json({ ok: true })
}
