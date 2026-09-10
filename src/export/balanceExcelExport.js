// Exportación a Excel del Balance semanal — réplica exacta (colores, logo,
// fórmulas y estructura de 2 pestañas) del archivo real que la empresa ya usa
// cada semana (ver plan de implementación para el detalle celda por celda,
// extraído con ExcelJS del archivo de referencia real de Decepaz).
//
// Pestaña 1 "Balance": el layout/colores/logo son fijos (son la identidad de
// marca de la empresa, no la plantilla visual seleccionable de la app) — no
// dependen de src/theme/templates.js. Coordenadas 1-based (fila/columna tal
// cual se ven en Excel) para que se puedan comparar directo contra el
// archivo de referencia.
// Pestaña 2 "Datos": reproduce el archivo de Tecnocarnes (grupo -> productos
// -> subtotal con fórmula SUM real), resaltando en amarillo los subtotales
// que sí alimentan el balance. La pestaña 1 lee esos subtotales por fórmula
// cruzada, así que editar un valor en la pestaña 2 (ya descargado, en Excel)
// recalcula el balance solo — sin nada que programar en la app para eso.

import ExcelJS from 'exceljs';
import { LOGO_BRANGUS_BASE64 } from '../assets/logoBrangusBase64.js';
import { groupBlocksIntoSections } from '../core/balanceFormulas.js';

function colLetter(idx1) {
  let n = idx1 - 1, s = '';
  do { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1; } while (n >= 0);
  return s;
}
// A(fila, columna) — ambas 1-based, igual que se leen en Excel.
function A(row1, col1) { return colLetter(col1) + row1; }
function round2(v) { return Math.round((v + Number.EPSILON) * 100) / 100; }

