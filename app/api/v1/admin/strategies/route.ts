// app/api/admin/strategies/route.js
// Admin only — create and list strategies

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { NEXT_AUTH as authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { parseBacktestFile } from '@/lib/parseBacktest'

// GET /api/admin/strategies — list all
export async function GET(req) {
  const session = await getServerSession(authOptions)
  if (session?.user?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const strategies = await prisma.strategy.findMany({
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { subscribers: true } } },
  })

  return NextResponse.json({ strategies })
}

// POST /api/admin/strategies — create a strategy (multipart/form-data)
export async function POST(req) {
  const session = await getServerSession(authOptions)
  if (session?.user?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const formData = await req.formData()
  const name        = formData.get('name')?.toString()
  const symbol      = formData.get('symbol')?.toString()
  const timeframe   = formData.get('timeframe')?.toString()
  const description = formData.get('description')?.toString() || null
  const isFeatured  = formData.get('isFeatured') === 'true'
  const file        = formData.get('backtestFile') // File object or null

  if (!name || !symbol || !timeframe) {
    return NextResponse.json({ error: 'name, symbol, timeframe are required' }, { status: 400 })
  }

  let parsedStats = {}
  let backtestFileUrl = null

  if (file && file.size > 0) {
    const buffer = Buffer.from(await file.arrayBuffer())
    try {
      parsedStats = parseBacktestFile(buffer, file.name)
    } catch (e) {
      return NextResponse.json({ error: e.message }, { status: 422 })
    }
    // TODO: upload buffer to your storage (S3/R2/local) and set backtestFileUrl
    // For now we skip file storage and just use the parsed stats
    backtestFileUrl = null
  }

  const strategy = await prisma.strategy.create({
    data: {
      name,
      symbol,
      timeframe,
      description,
      isFeatured,
      backtestFileUrl,
      equityData:    parsedStats.equityData    ?? null,
      totalPnlPct:  parsedStats.totalPnlPct   ?? null,
      winRate:      parsedStats.winRate        ?? null,
      maxDrawdown:  parsedStats.maxDrawdown    ?? null,
      profitFactor: parsedStats.profitFactor   ?? null,
      totalTrades:  parsedStats.totalTrades    ?? null,
    },
  })

  return NextResponse.json({ strategy }, { status: 201 })
}
