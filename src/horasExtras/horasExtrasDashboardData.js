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

// Anomalías de un día — a pedido explícito del usuario, para identificarlas
// "de inmediato" visualmente (no solo al leer la cifra con calma):
// - turnoDoble: el día tiene un 3er par de marcaciones (entrada3/salida3),
//   es decir el PDF trajo una "fila de continuación" para ese día — un
//   segundo turno el mismo día calendario (típicamente nocturno, cruzando
//   medianoche), que "no debería pasar" según el usuario.
// - horaNocturna: el día generó horas extra NOCTURNAS (Hen y/o Hefn) — el
//   usuario las marcó como anormales por sí solas, incluso sin turno doble.
export function diaAnomalias(row) {
  const turnoDoble = Boolean(row.entrada3 || row.salida3 || row.entrada4 || row.salida4);
  const horaNocturna = (Number(row.hen) || 0) > 0 || (Number(row.hefn) || 0) > 0;
  return { turnoDoble, horaNocturna, alguna: turnoDoble || horaNocturna };
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
    if (!entry.periods.has(periodKey)) entry.periods.set(periodKey, { periodKey, horaExtra: 0, he: 0, hen: 0, hefd: 0, hefn: 0, total: 0, dias: 0 });
    const acc = entry.periods.get(periodKey);
    acc.he += Number(row.he) || 0; acc.hen += Number(row.hen) || 0; acc.hefd += Number(row.hefd) || 0; acc.hefn += Number(row.hefn) || 0;
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

// "Corte de quincena" — 1ª quincena = días 1 al 15, 2ª = 16 al cierre del
// mes. Gestión Humana parte el mes así para el consolidado mensual (no
// depende de cómo vengan repartidos los PDF: un mismo PDF puede cruzar la
// mitad del mes sin problema, porque esto se calcula por el día exacto de
// cada fila ya guardada, no por el rango del archivo de origen).
export function quincenaOfFecha(fecha) {
  const day = new Date(String(fecha).slice(0, 10) + 'T00:00:00Z').getUTCDate();
  return day <= 15 ? 1 : 2;
}

// El cargo crudo (campo de texto libre del sistema de nómina/PDF de RH) trae
// variantes del mismo puesto escritas distinto — con/sin guion, con/sin "DE
// CARNES", un punto de más, etc. — confirmado revisando los 20 valores
// reales que existen hoy en horas_extra_dias. Se normaliza (mayúsculas, sin
// puntos finales, guion -> espacio, espacios repetidos colapsados) y se
// mapea a las categorías limpias que ya usa Gestión Humana en su consolidado
// mensual a mano, decididas junto con el usuario cargo por cargo (los 5
// ambiguos sin un cargo crudo obvio se confirmaron uno por uno).
function normCargoKey(cargo) {
  return String(cargo || '').trim().toUpperCase().replace(/\.+$/, '').replace(/-\s*/g, ' ').replace(/\s+/g, ' ').trim();
}
const CARGO_LABEL_ALIASES = {
  'AUXILIAR OPERATIVO CORTADOR': 'Cortadores',
  'AUXILIAR OPERATIVO CORTADOR DE CARNES': 'Cortadores',
  'AUXILIAR DE CARNES': 'Cortadores',
  'AUXILIAR OPERATIVO CAJERO': 'Cajeras',
  'CAJERA': 'Cajeras',
  'CAJERO PUNTO DE VENTAS': 'Cajeras',
  'COORDINADOR PUNTO DE VENTA': 'Coordinador',
  'SUPERVISOR PUNTO DE VENTA': 'Coordinador',
  'AUXILIAR OPERATIVO MENSAJERO': 'Mensajeros',
  'AUXILIAR OPERATIVO SALSAMENTARIA': 'Salsamentaria',
  'AUXILIAR OPERATIVO SERV GENERALES': 'Servicios Generales',
  'AUXILIAR OPERATIVO': 'Servicio al Cliente',
  'ADMINISTRADOR PUNTO DE VENTA': 'Administrador',
  'AUXILIAR DE INVENTARIOS': 'Minimarket',
  'MERCA IMPULSADOR': 'Merca-Impulsador',
};
export function normalizeCargoLabel(cargoRaw) {
  if (!cargoRaw) return 'Sin cargo';
  const key = normCargoKey(cargoRaw);
  return CARGO_LABEL_ALIASES[key] || cargoRaw.trim();
}

// "Por cargo y quincena" — reproduce el consolidado mensual que Gestión
// Humana arma a mano (ver scripts/analisis, archivo real "Horas Extras
// Octubre 2026.xlsx"): horas extra por Cargo, partidas en 1ª/2ª quincena.
// Mismo criterio que usan a mano: la hora NOCTURNA (hen/hefn) NO se suma al
// cargo del empleado, se lleva aparte a una fila "Extras Nocturnas" (igual
// para todos los cargos) — confirmado contra el archivo real: la suma de
// todas las filas de un punto, incluida "Extras Nocturnas", da exacto el
// gran total de esa sede, sin doble conteo.
export function aggregateHorasByCargoQuincena(diaRows, sedeFilter) {
  const rows = sedeFilter ? diaRows.filter((r) => r.sede_name === sedeFilter) : diaRows;
  const byCargo = new Map(); // cargo -> { cargo, q1, q2, total }
  const addTo = (cargo, q, horas) => {
    if (!byCargo.has(cargo)) byCargo.set(cargo, { cargo, q1: 0, q2: 0, total: 0 });
    const acc = byCargo.get(cargo);
    if (q === 1) acc.q1 += horas; else acc.q2 += horas;
    acc.total += horas;
  };
  rows.forEach((row) => {
    const q = quincenaOfFecha(row.fecha);
    const diurna = (Number(row.he) || 0) + (Number(row.hefd) || 0);
    const nocturna = (Number(row.hen) || 0) + (Number(row.hefn) || 0);
    if (diurna > 0) addTo(normalizeCargoLabel(row.cargo), q, diurna);
    if (nocturna > 0) addTo('Extras Nocturnas', q, nocturna);
  });
  const cargos = Array.from(byCargo.values()).sort((a, b) => b.total - a.total);
  const totalQ1 = cargos.reduce((a, c) => a + c.q1, 0);
  const totalQ2 = cargos.reduce((a, c) => a + c.q2, 0);
  return { cargos, totalQ1, totalQ2, total: totalQ1 + totalQ2 };
}

export function findTopEmpleados(diaRows, n = 10) {
  const acc = new Map();
  diaRows.forEach((row) => {
    if (!acc.has(row.empleado_id)) acc.set(row.empleado_id, { empleadoId: row.empleado_id, nombre: row.empleado_nombre, sedeName: row.sede_name, horaExtra: 0 });
    acc.get(row.empleado_id).horaExtra += horaExtraDelDia(row);
  });
  return Array.from(acc.values()).sort((a, b) => b.horaExtra - a.horaExtra).slice(0, n);
}

// Tipos de hora que trae el PDF de RH. Los 4 primeros son HORA EXTRA (los que
// cuentan contra el límite); el resto son horas ordinarias/recargos de la jornada.
export const TIPOS_HORA_EXTRA = [['he', 'Extra diurna'], ['hen', 'Extra nocturna'], ['hefd', 'Extra festiva diurna'], ['hefn', 'Extra festiva nocturna']];
export const TIPOS_HORA_OTROS = [['hdo', 'Ordinarias diurnas'], ['rn', 'Recargo nocturno'], ['rndyf', 'Recargo nocturno dominical/festivo'], ['dom', 'Dominical'], ['d', 'Descanso'], ['f', 'Festivo'], ['comida', 'Comida']];

// Total de cada tipo de hora en un conjunto de filas diarias (+ extra total y horas trabajadas).
export function sumDesglose(rows) {
  const out = { extra: 0, total: 0 };
  [...TIPOS_HORA_EXTRA, ...TIPOS_HORA_OTROS].forEach(([k]) => { out[k] = 0; });
  rows.forEach((r) => {
    [...TIPOS_HORA_EXTRA, ...TIPOS_HORA_OTROS].forEach(([k]) => { out[k] += Number(r[k]) || 0; });
    out.total += Number(r.total) || 0;
  });
  out.extra = out.he + out.hen + out.hefd + out.hefn;
  return out;
}