function safeSheetName(name) {
  return (name || 'Balance').replace(/[\\/*?:[\]]/g, '').trim().slice(0, 31) || 'Balance';
}
function uniqueSheetName(wb, name) {
  let n = 1; let finalName = name;
  while (wb.worksheets.some(w => w.name === finalName)) { finalName = (name + ' ' + (++n)).slice(0, 31); }
  return finalName;
}

const MESES_ES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
function formatPeriodoEs(weekStart, weekEnd) {
  if (!weekStart || !weekEnd) return '(semana no especificada)';
  const [ys, ms, ds] = weekStart.split('-').map(Number);
  const [, me, de] = weekEnd.split('-').map(Number);
  const mStart = MESES_ES[ms - 1], mEnd = MESES_ES[me - 1];
  if (ms === me) return `${ds} - ${de} de ${mEnd} de ${ys}`;
  return `${ds} de ${mStart} - ${de} de ${mEnd} de ${ys}`;
}

// Colores fijos de marca (no vienen de la plantilla visual seleccionable de la app).
const RED = 'FFFF0000';
const GREEN_TOTAL = 'FF92D050';
const YELLOW = 'FFFFFF00';
const FMT_CURRENCY = '_-"$" * #,##0_-;-"$" * #,##0_-;_-"$" * "-"??_-;_-@_-';
const FMT_CURRENCY_2DEC = '_-"$" * #,##0.00_-;-"$" * #,##0.00_-;_-"$" * "-"??_-;_-@_-';
const FMT_PERCENT = '0.0%';
const FONT = 'Arial';

function mediumBorder() {
  const side = { style: 'medium', color: { indexed: 64 } };
  return { top: side, bottom: side, left: side, right: side };
}
function thinBorder() {
  const side = { style: 'thin', color: { indexed: 64 } };
  return { top: side, bottom: side, left: side, right: side };
}

// Etiquetas EXACTAS de la plantilla real (mayúsculas, sin acentos) — distintas
// de BALANCE_BUCKET_LABELS (que son para la pantalla de revisión de la app).
const BUCKET_LABELS_EXACT = {
  planta_acopio: 'PLANTA ACOPI',
  salsamentaria: 'SALSAMENTARIA',
  puntos_venta: 'PUNTOS DE VENTA',
  planta_pollo: 'PLANTA POLLO',
  consumo_interno: 'CONSUMO INTERNO'
};

// Fila (1-based) de cada balde, iguales en Ventas (col D) y Compras (col D) salvo
// que Consumo Interno no existe en Compras — igual que en el archivo real.
const VENTAS_ROW = { planta_acopio: 10, salsamentaria: 11, puntos_venta: 12, planta_pollo: 13, consumo_interno: 14 };
const COMPRAS_ROW = { planta_acopio: 21, salsamentaria: 22, puntos_venta: 23, planta_pollo: 24 };

// ---------------- Pestaña 2: "Datos" (hoja fuente con fórmulas) ----------------

const DATOS_COL = { GRUPO: 1, PRODUCTO: 2, CANTIDAD: 3, VALOR: 4, IMPUESTO: 5, NETO: 6 };
const DATOS_HEADER_ROW = 1;
const DATOS_FIRST_DATA_ROW = 2;

const SECTION_HEADER_FILL = 'FFD9D9D9';
const FIELD_BY_COL = { [DATOS_COL.CANTIDAD]: 'cantidad', [DATOS_COL.VALOR]: 'valor', [DATOS_COL.IMPUESTO]: 'impuesto', [DATOS_COL.NETO]: 'neto' };

/**
 * Calcula en qué fila de la hoja "Datos" queda cada sección (Ventas ·
 * Electrónica, Ventas · Planta Acopio, ... Compras · Planta Pollo) y, dentro
 * de cada una, cada bloque (grupo + items + subtotal) — agrupando primero la
 * base y después sus devoluciones, con una fila de Neto al final cuando hay
 * más de un bloque en la sección (ver groupBlocksIntoSections). Se calcula
 * SIN necesitar la hoja ya creada, así la pestaña 1 puede armarse primero
 * referenciando estas direcciones por fórmula.
 */
function planSourceLayout(blocks) {
  let r = DATOS_FIRST_DATA_ROW;
  const { sections: rawSections, otros: otrosBlocks } = groupBlocksIntoSections(blocks);

  function layoutBlock(block) {
    const groupRow = r++;
    const itemRows = block.items.map(() => r++);
    const subtotalRow = block.items.length ? r++ : groupRow; // sin items: el valor va en la misma fila del grupo
    return { block, groupRow, itemRows, subtotalRow, cellAddr: A(subtotalRow, DATOS_COL.VALOR) };
  }

  const sections = rawSections.map(sec => {
    const headerRow = r++;
    const entries = sec.members.map(layoutBlock);
    let netRow = null, cellAddr;
    if (sec.isNetted) { netRow = r++; cellAddr = A(netRow, DATOS_COL.VALOR); }
    else cellAddr = entries[0].cellAddr;
    r++; // fila en blanco entre secciones
    return { ...sec, headerRow, entries, netRow, cellAddr };
  });

  let otrosHeaderRow = null;
  const otrosEntries = [];
  if (otrosBlocks.length) {
    otrosHeaderRow = r++;
    otrosBlocks.forEach(b => otrosEntries.push(layoutBlock(b)));
  }

  return { sections, otrosHeaderRow, otrosEntries };
}

function sectionFormula(layout, sourceSheetName, bucket, side) {
  const section = layout.sections.find(s => s.bucket === bucket && s.side === side);
  return section ? `'${sourceSheetName}'!${section.cellAddr}` : null;
}

function writeItemRows(ws, entry) {
  const { block, groupRow, itemRows, subtotalRow } = entry;
  ws.getRow(groupRow).getCell(DATOS_COL.GRUPO).value = block.label;
  ws.getRow(groupRow).getCell(DATOS_COL.GRUPO).font = { bold: true, name: FONT };

  block.items.forEach((it, i) => {
    const row = ws.getRow(itemRows[i]);
    row.getCell(DATOS_COL.PRODUCTO).value = it.producto || '';
    row.getCell(DATOS_COL.CANTIDAD).value = it.cantidad ?? 0;
    row.getCell(DATOS_COL.VALOR).value = it.valor ?? 0;
    row.getCell(DATOS_COL.IMPUESTO).value = it.impuesto ?? 0;
    row.getCell(DATOS_COL.NETO).value = it.neto ?? 0;
    [DATOS_COL.CANTIDAD, DATOS_COL.VALOR, DATOS_COL.IMPUESTO, DATOS_COL.NETO].forEach(c => { row.getCell(c).numFmt = FMT_CURRENCY; });
  });

  if (block.items.length) {
    const first = itemRows[0], last = itemRows[itemRows.length - 1];
    const subRow = ws.getRow(subtotalRow);
    subRow.getCell(DATOS_COL.PRODUCTO).value = block.isDevolucion ? 'Subtotal (devolución)' : 'Subtotal';
    subRow.getCell(DATOS_COL.PRODUCTO).font = { bold: true, name: FONT };
    [DATOS_COL.CANTIDAD, DATOS_COL.VALOR, DATOS_COL.IMPUESTO, DATOS_COL.NETO].forEach(c => {
      const cell = subRow.getCell(c);
      const field = FIELD_BY_COL[c];
      const result = block.items.reduce((acc, it) => acc + (it[field] || 0), 0);
      cell.value = { formula: `SUM(${A(first, c)}:${A(last, c)})`, result: round2(result) };
      cell.font = { bold: true, name: FONT };
      cell.numFmt = FMT_CURRENCY;
    });
  } else {
    const cell = ws.getRow(groupRow).getCell(DATOS_COL.VALOR);
    cell.value = round2(block.valor);
    cell.font = { bold: true, name: FONT };
    cell.numFmt = FMT_CURRENCY;
  }
}

function addBalanceSourceSheet(wb, ctx, layout, sheetName) {
  const ws = wb.addWorksheet(sheetName, { views: [{ state: 'frozen', ySplit: 1 }] });

  ['Tipo Documento', 'Producto', 'Cantidad', 'Valor', 'Impuesto', 'Neto'].forEach((h, i) => {
    const cell = ws.getRow(DATOS_HEADER_ROW).getCell(i + 1);
    cell.value = h;
    cell.font = { bold: true, name: FONT };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8E8E8' } };
  });

  layout.sections.forEach(section => {
    const headerCell = ws.getRow(section.headerRow).getCell(DATOS_COL.GRUPO);
    headerCell.value = section.title;
    headerCell.font = { bold: true, name: FONT, size: 12 };
    headerCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SECTION_HEADER_FILL } };
    ws.mergeCells(section.headerRow, DATOS_COL.GRUPO, section.headerRow, DATOS_COL.NETO);

    section.entries.forEach(entry => writeItemRows(ws, entry));

    if (section.netRow) {
      // "Compra menos devolución" (o "venta menos devolución"): base(s) primero,
      // devoluciones después — ya vienen en ese orden por groupBlocksIntoSections.
      const parts = section.entries.map(e => (e.block.isDevolucion ? '-' : '+') + A(e.subtotalRow, DATOS_COL.VALOR)).join('').replace(/^\+/, '');
      const row = ws.getRow(section.netRow);
      row.getCell(DATOS_COL.PRODUCTO).value = 'NETO';
      row.getCell(DATOS_COL.PRODUCTO).font = { bold: true, name: FONT };
      const cell = row.getCell(DATOS_COL.VALOR);
      cell.value = { formula: parts, result: round2(section.net) };
      cell.font = { bold: true, name: FONT };
      cell.numFmt = FMT_CURRENCY;
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: YELLOW } };
    } else {
      ws.getRow(section.entries[0].subtotalRow).getCell(DATOS_COL.VALOR).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: YELLOW } };
    }
  });

  if (layout.otrosEntries.length) {
    const headerCell = ws.getRow(layout.otrosHeaderRow).getCell(DATOS_COL.GRUPO);
    headerCell.value = 'OTROS (inventario, transformaciones, no clasificados)';
    headerCell.font = { bold: true, name: FONT, size: 12 };
    headerCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SECTION_HEADER_FILL } };
    ws.mergeCells(layout.otrosHeaderRow, DATOS_COL.GRUPO, layout.otrosHeaderRow, DATOS_COL.NETO);

    layout.otrosEntries.forEach(entry => {
      writeItemRows(ws, entry);
      if (entry.block.type === 'inv_final' || entry.block.type === 'inv_inicial') {
        ws.getRow(entry.subtotalRow).getCell(DATOS_COL.VALOR).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: YELLOW } };
      }
    });
  }

  ws.columns = [{ width: 34 }, { width: 30 }, { width: 12 }, { width: 16 }, { width: 12 }, { width: 16 }];
  return ws;
}

