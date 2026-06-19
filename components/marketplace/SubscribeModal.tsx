'use client'
// components/marketplace/SubscribeModal.jsx

import { useState } from 'react'

export default function SubscribeModal({ strategy, onClose, onSuccess }) {
  const [amount, setAmount] = useState(1000)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState(null)

  async function handleSubscribe() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/v1/marketplace/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ strategyId: strategy.id, amount }),
      })
      if (!res.ok) {
        const { error } = await res.json()
        throw new Error(error || 'Subscribe failed')
      }
      onSuccess(strategy.id)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-background border border-border/50 rounded-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
        <div className="text-base font-medium mb-1">Subscribe to {strategy.name}</div>
        <div className="text-xs text-muted-foreground mb-5">{strategy.symbol} · {strategy.timeframe} — symbol is locked by the strategy</div>

        <div className="space-y-4">
          {/* Symbol (read-only) */}
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Symbol</label>
            <div className="text-sm font-medium bg-muted/30 rounded-lg px-3 py-2 text-muted-foreground">{strategy.symbol} (fixed)</div>
          </div>

          {/* Lot size */}
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Capital (₹)</label>
            <input
              type="number"
              min="1"
              step="1"
              value={amount}
              onChange={e => setAmount(Number(e.target.value))}
              className="w-full bg-muted/30 border border-border/40 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
            />
            <div className="text-xs text-muted-foreground mt-1">Amount used per trade signal in ₹</div>
          </div>
        </div>

        {error && <div className="mt-3 text-xs text-red-400">{error}</div>}

        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 py-2 rounded-lg border border-border/40 text-sm hover:bg-muted/30 transition-colors">Cancel</button>
          <button
            onClick={handleSubscribe}
            disabled={loading || amount < 100}
            className="flex-1 py-2 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Subscribing…' : 'Confirm subscribe'}
          </button>
        </div>
      </div>
    </div>
  )
}
