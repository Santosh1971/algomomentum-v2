// app/api/marketplace/my-subscriptions/route.js
// Returns strategyIds the logged-in user is subscribed to

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { NEXT_AUTH as authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ strategyIds: [] })

  const configs = await prisma.tradeConfig.findMany({
    where: { userId: session.user.id, isSubscription: true },
    select: { strategyId: true },
  })

  return NextResponse.json({ strategyIds: configs.map(c => c.strategyId) })
}