// ---------------- Pestaña 1: "Balance" (réplica exacta de la plantilla) ----------------

function writeMoney(ws, row, col, value, opts = {}) {
  const cell = ws.getRow(row).getCell(col);
  if (opts.formula) cell.value = { formula: opts.formula, result: round2(value || 0) };
  else cell.value = round2(value || 0);
  cell.numFmt = opts.numFmt || FMT_CURRENCY;
  cell.font = Object.assign({ name: FONT, size: 12 }, opts.font || {});
  cell.border = opts.border !== undefined ? opts.border : thinBorder();
  if (opts.fill) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: opts.fill } };
  return cell;
}
function writeLabel(ws, row, col, text, opts = {}) {
  const cell = ws.getRow(row).getCell(col);
  cell.value = text;
  cell.font = Object.assign({ name: FONT, size: 12 }, opts.font || {});
  if (opts.border) cell.border = opts.border;
  if (opts.fill) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: opts.fill } };
  return cell;
}

/**
 * Escribe la hoja "Balance" con el layout exacto de la plantilla real.
 * @param {object} [opts.layout] plan de la hoja de datos (ver planSourceLayout) — si
 *   se da, las celdas de Ventas/Compras/Inventario Final quedan como fórmula
 *   cruzada a esa hoja; si no (ej. exportBalanceHistoryToExcel, que no guarda
 *   el detalle por producto de semanas pasadas), quedan como número plano.
 */
