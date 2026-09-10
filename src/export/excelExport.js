// Exportación a Excel usando ExcelJS (a diferencia de SheetJS/xlsx, sí soporta
// fórmulas reales Y estilos de celda al mismo tiempo). Los colores usados son
// los de la plantilla visual activa (ver src/theme/templates.js) — la misma
// que se ve en pantalla, convertida a ARGB porque así los exige ExcelJS:
//   - Subtotal de categoría (nombre del bloque + totales): fondo gris claro, negrita
//   - Diferencia KL negativa: fondo rojo claro, texto rojo oscuro
//   - Diferencia KL en cero: fondo verde claro, texto verde oscuro
// El nombre de categoría va únicamente en la fila de SUBTOTAL al final de cada
// bloque (no hay fila de encabezado aparte) — así en la fila de totales de un
// bloque siempre se lee a qué bloque pertenece.

import ExcelJS from 'exceljs';
import { computeNovedades } from '../core/novedades.js';
import { getTemplate, toExcelPalette, DEFAULT_TEMPLATE_ID } from '../theme/templates.js';

const DEFAULT_PALETTE = toExcelPalette(getTemplate(DEFAULT_TEMPLATE_ID));
const NOVEDADES_THRESHOLD = 0.04;
const NOVEDAD_YELLOW = 'FFFFFF00';
const NOVEDAD_FG = 'FF5C4A05';

function thinBorder(palette) {
  const side = { style: 'thin', color: { argb: palette.borderColor } };
  return { top: side, bottom: side, left: side, right: side };
}

function colLetter(idx) {
  let n = idx, s = '';
  do { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1; } while (n >= 0);
  return s;
}
function addr(r, c) { return colLetter(c) + (r + 1); } // r,c 0-based -> dirección Excel
function addrAbs(r, c) { return '$' + colLetter(c) + '$' + (r + 1); } // referencia absoluta ($COL$FILA)

function buildRawRowArray(cols, item) {
  return cols.map(c => {
    if (c.kind === 'code') return item.code || '';
    if (c.kind === 'text') return item.name || '';
    return 0;
  });
}

/**
 * Agrega la hoja de una sede al workbook, con fórmulas reales y colores.
 * @param {ExcelJS.Workbook} wb
 * @param {object} ctx  contexto de sede (ver src/sede/sedeContext.js) ya con reportPlan generado
 * @param {object} palette  paleta ARGB (ver src/theme/templates.js#toExcelPalette); por defecto la plantilla clásica
 */
export function addSedeSheet(wb, ctx, palette = DEFAULT_PALETTE) {
  const plan = ctx.reportPlan;
  const cols = plan.cols;

  let sheetName = safeSheetName(ctx.sedeName);
  let n = 1; let finalName = sheetName;
  while (wb.worksheets.some(w => w.name === finalName)) { finalName = (sheetName + ' ' + (++n)).slice(0, 31); }
  const ws = wb.addWorksheet(finalName, { views: [{ state: 'frozen', ySplit: 4 }] });

  ws.getRow(1).getCell(1).value = `INFORME DE MOVIMIENTOS POR PRODUCTO — ${ctx.sedeName || '(sede no especificada)'}`;
  ws.getRow(1).getCell(1).font = { bold: true, size: 13 };
  ws.getRow(2).getCell(1).value = `Periodo: ${ctx.periodo || '(no especificado)'}  |  Archivo fuente: ${ctx.fileName}`;
  ws.getRow(2).getCell(1).font = { italic: true, color: { argb: 'FF666666' } };

  // Fila 4: encabezados de columna
  const headerRow = ws.getRow(4);
  cols.forEach((c, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = c.label;
    cell.font = { bold: true, color: { argb: palette.headerFg } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: palette.headerBg } };
    cell.alignment = { horizontal: c.kind === 'text' || c.kind === 'code' ? 'left' : 'right', vertical: 'middle' };
    cell.border = thinBorder(palette);
  });

  const rowMeta = []; // paralelo a filas de Excel a partir de la fila 5 (índice 4 en base 0)
  let rIdx = 4; // índice de fila (0-based) siguiente a escribir

  plan.sections.forEach(sec => {
    const itemRowIdxs = [];
    const catDisponible = sec.catAgg.totals.disponible;
    sec.itemsAgg.forEach(entry => {
      writeDataRow(ws, rIdx, cols, buildRawRowArray(cols, entry.item), null, palette);
      itemRowIdxs.push(rIdx);
      const pctDiferencia = catDisponible === 0 ? 0 : entry.totals.diferenciaKL / catDisponible;
      const isNovedad = Math.abs(pctDiferencia) > NOVEDADES_THRESHOLD;
      rowMeta.push({ type: 'item', entry, catRef: null, isNovedad });
      rIdx++;
    });

    const subtotalRowIdx = rIdx;
    writeDataRow(ws, rIdx, cols, buildRawRowArray(cols, { code: '', name: sec.category }), { bg: palette.subtotalBg, fg: palette.subtotalFg, bold: true }, palette);
    rowMeta.push({ type: 'subtotal', sec, itemRowIdxs });
    itemRowIdxs.forEach(ri => { rowMeta[ri - 4].catRef = subtotalRowIdx; });
    rIdx++;

    rowMeta.push({ type: 'blank' });
    rIdx++;
  });

  writeFormulasAndColors(ws, cols, rowMeta, palette);

  ws.columns.forEach((col, i) => {
    const c = cols[i];
    col.width = c.kind === 'text' ? 34 : (c.kind === 'code' ? 10 : 16);
  });

  return ws;
}

