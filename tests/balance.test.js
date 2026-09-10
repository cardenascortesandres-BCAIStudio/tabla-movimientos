// Suite de regresión del módulo de Balance — src/core/balanceFileA.js,
// tipoDoctoClassify.js, balanceFormulas.js, workbookUtils.js.
// Los valores esperados son los confirmados contra las fórmulas de Excel
// reales del balance histórico de Decepaz (semana 20-26 jul 2026) — no los
// debilites al refactorizar. El Balance solo necesita el Archivo A
// (Tecnocarnes): el Inventario Final sale directo de su propio bloque
// "INVENTARIO SEMANAL FINAL" — ya no de un segundo archivo.

import { describe, it, expect } from 'vitest';
import XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import path from 'path';
import { fileURLToPath } from 'url';

import { findHeaderAcrossSheets } from '../src/core/workbookUtils.js';
import { detectTipoDoctoHeader, parseFileAGroups } from '../src/core/balanceFileA.js';
import { classifyTipoDocto } from '../src/core/tipoDoctoClassify.js';
import { computeTotales, computeInventarioInicial, computeCMV, computeUtilidadBruta, computeMargenPct, computeBalance } from '../src/core/balanceFormulas.js';
import { exportBalanceToExcel } from '../src/export/balanceExcelExport.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadSheets(fixtureName) {
  const wb = XLSX.readFile(path.join(__dirname, 'fixtures', fixtureName));
  return wb.SheetNames.map((sheetName, sheetIndex) => ({
    sheetIndex,
    sheetName,
    rows: XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: '', raw: true })
  }));
}

function classifyBlocks(blocks) {
  return blocks.map(b => ({ ...b, ...classifyTipoDocto(b.label) }));
}

describe('Archivo A — detección de encabezado en múltiples hojas', () => {
  it('encuentra "TipoDoctos" en la hoja 1 aunque la hoja 0 no lo traiga', () => {
    const sheets = loadSheets('fixture_balance_fileA_decepaz.xlsx');
    const found = findHeaderAcrossSheets(sheets, detectTipoDoctoHeader, 30);
    expect(found).not.toBeNull();
    expect(found.sheetIndex).toBe(1);
    expect(found.headerInfo.colTipoDoctos).toBe(0);
    expect(found.headerInfo.colValor).toBe(8);
  });
});

describe('Archivo A — extracción de bloques (grupo -> subtotal)', () => {
  const sheets = loadSheets('fixture_balance_fileA_decepaz.xlsx');
  const found = findHeaderAcrossSheets(sheets, detectTipoDoctoHeader, 30);
  const { blocks, warnings } = parseFileAGroups(found.rows, found.headerInfo);

  it('extrae todos los bloques con su Valor de subtotal', () => {
    const byLabel = Object.fromEntries(blocks.map(b => [b.label, b.valor]));
    expect(byLabel['COMPRAS PUNTO DE VENTA']).toBe(2350125);
    expect(byLabel['DEVOLUCION COMPRAS PUNTO DE VTA']).toBe(120000);
    expect(byLabel['ENTRADA MERCANCIA DE PLANTA']).toBe(35786500.55);
    expect(byLabel['FACTURA ELECTRONICA POS DECEPAZ']).toBe(65731929.28066);
    expect(byLabel['DEVOLUCION RESC POS ELECTRONICO']).toBe(143850);
    expect(byLabel['INVENTARIO SEMANAL FINAL']).toBe(43602470);
    expect(byLabel['INVENTARIO SEMANAL INICIAL']).toBe(38254366.8);
  });

  it('captura las filas de producto de cada bloque (items) para reproducir la hoja de datos fuente', () => {
    const compras = blocks.find(b => b.label === 'COMPRAS PUNTO DE VENTA');
    expect(compras.items).toEqual([
      { producto: 'OTROS PRODUCTOS', cantidad: 25, valor: 27500, impuesto: 0, neto: 27500 },
      { producto: 'PESCADO', cantidad: 218, valor: 2322625, impuesto: 0, neto: 2322625 }
    ]);
    const sumaItems = compras.items.reduce((acc, it) => acc + it.valor, 0);
    expect(sumaItems).toBe(compras.valor);
  });

  it('un bloque sin filas de producto capturadas trae items:[] (no rompe)', () => {
    const consumo = blocks.find(b => b.label === 'CONSUMO INTERNO');
    expect(consumo.items).toEqual([]);
  });

  it('captura un subtotal en cero como bloque válido (no lo confunde con fila vacía)', () => {
    const salida = blocks.find(b => b.label === 'SALIDA PARA PLANTA POLLO');
    expect(salida).toBeDefined();
    expect(salida.valor).toBe(0);
  });

  it('avisa cuando un bloque de cierre (ej. "TecnoCarnes") no tiene fila de subtotal', () => {
    expect(warnings.some(w => w.includes('TecnoCarnes'))).toBe(true);
  });
});