function addBalanceSheet(wb, ctx, { sourceSheetName, layout, logoImageId, crossSheetInvInicial } = {}) {
  const b = ctx.balance;
  const sedeName = (ctx.sedeName || 'Sede').toUpperCase();
  const sheetName = uniqueSheetName(wb, safeSheetName('Balance ' + (ctx.weekStart || ctx.sedeName || '')));
  const ws = wb.addWorksheet(sheetName);

  if (logoImageId != null) {
    // Ocupa el ancho de la columna A + parte de la B, sin invadir la columna C
    // donde empieza el título (evita que el logo tape el texto).
    ws.addImage(logoImageId, { tl: { col: 0.05, row: 0.3 }, br: { col: 1.9, row: 3.6 } });
  }

  // ---- Título ----
  ws.getRow(3).getCell(3).value = {
    richText: [
      { text: 'RENDIMIENTO P.D.V  ', font: { bold: true, size: 14, name: FONT } },
      { text: sedeName, font: { bold: true, size: 14, name: FONT, color: { argb: RED } } },
      { text: '  BRANGUS', font: { bold: true, size: 14, name: FONT } }
    ]
  };
  ws.mergeCells('C3:H3');

  writeLabel(ws, 5, 2, `REPORTE SEMANAL ${sedeName}`, { font: { bold: true, size: 18 } });
  ws.mergeCells('B5:D5');
  const periodo = formatPeriodoEs(ctx.weekStart, ctx.weekEnd);
  writeLabel(ws, 5, 6, `RESULTADO ${periodo}`, { font: { bold: true, size: 18 } });
  ws.mergeCells('F5:H5');

  // ---- Encabezados Ventas ----
  writeLabel(ws, 7, 2, 'VENTAS', { font: { bold: true, size: 18 } });
  ws.mergeCells('B7:C7');
  writeLabel(ws, 7, 4, 'Traslados', { font: { bold: true, size: 12 } });
  writeLabel(ws, 8, 2, 'DETALLE', { font: { bold: true, size: 12 }, border: mediumBorder() });
  writeLabel(ws, 8, 3, 'VALOR', { font: { bold: true, size: 12 }, border: mediumBorder() });
  ws.getRow(8).getCell(4).border = mediumBorder();
  ws.mergeCells('C8:D8');

  // ---- Ventas: filas 9-14 ----
  writeLabel(ws, 9, 2, 'ELECTRONICA');
  const electronicaF = layout ? sectionFormula(layout, sourceSheetName, 'electronica_compras', 'venta') : null;
  writeMoney(ws, 9, 3, b.electronica, electronicaF ? { formula: electronicaF, font: { bold: true } } : { font: { bold: true } });

  ['planta_acopio', 'salsamentaria', 'puntos_venta', 'planta_pollo'].forEach(bucket => {
    const row = VENTAS_ROW[bucket];
    writeLabel(ws, row, 2, BUCKET_LABELS_EXACT[bucket]);
    const f = layout ? sectionFormula(layout, sourceSheetName, bucket, 'venta') : null;
    writeMoney(ws, row, 4, b.traslados[bucket].venta, f ? { formula: f, font: { bold: true } } : { font: { bold: true } });
  });
  writeLabel(ws, 14, 2, 'CONSUMO INTERNO');
  {
    const f = layout ? sectionFormula(layout, sourceSheetName, 'consumo_interno', 'venta') : null;
    writeMoney(ws, 14, 4, b.traslados.consumo_interno.venta, f ? { formula: f } : {});
  }

  // ---- Subtotal y total Ventas ----
  writeLabel(ws, 15, 2, ' SUD TOTAL ', { font: { bold: true } });
  writeMoney(ws, 15, 3, b.electronica, { formula: `+${A(9, 3)}`, font: { bold: true } });
  writeMoney(ws, 15, 4, b.totalVentas - b.electronica, { formula: `SUM(${A(9, 4)}:${A(14, 4)})`, font: { bold: true } });

  writeLabel(ws, 16, 2, 'TOTAL VENTAS - SALIDAS', { font: { bold: true, size: 11 }, fill: GREEN_TOTAL });
  writeMoney(ws, 16, 3, b.totalVentas, { formula: `+${A(15, 3)}+${A(15, 4)}`, font: { bold: true }, border: null });
  ws.mergeCells('C16:D16');

  // ---- Encabezados Compras ----
  writeLabel(ws, 18, 2, 'COMPRAS', { font: { bold: true, size: 10 } });
  ws.mergeCells('B18:C18');
  writeLabel(ws, 18, 4, 'Traslados', { font: { bold: true, size: 12 } });
  writeLabel(ws, 19, 2, 'DETALLE', { font: { bold: true, size: 12 } });
  writeLabel(ws, 19, 3, 'VALOR', { font: { bold: true, size: 12 } });
  ws.mergeCells('C19:D19');

  // ---- Compras: filas 20-24 ----
  writeLabel(ws, 20, 2, 'COMPRAS');
  const comprasF = layout ? sectionFormula(layout, sourceSheetName, 'electronica_compras', 'compra') : null;
  writeMoney(ws, 20, 3, b.compras, comprasF ? { formula: comprasF, font: { bold: true } } : { font: { bold: true } });

  ['planta_acopio', 'salsamentaria', 'puntos_venta', 'planta_pollo'].forEach(bucket => {
    const row = COMPRAS_ROW[bucket];
    writeLabel(ws, row, 2, BUCKET_LABELS_EXACT[bucket]);
    const f = layout ? sectionFormula(layout, sourceSheetName, bucket, 'compra') : null;
    writeMoney(ws, row, 4, b.traslados[bucket].compra, f ? { formula: f, font: { bold: true } } : { font: { bold: true } });
  });

  // ---- Subtotal y total Compras ----
  writeLabel(ws, 26, 2, ' SUD TOTAL ', { font: { bold: true } });
  writeMoney(ws, 26, 3, b.compras, { formula: `+${A(20, 3)}`, font: { bold: true } });
  writeMoney(ws, 26, 4, b.totalCompras - b.compras, { formula: `+SUM(${A(21, 4)}:${A(24, 4)})`, font: { bold: true } });

  writeLabel(ws, 28, 2, 'TOTAL  COMPRAS - ENTRADAS', { font: { bold: true, size: 10 }, fill: GREEN_TOTAL });
  writeMoney(ws, 28, 3, b.totalCompras, { formula: `+${A(26, 3)}+${A(26, 4)}`, font: { bold: true }, border: null });
  ws.mergeCells('C28:D28');

  // ---- Resultado del balance ----
  writeLabel(ws, 12, 6, 'RESULTADO DEL BALANCE', { font: { bold: true, size: 12 } });
  ws.mergeCells('F12:H12');

  writeLabel(ws, 13, 6, 'INVENTARIO INICIAL:', { font: { bold: true, size: 10 } });
  if (crossSheetInvInicial) {
    writeMoney(ws, 13, 8, b.invInicial, { formula: `'${crossSheetInvInicial.sheetName}'!${crossSheetInvInicial.cellAddr}`, font: { bold: true }, border: null });
  } else {
    writeMoney(ws, 13, 8, b.invInicial, { font: { bold: true }, border: null });
  }

  writeLabel(ws, 14, 6, 'INVENTARIO FINAL:', { font: { bold: true, size: 10 } });
  const invFinalEntry = layout ? layout.otrosEntries.find(e => e.block.type === 'inv_final') : null;
  writeMoney(ws, 14, 8, b.invFinal, invFinalEntry
    ? { formula: `'${sourceSheetName}'!${invFinalEntry.cellAddr}`, font: { bold: true }, border: null }
    : { font: { bold: true }, border: null });

  writeLabel(ws, 16, 6, 'CMV', { font: { bold: true, size: 10 } });
  writeMoney(ws, 16, 8, b.cmv, { formula: `${A(13, 8)}+${A(28, 3)}-${A(14, 8)}`, border: null });

  writeLabel(ws, 17, 6, 'UTILIDAD BRUTA', { font: { bold: true, size: 10 } });
  // El +1.046 es un ajuste fijo que la empresa siempre incluye aquí (confirmado
  // por el usuario) — igual que en src/core/balanceFormulas.js#computeUtilidadBruta.
  writeMoney(ws, 17, 8, b.utilidadBruta, { formula: `${A(15, 3)}+${A(15, 4)}-${A(16, 8)}+1.046`, font: { bold: true }, border: null });

  writeLabel(ws, 18, 6, 'MARGEN  %', { font: { bold: true, size: 10 } });
  writeMoney(ws, 18, 8, b.margenPct, {
    formula: `IF(${A(16, 3)}=0,0,${A(17, 8)}/${A(16, 3)})`,
    numFmt: FMT_PERCENT, font: { bold: true }, fill: YELLOW, border: null
  });

  writeLabel(ws, 20, 6, 'UTILIDAD  ', { font: { bold: true, size: 10 } });
  writeMoney(ws, 20, 8, b.utilidadBruta, { formula: `+${A(17, 8)}`, numFmt: FMT_CURRENCY_2DEC, font: { bold: true }, fill: YELLOW, border: null });

  ws.getColumn(2).width = 38.1;
  ws.getColumn(3).width = 29.5;
  ws.getColumn(4).width = 19.2;
  ws.getColumn(6).width = 34.7;
  ws.getColumn(7).width = 10.8;
  ws.getColumn(8).width = 22.6;

  return { ws, sheetName, invFinalCellAddr: A(14, 8) };
}