function writeDataRow(ws, rIdx, cols, values, styleOverride, palette) {
  const row = ws.getRow(rIdx + 1);
  cols.forEach((c, ci) => {
    const cell = row.getCell(ci + 1);
    cell.value = values[ci];
    cell.alignment = { horizontal: (c.kind === 'text' || c.kind === 'code') ? 'left' : 'right' };
    cell.border = thinBorder(palette);
    if (styleOverride) {
      cell.font = { bold: !!styleOverride.bold, color: { argb: styleOverride.fg } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: styleOverride.bg } };
    }
  });
}

function writeFormulasAndColors(ws, cols, rowMeta, palette) {
  const idxByKind = {};
  cols.forEach((c, i) => { idxByKind[c.key] = i; });
  const invInicialCol = idxByKind.invInicial, invFinalCol = idxByKind.invFinal;
  const totalComprasCol = idxByKind.totalCompras, totalEntradasCol = idxByKind.totalEntradas;
  const totalVentaCol = idxByKind.totalVenta, totalSalidaCol = idxByKind.totalSalida;
  const teoricoCol = idxByKind.teorico, disponibleCol = idxByKind.disponible;
  const diferenciaKLCol = idxByKind.diferenciaKL, pctCol = idxByKind.pctDiferencia;

  function cellAt(r, c) { return ws.getRow(r + 1).getCell(c + 1); }
  function setFormula(r, c, formula, result) { cellAt(r, c).value = { formula, result: result != null ? round2(result) : undefined }; }
  function setNum(r, c, val) { cellAt(r, c).value = round2(val); }

  // Rango(s) de columnas crudas por grupo/subgrupo: "compra" y "venta" traen
  // dos subgrupos (base y devolución) — el total de esos dos bloques es
  // base MENOS devolución, no una suma (confirmado explícitamente por el
  // usuario 2026-08-03: "el total de las ventas se debe restar la venta con
  // las devoluciones de venta", misma lógica para compras).
  const subBlocks = {};
  ['compra', 'entrada', 'venta', 'salida', 'transformacion'].forEach(g => {
    subBlocks[g] = {};
    ['base', 'dev'].forEach(sub => {
      const idxs = cols.map((c, i) => (c.kind === 'raw' && c.group === g && c.subgroup === sub) ? i : -1).filter(i => i !== -1);
      subBlocks[g][sub] = idxs.length ? { start: idxs[0], end: idxs[idxs.length - 1] } : null;
    });
  });
  function rangeFormula(range, r) {
    if (!range) return null;
    if (range.start === range.end) return addr(r, range.start);
    return `SUM(${addr(r, range.start)}:${addr(r, range.end)})`;
  }
  function blockRangeFormula(name, r) {
    const baseF = rangeFormula(subBlocks[name].base, r);
    const devF = rangeFormula(subBlocks[name].dev, r);
    if (baseF && devF) return `${baseF}-${devF}`;
    if (baseF) return baseF;
    if (devF) return `-${devF}`;
    return null;
  }

  rowMeta.forEach((meta, i) => {
    const r = 4 + i;
    if (meta.type === 'blank') return;

    if (meta.type === 'item') {
      const { totals, raw } = meta.entry;
      setNum(r, invInicialCol, totals.invInicial);
      setNum(r, invFinalCol, totals.invFinal);
      cols.forEach((c, ci) => { if (c.kind === 'raw') setNum(r, ci, raw[c.colIndex] || 0); });
    } else if (meta.type === 'subtotal') {
      const rows = meta.itemRowIdxs;
      if (rows.length) {
        const first = rows[0], last = rows[rows.length - 1];
        setFormula(r, invInicialCol, `SUM(${addr(first, invInicialCol)}:${addr(last, invInicialCol)})`, meta.sec.catAgg.totals.invInicial);
        setFormula(r, invFinalCol, `SUM(${addr(first, invFinalCol)}:${addr(last, invFinalCol)})`, meta.sec.catAgg.totals.invFinal);
        cols.forEach((c, ci) => { if (c.kind === 'raw') setFormula(r, ci, `SUM(${addr(first, ci)}:${addr(last, ci)})`, meta.sec.catAgg.raw[c.colIndex] || 0); });
      } else {
        setNum(r, invInicialCol, 0); setNum(r, invFinalCol, 0);
        cols.forEach((c, ci) => { if (c.kind === 'raw') setNum(r, ci, 0); });
      }
    }

    const compraF = blockRangeFormula('compra', r);
    setFormula(r, totalComprasCol, compraF || '0');
    const entradaF = blockRangeFormula('entrada', r);
    setFormula(r, totalEntradasCol, entradaF || '0');
    const ventaF = blockRangeFormula('venta', r);
    setFormula(r, totalVentaCol, ventaF || '0');
    const salidaF = blockRangeFormula('salida', r);
    setFormula(r, totalSalidaCol, salidaF || '0');
    const transformF = blockRangeFormula('transformacion', r);

    setFormula(r, teoricoCol, `${addr(r, invInicialCol)}+${addr(r, totalComprasCol)}+${addr(r, totalEntradasCol)}-${addr(r, totalVentaCol)}-${addr(r, totalSalidaCol)}+${transformF || '0'}`);
    setFormula(r, disponibleCol, `${addr(r, invInicialCol)}+${addr(r, totalComprasCol)}+${addr(r, totalEntradasCol)}`);
    setFormula(r, diferenciaKLCol, `${addr(r, invFinalCol)}-${addr(r, teoricoCol)}`);

    // % Diferencia: igual que en el archivo de referencia de la empresa —
    // cada PRODUCTO divide su Diferencia KL entre el Disponible TOTAL de su
    // categoría (referencia absoluta $COL$FILA, sin proteger división por
    // cero — así es como lo tienen ellos, es una división simple arrastrada);
    // la fila de SUBTOTAL de categoría sí se protege contra /0 porque en el
    // archivo real esas filas sí llevan el envoltorio IF(...).
    if (meta.type === 'item' && meta.catRef != null) {
      setFormula(r, pctCol, `${addr(r, diferenciaKLCol)}/${addrAbs(meta.catRef, disponibleCol)}`);
    } else {
      const dispRef = addr(r, disponibleCol);
      setFormula(r, pctCol, `IF(${dispRef}=0,0,${addr(r, diferenciaKLCol)}/${dispRef})`);
    }
    cellAt(r, pctCol).numFmt = '0.0%';

    // Color condicional de Diferencia KL (mismo criterio que la pantalla)
    const diffVal = meta.type === 'item' ? meta.entry.totals.diferenciaKL
      : (meta.type === 'subtotal' ? meta.sec.catAgg.totals.diferenciaKL : null);
    if (diffVal != null) {
      const diffCell = cellAt(r, diferenciaKLCol);
      if (Math.abs(diffVal) < 0.01) {
        diffCell.font = Object.assign({}, diffCell.font, { bold: true, color: { argb: palette.diffZeroFg } });
        diffCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: palette.diffZeroBg } };
      } else if (diffVal < 0) {
        diffCell.font = Object.assign({}, diffCell.font, { bold: true, color: { argb: palette.diffNegFg } });
        diffCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: palette.diffNegBg } };
      }
    }

    // Novedad (mismo umbral que src/core/novedades.js / la hoja "Novedades"):
    // resalta la fila COMPLETA en amarillo para poder verla directo en la
    // hoja principal, sin tener que ir a revisar la segunda pestaña.
    if (meta.type === 'item' && meta.isNovedad) {
      cols.forEach((c, ci) => {
        const cell = cellAt(r, ci);
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NOVEDAD_YELLOW } };
        cell.font = Object.assign({}, cell.font, { color: { argb: NOVEDAD_FG }, bold: ci === diferenciaKLCol || ci === pctCol || cell.font?.bold });
      });
    }
  });
}

