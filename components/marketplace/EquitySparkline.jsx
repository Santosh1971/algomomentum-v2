'use client'
// components/marketplace/EquitySparkline.jsx
// Renders equity curve data as a canvas sparkline

import { useEffect, useRef } from 'react'

export default function EquitySparkline({ data, big = false }) {
  const ref = useRef(null)

  useEffect(() => {
    if (!ref.current || !data || data.length < 2) return
    const canvas = ref.current
    const ctx = canvas.getContext('2d')
    const dpr = window.devicePixelRatio || 1
    const w = canvas.offsetWidth
    const h = canvas.offsetHeight
    canvas.width = w * dpr
    canvas.height = h * dpr
    ctx.scale(dpr, dpr)

    const values = data.map(d => typeof d === 'number' ? d : d.equity)
    const min = Math.min(...values)
    const max = Math.max(...values)
    const range = max - min || 1

    const pts = values.map((v, i) => [
      (i / (values.length - 1)) * w,
      h - ((v - min) / range) * (h - 4) - 2,
    ])

    // Line
    ctx.beginPath()
    pts.forEach(([x, y], i) => i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y))
    ctx.strokeStyle = '#1db885'
    ctx.lineWidth = big ? 2 : 1.5
    ctx.stroke()

    // Fill
    const grad = ctx.createLinearGradient(0, 0, 0, h)
    grad.addColorStop(0, '#1db88533')
    grad.addColorStop(1, '#1db88500')
    ctx.lineTo(w, h)
    ctx.lineTo(0, h)
    ctx.closePath()
    ctx.fillStyle = grad
    ctx.fill()
  }, [data, big])

  if (!data || data.length < 2) {
    return <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground">No backtest data</div>
  }

  return <canvas ref={ref} style={{ width: '100%', height: '100%', display: 'block' }} />
}
