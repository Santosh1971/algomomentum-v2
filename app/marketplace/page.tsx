'use client'
import React from 'react'

import Navbar from '@/components/Navbar'
// app/marketplace/page.jsx
// User-facing strategy marketplace

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import EquitySparkline from '@/components/marketplace/EquitySparkline'
import { useRouter } from 'next/navigation'
import SubscribeModal from '@/components/marketplace/SubscribeModal'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

function DeltaConnectedBanner() {
  const searchParams = useSearchParams()
  const deltaConnected = searchParams.get('delta_connected') === '1'
  const welcome = searchParams.get('welcome') === '1'
  const connect = searchParams.get('connect') === '1'
  const pending = searchParams.get('pending') === '1'

  if (deltaConnected) return (
    <div className="mb-6 bg-green-500/20 border border-green-500/30 rounded-xl px-4 py-3 text-sm text-green-600 space-y-1">
      <p className="font-semibold">✅ Delta Exchange account connected successfully!</p>
      <p>📧 A confirmation email has been sent to you and the admin.</p>
      <p>⏳ Admin will verify your Delta account and approve. Once approved your bots will activate automatically.</p>
      <p>You can browse and subscribe to strategies in the meantime.</p>
    </div>
  )
  if (welcome) return (
    <div className="mb-6 bg-blue-500/20 border border-blue-500/30 rounded-xl px-4 py-3 text-sm text-blue-600">
      👋 Welcome! Browse our strategies below. <a href="/user/tradeconfig" className="underline font-semibold">Connect your Delta Exchange account</a> to subscribe and start trading.
    </div>
  )
  if (connect) return (
    <div className="mb-6 bg-orange-500/20 border border-orange-500/30 rounded-xl px-4 py-3 text-sm text-orange-600">
      🔗 Please <a href="/user/tradeconfig" className="underline font-semibold">connect your Delta Exchange account</a> first to access the full platform.
    </div>
  )
  if (pending) return (
    <div className="mb-6 bg-yellow-500/20 border border-yellow-500/30 rounded-xl px-4 py-3 text-sm text-yellow-600">
      ⏳ Your account is pending admin approval. You can browse strategies and subscribe — your bots will activate once approved.
    </div>
  )
  const emailMismatch = searchParams.get('delta_error') === 'email_mismatch'
  const expected = searchParams.get('expected') ?? ''
  const got = searchParams.get('got') ?? ''
  if (emailMismatch) return (
    <div className="mb-6 bg-red-500/20 border border-red-500/30 rounded-xl px-4 py-3 text-sm text-red-600">
      ❌ Delta email mismatch! You logged into Delta as <strong>{got}</strong> but your account email is <strong>{expected}</strong>. Please reconnect using the correct Delta account.
    </div>
  )
  return null
}


function EmailMismatchBanner({ expected, got }: { expected: string, got: string }) {
  const [newEmail, setNewEmail] = React.useState(got)
  const [saving, setSaving] = React.useState(false)
  const [msg, setMsg] = React.useState('')

  async function handleChange() {
    setSaving(true)
    setMsg('')
    const res = await fetch('/api/v1/user/change-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newEmail }),
    })
    const data = await res.json()
    if (res.ok) {
      setMsg('✅ Email updated! Please sign out and sign in again, then reconnect Delta.')
    } else {
      setMsg('❌ ' + (data.error ?? 'Failed to update email'))
    }
    setSaving(false)
  }

  return (
    <div className="mb-6 bg-red-500/20 border border-red-500/30 rounded-xl px-4 py-4 text-sm text-red-600 space-y-3">
      <p>❌ <strong>Delta email mismatch!</strong></p>
      <p>You logged into Delta Exchange as <strong>{got}</strong> but your AlgoMomentum account is <strong>{expected}</strong>.</p>
      <p className="text-xs">Options:</p>
      <div className="space-y-2">
        <p className="text-xs font-medium">Option 1: Update your AlgoMomentum email to match Delta</p>
        <div className="flex gap-2">
          <input value={newEmail} onChange={e => setNewEmail(e.target.value)}
            className="flex-1 border border-red-300 rounded-lg px-3 py-1.5 text-xs bg-background text-foreground"
            placeholder="Enter your Delta email" />
          <button onClick={handleChange} disabled={saving}
            className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs hover:bg-red-700 transition disabled:opacity-50">
            {saving ? 'Saving...' : 'Update Email'}
          </button>
        </div>
        <p className="text-xs font-medium mt-2">Option 2: Try connecting with a different Delta account</p>
        <a href="/api/auth/delta/authorize" className="inline-block px-3 py-1.5 rounded-lg border border-red-400 text-red-600 text-xs hover:bg-red-500/10 transition">
          🔄 Reconnect Delta
        </a>
      </div>
      {msg && <p className="text-xs font-medium">{msg}</p>}
    </div>
  )
}

