'use client'

import Navbar from '@/components/Navbar'
// Admin page to create and manage marketplace strategies

import { useEffect, useState, useRef } from 'react'

export default function AdminStrategiesPage() {
  const [strategies, setStrategies] = useState([])
  const [showForm, setShowForm]     = useState(false)
  const [editing, setEditing]       = useState(null)
  const [loading, setLoading]       = useState(true)
  const [propsModal, setPropsModal] = useState(null)

  useEffect(() => { fetchStrategies() }, [])

  async function fetchStrategies() {
    const res = await fetch('/api/v1/admin/strategies')
    const { strategies } = await res.json()
    setStrategies(strategies)
    setLoading(false)
  }

  async function handleDelete(id) {
    if (!confirm('Delete this strategy and all subscriber bots?')) return
    await fetch(`/api/v1/admin/strategies/${id}`, { method: 'DELETE' })
    setStrategies(prev => prev.filter(s => s.id !== id))
  }

  async function handleToggle(s, field) {
    const fd = new FormData()
    fd.append(field, String(!s[field]))
    const res = await fetch(`/api/v1/admin/strategies/${s.id}`, { method: 'PATCH', body: fd })
    const { strategy } = await res.json()
    setStrategies(prev => prev.map(x => x.id === s.id ? { ...x, ...strategy } : x))
  }

  if (loading) return <div className="p-8 text-center text-muted-foreground">Loading…</div>

  return (
    <><Navbar /><div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-medium">Marketplace strategies</h1>
        <button onClick={() => { setEditing(null); setShowForm(true) }} className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700">
          + New strategy
        </button>
      </div>

      <div className="space-y-3">
        {strategies.map(s => (
          <div key={s.id} className="border border-border/40 rounded-xl p-4 flex gap-4">
            {/* LEFT: strategy info */}
            <div className="flex-1 min-w-0 space-y-1">

              {/* Name */}
              <div className="font-semibold text-sm">{s.name}</div>

              {/* Symbol · Exchange · TF */}
              <div className="text-xs text-muted-foreground">
                {s.symbol} · {(s as any).properties?.Symbol ?? ('CRYPTO:' + s.symbol)} · {s.timeframe}
                {(s as any).backtestFileName && (s as any).backtestFileUrl ? <a href={(s as any).backtestFileUrl} download className="ml-2 text-[10px] text-cyan-400 hover:underline">📎 {(s as any).backtestFileName} ⬇</a> : (s as any).backtestFileName ? <span className="ml-2 text-[10px]">📎 {(s as any).backtestFileName}</span> : null}
              </div>

              {/* Backtest range + days */}
              {(s as any).properties?.['Trading range'] && (() => {
                const range = (s as any).properties['Trading range']
                const parts = range.split('—')
                let days = ''
                try { days = ` (${Math.round((new Date(parts[1].trim()).getTime() - new Date(parts[0].trim()).getTime()) / 86400000)} days)` } catch {}
                return <div className="text-xs text-muted-foreground">Backtest: {range}{days}</div>
              })()}

              {/* PnL stats */}
              {s.totalPnlPct != null && (
                <div className="text-xs text-foreground">
                  PnL: +{s.totalPnlPct.toFixed(1)}% · DD: −{s.maxDrawdown?.toFixed(1)}% · No. Trades: {s.totalTrades}
                </div>
              )}

              {/* Subscribers */}
              <div className="text-xs text-muted-foreground">
                <span>Subscribers: <span className="text-foreground font-medium">{s._count.subscribers}</span> &nbsp;&nbsp;&nbsp;</span>
                <span>Subscribed Amount: <span className="text-foreground font-medium">₹{(s.subscribers?.reduce((sum: number, t: any) => sum + (t.amount || 0), 0) || 0).toLocaleString('en-IN')}</span></span>
              </div>
              {(() => {
                const copy = (txt: string) => (e: any) => {
                  e.stopPropagation();
                  const el = document.createElement('textarea'); el.value = txt;
                  document.body.appendChild(el); el.select(); document.execCommand('copy'); document.body.removeChild(el);
                  const b = e.currentTarget; b.textContent = '✓ Copied!'; b.style.color = 'green';
                  setTimeout(() => { b.textContent = 'Copy'; b.style.color = '' }, 2000);
                };
                const sym = s.symbol;
                const rows = [
                  { label: "Webhook All",    val: `https://app.algomomentum.in/api/v1/webhook/strategy/${sym}?secret=algobc2026$`, bg: "bg-muted/20 border-border/20" },
                  { label: "Message",        val: `{"symbol":"{{ticker}}","side":"{{strategy.order.action}}","trade":"{{strategy.order.comment}}","price":"{{strategy.order.price}}","trigger_time":"{{timenow}}"}`, bg: "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-700" },
                ];
                return rows.map(({ label, val, bg, heading }: any) => heading ? (
                  <div key={label} className="pt-1">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide border-b border-border/30 pb-0.5">{label}</p>
                  </div>
                ) : (
                  <div key={label} className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground w-28 flex-shrink-0">{label}:</span>
                    <div className={`text-[10px] font-mono text-foreground border rounded px-2 py-1 flex-1 break-all ${bg}`}>{val}</div>
                    <button onClick={copy(val)} className="text-[10px] px-2 py-1 rounded bg-muted/50 border border-border/30 hover:bg-muted whitespace-nowrap">Copy</button>
                  </div>
                ));
              })()}

            </div>

            {/* RIGHT: controls */}
            <div className="flex flex-col items-end gap-2 flex-shrink-0">
              <div className="flex gap-3">
                <Toggle label="Featured" value={s.isFeatured} onChange={() => handleToggle(s, 'isFeatured')} />
                <Toggle label="Active"   value={s.isActive}   onChange={() => handleToggle(s, 'isActive')} />
              </div>
              <div className="flex gap-2">
                <button onClick={() => { setEditing(s); setShowForm(true) }} className="text-xs px-3 py-1.5 rounded border border-border/40 hover:bg-muted/30">Edit</button>
                <button onClick={() => setPropsModal(s)} className="text-xs px-3 py-1.5 rounded border border-blue-500/40 text-blue-400 hover:bg-blue-500/10">Properties</button>
                <button onClick={() => handleDelete(s.id)} className="text-xs px-3 py-1.5 rounded border border-red-500/30 text-red-400 hover:bg-red-500/10">Delete</button>
              </div>
            </div>
          </div>
        ))}
        {strategies.length === 0 && <div className="text-center text-muted-foreground text-sm py-12">No strategies yet. Create one to get started.</div>}
      </div>

      {propsModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setPropsModal(null)}>
          <div className="bg-background border border-border/50 rounded-2xl w-full max-w-lg max-h-[80vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div className="text-base font-medium">Strategy Properties — {propsModal.name}</div>
              <button onClick={() => setPropsModal(null)} className="text-muted-foreground hover:text-foreground text-xl">×</button>
            </div>
            {(propsModal as any).properties ? (
              <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <tbody>
                  {Object.entries((propsModal as any).properties).map(([k, v]) => (
                    <tr key={k} className="border-b border-border/20">
                      <td className="py-1.5 pr-4 text-muted-foreground font-medium w-1/2">{k}</td>
                      <td className="py-1.5 text-foreground">{String(v)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">No properties data. Re-upload the XLSX file to extract properties.</div>
            )}
          </div>
        </div>
      )}
      {showForm && (
        <StrategyFormModal
          initial={editing}
          onClose={() => setShowForm(false)}
          onSaved={(s) => {
            if (editing) {
              setStrategies(prev => prev.map(x => x.id === s.id ? { ...x, ...s } : x))
            } else {
              setStrategies(prev => [{ ...s, _count: { subscribers: 0 } }, ...prev])
            }
            setShowForm(false)
          }}
        />
      )}
    </div></>
  )
}

function StrategyFormModal({ initial, onClose, onSaved }) {
  const [name,        setName]        = useState(initial?.name || '')
  const [symbol,      setSymbol]      = useState(initial?.symbol || '')
  const [timeframe,   setTimeframe]   = useState(initial?.timeframe || '1h')
  const [description, setDescription] = useState(initial?.description || '')
  const [isFeatured,  setIsFeatured]  = useState(initial?.isFeatured ?? false)
  const [defaultLeverage, setDefaultLeverage] = useState(initial?.defaultLeverage ?? 1)
  const [minCapital,  setMinCapital]  = useState(initial?.minCapital || 1000)
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState(null)
  const fileRef = useRef()

  async function handleSave() {
    setLoading(true)
    setError(null)
    try {
      const fd = new FormData()
      fd.append('name', name)
      fd.append('symbol', symbol.toUpperCase())
      fd.append('timeframe', timeframe)
      fd.append('description', description)
      fd.append('isFeatured', String(isFeatured))
      fd.append('defaultLeverage', String(defaultLeverage))
      fd.append('minCapital', String(minCapital))
      const file = fileRef.current?.files?.[0]
      if (file) fd.append('backtestFile', file)

      const url    = initial ? `/api/v1/admin/strategies/${initial.id}` : '/api/v1/admin/strategies'
      const method = initial ? 'PATCH' : 'POST'
      const res    = await fetch(url, { method, body: fd })
      if (!res.ok) { const { error } = await res.json(); throw new Error(error) }
      const { strategy } = await res.json()
      onSaved(strategy)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-background border border-border/50 rounded-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
        <div className="text-base font-medium mb-4">{initial ? 'Edit strategy' : 'New strategy'}</div>
        <div className="space-y-3">
          <Field label="Name">
            <input value={name} onChange={e => setName(e.target.value)} className="form-input" placeholder="XRP Directional" />
          </Field>
          <Field label="Symbol">
            <input value={symbol} onChange={e => setSymbol(e.target.value)} className="form-input" placeholder="XRPUSDT" />
          </Field>
          <Field label="Timeframe">
            <select value={timeframe} onChange={e => setTimeframe(e.target.value)} className="form-input">
              {['1m','5m','15m','30m','1h','2h','4h','8h','1D'].map(t => <option key={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="Description">
            <textarea value={description} onChange={e => setDescription(e.target.value)} className="form-input" rows={2} />
          </Field>
          <Field label="Min Capital (₹)">
            <input type="number" value={minCapital} onChange={e => setMinCapital(Number(e.target.value))} className="form-input" placeholder="1000" min="100" />
          </Field>
          <Field label="Default Leverage">
            <select value={defaultLeverage} onChange={e => setDefaultLeverage(Number(e.target.value))} className="form-input">
              {[1,2,3,5,10,25,50,100,200].map(l => <option key={l} value={l}>{l}x</option>)}
            </select>
          </Field>
          <Field label="Backtest CSV / XLSX">
            {initial?.backtestFileName && (
              <div className="text-xs mb-2 flex items-center gap-2">
                <span className="text-muted-foreground">Current:</span>
                {initial?.backtestFileUrl
                  ? <a href={initial.backtestFileUrl} download className="text-cyan-400 hover:underline">📎 {initial.backtestFileName} ⬇</a>
                  : <span className="text-muted-foreground">📎 {initial.backtestFileName}</span>
                }
              </div>
            )}
            <label className="cursor-pointer inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-border text-sm hover:bg-muted transition-colors">
              📂 <span>Choose File</span>
              <input type="file" ref={fileRef} accept=".csv,.xlsx,.xls" className="hidden" />
            </label>
            <div className="text-xs text-muted-foreground mt-1">Equity curve and stats auto-parsed from file</div>
          </Field>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={isFeatured} onChange={e => setIsFeatured(e.target.checked)} />
            <span>Featured on marketplace</span>
          </label>
        </div>
        {error && <div className="mt-3 text-xs text-red-400">{error}</div>}
        <div className="flex gap-3 mt-5">
          <button onClick={onClose} className="flex-1 py-2 rounded-lg border border-border/40 text-sm">Cancel</button>
          <button onClick={handleSave} disabled={loading} className="flex-1 py-2 rounded-lg bg-blue-600 text-white text-sm disabled:opacity-50">
            {loading ? 'Saving…' : 'Save strategy'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }) {
  return (
    <div>
      <label className="text-xs text-muted-foreground block mb-1">{label}</label>
      {children}
    </div>
  )
}

function Toggle({ label, value, onChange }) {
  return (
    <label className="flex items-center gap-1 text-xs cursor-pointer">
      <input type="checkbox" checked={value} onChange={onChange} className="w-3 h-3" />
      <span className="text-muted-foreground">{label}</span>
    </label>
  )
}
