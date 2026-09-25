// Agregación del historial de Horas Extras (horas_extra_dias) — mismo patrón
// día/semana/mes/año que src/ventas/ventasDashboardData.js (se reusan sus
// funciones de periodo, son puras e idénticas: la fuente también es diaria).
// A diferencia de Ventas/Balance, acá hacen falta DOS niveles de agrupación:
// por EMPLEADO (para el ranking y las alertas) y por SEDE (para el
// comparativo entre sedes, igual que los demás módulos).

import { GRANULARITIES, periodKeyFor, periodLabel, weekRangeLabel } from '../ventas/ventasDashboardData.js';

export { GRANULARITIES, periodKeyFor, periodLabel, weekRangeLabel };

// Límite legal colombiano de horas extra semanales (Art. 22 Ley 789/2002).
// El corte de "por pasarse" (10h) es una elección razonable a falta de un
// número propio de la empresa — ajustar acá si gerencia da uno oficial.
export const LIMITE_SEMANAL = 12;
export const UMBRAL_ALERTA = 10;

export function horaExtraDelDia(row) {
  return (Number(row.he) || 0) + (Number(row.hen) || 0) + (Number(row.hefd) || 0) + (Number(row.hefn) || 0);
}

export function evaluarAlerta(horasExtraSemana) {
  if (horasExtraSemana > LIMITE_SEMANAL) return 'rojo';
  if (horasExtraSemana >= UMBRAL_ALERTA) return 'amarillo';
  return 'verde';
}

export function aggregateByEmpleado(diaRows, granularity = 'week') {
  const accByEmpleado = new Map(); // empleadoId -> { info, periods: Map(periodKey -> acumulador) }
  diaRows.forEach((row) => {
    const empleadoId = row.empleado_id;
    if (!accByEmpleado.has(empleadoId)) {
      accByEmpleado.set(empleadoId, { info: { empleadoId, nombre: row.empleado_nombre, sedeName: row.sede_name, cargo: row.cargo }, periods: new Map() });
    }
    const entry = accByEmpleado.get(empleadoId);
    // El nombre/sede/cargo más reciente (por fecha) es el que se muestra —
    // un empleado puede cambiar de cargo/sede entre reportes semanales.
    if (!entry.lastFecha || String(row.fecha) > entry.lastFecha) {
      entry.lastFecha = String(row.fecha);
      entry.info = { empleadoId, nombre: row.empleado_nombre, sedeName: row.sede_name, cargo: row.cargo };
    }
    const periodKey = periodKeyFor(row.fecha, granularity);
    if (!entry.periods.has(periodKey)) entry.periods.set(periodKey, { periodKey, horaExtra: 0, total: 0, dias: 0 });
    const acc = entry.periods.get(periodKey);
    acc.horaExtra += horaExtraDelDia(row);
    acc.total += Number(row.total) || 0;
    acc.dias += 1;
  });

  const byEmpleado = new Map();
  const byPeriod = new Map();
  accByEmpleado.forEach((entry, empleadoId) => {
    const points = Array.from(entry.periods.values())
      .map((acc) => ({ ...acc, ...entry.info, periodLabel: periodLabel(acc.periodKey, granularity) }))
      .sort((a, b) => (a.periodKey < b.periodKey ? -1 : 1));
    byEmpleado.set(empleadoId, { ...entry.info, points });
    points.forEach((p) => {
      if (!byPeriod.has(p.periodKey)) byPeriod.set(p.periodKey, []);
      byPeriod.get(p.periodKey).push(p);
    });
  });

  return {
    granularity,
    byEmpleado,
    byPeriod,
    periodKeysSorted: Array.from(byPeriod.keys()).sort(),
    empleadoIds: Array.from(byEmpleado.keys())
  };
}

