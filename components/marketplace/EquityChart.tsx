'use client'
// Full equity chart with X-axis dates and Y-axis amounts

import { useEffect, useRef } from 'react'

interface EquityPoint { date: string; equity: number }

export default function EquityChart({ data }: { data: EquityPoint[] | null | undefined }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (!ref.current || !data || data.length < 2) return
    const canvas = ref.current
    const ctx = canvas.getContext('2d')!
    const dpr = window.devicePixelRatio || 1
    const W = canvas.offsetWidth
    const H = canvas.offsetHeight
    canvas.width  = W * dpr
    canvas.height = H * dpr
    ctx.scale(dpr, dpr)

    const PAD = { top: 20, right: 20, bottom: 40, left: 70 }
    const chartW = W - PAD.left - PAD.right
    const chartH = H - PAD.top  - PAD.bottom

    const values = data.map(d => d.equity)
    const dates  = data.map(d => new Date(d.date))
    const minV = Math.min(...values)
    const maxV = Math.max(...values)
    const minD = dates[0].getTime()
    const maxD = dates[dates.length - 1].getTime()
    const rangeV = maxV - minV || 1
    const rangeD = maxD - minD || 1

    const toX = (d: Date) => PAD.left + ((d.getTime() - minD) / rangeD) * chartW
    const toY = (v: number) => PAD.top + chartH - ((v - minV) / rangeV) * chartH

    // Background
    ctx.fillStyle = 'transparent'
    ctx.fillRect(0, 0, W, H)

    // Grid lines + Y labels
    ctx.strokeStyle = 'rgba(128,128,128,0.15)'
    ctx.lineWidth = 1
    ctx.font = `${11 * dpr / dpr}px sans-serif`
    ctx.fillStyle = '#888'
    ctx.textAlign = 'right'
    const ySteps = 5
    for (let i = 0; i <= ySteps; i++) {
      const v = minV + (rangeV / ySteps) * i
      const y = toY(v)
      ctx.beginPath(); ctx.moveTo(PAD.left, y); ctx.lineTo(W - PAD.right, y); ctx.stroke()
      ctx.fillText(`₹${Math.round(v)}`, PAD.left - 6, y + 4)
    }

    // X labels — pick ~5 evenly spaced dates
    ctx.textAlign = 'center'
    const xCount = Math.min(5, data.length)
    for (let i = 0; i < xCount; i++) {
      const idx = Math.floor((data.length - 1) * i / (xCount - 1))
      const d   = dates[idx]
      const x   = toX(d)
      const lbl = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
      ctx.fillText(lbl, x, H - PAD.bottom + 16)
    }

    // Line
    const pts = data.map((d, i) => [toX(dates[i]), toY(d.equity)] as [number, number])
    ctx.beginPath()
    pts.forEach(([x, y], i) => i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y))
    ctx.strokeStyle = '#1db885'
    ctx.lineWidth   = 2
    ctx.stroke()

    // Fill
    const grad = ctx.createLinearGradient(0, PAD.top, 0, H - PAD.bottom)
    grad.addColorStop(0, '#1db88540')
    grad.addColorStop(1, '#1db88500')
    ctx.lineTo(toX(dates[dates.length - 1]), H - PAD.bottom)
    ctx.lineTo(toX(dates[0]), H - PAD.bottom)
    ctx.closePath()
    ctx.fillStyle = grad
    ctx.fill()

    // Dots at key points
    ctx.fillStyle = '#1db885'
    const step = Math.max(1, Math.floor(data.length / 20))
    pts.forEach(([x, y], i) => {
      if (i % step === 0 || i === pts.length - 1) {
        ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill()
      }
    })

  }, [data])

  if (!data || data.length < 2) {
    return <div className="w-full h-full flex items-center justify-center text-sm text-muted-foreground">No backtest data</div>
  }

  return <canvas ref={ref} style={{ width: '100%', height: '100%', display: 'block' }} />
}
