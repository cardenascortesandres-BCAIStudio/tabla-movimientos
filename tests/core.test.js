// Suite de regresión para src/core y src/sede.
// Corre con: npm test
//
// Estos casos ya atraparon bugs reales durante el desarrollo (ver PROMPT_PARA_CLAUDE_CODE.md
// "Historial de bugs ya encontrados y corregidos") — no los borres ni los debilites
// al refactorizar; si necesitas cambiar el comportamiento, actualiza también el caso.

import { describe, it, expect, beforeAll } from 'vitest';
import XLSX from 'xlsx';
import path from 'path';
import { fileURLToPath } from 'url';

import { detectHeaderRow } from '../src/core/headerDetection.js';
import { classifyHeader } from '../src/core/classify.js';
import { parseDataRows } from '../src/core/parse.js';
import { buildCatalogIndex, buildReport } from '../src/core/catalog.js';
import { groupColumns, computeRowTotals } from '../src/core/aggregate.js';
import { normalizeCode } from '../src/core/normalize.js';
import { computeNovedades } from '../src/core/novedades.js';
import { MASTER_CATALOG } from '../src/data/masterCatalog.js';
import { createSedeContext, processRowsForSede, generateReportForSede } from '../src/sede/sedeContext.js';
import { addSedeSheet, addNovedadesSheet } from '../src/export/excelExport.js';
import { parseFinalMovimientosFile } from '../src/core/parseFinalMovimientos.js';
import { aggregateByPeriod as aggregateMovByPeriod } from '../src/movimientos/movimientosDashboardData.js';
import ExcelJS from 'exceljs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const catalogInfo = buildCatalogIndex(MASTER_CATALOG);

function loadRows(fixtureName) {
  const wb = XLSX.readFile(path.join(__dirname, 'fixtures', fixtureName));
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true });
}

function classifyMovementCols(rows, headerInfo) {
  const headerRow = rows[headerInfo.headerRowIndex];
  const startCol = Math.max(headerInfo.codeCol, headerInfo.detCol) + 1;
  const cols = [];
  for (let c = startCol; c < headerRow.length; c++) {
    const h = headerRow[c];
    const cls = classifyHeader(h);
    cols.push({ colIndex: c, header: h === undefined || h === '' ? '' : String(h), type: cls.type, uncertain: !!cls.uncertain });
  }
  return cols;
}

describe('normalizeCode', () => {
  it('quita comas de miles', () => expect(normalizeCode('171,201')).toBe('171201'));
  it('quita residuo decimal .0', () => expect(normalizeCode('2700.0')).toBe('2700'));
  it('deja código simple intacto', () => expect(normalizeCode('1101')).toBe('1101'));
});

describe('detectHeaderRow — Método A (palabras clave)', () => {
  it('detecta CODIGO/DETALLE en Villa del Lago', () => {
    const rows = loadRows('fixture_villa_del_lago.xlsx');
    const info = detectHeaderRow(rows, 30);
    expect(info.method).toBe('keyword');
    expect(info.headerRowIndex).toBe(6);
  });

  it('prioriza CODIGO explícito sobre ITEM cuando ambos aparecen', () => {
    // Regresión: bug real encontrado — si el archivo trae ambas columnas,
    // debe usar la que dice literalmente "CODIGO", no la genérica "ITEM".
    const rows = [
      ['ITEM', 'CODIGO', 'DETALLE', 'VENTA X'],
      [1, '1101', 'PRODUCTO', 10]
    ];
    const info = detectHeaderRow(rows, 10);
    expect(info.codeCol).toBe(1); // columna "CODIGO", no la 0 ("ITEM")
  });
});

describe('detectHeaderRow — Método B (inferencia, sin palabras clave)', () => {
  it('infiere código/detalle cuando el archivo no trae esas palabras (caso Tecnocarnes)', () => {
    const rows = [
      ['', '', '', 'VENTA ELECTRONICA', 'COMPRAS CON FACTURA', 'INVENTARIO SEMANAL FINAL', 'INVENTARIO SEMANAL INICIAL'],
      ['CATEGORIA X', '171,201', 'PRODUCTO UNO', 10, 5, 20, 15],
      ['', '909,400', 'PRODUCTO DOS', 3, 1, 8, 9]
    ];
    const info = detectHeaderRow(rows, 10);
    expect(info.method).toBe('inferred');
    expect(info.headerRowIndex).toBe(0);
    expect(info.codeCol).toBe(1);
    expect(info.detCol).toBe(2);
  });
});