function round2(v) { return Math.round((v + Number.EPSILON) * 100) / 100; }

function safeSheetName(name) {
  return (name || 'Sede').replace(/[\\/*?:[\]]/g, '').trim().slice(0, 28) || 'Sede';
}

/**
 * Hoja "Resumen" con una fila por sede (fórmulas SUM sobre las hojas individuales).
 */
export function addResumenSheet(wb, sedes, palette = DEFAULT_PALETTE) {
  const ws = wb.addWorksheet('Resumen', { views: [{ state: 'frozen', ySplit: 3 }] });
  ws.getRow(1).getCell(1).value = 'RESUMEN CONSOLIDADO — TODAS LAS SEDES';
  ws.getRow(1).getCell(1).font = { bold: true, size: 13 };

  const headers = ['Sede', 'Periodo', 'Productos', 'Inventario Inicial', 'Total Compras', 'Total Entradas', 'Total Venta', 'Total Salida', 'Teórico', 'Disponible', 'Inventario Final', 'Diferencia KL', '% Diferencia'];
  headers.forEach((h, i) => {
    const cell = ws.getRow(3).getCell(i + 1);
    cell.value = h;
    cell.font = { bold: true, color: { argb: palette.headerFg } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: palette.headerBg } };
  });

  let r = 3;
  const dataRows = [];
  sedes.forEach(ctx => {
    r++;
    const t = ctx.reportPlan.grandAgg.totals;
    const row = ws.getRow(r + 1);
    row.getCell(1).value = ctx.sedeName;
    row.getCell(2).value = ctx.periodo || '';
    row.getCell(3).value = ctx.products.length;
    row.getCell(4).value = round2(t.invInicial);
    row.getCell(5).value = round2(t.totalCompras);
    row.getCell(6).value = round2(t.totalEntradas);
    row.getCell(7).value = round2(t.totalVenta);
    row.getCell(8).value = round2(t.totalSalida);
    row.getCell(9).value = round2(t.teorico);
    row.getCell(10).value = round2(t.disponible);
    row.getCell(11).value = round2(t.invFinal);
    row.getCell(12).value = round2(t.diferenciaKL);
    const dispAddr = addr(r, 9), difAddr = addr(r, 11);
    row.getCell(13).value = { formula: `IF(${dispAddr}=0,0,${difAddr}/${dispAddr})`, result: t.disponible === 0 ? 0 : t.diferenciaKL / t.disponible };
    row.getCell(13).numFmt = '0.0%';
    if (t.diferenciaKL < 0) {
      row.getCell(12).font = { bold: true, color: { argb: palette.diffNegFg } };
      row.getCell(12).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: palette.diffNegBg } };
    }
    dataRows.push(r);
  });

  const totalR = r + 1;
  const totalRow = ws.getRow(totalR + 1);
  totalRow.getCell(1).value = 'TOTAL GENERAL';
  totalRow.font = { bold: true };
  [4, 5, 6, 7, 8, 9, 10, 11, 12].forEach(c => {
    const colL = colLetter(c - 1);
    const first = dataRows[0] + 1, last = dataRows[dataRows.length - 1] + 1;
    totalRow.getCell(c).value = { formula: `SUM(${colL}${first}:${colL}${last})` };
  });
  const dispT = addr(totalR, 9), difT = addr(totalR, 11);
  totalRow.getCell(13).value = { formula: `IF(${dispT}=0,0,${difT}/${dispT})` };
  totalRow.getCell(13).numFmt = '0.0%';
  totalRow.eachCell(c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: palette.grandBg } }; c.font = { bold: true, color: { argb: palette.grandFg } }; });

  ws.columns = [{ width: 22 }, { width: 18 }, { width: 11 }, { width: 14 }, { width: 13 }, { width: 13 }, { width: 12 }, { width: 12 }, { width: 11 }, { width: 12 }, { width: 14 }, { width: 13 }, { width: 13 }];
  return ws;
}

