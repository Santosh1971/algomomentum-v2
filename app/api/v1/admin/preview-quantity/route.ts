import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { NEXT_AUTH as authOptions } from '@/lib/auth'
import { getBalances, getBalancesOAuth, getTicker } from '@/lib/deltaClient'
import cache from '@/lib/cache'
import { prisma } from '@/lib/prisma'

const INR_TO_USD = 85

function computeQuantity(orderSizeType: string, amount: number, marketPrice: number, lot: number, equityUSD = 0) {
  if (orderSizeType === 'lot') {
    return Math.max(1, Math.floor(amount))
  }
  if (orderSizeType === 'equity_pct') {
    return Math.max(1, Math.floor((equityUSD * amount / 100) / marketPrice / (lot || 1)))
  }
  return Math.max(1, Math.floor((amount / INR_TO_USD) / marketPrice / (lot || 1)))
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (session?.user?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { tradeConfigId, symbol, orderSizeType, amount, leverage, balanceOverride } = await req.json()
  if (!tradeConfigId || !symbol || !orderSizeType || amount == null) {
    return NextResponse.json({ error: 'tradeConfigId, symbol, orderSizeType, amount are required' }, { status: 400 })
  }

  const tc = await prisma.tradeConfig.findUnique({
    where: { id: tradeConfigId },
    include: { account: { select: { api_key_enc: true, api_secret_enc: true, is_oauth: true, oauth_access_token: true } } },
  })
  if (!tc) return NextResponse.json({ error: 'Trade config not found' }, { status: 404 })

  const script = cache.getScript(symbol.toUpperCase())
  if (!script) return NextResponse.json({ error: `Unknown symbol: ${symbol}` }, { status: 400 })

  const marketPrice = await getTicker(script.exchange_symbol)
  if (!marketPrice) return NextResponse.json({ error: `No live price for ${symbol}` }, { status: 502 })

  let balanceUSD: number
  if (balanceOverride != null) {
    balanceUSD = parseFloat(balanceOverride)
  } else {
    const isOAuth = tc.account.is_oauth && tc.account.oauth_access_token
    const balData = isOAuth
      ? await getBalancesOAuth(tc.account.oauth_access_token!)
      : await getBalances(tc.account.api_key_enc, tc.account.api_secret_enc)
    const balList = balData?.result ?? []
    const walletEntry = balList.find((b: any) => b.asset_symbol === 'USD') ?? balList[0]
    balanceUSD = parseFloat(walletEntry?.balance ?? '0')
  }

  const quantity = computeQuantity(orderSizeType, parseFloat(amount), marketPrice, script.lot, balanceUSD)
  const positionValueUSD = Math.round(quantity * (script.lot || 1) * marketPrice * 100) / 100
  const lev = leverage ? parseFloat(leverage) : 1
  const marginUsedUSD = Math.round((positionValueUSD / (lev || 1)) * 100) / 100

  return NextResponse.json({
    balanceUSD: Math.round(balanceUSD * 100) / 100,
    marketPrice,
    quantity,
    positionValueUSD,
    marginUsedUSD,
    exceedsBalance: marginUsedUSD > balanceUSD,
  })
}
