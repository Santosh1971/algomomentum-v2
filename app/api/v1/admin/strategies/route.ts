// app/api/admin/strategies/route.js
// Admin only — create and list strategies

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { NEXT_AUTH as authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { parseBacktestFile } from '@/lib/parseBacktest'
import fs from 'fs'
import path from 'path'

// GET /api/admin/strategies — list all
export async function GET(req) {
  const session = await getServerSession(authOptions)
  if (session?.user?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const strategies = await prisma.strategy.findMany({
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { subscribers: true } }, subscribers: { select: { amount: true } } },
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
  const defaultLeverage = parseInt(formData.get('defaultLeverage')?.toString() || '1')
  const minCapital  = parseFloat(formData.get('minCapital')?.toString() || '1000')
  const file        = formData.get('backtestFile') // File object or null

  if (!name || !symbol || !timeframe) {
    return NextResponse.json({ error: 'name, symbol, timeframe are required' }, { status: 400 })
  }

  let parsedStats: any = {}
  let backtestFileName: string | null = null
  let backtestFileUrl: string | null = null

  if (file && file.size > 0) {
    const buffer = Buffer.from(await file.arrayBuffer())
    try {
      parsedStats = parseBacktestFile(buffer, file.name)
      backtestFileName = file.name
      const uploadDir = path.join(process.cwd(), 'public', 'backtest-files')
      if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true })
      const safeName = `new_${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
      fs.writeFileSync(path.join(uploadDir, safeName), buffer)
      backtestFileUrl = `/backtest-files/${safeName}`
    } catch (e) {
      return NextResponse.json({ error: e.message }, { status: 422 })
    }
  }

  const strategy = await prisma.strategy.create({
    data: {
      name,
      symbol,
      timeframe,
      description,
      isFeatured,
      minCapital,
      backtestFileName,
      backtestFileUrl,
      equityData:    parsedStats.equityData    ?? null,
      totalPnlPct:  parsedStats.totalPnlPct   ?? null,
      winRate:      parsedStats.winRate        ?? null,
      maxDrawdown:  parsedStats.maxDrawdown    ?? null,
      profitFactor: parsedStats.profitFactor   ?? null,
      totalTrades:  parsedStats.totalTrades    ?? null,
      properties:   parsedStats.properties     ?? null,
    },
  })

  return NextResponse.json({ strategy }, { status: 201 })
}