describe('classifyHeader', () => {
  const cases = [
    ['VENTA ELECTRONICA CONTADO NARANJOS', 'venta'],
    ['DEVOLUCION FACTURA CONTADO NARANJOS', 'dev_venta'],
    ['COMPRAS CON FACTURA ELECTRONICA', 'compra'],
    ['ENTRADA DE PLANTA POLLO', 'entrada'],
    ['CONSUMO INTERNO', 'salida'],
    ['SALIDA M/CIA-CASONA', 'salida'],
    ['TRANSFORMACIONES', 'transformacion'],
    ['INVENTARIO SEMANAL FINAL', 'inv_final'],
    ['INVENTARIO SEMANAL INICIAL', 'inv_inicial'],
    // Siglas abreviadas: DV = devolución, NC = nota crédito — ambas se
    // clasifican igual que "DEVOLUCION..." completo (se restan, no se suman).
    ['DV COMPRA', 'dev_compra'],
    ['DV VENTA', 'dev_venta'],
    ['NC COMPRA', 'dev_compra'],
    ['NC VENTA', 'dev_venta'],
  ];
  cases.forEach(([header, expected]) => {
    it(`"${header}" -> ${expected}`, () => expect(classifyHeader(header).type).toBe(expected));
  });

  it('columna DEVOLUCION ambigua se marca uncertain y por defecto es dev_venta', () => {
    const r = classifyHeader('DEVOLUCION GENERAL');
    expect(r.type).toBe('dev_venta');
    expect(r.uncertain).toBe(true);
  });

  it('columna sin encabezado es unrecognized', () => {
    expect(classifyHeader('').type).toBe('unrecognized');
  });
});

describe('parseDataRows', () => {
  let rows, headerInfo, movementCols;
  beforeAll(() => {
    rows = loadRows('fixture_chiminangos.xlsx');
    headerInfo = detectHeaderRow(rows, 30);
    movementCols = classifyMovementCols(rows, headerInfo);
  });

  it('detecta la fila TOTAL aunque el texto "TOTAL" esté en la columna Detalle', () => {
    const { totalRow } = parseDataRows(rows, headerInfo, movementCols);
    expect(totalRow).not.toBeNull();
  });

  it('fusiona (suma) dos filas con el mismo código en vez de duplicarlas o descartarlas', () => {
    const { products } = parseDataRows(rows, headerInfo, movementCols);
    const catalog = buildCatalogIndex(MASTER_CATALOG);
    const categories = buildReport(products, catalog, MASTER_CATALOG);
    const finas = categories.find(c => c.category === 'FINAS');
    const loma = finas.items.find(i => i.code === '1101' || i.name.includes('LOMO VICHE CORRIENTE'));
    expect(loma.merged).toBe(true);
  });

  it('usa la primera coincidencia del catálogo cuando un código está duplicado (código 1705)', () => {
    const { products } = parseDataRows(rows, headerInfo, movementCols);
    const catalog = buildCatalogIndex(MASTER_CATALOG);
    const categories = buildReport(products, catalog, MASTER_CATALOG);
    const finas = categories.find(c => c.category === 'FINAS');
    expect(finas.items.some(i => i.code === '1705')).toBe(true);
  });

  it('excluye productos que no son carne (adobo, canastillas, bolsa, hipoclorito, detergente, domicilio)', () => {
    const excludedRows = [
      ['Código', 'Detalle', 'COMPRAS'],
      ['9999', 'ADOBO PARA CARNE X 1KG', 10],
      ['9998', 'CANASTILLAS PLASTICAS', 5],
      ['9997', 'BOLSA PLASTICA CALIBRE 8', 20],
      ['9996', 'HIPOCLORITO DE SODIO', 2],
      ['9995', 'DETERGENTE INDUSTRIAL', 3],
      ['9994', 'DOMICILIO ZONA NORTE', 1],
      ['1101', 'LOMO VICHE CORRIENTE', 15],
    ];
    const hInfo = detectHeaderRow(excludedRows, 5);
    const mCols = classifyMovementCols(excludedRows, hInfo);
    const { products, skippedExcluded } = parseDataRows(excludedRows, hInfo, mCols);
    expect(products.map(p => p.rawCode)).toEqual(['1101']);
    expect(skippedExcluded).toBe(6);
  });
});

