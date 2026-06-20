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
    // Use 'Trades' sheet if available, otherwise first sheet
    const tradesSheet = wb.SheetNames.find((n: string) => n.toLowerCase() === 'trades')
    const ws = wb.Sheets[tradesSheet ?? wb.SheetNames[0]]
    rows = XLSX.utils.sheet_to_json(ws, { defval: '' })
  } else {
    throw new Error('Unsupported file type. Upload .csv or .xlsx')
  }

  // Extract Properties sheet if xlsx
  let properties: Record<string, string> | null = null
  if (ext === 'xlsx' || ext === 'xls') {
    try {
      const wb2 = XLSX.read(buffer, { type: 'buffer' })
      const propSheet = wb2.SheetNames.find((n: string) => n.toLowerCase() === 'properties')
      if (propSheet) {
        const ws2 = wb2.Sheets[propSheet]
        const propRows = XLSX.utils.sheet_to_json(ws2, { header: 1 }) as string[][]
        properties = {}
        for (const row of propRows.slice(1) as string[][]) {
          if (row[0] && row[1] !== undefined) {
            properties[String(row[0]).trim()] = String(row[1]).trim()
          }
        }
      }
    } catch {}
  }

  const stats = extractStats(rows)
  return { ...stats, properties }
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

  // Find type column to filter only Exit rows for equity curve
  const typeCol = Object.keys(rows[0] || {}).find((h: string) => h.toLowerCase() === 'type') ?? ''

  for (const row of rows) {
    const rowType = typeCol ? String(row[typeCol] || '').toLowerCase() : ''
    const isExit = !typeCol || rowType.includes('exit')
    const profitVal = parseFloat(row[colMap.profit] || 0)

    // Count wins/losses from Exit rows only
    if (isExit && !isNaN(profitVal) && profitVal !== 0) {
      if (profitVal > 0) wins++
      else losses++
    }

    // Only use Exit rows for equity curve
    if (!isExit) continue

    const dateVal = row[colMap.date] || row[colMap.closeTime] || ''
    const equityVal = parseFloat(row[colMap.equity] || row[colMap.cumulativePnl] || 0)

    if (!isNaN(equityVal) && dateVal) {
      if (initialEquity === null) initialEquity = equityVal
      finalEquity = equityVal
      // Cumulative PnL USD — add base capital 1000 to get equity
      const equityAbs = 1000 + equityVal
      equityData.push({ date: dateVal, equity: equityAbs })

      // Track drawdown on equity not cumPnL
      if (equityAbs > peak) peak = equityAbs
      const dd = peak > 0 ? (peak - equityAbs) / peak : 0
      if (dd > maxDrawdown) maxDrawdown = dd
    }
  }

  const totalTrades = wins + losses
  const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : null

  // Total PnL %
  // PnL% based on initial capital 1000 (cumPnL goes from ~0 upward)
  const initialCapital = 1000
  let totalPnlPct = null
  if (finalEquity !== null) {
    totalPnlPct = (finalEquity / initialCapital) * 100
  }

  // Profit factor: gross profit / gross loss (approximate from equity swings)
  let grossProfit = 0, grossLoss = 0
  for (const row of rows) {
    const p = parseFloat(row[colMap.profit] || 0)
    if (p > 0) grossProfit += p
    else if (p < 0) grossLoss += Math.abs(p)
  }
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : null

  // Extract individual trades for storage
  const backtestTrades: BacktestTrade[] = []
  for (const row of rows) {
    const tradeNum = parseInt(row[colMap.date ? Object.keys(rows[0]).find(h => h.toLowerCase().replace(/[\s_()%]/g,'') === 'tradenumber') ?? '' : ''] || '0')
    const typeVal = Object.keys(rows[0]).find(h => h.toLowerCase() === 'type') ?? ''
    const signalCol = Object.keys(rows[0]).find(h => h.toLowerCase().replace(/[\s_()%]/g,'') === 'signal') ?? ''
    const priceCol = Object.keys(rows[0]).find(h => h.toLowerCase().replace(/[\s_()%]/g,'') === 'priceusd') ?? ''
    const sizeCol = Object.keys(rows[0]).find(h => h.toLowerCase().replace(/[\s_()%]/g,'') === 'sizeqty') ?? ''
    const netPnlCol = Object.keys(rows[0]).find(h => h.toLowerCase().replace(/[\s_()%]/g,'') === 'netpnlusd') ?? ''
    const netPnlPctCol = Object.keys(rows[0]).find(h => h.toLowerCase().replace(/[\s_()%]/g,'') === 'netpnlpct') ?? ''
    const cumPnlCol = Object.keys(rows[0]).find(h => h.toLowerCase().replace(/[\s_()%]/g,'') === 'cumulativepnlusd') ?? ''
    const dateVal = colMap.date ? row[colMap.date] : ''
    if (!dateVal || !typeVal || !row[typeVal]) continue
    const typeStr = String(row[typeVal]).toLowerCase()
    const side = typeStr.includes('long') ? 'buy' : typeStr.includes('short') ? 'sell' : ''
    if (!side) continue
    backtestTrades.push({
      tradeNumber: parseInt(row[Object.keys(rows[0]).find(h => h.toLowerCase().replace(/[\s_()%]/g,'') === 'tradenumber') ?? ''] || '0'),
      type: row[typeVal],
      side,
      signal: signalCol ? row[signalCol] : '',
      price: priceCol ? parseFloat(row[priceCol]) || 0 : 0,
      size: sizeCol ? parseFloat(row[sizeCol]) || 0 : 0,
      netPnlUsd: netPnlCol ? parseFloat(row[netPnlCol]) || 0 : 0,
      netPnlPct: netPnlPctCol ? parseFloat(row[netPnlPctCol]) || 0 : 0,
      cumulativePnlUsd: cumPnlCol ? parseFloat(row[cumPnlCol]) || 0 : 0,
      firedAt: String(dateVal),
    })
  }

  return {
    equityData,
    totalPnlPct: totalPnlPct !== null ? Math.round(totalPnlPct * 100) / 100 : null,
    winRate: winRate !== null ? Math.round(winRate * 100) / 100 : null,
    maxDrawdown: Math.round(maxDrawdown * 10000) / 100, // as percentage
    profitFactor: profitFactor !== null ? Math.round(profitFactor * 1000) / 1000 : null,
    totalTrades,
    backtestTrades,
  }
}

// Fuzzy column matching for TradingView's various export formats
function findColumns(headers) {
  const lower = h => h.toLowerCase().replace(/[\s_()%]/g, '')
  const find = (...keys) => headers.find(h => keys.includes(lower(h))) || ''

  return {
    date:         find('dateandtime', 'date', 'datetime', 'time', 'tradedate', 'closetime'),
    closeTime:    find('closetime', 'exittime', 'dateandtime'),
    equity:       find('cumulativepnlusd', 'equity', 'cumulativeequity', 'runningequity', 'cumulativepnl'),
    cumulativePnl:find('cumulativepnlusd', 'cumulativepnl', 'cumpnl', 'runningpnl'),
    profit:       find('netpnlusd', 'profit', 'pnl', 'netprofit', 'tradepnl', 'netpnl'),
  }
}
