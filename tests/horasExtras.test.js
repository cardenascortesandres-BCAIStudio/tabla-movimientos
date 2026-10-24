// Suite de regresión para src/core/horasExtrasPdfParse.js — el fixture usa
// coordenadas (x, y) reales tomadas de un PDF "Liquidación Detallada" real
// (ver plan del módulo de Horas Extras), no valores inventados, para que el
// test cubra el mismo layout que produce el sistema de nómina.

import { describe, it, expect } from 'vitest';
import { parseLiquidacionPage } from '../src/core/horasExtrasPdfParse.js';
import { computeAlertas, diaAnomalias } from '../src/horasExtras/horasExtrasDashboardData.js';

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

  // Bug real (2026-10-22): RH cambió el formato del PDF — el ID ya no viene
  // entre paréntesis, "Periodo: X hasta Y" pasó a "Periodo: X al Y", "Sucursal:"
  // desapareció del todo, y cada campo quedó separado en VARIOS textItems de
  // pdfjs con un textItem de solo " " entre ellos (en vez de un único string
  // con todo el texto, como en el fixture METADATA de arriba) — coordenadas
  // tomadas de un PDF real (ALAMEDA 28 SEP AL 20 OCT.pdf).
  it('reconoce el formato nuevo del PDF (sin paréntesis en el ID, "al" en vez de "hasta", sin Sucursal)', () => {
    const items = [
      { str: 'Liquidación Detallada', x: 239, y: 749 },
      { str: 'Periodo: 2026-09-28 al 2026-10-20', x: 244, y: 738 },
      { str: 'ARANGO MORENO GUSTAVO ADOLFO', x: 46, y: 714 },
      { str: ' ', x: 235, y: 714 },
      { str: 'ID: 94447474', x: 244, y: 714 },
      { str: 'Cargo:', x: 46, y: 696 }, { str: ' ', x: 70, y: 696 },
      { str: 'AUXILIAR DE INVENTARIOS ·', x: 72, y: 696 }, { str: ' ', x: 178, y: 696 },
      { str: 'Estado:', x: 182, y: 696 }, { str: ' ', x: 210, y: 696 }, { str: 'Activo', x: 212, y: 696 },
      ...HEADER,
      { str: 'Lu 28', x: 47, y: 666 },
      { str: '08:00', x: 85, y: 666 }, { str: '13:00', x: 126, y: 666 },
      { str: '14:00', x: 165, y: 666 }, { str: '17:00', x: 210, y: 666 },
      { str: '5', x: 259, y: 666 }, { str: '4', x: 301, y: 666 }, { str: '5', x: 356, y: 666 }
    ];
    const result = parseLiquidacionPage(items);
    expect(result).not.toBeNull();
    expect(result.empleadoId).toBe('94447474');
    expect(result.nombre).toBe('ARANGO MORENO GUSTAVO ADOLFO');
    expect(result.cargo).toBe('AUXILIAR DE INVENTARIOS');
    expect(result.sede).toBeNull(); // ya no viene en el PDF — se adivina/edita por archivo en main.js
    expect(result.periodoInicio).toBe('2026-09-28');
    expect(result.periodoFin).toBe('2026-10-20');
    expect(result.dias).toHaveLength(1);
    // Marcaciones (Entrada/Salida reales) — a pedido explícito del usuario,
    // para identificar anomalías día por día.
    expect(result.dias[0].entrada1).toBe('08:00');
    expect(result.dias[0].salida1).toBe('13:00');
    expect(result.dias[0].entrada2).toBe('14:00');
    expect(result.dias[0].salida2).toBe('17:00');
  });

  // Bug real reportado por el usuario con captura de pantalla de un PDF real
  // (BLANDON GUZMAN JUAN DAVID, Alameda, periodo 2026-09-28 al 2026-10-20):
  // un día puede traer una fila de continuación con un 2do turno (típicamente
  // nocturno, cruzando medianoche) — antes esa 3ra/4ta marcación se perdía
  // en silencio porque entrada1/salida1/entrada2/salida2 ya estaban llenas.
  it('no pierde la 3ra/4ta marcación de una fila de continuación (turno doble/nocturno)', () => {
    const items = [
      ...METADATA,
      ...HEADER,
      // Ma 01: fila principal con 2 marcaciones (turno normal).
      { str: 'Ma 01', x: 46.09, y: 678 },
      { str: '06:35', x: 84.67, y: 678 }, { str: '11:25', x: 126.74, y: 678 },
      { str: '12:03', x: 165.9, y: 678 }, { str: '16:58', x: 210.88, y: 678 },
      { str: '20.5', x: 259.98, y: 678 }, { str: '3.5', x: 301.52, y: 678 },
      { str: '3.5', x: 529.69, y: 678 }, { str: '10', x: 557.4, y: 678 },
      // Ma 01: fila de continuación — mismo día, 2do turno nocturno
      // (20:07 -> 06:23 del día siguiente), sin Total/columnas de horas.
      { str: 'Ma 01', x: 46.09, y: 664 },
      { str: '20:07', x: 84.67, y: 664 }, { str: '06:23', x: 210.88, y: 664 },
      // Totales (cierre de la tabla).
      { str: 'Totales', x: 127.52, y: 622 }
    ];
    const result = parseLiquidacionPage(items);
    expect(result).not.toBeNull();
    expect(result.dias).toHaveLength(1);
    const d = result.dias.find((x) => x.fecha === '2026-09-01');
    expect(d).toBeTruthy();
    // Turno principal, sin tocar.
    expect(d.entrada1).toBe('06:35');
    expect(d.salida1).toBe('11:25');
    expect(d.entrada2).toBe('12:03');
    expect(d.salida2).toBe('16:58');
    // 2do turno (de la fila de continuación) — antes se perdía.
    expect(d.entrada3).toBe('20:07');
    expect(d.salida3).toBe('06:23');
    expect(d.entrada4).toBeNull();
    expect(d.salida4).toBeNull();
    // Los totales de horas de la fila principal no deben verse afectados.
    expect(d.total).toBe(20.5);
    expect(d.hen).toBe(10);
  });

  it('marca las marcaciones como null (no "08:07" malinterpretado) cuando faltan', () => {
    const items = buildItems([
      { str: 'Ma 01', x: 46.09, y: 678 },
      { str: '08:07', x: 84.67, y: 678 } // solo entrada, sin salida ni total ese día
    ]);
    const result = parseLiquidacionPage(items);
    const d1 = result.dias.find((d) => d.fecha === '2026-09-01');
    expect(d1.entrada1).toBe('08:07');
    expect(d1.salida1).toBeNull();
    expect(d1.entrada2).toBeNull();
    expect(d1.salida2).toBeNull();
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

describe('diaAnomalias', () => {
  // A pedido explícito del usuario: resaltar de inmediato (1) un día con
  // turno doble (fila de continuación en el PDF) y (2) un día con hora
  // extra NOCTURNA (Hen/Hefn > 0), aunque no tenga turno doble.
  it('detecta turno doble por la presencia de entrada3/salida3', () => {
    const r = { entrada1: '06:35', salida1: '11:25', entrada2: '12:03', salida2: '16:58', entrada3: '20:07', salida3: '06:23', hen: 0, hefn: 0 };
    expect(diaAnomalias(r)).toEqual({ turnoDoble: true, horaNocturna: false, alguna: true });
  });

  it('detecta hora extra nocturna aunque no haya turno doble', () => {
    const r = { entrada1: '18:00', salida1: '23:00', hen: 2.5, hefn: 0 };
    expect(diaAnomalias(r)).toEqual({ turnoDoble: false, horaNocturna: true, alguna: true });
  });

  it('un día normal (1 turno, sin extra nocturna) no marca ninguna anomalía', () => {
    const r = { entrada1: '08:00', salida1: '17:00', hen: 0, hefn: 0 };
    expect(diaAnomalias(r)).toEqual({ turnoDoble: false, horaNocturna: false, alguna: false });
  });
});