export async function exportBalanceToExcel(ctx) {
  const wb = new ExcelJS.Workbook();
  const logoImageId = wb.addImage({ base64: 'data:image/jpeg;base64,' + LOGO_BRANGUS_BASE64, extension: 'jpeg' });

  const sourceSheetName = uniqueSheetName(wb, safeSheetName('Datos ' + (ctx.sedeName || '')));
  const layout = planSourceLayout(ctx.classifiedBlocks);

  addBalanceSheet(wb, ctx, { sourceSheetName, layout, logoImageId });
  addBalanceSourceSheet(wb, ctx, layout, sourceSheetName);

  const buffer = await wb.xlsx.writeBuffer();
  return buffer;
}

/**
 * Un workbook con una hoja de balance por semana guardada (más antigua
 * primero, para que las fórmulas de encadenado referencien hojas ya creadas).
 * El historial guardado no conserva el detalle por producto de semanas
 * pasadas, así que aquí NO hay hoja de datos por semana ni fórmula cruzada —
 * los valores de Ventas/Compras/Inventario Final quedan como número plano
 * (excepto el Inventario Inicial, que si encadena con la hoja anterior).
 */
export async function exportBalanceHistoryToExcel(sedeName, weeks) {
  const wb = new ExcelJS.Workbook();
  const logoImageId = wb.addImage({ base64: 'data:image/jpeg;base64,' + LOGO_BRANGUS_BASE64, extension: 'jpeg' });
  const sheetRefs = [];

  weeks.forEach((week, i) => {
    const prevRef = i > 0 ? sheetRefs[i - 1] : null;
    const ctxLike = {
      sedeName,
      weekStart: week.week_start || week.week_key,
      weekEnd: week.week_end || '',
      balance: week.computed,
      classifiedBlocks: []
    };
    const { sheetName, invFinalCellAddr } = addBalanceSheet(wb, ctxLike, { logoImageId, crossSheetInvInicial: prevRef });
    sheetRefs.push({ sheetName, cellAddr: invFinalCellAddr });
  });

  const buffer = await wb.xlsx.writeBuffer();
  return buffer;
}
