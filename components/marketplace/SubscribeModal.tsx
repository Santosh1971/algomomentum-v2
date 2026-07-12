'use client'
// components/marketplace/SubscribeModal.jsx

import { useState, useEffect } from 'react'

export default function SubscribeModal({ strategy, onClose, onSuccess }) {
  const [amount, setAmount] = useState(strategy.minCapital || 1000)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState(null)
  const [balance, setBalance] = useState(null)
  const [loadingBalance, setLoadingBalance] = useState(true)
  const [showUSD, setShowUSD] = useState(false)
  const INR_TO_USD = 85

  useEffect(() => {
    fetch('/api/v1/accounts')
      .then(r => r.json())
      .then(d => {
        const accounts = Array.isArray(d) ? d : (d?.accounts ?? [])
        const mainAccount = accounts.find((a: any) => a.accountType === 'main') ?? accounts[0]
        if (mainAccount?.id) {
          fetch(`/api/v1/accounts/${mainAccount.id}/balance`)
            .then(r => r.json())
            .then(b => { setBalance(b); setLoadingBalance(false) })
            .catch(() => setLoadingBalance(false))
        } else setLoadingBalance(false)
      })
      .catch(() => setLoadingBalance(false))
  }, [])

  async function handleSubscribe() {
    const isEquityPct = strategy.orderSizeType === 'equity_pct'
    const INR_TO_USD = 85
    if (!isEquityPct) {
      const requiredUsd = (strategy.minCapital || amount) / INR_TO_USD
      if (balance && balance.available < requiredUsd) {
        window.alert(`❌ Insufficient margin!\n\nRequired: ₹${(strategy.minCapital || amount).toLocaleString('en-IN')} (~$${requiredUsd.toFixed(2)})\nAvailable: $${balance.available.toFixed(2)} (~₹${(balance.available * INR_TO_USD).toFixed(0)})\n\nPlease add funds to your Delta account.`)
        return
      }
    }
    const confirm = isEquityPct
      ? window.confirm(`Subscribe to ${strategy.name}?\n\nThis strategy uses ${strategy.defaultOrderSizeValue ?? '—'}% of your account equity per trade (set by the admin) — no capital allocation needed from you.\n\nConfirm subscription?`)
      : window.confirm(`Subscribe to ${strategy.name}?\n\nCapital: ${showUSD ? `$${(amount/INR_TO_USD).toFixed(2)}` : `₹${amount}`}\nAvailable Balance: ${showUSD ? `$${balance?.available?.toFixed(2) ?? "—"}` : `₹${balance ? (balance.available * INR_TO_USD).toFixed(0) : "—"}`}\n\nConfirm subscription?`)
    if (!confirm) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/v1/marketplace/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ strategyId: strategy.id, amount: isEquityPct ? (strategy.minCapital || 1000) : amount }),
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

          {/* Account Balance */}
          <div className="bg-muted/30 rounded-lg px-4 py-3 text-sm">
            {loadingBalance ? (
              <div className="text-xs text-muted-foreground">Fetching account balance…</div>
            ) : balance ? (
              <div className="space-y-1">
                <div className="flex justify-between items-center">
                  <div className="flex gap-4">
                    <div>
                      <span className="text-muted-foreground text-xs">Total Balance</span>
                      <div className="font-semibold">
                        {showUSD ? `$${balance.total?.toFixed(2)}` : `₹${(balance.total * INR_TO_USD).toFixed(0)}`}
                      </div>
                    </div>
                    <div>
                      <span className="text-muted-foreground text-xs">Available</span>
                      <div className="font-semibold text-green-600">
                        {showUSD ? `$${balance.available?.toFixed(2)}` : `₹${(balance.available * INR_TO_USD).toFixed(0)}`}
                      </div>
                    </div>
                  </div>
                  <button onClick={() => setShowUSD(!showUSD)}
                    className="text-xs px-2 py-1 rounded border border-border/40 text-muted-foreground hover:bg-muted/30 transition">
                    {showUSD ? 'Show ₹' : 'Show $'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-xs text-muted-foreground">Balance unavailable</div>
            )}
          </div>

          {/* Lot size */}
          {strategy.orderSizeType === 'equity_pct' ? (
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Order Size</label>
              <div className="text-sm font-medium bg-muted/30 rounded-lg px-3 py-2">
                {strategy.defaultOrderSizeValue ?? '—'}% of Equity
              </div>
              <div className="text-xs text-muted-foreground mt-1">This strategy uses a shared percentage set by the admin — your bot automatically uses this % of your live account balance on every trade. No capital allocation needed from you.</div>
            </div>
          ) : (
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Capital ({showUSD ? "$" : "₹"})</label>
              <input
                type="number"
                min="1"
                step="1"
                value={showUSD ? (amount / INR_TO_USD).toFixed(2) : amount}
                onChange={e => setAmount(showUSD ? Math.round(Number(e.target.value) * INR_TO_USD) : Number(e.target.value))}
                className="w-full bg-muted/30 border border-border/40 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
              />
              <div className="text-xs text-muted-foreground mt-1">Amount used per trade signal in {showUSD ? "USD" : "₹"} · {showUSD ? `₹${amount}` : `$${(amount/INR_TO_USD).toFixed(2)}`}</div>
            </div>
          )}
        </div>

        {error && <div className="mt-3 text-xs text-red-400">{error}</div>}

        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 py-2 rounded-lg border border-border/40 text-sm hover:bg-muted/30 transition-colors">Cancel</button>
          <button
            onClick={handleSubscribe}
            disabled={loading || (strategy.orderSizeType !== 'equity_pct' && amount < (strategy.minCapital || 100))}
            className="flex-1 py-2 rounded-lg bg-green-500 text-white text-sm hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Subscribing…' : 'Confirm subscribe'}
          </button>
        </div>
      </div>
    </div>
  )
}