export default function MarketplacePage() {
  const deltaConnected = false
  const router = useRouter()
  const { data: session } = useSession()
  const hasDelta = !!(session?.user as any)?.deltaUserId
  const isApproved = !!(session?.user as any)?.isApproved

  const [strategies, setStrategies] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)      // strategy for detail view
  const [subModal, setSubModal] = useState(null)       // strategy for subscribe modal
  const [subscribed, setSubscribed] = useState(new Set()) // strategyIds user is subbed to

  useEffect(() => {
    fetchStrategies()
    if (session?.user?.id) fetchUserSubs()
  }, [session])

  async function fetchStrategies() {
    const res = await fetch('/api/v1/marketplace')
    const { strategies } = await res.json()
    setStrategies(strategies)
    setLoading(false)
  }

  async function fetchUserSubs() {
    const res = await fetch('/api/v1/marketplace/my-subscriptions')
    if (res.ok) {
      const { strategyIds } = await res.json()
      setSubscribed(new Set(strategyIds))
    }
  }

  async function handleUnsubscribe(strategyId) {
    const strategy = strategies.find(s => s.id === strategyId)
    const confirm = window.confirm(`Unsubscribe from ${strategy?.name ?? "this strategy"}?\nYour bot will be deactivated.\n\nConfirm?`)
    if (!confirm) return
    await fetch('/api/v1/marketplace/unsubscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ strategyId }),
    })
    setSubscribed(prev => { const s = new Set(prev); s.delete(strategyId); return s })
  }

  if (loading) return <><Navbar /><div className="p-8 text-center text-muted-foreground">Loading strategies…</div></>

  return (
    <>
    <Navbar />
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-medium mb-1">Strategy Marketplace</h1>
        <p className="text-sm text-muted-foreground">Subscribe to a strategy — your bot auto-runs with the right symbol and timeframe.</p>
      </div>

      {/* Listing grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {strategies.map(s => (
          <StrategyCard
            key={s.id}
            strategy={s}
            isSubscribed={subscribed.has(s.id)}
            hasDelta={hasDelta}
            isApproved={isApproved}
            onDetail={() => router.push(`/marketplace/${s.id}`)}
            onSubscribe={() => setSubModal(s)}
            onUnsubscribe={() => handleUnsubscribe(s.id)}
          />
        ))}
      </div>

      {/* Detail panel (slide-in or inline) */}
      {selected && (
        <StrategyDetail
          strategy={selected}
          isSubscribed={subscribed.has(selected.id)}
          onClose={() => setSelected(null)}
          onSubscribe={() => { setSubModal(selected); setSelected(null) }}
            hasDelta={hasDelta}
            isApproved={isApproved}
          onUnsubscribe={() => { handleUnsubscribe(selected.id); setSelected(null) }}
        />
      )}

      {/* Subscribe modal */}
      {subModal && (
        <SubscribeModal
          strategy={subModal}
          onClose={() => setSubModal(null)}
          onSuccess={(strategyId) => {
            setSubscribed(prev => new Set([...prev, strategyId]))
            setSubModal(null)
          }}
        />
      )}
    </div>
    </>
  )
}

// ── Strategy Card ────────────────────────────────────────────────────────────
function StrategyCard({ strategy: s, isSubscribed, onDetail, onSubscribe, onUnsubscribe, hasDelta = false, isApproved = false }) {
  return (
    <div
      className={`rounded-xl border bg-card overflow-hidden cursor-pointer hover:border-border/80 transition-colors ${s.isFeatured ? 'border-blue-500/50' : 'border-border/40'}`}
      onClick={onDetail}
    >
      {/* Header */}
      <div className="p-4 pb-2">
        <div className="flex items-center gap-2 mb-2">
          {s.isFeatured && <Badge color="blue">featured</Badge>}
          {isSubscribed && <Badge color="green">subscribed</Badge>}
        </div>
        <div className="font-medium text-sm">{s.name}</div>
        <div className="text-xs text-muted-foreground mt-0.5">{s.symbol} · {s.timeframe}</div>
      </div>

      {/* Sparkline */}
      <div className="h-14 px-4">
        <EquitySparkline data={s.equityData} />
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 border-t border-border/30">
        <StatCell label="Total PnL" value={s.totalPnlPct != null ? `+${s.totalPnlPct.toFixed(1)}%` : '—'} color="green" />
        <StatCell label="Win rate" value={s.winRate != null ? `${s.winRate.toFixed(1)}%` : '—'} />
        <StatCell label="Max DD" value={s.maxDrawdown != null ? `−${s.maxDrawdown.toFixed(1)}%` : '—'} color="red" />
      </div>

      {/* Footer */}
      <div
        className="px-4 py-2.5 border-t border-border/30 flex items-center justify-between"
        onClick={e => e.stopPropagation()}
      >
        <span className="text-xs text-muted-foreground">{s._count.subscribers} subscribers</span>
          {s.minCapital && <span className="text-xs text-muted-foreground">Min: ₹{s.minCapital.toLocaleString('en-IN')}</span>}
        {isSubscribed
          ? <button onClick={onUnsubscribe} className="text-xs px-3 py-1 rounded-md border border-border/40 text-green-500 hover:bg-muted/40 transition-colors">Subscribed ✓</button>
          : hasDelta && isApproved
            ? <button onClick={onSubscribe} className="text-xs px-3 py-1 rounded-md border border-border/40 hover:bg-muted/40 transition-colors">Subscribe</button>
            : hasDelta
            ? <span className="text-xs px-3 py-1 rounded-md border border-yellow-400/40 text-yellow-500">⏳ Pending Approval</span>
            : <button onClick={() => { const ok = window.confirm("⚠️ Please login to Delta Exchange using the SAME email you registered here.\n\nProceed?"); if(ok) window.location.href="/api/auth/delta/authorize" }} className="text-xs px-3 py-1 rounded-md border border-orange-400/40 text-orange-500 hover:bg-orange-500/10 transition-colors">🔗 Connect Delta</button>
        }
      </div>
    </div>
  )
}