describe('classifyTipoDocto — heurística por balde', () => {
  it('clasifica "SALIDA DECEPAZ A PLANTA" como Puntos de Venta, no Planta Acopio (regresión confirmada)', () => {
    const cls = classifyTipoDocto('SALIDA DECEPAZ A PLANTA');
    expect(cls.bucket).toBe('puntos_venta');
    expect(cls.side).toBe('venta');
  });

  it('no deja que el nombre de la propia sede en una etiqueta de venta electrónica la clasifique como Puntos de Venta', () => {
    const cls = classifyTipoDocto('VENTA ELECTRONICA CONTADO NARANJOS');
    expect(cls.bucket).toBe('electronica_compras');
    expect(cls.side).toBe('venta');
  });

  it('clasifica compras y su devolución en el mismo balde+lado', () => {
    expect(classifyTipoDocto('COMPRAS PUNTO DE VENTA')).toMatchObject({ bucket: 'electronica_compras', side: 'compra', isDevolucion: false });
    expect(classifyTipoDocto('DEVOLUCION COMPRAS PUNTO DE VTA')).toMatchObject({ bucket: 'electronica_compras', side: 'compra', isDevolucion: true });
  });

  it('agrupa entradas de otras sedes en Puntos de Venta', () => {
    expect(classifyTipoDocto('ENTRADA M/CIA-NARANJOS').bucket).toBe('puntos_venta');
    expect(classifyTipoDocto('ENTRADA MERCANCIA ALAMEDA').bucket).toBe('puntos_venta');
    expect(classifyTipoDocto('SALIDA M/CIA-CHIMINANGOS').bucket).toBe('puntos_venta');
  });

  it('marca TRANSFORMACIONES como ignorado (nunca entra al balance)', () => {
    expect(classifyTipoDocto('TRANSFORMACIONES').type).toBe('ignored_transformacion');
  });

  it('marca INVENTARIO SEMANAL FINAL como el bloque autoritativo de Inventario Final', () => {
    expect(classifyTipoDocto('INVENTARIO SEMANAL FINAL').type).toBe('inv_final');
  });

  it('devuelve "unrecognized" para una etiqueta sin ninguna palabra clave reconocible', () => {
    expect(classifyTipoDocto('AJUSTE POR CONTEO FISICO EXTRAORDINARIO').type).toBe('unrecognized');
  });
});