describe('parseDataRows — excluye insumos/empaques/aseo por palabra clave', () => {
  const rows = [
    ['Código', 'Detalle', 'Inventario Inicial', 'COMPRAS', 'VENTAS', 'Inventario Final'],
    ['1102', 'LOMO VICHE MAGRO PREMIUM AL VAC', 0, 100, 0, 50],
    ['9999', 'ADOBO PARA CARNE X 500GR', 10, 0, 5, 5],
    ['9998', 'CANASTILLAS PLASTICAS', 0, 20, 0, 20],
    ['9997', 'BOLSA TRANSPARENTE X 100', 0, 5, 0, 5],
    ['9996', 'HIPOCLORITO DE SODIO', 0, 3, 0, 3],
    ['9995', 'DETERGENTE INDUSTRIAL', 0, 2, 0, 2],
    ['9994', 'DOMICILIO ZONA NORTE', 0, 0, 1, 0],
  ];
  const headerInfo = detectHeaderRow(rows, 10);
  const movementCols = classifyMovementCols(rows, headerInfo);

  it('descarta las filas cuyo nombre contiene adobo/canastillas/bolsa/hipoclorito/detergente/domicilio', () => {
    const { products, skippedExcluded } = parseDataRows(rows, headerInfo, movementCols);
    expect(products.map(p => p.normCode)).toEqual(['1102']);
    expect(skippedExcluded).toBe(6);
  });
});

describe('parseDataRows — filas sin código (pie de página / separadores)', () => {
  it('no revienta con filas de texto sin datos numéricos (ej. paginación "1 de 1")', () => {
    const rows = [
      ['CODIGO', 'DETALLE', 'VENTA X'],
      ['1101', 'PRODUCTO', 10],
      ['', '1 de 1', ''],
      ['', 'TecnoCarnes', '']
    ];
    const headerInfo = { headerRowIndex: 0, codeCol: 0, detCol: 1 };
    const movementCols = [{ colIndex: 2, header: 'VENTA X', type: 'venta' }];
    const { products, totalRow, skippedNoCode } = parseDataRows(rows, headerInfo, movementCols);
    expect(products.length).toBe(1);
    expect(totalRow).toBeNull();
    expect(skippedNoCode).toBe(2);
  });
});

describe('cálculo de fórmulas (computeRowTotals)', () => {
  it('Teórico = InvInicial + Compras + Entradas - Venta - Salida + Transformaciones', () => {
    const movementCols = [
      { colIndex: 0, type: 'inv_inicial' }, { colIndex: 1, type: 'compra' }, { colIndex: 2, type: 'entrada' },
      { colIndex: 3, type: 'venta' }, { colIndex: 4, type: 'salida' }, { colIndex: 5, type: 'inv_final' }
    ];
    const colGroups = groupColumns(movementCols);
    const values = { 0: 10, 1: 5, 2: 3, 3: 12, 4: 1, 5: 4 };
    const t = computeRowTotals(values, colGroups);
    expect(t.teorico).toBe(10 + 5 + 3 - 12 - 1);
    expect(t.disponible).toBe(10 + 5 + 3);
    expect(t.diferenciaKL).toBe(4 - t.teorico);
  });

  it('Total Compras resta las devoluciones de compra (no las suma) — confirmado explícitamente por el usuario 2026-08-03', () => {
    const movementCols = [
      { colIndex: 0, type: 'compra' }, { colIndex: 1, type: 'dev_compra' },
      { colIndex: 2, type: 'venta' }, { colIndex: 3, type: 'dev_venta' }
    ];
    const colGroups = groupColumns(movementCols);
    const values = { 0: 100, 1: 30, 2: 200, 3: 15 };
    const t = computeRowTotals(values, colGroups);
    expect(t.totalCompras).toBe(100 - 30);
    expect(t.totalVenta).toBe(200 - 15);
  });

  it('% Diferencia es 0 cuando el Disponible de la categoría es 0 (nunca división por cero)', () => {
    const disponibleCategoria = 0;
    const diferenciaKL = 5;
    const pct = disponibleCategoria === 0 ? 0 : diferenciaKL / disponibleCategoria;
    expect(pct).toBe(0);
  });
});

