import * as XLSX from 'xlsx';
import fs from 'fs';
import { createSedeContext, processRowsForSede, validateAgainstTotalRow } from './src/sede/sedeContext.js';

const filePath = 'C:/Users/Supervisor_Puntos/Desktop/INVENTARIOS/ALAMEDA/AGOSTO/27 JULIO AL 02 AGOSTO/tabla alameda 02 de agosto de 2026.xls';
const buf = fs.readFileSync(filePath);
const wb = XLSX.read(buf, { type: 'buffer' });
const ws = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true });

const ctx = createSedeContext('tabla alameda 02 de agosto de 2026.xls', 'Alameda');
processRowsForSede(ctx, rows);

console.log('status:', ctx.status);
console.log('skippedNoCode:', ctx.skippedNoCode, 'skippedExcluded:', ctx.skippedExcluded);
console.log('products.length:', ctx.products.length);
console.log('totalRow:', JSON.stringify(ctx.totalRow));
console.log('movementCols needing review:', ctx.movementCols.filter(m => m.type === 'unrecognized' || m.uncertain).map(m => ({ header: m.header, type: m.type, uncertain: m.uncertain })));

const mismatches = validateAgainstTotalRow(ctx);
console.log('mismatches:', JSON.stringify(mismatches, null, 2));