describe('Fórmulas del Balance — contra los números reales confirmados (Decepaz 20-26 jul 2026)', () => {
  const sheets = loadSheets('fixture_balance_fileA_decepaz.xlsx');
  const found = findHeaderAcrossSheets(sheets, detectTipoDoctoHeader, 30);
  const { blocks } = parseFileAGroups(found.rows, found.headerInfo);
  const allClassified = classifyBlocks(blocks);
  const classified = allClassified.filter(b => b.bucket); // descarta inv_inicial/inv_final/transformaciones (bucket null)
  const invFinalBlock = allClassified.find(b => b.type === 'inv_final');
  const invInicialBlock = allClassified.find(b => b.type === 'inv_inicial');

  it('Electrónica neta = Valor factura - Valor devolución = 65,588,079.28066', () => {
    const { electronica } = computeTotales(classified);
    expect(electronica).toBeCloseTo(65588079.28066, 3);
  });

  it('Compras netas = 2,230,125', () => {
    const { compras } = computeTotales(classified);
    expect(compras).toBe(2230125);
  });

  it('Planta Acopio (traslado compra) = 35,786,500.55', () => {
    const { traslados } = computeTotales(classified);
    expect(traslados.planta_acopio.compra).toBeCloseTo(35786500.55, 3);
  });

  it('Puntos de Venta (traslado compra) = 2,511,454.309 (suma de Naranjos+Alameda+Casona+Jamundí)', () => {
    const { traslados } = computeTotales(classified);
    expect(traslados.puntos_venta.compra).toBeCloseTo(2511454.309, 3);
  });

  it('Total Compras = 56,424,367.416 (coincide con C28 del balance histórico)', () => {
    const { totalCompras } = computeTotales(classified);
    expect(totalCompras).toBeCloseTo(56424367.416, 3);
  });

  it('Total Ventas = 65,879,655.83066 (coincide con C16 del balance histórico)', () => {
    const { totalVentas } = computeTotales(classified);
    expect(totalVentas).toBeCloseTo(65879655.83066, 3);
  });

  it('Inventario Final sale del bloque "INVENTARIO SEMANAL FINAL" del propio Archivo A', () => {
    expect(invFinalBlock.valor).toBe(43602470);
  });

  it('CMV = Inv. Inicial + Total Compras - Inv. Final (todo del mismo archivo)', () => {
    const invInicial = computeInventarioInicial(undefined, invInicialBlock.valor);
    const { totalCompras } = computeTotales(classified);
    const cmv = computeCMV({ invInicial, totalCompras, invFinal: invFinalBlock.valor });
    expect(cmv).toBeCloseTo(51076264.216, 1);
  });

  it('computeInventarioInicial encadena con la semana anterior cuando existe historial; si no, usa el valor manual', () => {
    expect(computeInventarioInicial(99000000, 38254366.8)).toBe(99000000);
    expect(computeInventarioInicial(undefined, 38254366.8)).toBe(38254366.8);
    expect(computeInventarioInicial(undefined, undefined)).toBe(0);
  });

  it('Margen % nunca da NaN/Infinity cuando Total Ventas es 0', () => {
    expect(computeMargenPct({ utilidadBruta: 5, totalVentas: 0 })).toBe(0);
  });

  it('computeBalance arma el balance completo de forma consistente', () => {
    const result = computeBalance({
      blocks: classified,
      invInicial: computeInventarioInicial(undefined, invInicialBlock.valor),
      invFinal: invFinalBlock.valor
    });
    expect(result.totalVentas).toBeGreaterThan(0);
    expect(result.margenPct).toBeGreaterThan(0);
    expect(result.utilidadBruta).toBeCloseTo(computeUtilidadBruta({ totalVentas: result.totalVentas, cmv: result.cmv }), 6);
  });
});

