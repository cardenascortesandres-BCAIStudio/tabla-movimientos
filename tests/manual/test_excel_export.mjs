import XLSX from 'xlsx';
import fs from 'fs';
import { detectHeaderRow } from '../../src/core/headerDetection.js';
import { classifyHeader } from '../../src/core/classify.js';
import { parseDataRows } from '../../src/core/parse.js';
import { buildCatalogIndex } from '../../src/core/catalog.js';
import { createSedeContext, processRowsForSede, generateReportForSede } from '../../src/sede/sedeContext.js';
import { exportSedeToExcel, exportConsolidatedToExcel } from '../../src/export/excelExport.js';
import { MASTER_CATALOG } from '../../src/data/masterCatalog.js';

const catalogInfo = buildCatalogIndex(MASTER_CATALOG);

function loadCtx(fileName, sedeName) {
  const wb = XLSX.readFile(fileName);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true });
  const ctx = createSedeContext(fileName, sedeName);
  processRowsForSede(ctx, rows);
  ctx.periodo = '20 - 26 Julio 2026';
  generateReportForSede(ctx, catalogInfo, MASTER_CATALOG);
  return ctx;
}

const ctx1 = loadCtx('./tests/manual/MOVIMIENTOS_EJEMPLO.xls', 'Naranjos');
console.log('Sede 1 status:', ctx1.status, '| productos:', ctx1.products.length);

const buf1 = await exportSedeToExcel(ctx1);
fs.writeFileSync('./tests/manual/out_sede.xlsx', buf1);
console.log('Escrito out_sede.xlsx:', buf1.length, 'bytes');

const ctx2 = loadCtx('./tests/manual/MOVIMIENTOS_EJEMPLO.xls', 'Villa del Lago');
const buf2 = await exportConsolidatedToExcel([ctx1, ctx2]);
fs.writeFileSync('./tests/manual/out_consolidado.xlsx', buf2);
console.log('Escrito out_consolidado.xlsx:', buf2.length, 'bytes');
