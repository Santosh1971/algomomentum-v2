'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
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
  const { id } = useParams()
  const [tab, setTab] = useState<'backtest' | 'live'>('backtest')
  const [period, setPeriod] = useState('30')
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/v1/marketplace/${id}?period=${period}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
  }, [id, period])

  if (loading) return <><Navbar /><div className="p-10 text-center text-muted-foreground">Loading…</div></>
  if (!data?.strategy) return <><Navbar /><div className="p-10 text-center text-muted-foreground">Strategy not found</div></>

  const s = data.strategy

  return (
    <>
      <Navbar />
      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-semibold">{s.name}</h1>
          <div className="text-sm text-muted-foreground mt-1">{s.symbol} · {s.timeframe} · {s._count.subscribers} subscribers</div>
          {s.description && <p className="text-sm text-muted-foreground mt-2">{s.description}</p>}
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
            {/* KPI row */}
            <div className="grid grid-cols-4 gap-3">
              <KpiCard label="Total PnL"     value={s.totalPnlPct  != null ? `+${s.totalPnlPct.toFixed(1)}%`  : '—'} color="green" />
              <KpiCard label="Profit factor" value={s.profitFactor?.toFixed(2) ?? '—'} />
              <KpiCard label="Win rate"      value={s.winRate != null ? `${s.winRate.toFixed(1)}%` : '—'} />
              <KpiCard label="Max drawdown"  value={s.maxDrawdown != null ? `−${s.maxDrawdown.toFixed(1)}%` : '—'} color="red" />
            </div>

            {/* Equity chart */}
            <div className="border border-border/40 rounded-xl p-4">
              <div className="text-sm font-medium mb-3">Backtesting PnL</div>
              <div className="h-64">
                <EquityChart data={s.equityData} />
              </div>
            </div>

            {/* Backtest details */}
            <div className="grid grid-cols-2 gap-4">
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
                <Row label="Subscribers" value={s._count.subscribers} />
                <Row label="Launch Date" value={new Date(s.createdAt).toLocaleDateString('en-IN')} />
                {(s as any).properties?.['Trading range'] && (
                  <Row label="Backtest Range" value={(s as any).properties['Trading range']} />
                )}
              </div>
            </div>
          </div>
        )}

        {tab === 'live' && (
          <div className="space-y-4">
            {/* Period selector */}
            <div className="flex gap-2 flex-wrap">
              {[{label:'All',value:'all'}, ...PERIODS].map(p => (
                <button key={p.value} onClick={() => setPeriod(p.value)}
                  className={`px-4 py-1.5 rounded-lg text-sm transition-colors ${period === p.value ? 'bg-blue-600 text-white' : 'border border-border/40 hover:bg-muted/30'}`}>
                  {p.label}
                </button>
              ))}
            </div>

            {/* Live stats */}
            <div className="grid grid-cols-4 gap-3">
              <KpiCard label="Total Trades"  value={data.stats?.total ?? 0} />
              <KpiCard label="Win Rate"      value={data.stats?.winRate ? `${data.stats.winRate}%` : '—'} color="green" />
              <KpiCard label="Wins"          value={data.stats?.wins ?? 0} color="green" />
              <KpiCard label="Losses"        value={data.stats?.losses ?? 0} color="red" />
            </div>

            {/* Live equity chart */}
            {data.liveEquity?.length > 1 && (
              <div className="border border-border/40 rounded-xl p-4">
                <div className="text-sm font-medium mb-3">Live PnL Curve</div>
                <div className="h-52">
                  <EquityChart data={data.liveEquity} />
                </div>
              </div>
            )}

            {/* Trade history table */}
            <div className="border border-border/40 rounded-xl overflow-hidden">
              <div className="p-4 border-b border-border/40">
                <div className="text-sm font-medium">Historical Trades (Backtest + Live)</div>
              </div>
              {data.allPaired?.length > 0 ? (
                <table className="w-full text-xs">
                  <thead className="bg-muted/30">
                    <tr>
                      <th className="text-left px-3 py-2 text-muted-foreground font-medium">Trade#</th>
                      <th className="text-left px-3 py-2 text-muted-foreground font-medium">Symbol</th>
                      <th className="text-left px-3 py-2 text-muted-foreground font-medium">Signal</th>
                      <th className="text-left px-3 py-2 text-muted-foreground font-medium">Entry Date</th>
                      <th className="text-left px-3 py-2 text-muted-foreground font-medium">Entry Price</th>
                      <th className="text-left px-3 py-2 text-muted-foreground font-medium">Exit Date</th>
                      <th className="text-left px-3 py-2 text-muted-foreground font-medium">Exit Price</th>
                      <th className="text-right px-3 py-2 text-muted-foreground font-medium">PnL (ROI%)</th>
                      <th className="text-right px-3 py-2 text-muted-foreground font-medium">Agg. PnL%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.allPaired.map((t: any) => (
                      <tr key={t.tradeNum} className="border-t border-border/20 hover:bg-muted/20">
                        <td className="px-3 py-2">{t.tradeNum}</td>
                        <td className="px-3 py-2 font-medium">{t.symbol}</td>
                        <td className={`px-3 py-2 font-medium ${t.entrySide === 'buy' ? 'text-green-500' : 'text-red-400'}`}>{t.entrySide?.toUpperCase()}</td>
                        <td className="px-3 py-2 text-muted-foreground">{new Date(t.entryDate).toLocaleDateString('en-IN')}</td>
                        <td className="px-3 py-2">${t.entryPrice?.toFixed(4)}</td>
                        <td className="px-3 py-2 text-muted-foreground">{new Date(t.exitDate).toLocaleDateString('en-IN')}</td>
                        <td className="px-3 py-2">${t.exitPrice?.toFixed(4)}</td>
                        <td className={`px-3 py-2 text-right font-medium ${t.pnlPct >= 0 ? 'text-green-500' : 'text-red-400'}`}>{t.pnlPct >= 0 ? '+' : ''}{t.pnlPct.toFixed(2)}%</td>
                        <td className={`px-3 py-2 text-right font-medium ${t.aggPnlPct >= 0 ? 'text-green-500' : 'text-red-400'}`}>{t.aggPnlPct >= 0 ? '+' : ''}{t.aggPnlPct.toFixed(2)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="p-8 text-center text-muted-foreground text-sm">
                  No completed trades in this period yet.<br/>
                  <span className="text-xs">Trades will appear here once TradingView signals start firing.</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
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
