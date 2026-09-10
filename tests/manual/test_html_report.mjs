import XLSX from 'xlsx';
import fs from 'fs';
import { createSedeContext, processRowsForSede, generateReportForSede } from '../../src/sede/sedeContext.js';
import { buildCatalogIndex } from '../../src/core/catalog.js';
import { computeDashboardData, serializeDashboardData } from '../../src/dashboard/dashboardData.js';
import { buildInteractiveReportHtml } from '../../src/export/htmlReportExport.js';
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
const ctx2 = loadCtx('./tests/manual/MOVIMIENTOS_EJEMPLO.xls', 'Villa del Lago');
const data = computeDashboardData([ctx1, ctx2]);
const serialized = serializeDashboardData(data);

const chartJsSource = fs.readFileSync('./node_modules/chart.js/dist/chart.umd.min.js', 'utf8');
const html = buildInteractiveReportHtml(serialized, chartJsSource, { periodo: '20 - 26 Julio 2026' });
fs.writeFileSync('./tests/manual/informe_interactivo.html', html);
console.log('Informe generado:', html.length, 'caracteres');