/**
 * Hoja "Novedades" de una sede: productos cuyo % Diferencia supera el umbral
 * (ver src/core/novedades.js), marcados Faltante/Sobrante según el signo.
 */
export function addNovedadesSheet(wb, ctx, thresholdPct = NOVEDADES_THRESHOLD, palette = DEFAULT_PALETTE) {
  // Sin reordenar: computeNovedades ya recorre las secciones/ítems en el
  // mismo orden de bloques que la primera pestaña (FINAS, PULPA, SEGUNDAS...),
  // así el listado de novedades queda organizado igual que el informe principal.
  const novedades = computeNovedades(ctx.reportPlan.sections, thresholdPct);

  let sheetName = safeSheetName('Nov ' + (ctx.sedeName || 'Sede'));
  let n = 1; let finalName = sheetName;
  while (wb.worksheets.some(w => w.name === finalName)) { finalName = (sheetName + ' ' + (++n)).slice(0, 31); }
  const ws = wb.addWorksheet(finalName, { views: [{ state: 'frozen', ySplit: 3 }] });

  ws.getRow(1).getCell(1).value = `NOVEDADES DE INVENTARIO — ${ctx.sedeName || '(sede no especificada)'} (umbral ±${Math.round(thresholdPct * 100)}%)`;
  ws.getRow(1).getCell(1).font = { bold: true, size: 13 };

  const headers = ['Código', 'Producto', 'Categoría', 'Diferencia KL', '% Diferencia', 'Novedad'];
  headers.forEach((h, i) => {
    const cell = ws.getRow(3).getCell(i + 1);
    cell.value = h;
    cell.font = { bold: true, color: { argb: palette.headerFg } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: palette.headerBg } };
  });

  novedades.forEach((nov, i) => {
    const row = ws.getRow(4 + i);
    row.getCell(1).value = nov.code;
    row.getCell(2).value = nov.name;
    row.getCell(3).value = nov.category;
    row.getCell(4).value = round2(nov.diferenciaKL);
    row.getCell(5).value = nov.pctDiferencia;
    row.getCell(5).numFmt = '0.0%';
    row.getCell(6).value = nov.novedad;

    // Resalta la fila COMPLETA (las 6 columnas), no solo Diferencia KL/Novedad,
    // para poder identificar cada producto de un vistazo en la hoja exportada.
    const bg = nov.diferenciaKL < 0 ? palette.diffNegBg : palette.diffZeroBg;
    const fg = nov.diferenciaKL < 0 ? palette.diffNegFg : palette.diffZeroFg;
    for (let c = 1; c <= 6; c++) {
      const cell = row.getCell(c);
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
      cell.font = Object.assign({}, cell.font, { color: { argb: fg }, bold: c === 6 || cell.font?.bold });
    }
  });

  ws.columns = [{ width: 12 }, { width: 34 }, { width: 20 }, { width: 14 }, { width: 13 }, { width: 12 }];
  return ws;
}

export async function exportSedeToExcel(ctx, palette = DEFAULT_PALETTE) {
  const wb = new ExcelJS.Workbook();
  addSedeSheet(wb, ctx, palette);
  addNovedadesSheet(wb, ctx, NOVEDADES_THRESHOLD, palette);
  const buffer = await wb.xlsx.writeBuffer();
  return buffer;
}

export async function exportConsolidatedToExcel(sedes, palette = DEFAULT_PALETTE) {
  const wb = new ExcelJS.Workbook();
  const ready = sedes.filter(s => s.reportPlan);
  addResumenSheet(wb, ready, palette);
  ready.forEach(ctx => { addSedeSheet(wb, ctx, palette); addNovedadesSheet(wb, ctx, NOVEDADES_THRESHOLD, palette); });
  const buffer = await wb.xlsx.writeBuffer();
  return buffer;
}
