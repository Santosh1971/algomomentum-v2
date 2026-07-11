'use client'
import { useSession } from 'next-auth/react'
import SubscribeModal from '@/components/marketplace/SubscribeModal'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Navbar from '@/components/Navbar'
import EquityChart from '@/components/marketplace/EquityChart'

const PERIODS = [
  { label: '7D', value: '7' },
  { label: '30D', value: '30' },
  { label: '90D', value: '90' },
  { label: '6M', value: '180' },
  { label: '1Y', value: '365' },
]

export default function StrategyDetailPage() {
  const { data: session } = useSession()
  const hasDelta = !!(session?.user as any)?.deltaUserId
  const isApproved = !!(session?.user as any)?.isApproved
  const { id } = useParams()
  const router = useRouter()
  const [tab, setTab] = useState<'backtest' | 'live'>('backtest')
  const [period, setPeriod] = useState('30')
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [subscribing, setSubscribing] = useState(false)
  const [subMsg, setSubMsg] = useState('')
  const [showSubModal, setShowSubModal] = useState(false)

  useEffect(() => {
    fetch(`/api/v1/marketplace/${id}?period=${period}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
  }, [id, period])

  function handleSubscribe() {
    setShowSubModal(true)
  }

  async function handleUnsubscribe() {
    const confirm = window.confirm(`Unsubscribe from ${s?.name ?? "this strategy"}?\nYour bot will be deactivated.\n\nConfirm?`)
    if (!confirm) return
    setSubscribing(true)
    setSubMsg('')
    const res = await fetch('/api/v1/marketplace/unsubscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ strategyId: id }),
    })
    const json = await res.json()
    if (res.ok) {
      setSubMsg('Unsubscribed successfully.')
      setData((prev: any) => ({ ...prev, isSubscribed: false }))
    } else {
      setSubMsg(json.error ?? 'Failed to unsubscribe')
    }
    setSubscribing(false)
  }

  if (loading) return <><Navbar /><div className="p-10 text-center text-muted-foreground">Loading…</div></>
  if (!data?.strategy) return <><Navbar /><div className="p-10 text-center text-muted-foreground">Strategy not found</div></>

  const s = data.strategy

  return (
    <>
      <Navbar />
      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">{s.name}</h1>
            <div className="text-sm text-muted-foreground mt-1">{s.symbol} · {s.timeframe}{s.showSubscriberCount !== false ? ` · ${s._count.subscribers} subscribers` : ''}{s.minCapital ? ` · Min ₹${s.minCapital.toLocaleString('en-IN')}` : ''}</div>
            {s.description && <p className="text-sm text-muted-foreground mt-2">{s.description}</p>}
          </div>
          <div className="flex flex-col items-end gap-2 shrink-0">
            {data.isSubscribed && isApproved ? (
              <button onClick={handleUnsubscribe} disabled={subscribing}
                className="px-5 py-2 rounded-lg text-sm font-medium bg-red-600 hover:bg-red-700 text-white transition-colors disabled:opacity-50">
                {subscribing ? 'Processing…' : 'Unsubscribe'}
              </button>
            ) : hasDelta && isApproved ? (
              <button onClick={handleSubscribe} disabled={subscribing}
                className="px-5 py-2 rounded-lg text-sm font-medium bg-green-600 hover:bg-green-700 text-white transition-colors disabled:opacity-50">
                {subscribing ? 'Processing…' : 'Subscribe'}
              </button>
            ) : hasDelta ? (
              <span className="px-5 py-2 rounded-lg text-sm font-medium border border-yellow-400/40 text-yellow-500">⏳ Pending Approval</span>
            ) : (
              <a href="/api/auth/delta/authorize"
                className="px-5 py-2 rounded-lg text-sm font-medium bg-orange-500 hover:bg-orange-600 text-white transition-colors">
                🔗 Connect Delta to Subscribe
              </a>
            )}
            {subMsg && <div className="text-xs text-muted-foreground">{subMsg}</div>}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          <button onClick={() => setTab('backtest')}
            className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors ${tab === 'backtest' ? 'bg-blue-600 text-white' : 'border border-border/40 hover:bg-muted/30'}`}>
            Backtest
          </button>
          <button onClick={() => setTab('live')}
            className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors ${tab === 'live' ? 'bg-blue-600 text-white' : 'border border-border/40 hover:bg-muted/30'}`}>
            Live
          </button>
        </div>

        {tab === 'backtest' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <KpiCard label="Total PnL"     value={s.totalPnlPct  != null ? `+${s.totalPnlPct.toFixed(1)}%`  : '—'} color="green" />
              <KpiCard label="Profit factor" value={s.profitFactor?.toFixed(2) ?? '—'} />
              <KpiCard label="Win rate"      value={s.winRate != null ? `${s.winRate.toFixed(1)}%` : '—'} />
              <KpiCard label="Max drawdown"  value={s.maxDrawdown != null ? `−${s.maxDrawdown.toFixed(1)}%` : '—'} color="red" />
            </div>
            <div className="border border-border/40 rounded-xl p-4">
              <div className="text-sm font-medium mb-3">Backtesting PnL</div>
              <div className="h-64">
                <EquityChart data={s.equityData} />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="border border-border/40 rounded-xl p-4 space-y-2">
                <div className="text-sm font-medium mb-2">Backtesting Result</div>
                <Row label="Initial Capital" value="₹1,000" />
                <Row label="Total PnL" value={s.totalPnlPct != null ? `+${s.totalPnlPct.toFixed(1)}%` : '—'} color="green" />
                <Row label="No. of Trades" value={s.totalTrades ?? '—'} />
                <Row label="Win Rate" value={s.winRate != null ? `${s.winRate.toFixed(1)}%` : '—'} />
                <Row label="Profit Factor" value={s.profitFactor?.toFixed(3) ?? '—'} />
                <Row label="Max Drawdown" value={s.maxDrawdown != null ? `−${s.maxDrawdown.toFixed(1)}%` : '—'} color="red" />
              </div>
              <div className="border border-border/40 rounded-xl p-4 space-y-2">
                <div className="text-sm font-medium mb-2">Key Metrics</div>
                <Row label="Symbol" value={s.symbol} />
                <Row label="Timeframe" value={s.timeframe} />
                {s.showSubscriberCount !== false && <Row label="Subscribers" value={s._count.subscribers} />}
                <Row label="Launch Date" value={new Date(s.createdAt).toLocaleDateString('en-IN')} />
                {(s as any).properties?.['Trading range'] && (
                  <Row label="Backtest Range" value={(s as any).properties['Trading range']} />
                )}
              </div>
            </div>
            <div className="border border-border/40 rounded-xl overflow-hidden">
              <div className="p-4 border-b border-border/40">
                <div className="text-sm font-medium">Backtested Trades</div>
              </div>
              <TradesTable trades={data.backtestPaired} emptyText="No backtest trades recorded for this strategy." />
            </div>
          </div>
        )}

        {tab === 'live' && (
          <div className="space-y-4">
            <div className="flex gap-2 flex-wrap">
              {[{label:'All',value:'all'}, ...PERIODS].map(p => (
                <button key={p.value} onClick={() => setPeriod(p.value)}
                  className={`px-4 py-1.5 rounded-lg text-sm transition-colors ${period === p.value ? 'bg-blue-600 text-white' : 'border border-border/40 hover:bg-muted/30'}`}>
                  {p.label}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <KpiCard label="Total Trades"  value={data.stats?.total ?? 0} />
              <KpiCard label="Win Rate"      value={data.stats?.winRate ? `${data.stats.winRate}%` : '—'} color="green" />
              <KpiCard label="Wins"          value={data.stats?.wins ?? 0} color="green" />
              <KpiCard label="Losses"        value={data.stats?.losses ?? 0} color="red" />
            </div>
            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              <KpiCard label="Live PnL"      value={data.stats?.livePnlPct != null ? `${data.stats.livePnlPct > 0 ? '+' : ''}${data.stats.livePnlPct}%` : '—'} color={data.stats?.livePnlPct >= 0 ? 'green' : 'red'} />
              <KpiCard label="Max Drawdown"  value={data.stats?.liveMaxDD != null ? `-${data.stats.liveMaxDD}%` : '—'} color="red" />
              <KpiCard label="Profit Factor" value={data.stats?.liveProfitFactor?.toFixed(2) ?? '—'} />
            </div>
            {data.liveEquity?.length > 1 && (
              <div className="border border-border/40 rounded-xl p-4">
                <div className="text-sm font-medium mb-3">Live PnL Curve</div>
                <div className="h-52">
                  <EquityChart data={data.liveEquity} />
                </div>
              </div>
            )}
            <div className="border border-border/40 rounded-xl overflow-hidden">
              <div className="p-4 border-b border-border/40">
                <div className="text-sm font-medium">Live Trades</div>
              </div>
              <TradesTable trades={data.liveTrades} emptyText="No trades in this period yet." emptyHint="Trades will appear here once TradingView signals start firing." />
            </div>
          </div>
        )}
      </div>
      {showSubModal && s && (
        <SubscribeModal
          strategy={s}
          onClose={() => setShowSubModal(false)}
          onSuccess={(strategyId) => {
            setData((prev: any) => ({ ...prev, isSubscribed: true }))
            setShowSubModal(false)
            setSubMsg('Successfully subscribed!')
          }}
        />
      )}
    </>
  )
}

function KpiCard({ label, value, color }: { label: string; value: any; color?: string }) {
  const cls = color === 'green' ? 'text-green-500' : color === 'red' ? 'text-red-400' : 'text-foreground'
  return (
    <div className="border border-border/40 rounded-xl p-4">
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      <div className={`text-xl font-semibold ${cls}`}>{value}</div>
    </div>
  )
}

function Row({ label, value, color }: { label: string; value: any; color?: string }) {
  const cls = color === 'green' ? 'text-green-500' : color === 'red' ? 'text-red-400' : 'text-foreground'
  return (
    <div className="flex justify-between text-sm border-b border-border/20 pb-1.5">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-medium ${cls}`}>{value}</span>
    </div>
  )
}

