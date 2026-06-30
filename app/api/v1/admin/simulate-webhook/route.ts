import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { NEXT_AUTH as authOptions } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (session?.user?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { symbol, side, trade, price } = await req.json()
  if (!symbol || !side || !trade) {
    return NextResponse.json({ error: 'symbol, side, trade are required' }, { status: 400 })
  }

  const url = `http://localhost:3000/api/v1/webhook/strategy/${symbol}?secret=${process.env.BROADCAST_SECRET}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ side, trade, price, trigger_time: new Date().toISOString() }),
  })
  const data = await res.json()
  return NextResponse.json(data, { status: res.status })
}
