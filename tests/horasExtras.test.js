// Suite de regresión para src/core/horasExtrasPdfParse.js — el fixture usa
// coordenadas (x, y) reales tomadas de un PDF "Liquidación Detallada" real
// (ver plan del módulo de Horas Extras), no valores inventados, para que el
// test cubra el mismo layout que produce el sistema de nómina.

import { describe, it, expect } from 'vitest';
import { parseLiquidacionPage } from '../src/core/horasExtrasPdfParse.js';
import { computeAlertas } from '../src/horasExtras/horasExtrasDashboardData.js';

// Header row (y=692) — mismas columnas y X que el PDF real.
const HEADER = [
  { str: 'Día', x: 50.68, y: 692 }, { str: 'Entrada', x: 80.1, y: 692 }, { str: 'Salida', x: 125.08, y: 692 },
  { str: 'Entrada', x: 164.24, y: 692 }, { str: 'Salida', x: 209.22, y: 692 }, { str: 'Total', x: 253.11, y: 692 },
  { str: 'Comida', x: 289.85, y: 692 }, { str: 'F', x: 328.2, y: 692 }, { str: 'Hdo', x: 344.51, y: 692 },
  { str: 'Rn', x: 371.84, y: 692 }, { str: 'Rndyf', x: 392.84, y: 692 }, { str: 'Dom', x: 425.74, y: 692 },
  { str: 'D', x: 451.86, y: 692 }, { str: 'Hefd', x: 466.73, y: 692 }, { str: 'Hefn', x: 494.42, y: 692 },
  { str: 'He', x: 526.98, y: 692 }, { str: 'Hen', x: 552.4, y: 692 }
];

const METADATA = [
  { str: 'Liquidación Detallada', x: 238.82, y: 745 },
  { str: 'PEREZ GOMEZ JUAN (ID: 12345678)', x: 40, y: 731 },
  { str: 'Empresa: Agrovillamaria · Sucursal: Alameda · Cargo: AUXILIAR', x: 40, y: 719 },
  { str: 'Periodo: 2026-09-01 hasta 2026-09-03 · Estado: Activo', x: 40, y: 709.5 }
];

function buildItems(dayRows) {
  return [...METADATA, ...HEADER, ...dayRows];
}

describe('parseLiquidacionPage', () => {
  it('parsea un día normal, uno con fila de continuación, y uno de inasistencia', () => {
    const items = buildItems([
      // Ma 01: día normal, con Total/Comida/Hdo/He en su columna real.
      { str: 'Ma 01', x: 46.09, y: 678 },
      { str: '08:00', x: 84.67, y: 678 }, { str: '13:00', x: 126.74, y: 678 },
      { str: '9', x: 259.98, y: 678 }, { str: '1', x: 301.52, y: 678 },
      { str: '7', x: 349.71, y: 678 }, { str: '2', x: 529.69, y: 678 },
      // Mi 02: fila principal + fila de continuación (mismo día, sin Total).
      { str: 'Mi 02', x: 47.34, y: 664 },
      { str: '06:33', x: 84.67, y: 664 }, { str: '10:07', x: 126.74, y: 664 },
      { str: '8', x: 259.98, y: 664 }, { str: '1.5', x: 301.52, y: 664 },
      { str: '7', x: 349.71, y: 664 }, { str: '1', x: 529.69, y: 664 },
      { str: 'Mi 02', x: 47.34, y: 650 },
      { str: '14:25', x: 84.67, y: 650 }, { str: '17:03', x: 209.22, y: 650 },
      // Ju 03: inasistencia (texto único, sin columnas).
      { str: 'Ju 03', x: 47.34, y: 636 },
      { str: 'Inasistencia', x: 137.36, y: 636 },
      // Totales.
      { str: 'Totales', x: 127.52, y: 622 },
      { str: '17', x: 259.98, y: 622 }, { str: '2.5', x: 301.52, y: 622 }, { str: '0', x: 328.4, y: 622 },
      { str: '14', x: 349.71, y: 622 }, { str: '0', x: 374.75, y: 622 }, { str: '0', x: 401.38, y: 622 },
      { str: '0', x: 431.99, y: 622 }, { str: '0', x: 452.48, y: 622 }, { str: '0', x: 472.98, y: 622 },
      { str: '0', x: 500.67, y: 622 }, { str: '3', x: 529.69, y: 622 }, { str: '0', x: 557.4, y: 622 }
    ]);

    const result = parseLiquidacionPage(items);
    expect(result.empleadoId).toBe('12345678');
    expect(result.nombre).toBe('PEREZ GOMEZ JUAN');
    expect(result.sede).toBe('Alameda');
    expect(result.periodoInicio).toBe('2026-09-01');
    expect(result.periodoFin).toBe('2026-09-03');
    expect(result.dias).toHaveLength(3);

    const d1 = result.dias.find((d) => d.fecha === '2026-09-01');
    expect(d1.estadoDia).toBe('trabajado');
    expect(d1.total).toBe(9);
    expect(d1.hdo).toBe(7);
    expect(d1.he).toBe(2);

    // La fila de continuación NO debe pisar los valores de la fila principal.
    const d2 = result.dias.find((d) => d.fecha === '2026-09-02');
    expect(d2.total).toBe(8);
    expect(d2.he).toBe(1);

    const d3 = result.dias.find((d) => d.fecha === '2026-09-03');
    expect(d3.estadoDia).toBe('inasistencia');
    expect(d3.total).toBeNull();
  });

  it('no confunde un horario tipo "08:07" (x a la izquierda de Total) con un valor numérico de la columna Total', () => {
    const items = buildItems([
      { str: 'Ma 01', x: 46.09, y: 678 },
      { str: '08:07', x: 84.67, y: 678 } // solo entrada, sin Total real ese día
    ]);
    const result = parseLiquidacionPage(items);
    const d1 = result.dias.find((d) => d.fecha === '2026-09-01');
    expect(d1.total).toBeNull();
  });

  it('devuelve null si la página no tiene la forma esperada (no es una Liquidación Detallada)', () => {
    expect(parseLiquidacionPage([{ str: 'Texto cualquiera', x: 10, y: 10 }])).toBeNull();
  });
});

describe('computeAlertas', () => {
  // El periodo de un reporte real casi nunca cierra en domingo (ej. "2026-09-01
  // hasta 2026-09-22", que termina un martes) — usar la última semana ISO tal
  // cual subestimaría la alerta porque esa semana viene con solo 1-2 días.
  function diaRow(empleadoId, fecha, he) {
    return { sede_name: 'Alameda', empleado_id: empleadoId, empleado_nombre: 'EMPLEADO ' + empleadoId, cargo: 'X', fecha, he, hen: 0, hefd: 0, hefn: 0, total: 8 };
  }

  it('usa la última semana COMPLETA, no la última semana calendario (parcial)', () => {
    const rows = [
      // Semana completa 2026-09-14 (lunes) a 2026-09-20 (domingo): 14h extra -> rojo.
      diaRow('1', '2026-09-14', 7), diaRow('1', '2026-09-15', 7),
      // Semana siguiente, incompleta (solo 2 días cargados: 21 y 22).
      diaRow('1', '2026-09-21', 1), diaRow('1', '2026-09-22', 1)
    ];
    const { lastWeek, alertas } = computeAlertas(rows);
    expect(lastWeek).toBe('2026-09-14');
    expect(alertas[0].nivel).toBe('rojo');
    expect(alertas[0].horaExtraSemana).toBe(14);
  });
});
