import fs from 'fs'
import path from 'path'
// app/api/admin/strategies/[id]/route.js

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { NEXT_AUTH as authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { parseBacktestFile } from '@/lib/parseBacktest'
import { setLeverage, setLeverageOAuth } from '@/lib/deltaClient'
import cache from '@/lib/cache'

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
    if (key === 'minLiveLot') { data[key] = val === '' ? null : parseFloat(val); continue }
    if (key === 'orderSizeType') { data[key] = val; continue }
    if (key === 'defaultOrderSizeValue') { data[key] = val === '' ? null : parseFloat(val); continue }
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

  // If defaultLeverage changed, propagate to all subscriber TradeConfigs — both our
  // own DB record AND a live push to Delta, so the Admin Positions page (which reads
  // leverage straight from Delta's live data) reflects the change immediately rather
  // than waiting for each subscriber's next trade to naturally push a new leverage.
  if (data.defaultLeverage !== undefined) {
    await prisma.tradeConfig.updateMany({
      where: { strategyId: id, isSubscription: true },
      data: { leverage: data.defaultLeverage },
    })

    try {
      const script = cache.getScript(strategy.symbol)
      if (script) {
        const subscribers = await prisma.tradeConfig.findMany({
          where: { strategyId: id, isSubscription: true, isActive: true, userActive: true },
          include: { account: { select: { api_key_enc: true, api_secret_enc: true, is_oauth: true, oauth_access_token: true } } },
        })
        await Promise.allSettled(subscribers.map((tc: any) =>
          tc.account.is_oauth && tc.account.oauth_access_token
            ? setLeverageOAuth(tc.account.oauth_access_token, script.productId, data.defaultLeverage)
            : setLeverage(tc.account.api_key_enc, tc.account.api_secret_enc, script.productId, data.defaultLeverage)
        ))
      }
    } catch (e) {
      console.warn('Could not push leverage change to Delta for all subscribers:', e)
    }
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
