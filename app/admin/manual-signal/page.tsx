'use client'

import { useEffect, useState } from 'react'
import Navbar from '@/components/Navbar'

export default function ManualSignalPage() {
  const [strategies, setStrategies] = useState<any[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [side, setSide] = useState('buy')
  const [trade, setTrade] = useState('ENTRY')
  const [price, setPrice] = useState('')
  const [marketPrice, setMarketPrice] = useState<number | null>(null)
  const [loadingPrice, setLoadingPrice] = useState(false)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<any>(null)

  useEffect(() => {
    fetch('/api/v1/admin/strategies')
      .then(r => r.json())
      .then(d => {
        setStrategies(d.strategies ?? [])
        if (d.strategies?.length) setSelectedId(d.strategies[0].id)
      })
  }, [])

  const selected = strategies.find(s => s.id === selectedId)

  useEffect(() => {
    if (!selected?.symbol) return
    setMarketPrice(null)
    setLoadingPrice(true)
    fetch(`/api/v1/ticker?symbol=${selected.symbol}`)
      .then(r => r.json())
      .then(d => { setMarketPrice(d.price ?? null); setLoadingPrice(false) })
      .catch(() => setLoadingPrice(false))
  }, [selectedId, selected?.symbol])

  async function fireSignal() {
    if (!selectedId || !selected) return
    const confirm = window.confirm(`Fire ${side === 'buy' ? 'LONG' : 'SHORT'} ${trade} to all subscribers of "${selected.name}"?`)
    if (!confirm) return
    setLoading(true)
    setResult(null)
    try {
      const res = await fetch('/api/v1/admin/manual-signal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ strategyId: selectedId, side, trade, price: price ? parseFloat(price) : marketPrice }),
      })
      const json = await res.json()
      setResult(json)
    } catch (e: any) {
      setResult({ error: e.message })
    }
    setLoading(false)
  }

  return (
    <>
      <Navbar />
      <div className="max-w-2xl mx-auto px-4 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-bold">Manual Entry / Exit</h1>
          <p className="text-sm text-muted-foreground mt-1">Fire entry or exit signals manually to all strategy subscribers — use when TradingView fails.</p>
        </div>

        <div className="border border-border/40 rounded-2xl p-6 space-y-5">
          {/* Strategy selector */}
          <div>
            <label className="text-sm font-medium block mb-1.5">Strategy</label>
            <select value={selectedId} onChange={e => setSelectedId(e.target.value)}
              className="w-full border border-border/40 rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:border-blue-500">
              {strategies.map(s => (
                <option key={s.id} value={s.id}>{s.name} ({s.symbol})</option>
              ))}
            </select>
            {selected && (
              <div className="text-xs text-muted-foreground mt-1">{selected._count?.subscribers ?? 0} active subscribers · {selected.symbol} · {selected.timeframe}</div>
            )}
          </div>

          {/* Side — Long / Short */}
          <div>
            <label className="text-sm font-medium block mb-1.5">Direction</label>
            <div className="flex gap-2">
              {[{ label: '🟢 Long', value: 'buy' }, { label: '🔴 Short', value: 'sell' }].map(s => (
                <button key={s.value} onClick={() => setSide(s.value)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${side === s.value
                    ? s.value === 'buy' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
                    : 'border border-border/40 hover:bg-muted/30'}`}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Signal type — Entry / Exit */}
          <div>
            <label className="text-sm font-medium block mb-1.5">Signal Type</label>
            <div className="flex gap-2">
              {['ENTRY', 'EXIT'].map(t => (
                <button key={t} onClick={() => setTrade(t)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${trade === t ? 'bg-blue-600 text-white' : 'border border-border/40 hover:bg-muted/30'}`}>
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Price */}
          <div>
            <label className="text-sm font-medium block mb-1.5">
              Price
              {marketPrice && <span className="ml-2 text-xs text-muted-foreground font-normal">
                Market: <span className="text-blue-500 font-semibold">${marketPrice}</span>
                {loadingPrice && ' (fetching…)'}
              </span>}
            </label>
            <div className="relative">
              <input type="number" step="any" placeholder={marketPrice ? `${marketPrice} (market)` : 'Leave blank to use market price'}
                value={price} onChange={e => setPrice(e.target.value)}
                className="w-full border border-border/40 rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:border-blue-500 pr-20" />
              {marketPrice && (
                <button onClick={() => setPrice(String(marketPrice))}
                  className="absolute right-2 top-1.5 text-xs px-2 py-1 rounded bg-muted/50 text-muted-foreground hover:bg-muted">
                  Use market
                </button>
              )}
            </div>
          </div>

          {/* Summary */}
          {selected && (
            <div className="bg-muted/30 rounded-lg px-4 py-3 text-sm">
              Will fire <span className="font-semibold">{side === 'buy' ? 'LONG' : 'SHORT'} {trade}</span> on <span className="font-semibold">{selected.symbol}</span> at <span className="font-semibold">${price || marketPrice || '—'}</span> to <span className="font-semibold">{selected._count?.subscribers ?? 0} subscriber(s)</span>
            </div>
          )}

          {/* Fire button */}
          <button onClick={fireSignal} disabled={loading || !selectedId}
            className={`w-full py-3 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 ${side === 'sell' ? 'bg-red-600 hover:bg-red-700 text-white' : 'bg-green-600 hover:bg-green-700 text-white'}`}>
            {loading ? 'Firing…' : `🚀 Fire ${side === 'buy' ? 'Long' : 'Short'} ${trade} Signal`}
          </button>

          {/* Result */}
          {result && (
            <div className={`rounded-lg px-4 py-3 text-sm ${result.error ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-green-50 text-green-700 border border-green-200'}`}>
              {result.error ? `❌ Error: ${result.error}` : `✅ Signal fired to ${result.fired}/${result.total} subscribers`}
              {result.errors?.length > 0 && (
                <div className="mt-2 text-xs text-red-600 space-y-1">
                  {result.errors.map((e: any, i: number) => <div key={i}>{e.userId}: {e.error}</div>)}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
