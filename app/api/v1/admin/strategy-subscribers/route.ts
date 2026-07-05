import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { NEXT_AUTH as authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (session?.user?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const symbol = req.nextUrl.searchParams.get('symbol')
  if (!symbol) return NextResponse.json({ error: 'symbol is required' }, { status: 400 })

  const strategy = await prisma.strategy.findFirst({
    where: { symbol: symbol.toUpperCase(), isActive: true },
    include: {
      subscribers: {
        where: { isActive: true, userActive: true },
        include: { user: { select: { id: true, name: true, email: true } } },
      },
    },
  })

  if (!strategy) return NextResponse.json({ subscribers: [] })

  const subscribers = strategy.subscribers.map((tc: any) => ({
    userId: tc.userId,
    name: tc.user?.name ?? tc.user?.email,
    email: tc.user?.email,
    tradeConfigId: tc.id,
    amount: tc.amount,
    leverage: tc.leverage,
  }))

  return NextResponse.json({ subscribers })
}