export function aggregateBySede(diaRows, granularity = 'week') {
  const accBySede = new Map();
  diaRows.forEach((row) => {
    const sedeName = row.sede_name;
    const periodKey = periodKeyFor(row.fecha, granularity);
    if (!accBySede.has(sedeName)) accBySede.set(sedeName, new Map());
    const periods = accBySede.get(sedeName);
    if (!periods.has(periodKey)) periods.set(periodKey, { periodKey, sedeName, horaExtra: 0, total: 0 });
    const acc = periods.get(periodKey);
    acc.horaExtra += horaExtraDelDia(row);
    acc.total += Number(row.total) || 0;
  });

  const bySede = new Map();
  const byPeriod = new Map();
  accBySede.forEach((periods, sedeName) => {
    const points = Array.from(periods.values())
      .map((acc) => ({ ...acc, periodLabel: periodLabel(acc.periodKey, granularity) }))
      .sort((a, b) => (a.periodKey < b.periodKey ? -1 : 1));
    bySede.set(sedeName, points);
    points.forEach((p) => {
      if (!byPeriod.has(p.periodKey)) byPeriod.set(p.periodKey, []);
      byPeriod.get(p.periodKey).push(p);
    });
  });

  return {
    granularity,
    bySede,
    byPeriod,
    periodKeysSorted: Array.from(byPeriod.keys()).sort(),
    sedeNames: Array.from(bySede.keys()).sort()
  };
}

// Última semana ISO (lunes) que ya está COMPLETA dentro de los datos
// cargados — el periodo de un reporte de RH casi nunca cierra justo un
// domingo (ej. "2026-09-01 hasta 2026-09-22", que termina un martes), así
// que la última semana calendario suele venir con solo 1-2 días y subestima
// muchísimo la alerta si se usa tal cual. Se busca la última semana cuyo
// domingo de cierre ya esté dentro del rango de fechas cargado.
function lastCompleteWeek(periodKeysSorted, maxFecha) {
  if (!maxFecha) return periodKeysSorted[periodKeysSorted.length - 1] || null;
  for (let i = periodKeysSorted.length - 1; i >= 0; i--) {
    const start = new Date(periodKeysSorted[i] + 'T00:00:00Z');
    const end = new Date(start); end.setUTCDate(end.getUTCDate() + 6);
    if (end.toISOString().slice(0, 10) <= maxFecha) return periodKeysSorted[i];
  }
  return periodKeysSorted[periodKeysSorted.length - 1] || null;
}

// Estado de alerta de cada empleado en la última semana COMPLETA con datos
// (ver lastCompleteWeek) — independiente de la granularidad elegida en
// pantalla, porque el límite legal (12h) siempre es semanal. `sedeFilter`
// (opcional) limita a una sede.
export function computeAlertas(diaRows, sedeFilter) {
  const rows = sedeFilter ? diaRows.filter((r) => r.sede_name === sedeFilter) : diaRows;
  const data = aggregateByEmpleado(rows, 'week');
  const maxFecha = rows.reduce((max, r) => { const f = String(r.fecha).slice(0, 10); return !max || f > max ? f : max; }, null);
  const lastWeek = lastCompleteWeek(data.periodKeysSorted, maxFecha);
  const alertas = [];
  data.byEmpleado.forEach((entry) => {
    const point = entry.points.find((p) => p.periodKey === lastWeek);
    const horaExtra = point ? point.horaExtra : 0;
    alertas.push({ ...entry, horaExtraSemana: horaExtra, semanaLabel: point ? point.periodLabel : null, nivel: evaluarAlerta(horaExtra) });
  });
  alertas.sort((a, b) => b.horaExtraSemana - a.horaExtraSemana);
  return { lastWeek, alertas };
}

export function findTopEmpleados(diaRows, n = 10) {
  const acc = new Map();
  diaRows.forEach((row) => {
    if (!acc.has(row.empleado_id)) acc.set(row.empleado_id, { empleadoId: row.empleado_id, nombre: row.empleado_nombre, sedeName: row.sede_name, horaExtra: 0 });
    acc.get(row.empleado_id).horaExtra += horaExtraDelDia(row);
  });
  return Array.from(acc.values()).sort((a, b) => b.horaExtra - a.horaExtra).slice(0, n);
}
