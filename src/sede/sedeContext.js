// Contexto de una sede cargada: procesamiento del archivo y generación del
// reportPlan (estructura consumida tanto por la tabla en pantalla como por el
// export a Excel y el dashboard consolidado).

import { detectHeaderRow } from '../core/headerDetection.js';
import { classifyHeader } from '../core/classify.js';
import { parseDataRows } from '../core/parse.js';
import { buildReport } from '../core/catalog.js';
import { computeAggregate } from '../core/aggregate.js';
import { buildColumnLayout } from './columnLayout.js';

let _nextId = 1;

export function createSedeContext(fileName, sedeName) {
  return {
    id: _nextId++,
    fileName,
    sedeName,
    periodo: '',
    rows: null,
    headerInfo: null,
    movementCols: [],
    totalRow: null,
    skippedNoCode: 0,
    skippedExcluded: 0,
    products: [],
    reportPlan: null,
    status: 'loading',   // loading | needs_review | ready | error
    errorMsg: null
  };
}

export function guessSedeName(fileName) {
  const base = fileName.replace(/\.(xlsx|xls)$/i, '');
  let s = base.replace(/[_-]+/g, ' ');
  s = s.replace(/\b(movimientos?|ejemplo|informe|reporte|semanal|inventario|tabla|producto)\b/gi, '');
  s = s.trim().replace(/\s+/g, ' ');
  return s || base;
}

export function processRowsForSede(ctx, rows) {
  ctx.rows = rows;
  const headerInfo = detectHeaderRow(rows, 40);
  if (!headerInfo) {
    ctx.status = 'error';
    ctx.errorMsg = 'No se encontró una fila de encabezados reconocible (ni por palabras clave "CODIGO"/"DETALLE", ni por columnas de movimiento identificables).';
    return;
  }
  ctx.headerInfo = headerInfo;
  const headerRow = rows[headerInfo.headerRowIndex];
  const startCol = Math.max(headerInfo.codeCol, headerInfo.detCol) + 1;
  const movementCols = [];
  for (let c = startCol; c < headerRow.length; c++) {
    const header = headerRow[c];
    const cls = classifyHeader(header);
    movementCols.push({
      colIndex: c,
      header: (header === undefined || header === '') ? '' : String(header),
      type: cls.type,
      uncertain: !!cls.uncertain,
      manualOverride: cls.uncertain ? 'dev_venta' : null
    });
  }
  ctx.movementCols = movementCols;

  const parsed = parseDataRows(rows, headerInfo, movementCols);
  ctx.products = parsed.products;
  ctx.totalRow = parsed.totalRow;
  ctx.skippedNoCode = parsed.skippedNoCode;
  ctx.skippedExcluded = parsed.skippedExcluded;
  ctx.status = movementCols.some(m => m.type === 'unrecognized' && !m.manualOverride) ? 'needs_review' : 'ready';
}

export function countAdditionalProducts(ctx, catalogInfo) {
  let n = 0;
  const seen = new Set();
  ctx.products.forEach(p => {
    if (!catalogInfo.index.has(p.normCode) && !seen.has(p.normCode)) { seen.add(p.normCode); n++; }
  });
  return n;
}

export function generateReportForSede(ctx, catalogInfo, MASTER_CATALOG) {
  const layout = buildColumnLayout(ctx.movementCols);
  const categories = buildReport(ctx.products, catalogInfo, MASTER_CATALOG);

  const sections = categories.map(cat => {
    const itemsAgg = cat.items.map(item => ({ item, ...computeAggregate([item], layout.colGroups) }));
    const catAgg = computeAggregate(cat.items, layout.colGroups);
    return { category: cat.category, itemsAgg, catAgg };
  });

  const allItems = categories.reduce((acc, c) => acc.concat(c.items), []);
  const grandAgg = computeAggregate(allItems, layout.colGroups);

  ctx.reportPlan = { cols: layout.cols, blocks: layout.blocks, sections, grandAgg, sedeName: ctx.sedeName };
  return ctx.reportPlan;
}

export function validateAgainstTotalRow(ctx) {
  if (!ctx.totalRow) return null;
  const mismatches = [];
  ctx.movementCols.forEach(mc => {
    const fileVal = ctx.totalRow.values[mc.colIndex] || 0;
    const calc = ctx.products.reduce((acc, p) => acc + (p.values[mc.colIndex] || 0), 0);
    if (Math.abs(calc - fileVal) > 0.05) {
      mismatches.push({ header: mc.header || '(sin nombre)', fileVal, calc });
    }
  });
  return mismatches;
}