function TradesTable({ trades, emptyText, emptyHint }: { trades: any[]; emptyText: string; emptyHint?: string }) {
  if (!trades || trades.length === 0) {
    return (
      <div className="p-8 text-center text-muted-foreground text-sm">
        {emptyText}
        {emptyHint && <><br /><span className="text-xs">{emptyHint}</span></>}
      </div>
    )
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs min-w-[720px]">
        <thead className="bg-muted/30">
          <tr>
            <th className="text-left px-3 py-2 text-muted-foreground font-medium">Trade#</th>
            <th className="text-left px-3 py-2 text-muted-foreground font-medium">Symbol</th>
            <th className="text-left px-3 py-2 text-muted-foreground font-medium">Signal</th>
            <th className="text-left px-3 py-2 text-muted-foreground font-medium">Entry Date</th>
            <th className="text-left px-3 py-2 text-muted-foreground font-medium">Entry Price</th>
            <th className="text-right px-3 py-2 text-muted-foreground font-medium">Lot</th>
            <th className="text-left px-3 py-2 text-muted-foreground font-medium">Exit Date</th>
            <th className="text-left px-3 py-2 text-muted-foreground font-medium">Exit Price</th>
            <th className="text-right px-3 py-2 text-muted-foreground font-medium">PnL (ROI%)</th>
            <th className="text-right px-3 py-2 text-muted-foreground font-medium">Agg. PnL%</th>
          </tr>
        </thead>
        <tbody>
          {trades.map((t: any) => (
            <tr key={t.tradeNum} className="border-t border-border/20 hover:bg-muted/20">
              <td className="px-3 py-2">{t.tradeNum}</td>
              <td className="px-3 py-2 font-medium">{t.symbol}</td>
              <td className={`px-3 py-2 font-medium ${t.entrySide === 'buy' ? 'text-green-500' : 'text-red-400'}`}>{t.entrySide?.toUpperCase()}</td>
              <td className="px-3 py-2 text-muted-foreground">{new Date(t.entryDate).toLocaleDateString('en-IN')}</td>
              <td className="px-3 py-2">${t.entryPrice?.toFixed(4)}</td>
              <td className="px-3 py-2 text-right">{t.entrySize ?? "—"}</td>
              <td className="px-3 py-2 text-muted-foreground">{new Date(t.exitDate).toLocaleDateString('en-IN')}</td>
              <td className="px-3 py-2">${t.exitPrice?.toFixed(4)}</td>
              <td className={`px-3 py-2 text-right font-medium ${t.pnlPct >= 0 ? 'text-green-500' : 'text-red-400'}`}>{t.pnlPct >= 0 ? '+' : ''}{t.pnlPct.toFixed(2)}%</td>
              <td className={`px-3 py-2 text-right font-medium ${t.aggPnlPct >= 0 ? 'text-green-500' : 'text-red-400'}`}>{t.aggPnlPct >= 0 ? '+' : ''}{t.aggPnlPct.toFixed(2)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