// ── Strategy Detail (full info panel) ───────────────────────────────────────
function StrategyDetail({ strategy: s, isSubscribed, onClose, onSubscribe, onUnsubscribe, hasDelta = false, isApproved = false }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end md:items-center justify-center p-4" onClick={onClose}>
      <div className="bg-background rounded-2xl border border-border/50 w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="p-6">
          {/* Header */}
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="text-lg font-medium">{s.name}</div>
              <div className="text-sm text-muted-foreground">{s.symbol} · {s.timeframe} · {s.totalTrades ?? '—'} trades</div>
            </div>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-xl leading-none">×</button>
          </div>

          {/* KPI row */}
          <div className="grid grid-cols-4 gap-3 mb-4">
            <KpiCard label="Total PnL"     value={s.totalPnlPct != null ? `+${s.totalPnlPct.toFixed(1)}%` : '—'} color="green" />
            <KpiCard label="Profit factor" value={s.profitFactor?.toFixed(2) ?? '—'} />
            <KpiCard label="Win rate"      value={s.winRate != null ? `${s.winRate.toFixed(1)}%` : '—'} />
            <KpiCard label="Max drawdown"  value={s.maxDrawdown != null ? `−${s.maxDrawdown.toFixed(1)}%` : '—'} color="red" />
          </div>

          {/* Big equity chart */}
          <div className="h-36 bg-muted/30 rounded-lg mb-4 overflow-hidden">
            <EquitySparkline data={s.equityData} big />
          </div>

          {/* Description */}
          {s.description && <p className="text-sm text-muted-foreground mb-4">{s.description}</p>}

          {/* Action */}
          <div className="flex items-center gap-3">
            {isSubscribed
              ? <button onClick={onUnsubscribe} className="flex-1 py-2 rounded-lg border border-green-500/40 text-green-500 text-sm hover:bg-green-500/10 transition-colors">Unsubscribe</button>
              : hasDelta 
                ? <button onClick={onSubscribe} className="flex-1 py-2 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700 transition-colors">Subscribe to this strategy</button>
                : <a href="/api/auth/delta/authorize" className="flex-1 py-2 rounded-lg bg-orange-500 text-white text-sm hover:bg-orange-600 transition-colors text-center">🔗 Connect Delta to Subscribe</a>
            }
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Small helpers ────────────────────────────────────────────────────────────
function StatCell({ label, value, color }) {
  const cls = color === 'green' ? 'text-green-500' : color === 'red' ? 'text-red-400' : 'text-foreground'
  return (
    <div className="px-3 py-2 border-r border-border/30 last:border-r-0">
      <div className="text-[10px] text-muted-foreground mb-0.5">{label}</div>
      <div className={`text-xs font-medium ${cls}`}>{value}</div>
    </div>
  )
}

function KpiCard({ label, value, color }) {
  const cls = color === 'green' ? 'text-green-500' : color === 'red' ? 'text-red-400' : 'text-foreground'
  return (
    <div className="bg-muted/30 rounded-lg p-3">
      <div className="text-[10px] text-muted-foreground mb-1">{label}</div>
      <div className={`text-base font-medium ${cls}`}>{value}</div>
    </div>
  )
}

function Badge({ color, children }) {
  const cls = color === 'blue' ? 'bg-blue-500/15 text-blue-400' : 'bg-green-500/15 text-green-400'
  return <span className={`text-[10px] font-medium px-2 py-0.5 rounded ${cls}`}>{children}</span>
}
