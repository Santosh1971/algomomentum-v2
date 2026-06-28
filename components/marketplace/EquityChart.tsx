'use client'

import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

interface EquityPoint { date: string; equity: number }

export default function EquityChart({ data }: { data: EquityPoint[] | null | undefined }) {
  if (!data || data.length < 2) {
    return <div className="w-full h-full flex items-center justify-center text-sm text-muted-foreground">No data</div>
  }

  const formatted = data.map(d => ({
    date: new Date(d.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' }),
    equity: Math.round(d.equity * 100) / 100,
  }))

  const minVal = Math.min(...data.map(d => d.equity))
  const maxVal = Math.max(...data.map(d => d.equity))
  const pad = (maxVal - minVal) * 0.1

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={formatted} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
        <defs>
          <linearGradient id="equityGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#1db885" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#1db885" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.15)" />
        <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#888' }} tickLine={false}
          interval={Math.floor(formatted.length / 5)} />
        <YAxis tick={{ fontSize: 11, fill: '#888' }} tickLine={false} axisLine={false}
          domain={[Math.floor(minVal - pad), Math.ceil(maxVal + pad)]}
          tickFormatter={v => `₹${v}`} width={60} />
        <Tooltip
          contentStyle={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '12px' }}
          labelStyle={{ color: 'var(--foreground)', fontWeight: 600 }}
          formatter={(value: number) => [`₹${value.toFixed(2)}`, 'Equity']}
          formatter={(v: any) => [`₹${v}`, 'Equity']} />
        <Area type="monotone" dataKey="equity" stroke="#1db885" strokeWidth={2}
          fill="url(#equityGrad)" dot={false} activeDot={{ r: 4, fill: '#1db885' }} />
      </AreaChart>
    </ResponsiveContainer>
  )
}
