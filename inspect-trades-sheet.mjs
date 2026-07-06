import * as XLSX from 'xlsx'
import fs from 'fs'
const buffer = fs.readFileSync(process.argv[2])
const wb = XLSX.read(buffer, { type: 'buffer' })
const tradesSheet = wb.SheetNames.find(n => n.toLowerCase() === 'trades')
console.log('Sheet used:', tradesSheet)
const ws = wb.Sheets[tradesSheet]
const rows = XLSX.utils.sheet_to_json(ws, { defval: '' })
console.log('Row count:', rows.length)
console.log('Headers:', Object.keys(rows[0]))
console.log('First row sample:', JSON.stringify(rows[0], null, 2))
console.log('Last row sample:', JSON.stringify(rows[rows.length - 1], null, 2))
