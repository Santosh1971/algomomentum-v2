import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { NEXT_AUTH } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST(req: NextRequest) {
  const session = await getServerSession(NEXT_AUTH)
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (user?.role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const { strategyId, side, trade, price } = await req.json()

  const strategy = await prisma.strategy.findUnique({ where: { id: strategyId } })
  if (!strategy) return NextResponse.json({ error: 'Strategy not found' }, { status: 404 })

  const res = await fetch(`${process.env.NEXTAUTH_URL}/api/v1/webhook/strategy/${strategy.symbol}?secret=${process.env.BROADCAST_SECRET}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ side, trade, price }),
  })
  const json = await res.json()
  return NextResponse.json(json)
}
