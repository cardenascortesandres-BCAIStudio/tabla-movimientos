// Suite de regresión para el módulo de Ventas: parseo del archivo "Ventas
// Netas Por Dia" y agregación día/semana/mes/año.
import { describe, it, expect } from 'vitest';
import { parseVentasDiariasFile, guessSedeFromVentasRows } from '../src/core/ventasFileParse.js';
import { parsePresupuestoFile } from '../src/core/presupuestoFileParse.js';
import { aggregateByPeriod, periodKeyFor, computeProjection, findBestPeriod } from '../src/ventas/ventasDashboardData.js';

// Forma real (ver Desktop/BRANGUS/VENTAS/*.xls): fila de subtotal mensual
// (Fecha en blanco), marcador de mes suelto ("11"), y "Grand Total:" al final
// con pie de página después que debe ignorarse.
function buildFixtureRows() {
  return [
    ['AGROPECUARIA CRIADERO VILLAMARIA S.A.S.', '', '', '', 46274, 0.43],
    ['', 'DECEPAZ', '', '', '', ''],
    ['', '', '900311569-8', '', 'Fecha Inicial:', 45658],
    ['', '', '', '', 'Fecha Final:', 46274],
    ['', '', '', '', '', ''],
    ['', '', 'Ventas Netas Por Dia', '', '', 'R520407'],
    ['', '', '', '', '', ''],
    ['Fecha', 'Kilos', 'Unidades', 'Descuento', 'Nro Clientes', '', 'Valor Venta'],
    ['02/01/2025', 100, 50, 0, 20, '', 1000000],
    ['03/01/2025', 110, 55, 0, 22, '', 1100000],
    ['', 210, 105, 0, 42, '', 2100000], // subtotal mensual (enero) -> se ignora
    ['2', '', '', '', '', '', ''], // marcador de mes suelto -> se ignora
    ['01/02/2025', 90, 40, 0, 18, '', 900000],
    ['Grand Total:', 400, 195, 0, 82, '', 4000000],
    ['', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '1 de 1'],
    ['TecnoCarnes', '', '', '', '', '', ''],
  ];
}

describe('ventasFileParse', () => {
  it('parsea solo las filas de dato reales, ignorando subtotales, marcador de mes y pie de página', () => {
    const result = parseVentasDiariasFile(buildFixtureRows());
    expect(result).not.toBeNull();
    expect(result.dias).toEqual([
      { fecha: '2025-01-02', kilos: 100, unidades: 50, descuento: 0, nroClientes: 20, valorVenta: 1000000 },
      { fecha: '2025-01-03', kilos: 110, unidades: 55, descuento: 0, nroClientes: 22, valorVenta: 1100000 },
      { fecha: '2025-02-01', kilos: 90, unidades: 40, descuento: 0, nroClientes: 18, valorVenta: 900000 },
    ]);
  });

  it('tolera que "Nro Clientes"/"Valor Venta" cambien de columna (sin la columna en blanco intermedia)', () => {
    const rows = [
      ['Fecha', 'Kilos', 'Unidades', 'Descuento', 'Nro Clientes', 'Valor Venta'],
      ['02/01/2025', 967.48, 72, 0, 513, 17708083.73],
    ];
    const result = parseVentasDiariasFile(rows);
    expect(result.dias).toEqual([
      { fecha: '2025-01-02', kilos: 967.48, unidades: 72, descuento: 0, nroClientes: 513, valorVenta: 17708083.73 },
    ]);
  });

  it('devuelve null si no encuentra la fila de encabezado', () => {
    expect(parseVentasDiariasFile([['algo', 'random'], ['sin', 'encabezado']])).toBeNull();
  });

  it('adivina la sede por el contenido del archivo, con inclusión en ambos sentidos', () => {
    const rows = buildFixtureRows();
    expect(guessSedeFromVentasRows(rows, ['DECEPAZ', 'ALAMEDA'])).toBe('DECEPAZ');
    expect(guessSedeFromVentasRows([['', 'LA CASONA', '']], ['CASONA'])).toBe('CASONA');
  });
});