describe('Excel del Balance — réplica exacta (2 pestañas, fórmulas cruzadas, logo, resaltado)', () => {
  const sheets = loadSheets('fixture_balance_fileA_decepaz.xlsx');
  const found = findHeaderAcrossSheets(sheets, detectTipoDoctoHeader, 30);
  const { blocks } = parseFileAGroups(found.rows, found.headerInfo);
  const classifiedBlocks = classifyBlocks(blocks).map(b => ({ ...b, manualOverride: null }));
  const invInicialBlock = classifiedBlocks.find(b => b.type === 'inv_inicial');
  const invFinalBlock = classifiedBlocks.find(b => b.type === 'inv_final');
  const balance = computeBalance({
    blocks: classifiedBlocks.filter(b => b.bucket),
    invInicial: computeInventarioInicial(undefined, invInicialBlock.valor),
    invFinal: invFinalBlock.valor
  });
  balance.invInicialFromChain = false;

  const ctx = { sedeName: 'Decepaz', weekStart: '2026-07-20', weekEnd: '2026-07-26', classifiedBlocks, balance };

  async function buildWorkbook() {
    const buffer = await exportBalanceToExcel(ctx);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    return wb;
  }

  it('genera exactamente 2 hojas: Balance y Datos', async () => {
    const wb = await buildWorkbook();
    expect(wb.worksheets.length).toBe(2);
    expect(wb.worksheets[0].name).toMatch(/^Balance/);
    expect(wb.worksheets[1].name).toMatch(/^Datos/);
  });

  it('incrusta el logo (1 imagen en el workbook)', async () => {
    const wb = await buildWorkbook();
    expect(wb.model.media.length).toBe(1);
    expect(wb.model.media[0].extension).toBe('jpeg');
  });

  it('la hoja Datos junta COMPRAS con su devolución en una fila NETO resaltada, y no resalta TRANSFORMACIONES', async () => {
    const wb = await buildWorkbook();
    const datos = wb.worksheets[1];
    let sectionHeaderRow = null, transformRowFound = null;
    datos.eachRow((row, rowNumber) => {
      if (row.getCell(1).value === 'COMPRAS · COMPRAS') sectionHeaderRow = rowNumber;
      if (row.getCell(1).value === 'TRANSFORMACIONES') transformRowFound = rowNumber;
    });
    expect(sectionHeaderRow).not.toBeNull();
    expect(transformRowFound).not.toBeNull();

    let netoRow = null;
    for (let r = sectionHeaderRow + 1; r < sectionHeaderRow + 20; r++) {
      if (datos.getRow(r).getCell(2).value === 'NETO') { netoRow = r; break; }
    }
    expect(netoRow).not.toBeNull();
    const netoCell = datos.getRow(netoRow).getCell(4);
    // Compra (2.350.125) menos su devolución (120.000), ambas referencias dentro de la misma hoja.
    expect(netoCell.value.formula).toMatch(/^[A-Z]+\d+-[A-Z]+\d+$/);
    expect(netoCell.value.result).toBeCloseTo(2230125, 3);
    expect(netoCell.fill.fgColor.argb).toBe('FFFFFF00');

    // TRANSFORMACIONES no participa del balance (sin balde) -> sin resaltar.
    const transformValorCell = datos.getRow(transformRowFound).getCell(4);
    expect(transformValorCell.fill?.pattern).not.toBe('solid');
  });

  it('la hoja Balance referencia por fórmula el NETO ya calculado en la hoja Datos (Electrónica = Factura - Devolución)', async () => {
    const wb = await buildWorkbook();
    const balanceSheet = wb.worksheets[0];
    const electronicaCell = balanceSheet.getRow(9).getCell(3);
    expect(electronicaCell.value.formula).toMatch(/^'Datos.*'![A-Z]+\d+$/);
    // El "result" cacheado se redondea a centavos (igual que el resto de celdas monetarias);
    // Excel recalcula el valor exacto de la fórmula al abrir el archivo.
    expect(electronicaCell.value.result).toBeCloseTo(65588079.28066, 1);
  });

  it('Inventario Final en la hoja Balance es una fórmula cruzada al bloque INVENTARIO SEMANAL FINAL', async () => {
    const wb = await buildWorkbook();
    const balanceSheet = wb.worksheets[0];
    const invFinalCell = balanceSheet.getRow(14).getCell(8);
    expect(invFinalCell.value.formula).toContain("'Datos");
    expect(invFinalCell.value.result).toBeCloseTo(43602470, 3);
  });

  it('Inventario Inicial en la hoja Balance es un número plano (nunca fórmula cruzada a esta semana)', async () => {
    const wb = await buildWorkbook();
    const balanceSheet = wb.worksheets[0];
    const invInicialCell = balanceSheet.getRow(13).getCell(8);
    expect(typeof invInicialCell.value).toBe('number');
    expect(invInicialCell.value).toBeCloseTo(38254366.8, 1);
  });

  it('Margen % y Utilidad quedan resaltados en amarillo, igual que en la plantilla real', async () => {
    const wb = await buildWorkbook();
    const balanceSheet = wb.worksheets[0];
    expect(balanceSheet.getRow(18).getCell(8).fill.fgColor.argb).toBe('FFFFFF00');
    expect(balanceSheet.getRow(20).getCell(8).fill.fgColor.argb).toBe('FFFFFF00');
  });
});
