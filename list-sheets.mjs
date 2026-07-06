import * as XLSX from 'xlsx'
import fs from 'fs'
const buffer = fs.readFileSync(process.argv[2])
const wb = XLSX.read(buffer, { type: 'buffer' })
console.log('Sheet names in order:')
wb.SheetNames.forEach((n, i) => console.log(`  ${i}: "${n}"`))