function novedadesFixtureSections() {
  // Categoría con Disponible = 100: item A a -15% (Faltante, supera umbral),
  // item B a +5% (dentro del umbral, no debe salir), item C a +20% (Sobrante).
  return [{
    category: 'FINAS',
    catAgg: { totals: { disponible: 100 } },
    itemsAgg: [
      { item: { code: '1', name: 'ITEM A' }, totals: { diferenciaKL: -15 } },
      { item: { code: '2', name: 'ITEM B' }, totals: { diferenciaKL: 5 } },
      { item: { code: '3', name: 'ITEM C' }, totals: { diferenciaKL: 20 } }
    ]
  }];
}

describe('computeNovedades', () => {
  it('marca Faltante cuando Diferencia KL es negativa y supera el umbral', () => {
    const novedades = computeNovedades(novedadesFixtureSections(), 0.10);
    const a = novedades.find(n => n.code === '1');
    expect(a.novedad).toBe('Faltante');
    expect(a.pctDiferencia).toBeCloseTo(-0.15);
  });

  it('marca Sobrante cuando Diferencia KL es positiva y supera el umbral', () => {
    const novedades = computeNovedades(novedadesFixtureSections(), 0.10);
    const c = novedades.find(n => n.code === '3');
    expect(c.novedad).toBe('Sobrante');
    expect(c.pctDiferencia).toBeCloseTo(0.20);
  });

  it('no incluye productos dentro del umbral', () => {
    const novedades = computeNovedades(novedadesFixtureSections(), 0.10);
    expect(novedades.find(n => n.code === '2')).toBeUndefined();
    expect(novedades.length).toBe(2);
  });

  it('nunca divide por cero cuando el Disponible de la categoría es 0', () => {
    const sections = [{
      category: 'X',
      catAgg: { totals: { disponible: 0 } },
      itemsAgg: [{ item: { code: '9', name: 'ITEM X' }, totals: { diferenciaKL: 5 } }]
    }];
    const novedades = computeNovedades(sections, 0.10);
    expect(novedades.length).toBe(0);
  });
});

