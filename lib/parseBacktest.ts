// lib/parseBacktest.js
// Parses TradingView exported backtest CSV/XLSX
// Returns { equityData, totalPnlPct, winRate, maxDrawdown, profitFactor, totalTrades }

import * as XLSX from 'xlsx'

/**
 * Parse a Buffer (from file upload) into backtest stats.
 * Supports both .csv and .xlsx exports from TradingView Strategy Tester.
 */
export function parseBacktestFile(buffer, filename) {
  const ext = filename.split('.').pop().toLowerCase()

  let rows
  if (ext === 'csv') {
    const text = buffer.toString('utf-8')
    rows = parseCSV(text)
  } else if (ext === 'xlsx' || ext === 'xls') {
    const wb = XLSX.read(buffer, { type: 'buffer' })
    const ws = wb.Sheets[wb.SheetNames[0]]
    rows = XLSX.utils.sheet_to_json(ws, { defval: '' })
  } else {
    throw new Error('Unsupported file type. Upload .csv or .xlsx')
  }

  return extractStats(rows)
}

function parseCSV(text) {
  const lines = text.trim().split('\n')
  const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''))
  return lines.slice(1).map(line => {
    const values = line.split(',').map(v => v.trim().replace(/"/g, ''))
    const row = {}
    headers.forEach((h, i) => { row[h] = values[i] || '' })
    return row
  })
}

function extractStats(rows) {
  // TradingView exports use these column names (case-insensitive match)
  const colMap = findColumns(rows[0] ? Object.keys(rows[0]) : [])

  // Build equity curve: array of { date, equity }
  const equityData = []
  let wins = 0, losses = 0
  let peak = 0, maxDrawdown = 0
  let initialEquity = null
  let finalEquity = null

  for (const row of rows) {
    const dateVal = row[colMap.date] || row[colMap.closeTime] || ''
    const equityVal = parseFloat(row[colMap.equity] || row[colMap.cumulativePnl] || 0)
    const profitVal = parseFloat(row[colMap.profit] || 0)

    if (!isNaN(equityVal) && dateVal) {
      if (initialEquity === null) initialEquity = equityVal
      finalEquity = equityVal
      // If values look like PnL (small numbers), add initial capital
      const equityAbs = Math.abs(equityVal) < 500 && equityData.length === 0 ? equityVal + 1000 : equityVal
      equityData.push({ date: dateVal, equity: equityAbs })

      // Track drawdown
      if (equityVal > peak) peak = equityVal
      const dd = peak > 0 ? (peak - equityVal) / peak : 0
      if (dd > maxDrawdown) maxDrawdown = dd
    }

    if (!isNaN(profitVal)) {
      if (profitVal > 0) wins++
      else if (profitVal < 0) losses++
    }
  }

  const totalTrades = wins + losses
  const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : null

  // Total PnL %
  let totalPnlPct = null
  if (initialEquity !== null && finalEquity !== null && initialEquity !== 0) {
    totalPnlPct = ((finalEquity - initialEquity) / Math.abs(initialEquity)) * 100
  }

  // Profit factor: gross profit / gross loss (approximate from equity swings)
  let grossProfit = 0, grossLoss = 0
  for (const row of rows) {
    const p = parseFloat(row[colMap.profit] || 0)
    if (p > 0) grossProfit += p
    else if (p < 0) grossLoss += Math.abs(p)
  }
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : null

  return {
    equityData,
    totalPnlPct: totalPnlPct !== null ? Math.round(totalPnlPct * 100) / 100 : null,
    winRate: winRate !== null ? Math.round(winRate * 100) / 100 : null,
    maxDrawdown: Math.round(maxDrawdown * 10000) / 100, // as percentage
    profitFactor: profitFactor !== null ? Math.round(profitFactor * 1000) / 1000 : null,
    totalTrades,
  }
}

// Fuzzy column matching for TradingView's various export formats
function findColumns(headers) {
  const lower = h => h.toLowerCase().replace(/\s|_/g, '')
  const find = (...keys) => headers.find(h => keys.includes(lower(h))) || ''

  return {
    date:         find('dateandtime', 'date', 'datetime', 'time', 'tradedate', 'closetime'),
    closeTime:    find('closetime', 'exittime', 'dateandtime'),
    equity:       find('cumulativepnlusd', 'equity', 'cumulativeequity', 'runningequity', 'cumulativepnl'),
    cumulativePnl:find('cumulativepnlusd', 'cumulativepnl', 'cumpnl', 'runningpnl'),
    profit:       find('netpnlusd', 'profit', 'pnl', 'netprofit', 'tradepnl', 'netpnl'),
  }
}