describe('presupuestoFileParse', () => {
  // Forma real (ver Desktop/BRANGUS/PRESUPUESTO.xlsx): encabezado con
  // columnas de referencia de meses puntuales que no se usan, y fila TOTAL
  // final que debe ignorarse.
  function buildFixtureRows() {
    return [
      ['', 'PRESUPUESTO', 'SEPTIEMBRE DE 2025', 'AGOSTO DE 2026'],
      ['ALAMEDA', 1165000000, 1217851313, 1275195153],
      ['CASONA', 560000000, 485399131, 506675378],
      ['JAMUNDI', 600000000, 265983916, 359294570],
      ['DECEPAZ', 450000000, 361535668, 320482074],
      ['VILLA DEL LAGO', 320000000, 190486926, 233477781],
      ['NARANJOS', 350000000, 195442699, 245666746],
      ['CHIMINANGOS', 230000000, 151788010, 174360192],
      ['PLANTA POLLO', 230000000, 70846, 476425],
      ['TOTAL', 3905000000, 2868558509, 3115628319],
    ];
  }

  it('parsea el monto de presupuesto por sede, ignorando la fila TOTAL y Planta Pollo (descontinuada)', () => {
    const result = parsePresupuestoFile(buildFixtureRows());
    expect(result).not.toBeNull();
    expect(result.sedes).toEqual([
      { sedeName: 'ALAMEDA', monto: 1165000000 },
      { sedeName: 'CASONA', monto: 560000000 },
      { sedeName: 'JAMUNDI', monto: 600000000 },
      { sedeName: 'DECEPAZ', monto: 450000000 },
      { sedeName: 'VILLA DEL LAGO', monto: 320000000 },
      { sedeName: 'NARANJOS', monto: 350000000 },
      { sedeName: 'CHIMINANGOS', monto: 230000000 },
    ]);
  });

  it('devuelve null si no encuentra la columna "PRESUPUESTO"', () => {
    expect(parsePresupuestoFile([['algo', 'random'], ['sin', 'encabezado']])).toBeNull();
  });
});

describe('ventasDashboardData#aggregateByPeriod', () => {
  const rows = [
    { sede_name: 'Decepaz', fecha: '2026-08-31', valor_venta: '100', kilos: '10' }, // lunes
    { sede_name: 'Decepaz', fecha: '2026-09-01', valor_venta: '200', kilos: '20' }, // martes, misma semana ISO
    { sede_name: 'Decepaz', fecha: '2026-09-08', valor_venta: '300', kilos: '30' }, // lunes siguiente
    { sede_name: 'Alameda', fecha: '2026-09-01', valor_venta: '500', kilos: '50' },
  ];

  it('agrupa por día sin perder nada', () => {
    const data = aggregateByPeriod(rows, 'day');
    expect(data.periodKeysSorted).toEqual(['2026-08-31', '2026-09-01', '2026-09-08']);
    expect(data.bySede.get('Decepaz').find(p => p.periodKey === '2026-09-01').valorVenta).toBe(200);
  });

  it('agrupa por semana ISO (lunes a domingo)', () => {
    const data = aggregateByPeriod(rows, 'week');
    const decepaz = data.bySede.get('Decepaz');
    expect(decepaz.find(p => p.periodKey === '2026-08-31').valorVenta).toBe(300); // 31 ago + 01 sep
    expect(decepaz.find(p => p.periodKey === '2026-09-07').valorVenta).toBe(300);
  });

  it('agrupa por mes sumando ventas, no promediando', () => {
    const data = aggregateByPeriod(rows, 'month');
    const decepazSep = data.bySede.get('Decepaz').find(p => p.periodKey === '2026-09');
    expect(decepazSep.valorVenta).toBe(500); // 200 + 300
  });

  it('periodKeyFor: la fecha ISO completa de Postgres (con hora/zona) no rompe el agrupado', () => {
    expect(periodKeyFor('2026-09-01T05:00:00.000Z', 'day')).toBe('2026-09-01');
    expect(periodKeyFor('2026-09-01T05:00:00.000Z', 'month')).toBe('2026-09');
  });
});

describe('ventasDashboardData#computeProjection', () => {
  it('proyecta el fin de mes a partir del ritmo acumulado hasta la última fecha con datos', () => {
    const diasDelMes = [
      { fecha: '2026-09-01', valor_venta: 100 },
      { fecha: '2026-09-02', valor_venta: 100 },
      { fecha: '2026-09-03', valor_venta: 100 },
    ]; // 300 acumulado en 3 días de septiembre (30 días)
    const p = computeProjection(diasDelMes, 2026, 9);
    expect(p.acumulado).toBe(300);
    expect(p.diasTranscurridos).toBe(3);
    expect(p.diasDelMes).toBe(30);
    expect(p.proyeccion).toBeCloseTo(3000, 5); // 300/3*30
  });

  it('devuelve null si no hay datos del mes', () => {
    expect(computeProjection([], 2026, 9)).toBeNull();
  });
});

describe('ventasDashboardData#findBestPeriod', () => {
  it('encuentra el periodo de mayor venta', () => {
    const points = [
      { periodKey: '2026-09-01', valorVenta: 100 },
      { periodKey: '2026-09-02', valorVenta: 500 },
      { periodKey: '2026-09-03', valorVenta: 300 },
    ];
    expect(findBestPeriod(points).periodKey).toBe('2026-09-02');
  });

  it('devuelve null si no hay puntos', () => {
    expect(findBestPeriod([])).toBeNull();
  });
});