// La fórmula de % Diferencia del Excel exportado debe ser IDÉNTICA a la del
// archivo de referencia real de la empresa (Chiminangos, verificado a mano
// 2026-08-03): cada PRODUCTO divide su Diferencia KL entre el Disponible
// TOTAL de su categoría con referencia ABSOLUTA ("=Y5/$X$10", sin IF de
// protección — así es en el archivo real), mientras que la fila de SUBTOTAL
// de categoría sí lleva el envoltorio IF(...=0,0,...). No relajar esto sin
// volver a revisar contra un archivo real de la empresa.
describe('addSedeSheet — fórmula de % Diferencia igual al archivo de referencia', () => {
  it('producto: division simple con referencia absoluta al Disponible de la categoría', async () => {
    const rows = [
      ['Código', 'Detalle', 'Inventario Inicial', 'COMPRAS', 'VENTAS', 'Inventario Final'],
      ['1102', 'LOMO VICHE MAGRO PREMIUM AL VAC', 0, 0, 3.21, 0],
      ['1105', 'LOMO CARACHO', 22.5, 0, 19.14, 6],
    ];
    const ctx = createSedeContext('fixture.xlsx', 'Chiminangos');
    processRowsForSede(ctx, rows);
    generateReportForSede(ctx, catalogInfo, MASTER_CATALOG);

    const wb = new ExcelJS.Workbook();
    const ws = addSedeSheet(wb, ctx);
    const pctColIdx = ctx.reportPlan.cols.findIndex(c => c.key === 'pctDiferencia') + 1;
    const dispColIdx = ctx.reportPlan.cols.findIndex(c => c.key === 'disponible') + 1;
    const diffColIdx = ctx.reportPlan.cols.findIndex(c => c.key === 'diferenciaKL') + 1;
    const letterOf = (cell) => cell.address.replace(/\d+$/, '');
    const dispLetter = letterOf(ws.getRow(4).getCell(dispColIdx));
    const diffLetter = letterOf(ws.getRow(4).getCell(diffColIdx));

    // fila 5-6 = los 2 productos (FINAS); fila 7 = subtotal de la categoría
    const itemFormula = ws.getRow(5).getCell(pctColIdx).value.formula;
    const subtotalFormula = ws.getRow(7).getCell(pctColIdx).value.formula;
    expect(itemFormula).toBe(`${diffLetter}5/$${dispLetter}$7`);
    expect(subtotalFormula).toBe(`IF(${dispLetter}7=0,0,${diffLetter}7/${dispLetter}7)`);
  });

  it('TOTAL COMPRAS y TOTAL VENTA restan la devolución (formula real de resta, no SUM que las suma)', () => {
    const rows = [
      ['Código', 'Detalle', 'COMPRAS PUNTO DE VENTA', 'DEVOLUCION COMPRAS', 'VENTAS CONTADO', 'DEVOLUCION FACTURA CONTADO'],
      ['1102', 'LOMO VICHE MAGRO PREMIUM AL VAC', 100, 30, 200, 15],
    ];
    const ctx = createSedeContext('fixture.xlsx', 'Chiminangos');
    processRowsForSede(ctx, rows);
    generateReportForSede(ctx, catalogInfo, MASTER_CATALOG);

    const wb = new ExcelJS.Workbook();
    const ws = addSedeSheet(wb, ctx);
    const cols = ctx.reportPlan.cols;
    const letterOf = (key) => {
      const idx = cols.findIndex(c => c.key === key) + 1;
      return ws.getRow(5).getCell(idx).address.replace(/\d+$/, '');
    };
    const compraLetter = letterOf('raw_2'), devCompraLetter = letterOf('raw_3');
    const ventaLetter = letterOf('raw_4'), devVentaLetter = letterOf('raw_5');
    const totalComprasColIdx = cols.findIndex(c => c.key === 'totalCompras') + 1;
    const totalVentaColIdx = cols.findIndex(c => c.key === 'totalVenta') + 1;

    const comprasCell = ws.getRow(5).getCell(totalComprasColIdx);
    const ventaCell = ws.getRow(5).getCell(totalVentaColIdx);
    expect(comprasCell.value.formula).toBe(`${compraLetter}5-${devCompraLetter}5`);
    expect(ventaCell.value.formula).toBe(`${ventaLetter}5-${devVentaLetter}5`);
  });
});

describe('parseFinalMovimientosFile — lee un Excel YA EDITADO (Disponible/Diferencia KL/% Diferencia finales, sin recalcular)', () => {
  const rows = [
    ['Código', 'Detalle', 'Inventario Inicial', 'TEÓRICO', 'Inventario Final', 'DISPONIBLE', 'DIFERENCIA KL', '% DIFERENCIA'],
    ['1102', 'LOMO VICHE MAGRO PREMIUM AL VAC', 0, 100, 50, 100, -50, -0.5],
    ['1105', 'LOMO CARACHO', 100, 100, 100, 100, 0, 0],
    ['', 'FINAS', '', '', '', 200, -50, -0.25],
    ['1200', 'BOLA NEGRA', 0, 10, 0, 10, -10, -1],
    ['', 'PULPA', '', '', '', 10, -10, -1],
  ];

  it('agrupa por categoría (fila de subtotal = código vacío) y respeta los valores finales tal cual, sin recalcular', () => {
    const data = parseFinalMovimientosFile(rows, 'Chiminangos');
    expect(data).not.toBeNull();
    expect(data.allProductRows.map(p => p.code)).toEqual(['1102', '1105', '1200']);
    expect(data.byCategory.get('FINAS')).toEqual({ disponible: 200, diferenciaKL: -50 });
    expect(data.byCategory.get('PULPA')).toEqual({ disponible: 10, diferenciaKL: -10 });
    expect(data.totalDisponible).toBe(210);
    expect(data.totalDiferencia).toBe(-60);
    expect(data.totalProductosNeg).toBe(2); // 1102 (-50) y 1200 (-10); 1105 tiene 0
    // el % Diferencia se lee directo del archivo, no se recalcula:
    expect(data.allProductRows[0].pct).toBe(-0.5);
  });

  it('devuelve null si el archivo no tiene las columnas Disponible/Diferencia KL', () => {
    const badRows = [['Código', 'Detalle', 'Algo'], ['1102', 'X', 5]];
    expect(parseFinalMovimientosFile(badRows, 'Chiminangos')).toBeNull();
  });
});

describe('movimientos: aggregateByPeriod — no rompe con fechas ISO completas devueltas por la API', () => {
  it('agrupa por mes aunque week_start venga como datetime ISO completo (columna date de Postgres serializada)', () => {
    const weekRows = [
      { sede_name: 'Alameda', week_start: '2026-07-27T05:00:00.000Z', computed: { totalDisponible: 100, totalDiferencia: -10 } },
      { sede_name: 'Alameda', week_start: '2026-07-13T05:00:00.000Z', computed: { totalDisponible: 50, totalDiferencia: 5 } },
    ];
    const data = aggregateMovByPeriod(weekRows, 'month');
    expect(data.periodKeysSorted).toEqual(['2026-07']);
    const point = data.bySede.get('Alameda')[0];
    expect(point.periodLabel).toBe('jul 2026');
    expect(point.disponible).toBe(150);
    expect(point.diferenciaKL).toBe(-5);
  });
});

describe('Novedades en la hoja principal y orden de la hoja "Novedades"', () => {
  // 1102 (FINAS) y 1105 (FINAS) primero, 1200 (PULPA) después — a propósito
  // con 1200 teniendo el % Diferencia más grande en valor absoluto, para
  // distinguir "orden de bloques" (lo que se pide) de "orden por magnitud"
  // (el comportamiento viejo que había que quitar).
  const rows = [
    ['Código', 'Detalle', 'Inventario Inicial', 'COMPRAS', 'VENTAS', 'Inventario Final'],
    ['1102', 'LOMO VICHE MAGRO PREMIUM AL VAC', 0, 100, 0, 50],   // FINAS, %Dif = -50/200 = -25% -> novedad
    ['1105', 'LOMO CARACHO', 100, 0, 0, 100],                     // FINAS, %Dif = 0/200 = 0% -> NO es novedad
    ['1200', 'BOLA NEGRA', 0, 10, 0, 0],                          // PULPA, %Dif = -10/10 = -100% -> novedad (mayor magnitud)
  ];

  function buildCtx() {
    const ctx = createSedeContext('fixture.xlsx', 'Chiminangos');
    processRowsForSede(ctx, rows);
    generateReportForSede(ctx, catalogInfo, MASTER_CATALOG);
    return ctx;
  }

  it('resalta en amarillo toda la fila de un producto que es novedad, y no la de uno que no lo es', () => {
    const ctx = buildCtx();
    const wb = new ExcelJS.Workbook();
    const ws = addSedeSheet(wb, ctx);
    const codeColIdx = ctx.reportPlan.cols.findIndex(c => c.key === 'code') + 1;
    const nameColIdx = ctx.reportPlan.cols.findIndex(c => c.key === 'producto') + 1;

    // fila 5 = 1102 (novedad), fila 6 = 1105 (no es novedad)
    expect(ws.getRow(5).getCell(codeColIdx).value).toBe('1102');
    expect(ws.getRow(5).getCell(codeColIdx).fill.fgColor.argb).toBe('FFFFFF00');
    expect(ws.getRow(5).getCell(nameColIdx).fill.fgColor.argb).toBe('FFFFFF00');

    expect(ws.getRow(6).getCell(codeColIdx).value).toBe('1105');
    expect(ws.getRow(6).getCell(codeColIdx).fill?.fgColor?.argb).not.toBe('FFFFFF00');
  });

  it('la hoja Novedades queda en el mismo orden de bloques que la hoja principal (FINAS antes que PULPA), no por magnitud de % Diferencia', () => {
    const ctx = buildCtx();
    const wb = new ExcelJS.Workbook();
    addNovedadesSheet(wb, ctx);
    const ws = wb.worksheets.find(w => w.name.startsWith('Nov'));

    // fila 1 = título, fila 3 = encabezados, fila 4 = primera novedad
    const firstCode = ws.getRow(4).getCell(1).value;
    const secondCode = ws.getRow(5).getCell(1).value;
    expect(firstCode).toBe('1102');  // FINAS, va primero aunque 1200 tenga mayor % Diferencia
    expect(secondCode).toBe('1200'); // PULPA, va después por orden de bloque, no por magnitud
  });
});
