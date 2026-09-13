// Agregación del historial de Balance (todas las sedes, todas las semanas
// guardadas) para el informe HTML comparativo — a diferencia de
// src/dashboard/dashboardData.js, esto no lee `app.sedes` en memoria: lee el
// historial persistido (ver src/balance/balanceApi.js), porque las semanas
// de Balance llegan una por una a lo largo de meses, no todas en una sesión.

export function computeBalanceDashboardData(weekRows) {
  const bySede = new Map();
  const byWeek = new Map();

  weekRows.forEach(w => {
    const sedeName = w.sede_name;
    const c = w.computed || {};
    const point = {
      weekKey: w.week_key, weekStart: w.week_start, weekEnd: w.week_end, sedeName,
      margenPct: c.margenPct || 0, utilidadBruta: c.utilidadBruta || 0,
      totalVentas: c.totalVentas || 0, totalCompras: c.totalCompras || 0
    };
    if (!bySede.has(sedeName)) bySede.set(sedeName, []);
    bySede.get(sedeName).push(point);
    if (!byWeek.has(w.week_key)) byWeek.set(w.week_key, []);
    byWeek.get(w.week_key).push(point);
  });

  bySede.forEach(points => points.sort((a, b) => (a.weekKey < b.weekKey ? -1 : 1)));
  const weekKeysSorted = Array.from(byWeek.keys()).sort();
  const sedeNames = Array.from(bySede.keys()).sort();

  return { bySede, byWeek, weekKeysSorted, sedeNames };
}

// Versión serializable (Map -> arreglo) para embeber como JSON en el informe HTML.
export function serializeBalanceDashboardData(data) {
  return {
    bySede: Array.from(data.bySede.entries()).map(([sedeName, points]) => ({ sedeName, points })),
    byWeek: Array.from(data.byWeek.entries()).map(([weekKey, points]) => ({ weekKey, points })),
    weekKeysSorted: data.weekKeysSorted,
    sedeNames: data.sedeNames
  };
}

// ---------------------------------------------------------------------------
// Reportes (apartado nuevo): agregación por semana/mes/año para comparar
// margen y utilidad en el tiempo. A diferencia de computeBalanceDashboardData
// (que solo agrupa semanas sueltas, usado por el informe de una sola semana),
// esto SUMA ventas/compras/utilidad de las semanas que caen en cada periodo y
// recalcula margenPct desde esos totales — promediar los % semanales daría un
// número distinto (y menos correcto) que margen = utilidad total / ventas totales.
export const GRANULARITIES = ['week', 'month', 'year'];

// weekStart puede llegar como "YYYY-MM-DD" (fixture/tests) o como timestamp
// ISO completo con hora/zona (así serializa `pg` una columna `date` al pasar
// por JSON, ej. "2023-11-27T05:00:00.000Z") — se normaliza a solo la fecha
// antes de parsear para no romper new Date() concatenando dos veces la hora.
function dateOnly(weekStart) {
  return String(weekStart).slice(0, 10);
}

export function periodKeyFor(weekStart, granularity) {
  const iso = dateOnly(weekStart);
  if (granularity === 'week') return iso;
  const d = new Date(iso + 'T00:00:00Z');
  const y = d.getUTCFullYear();
  if (granularity === 'year') return String(y);
  return `${y}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

// "semana del 01 al 09 Sep" (o "semana del 30 Ago al 05 Sep" si cruza de
// mes) — a pedido explícito del usuario, para saber de un vistazo qué rango
// de días exactos cubre la semana seleccionada en el filtro "Fechas". Usa
// week_start/week_end REALES (no se asume lunes-a-domingo: cada sede cuenta
// su semana en un día distinto — ver la nota sobre esto en el resto del
// proyecto).
export function weekRangeLabel(weekStart, weekEnd) {
  const s = new Date(dateOnly(weekStart) + 'T00:00:00Z');
  const e = new Date(dateOnly(weekEnd) + 'T00:00:00Z');
  const sDay = String(s.getUTCDate()).padStart(2, '0'), eDay = String(e.getUTCDate()).padStart(2, '0');
  const sMon = cap(MESES[s.getUTCMonth()]), eMon = cap(MESES[e.getUTCMonth()]);
  return sMon === eMon ? `semana del ${sDay} al ${eDay} ${sMon}` : `semana del ${sDay} ${sMon} al ${eDay} ${eMon}`;
}

export function periodLabel(periodKey, granularity) {
  if (granularity === 'year') return periodKey;
  if (granularity === 'week') return periodKey; // ver weekRangeLabel: aggregateByPeriod la usa cuando tiene week_end real
  const [y, m] = periodKey.split('-');
  return `${MESES[parseInt(m, 10) - 1]} ${y}`;
}

export function aggregateByPeriod(weekRows, granularity = 'week') {
  if (!GRANULARITIES.includes(granularity)) throw new Error('granularidad invalida: ' + granularity);

  const accBySede = new Map(); // sedeName -> Map(periodKey -> acumulador)
  weekRows.forEach(w => {
    const sedeName = w.sede_name;
    const c = w.computed || {};
    const periodKey = periodKeyFor(w.week_start, granularity);
    if (!accBySede.has(sedeName)) accBySede.set(sedeName, new Map());
    const periods = accBySede.get(sedeName);
    if (!periods.has(periodKey)) {
      periods.set(periodKey, {
        periodKey, sedeName, totalVentas: 0, totalCompras: 0, utilidadBruta: 0,
        weeks: 0, periodStart: w.week_start, periodEnd: w.week_end
      });
    }
    const acc = periods.get(periodKey);
    acc.totalVentas += c.totalVentas || 0;
    acc.totalCompras += c.totalCompras || 0;
    acc.utilidadBruta += c.utilidadBruta || 0;
    acc.weeks += 1;
    if (w.week_start && (!acc.periodStart || w.week_start < acc.periodStart)) acc.periodStart = w.week_start;
    if (w.week_end && (!acc.periodEnd || w.week_end > acc.periodEnd)) acc.periodEnd = w.week_end;
  });

  const bySede = new Map();
  const byPeriod = new Map();
  accBySede.forEach((periods, sedeName) => {
    const points = Array.from(periods.values())
      .map(acc => ({
        periodKey: acc.periodKey,
        periodLabel: (granularity === 'week' && acc.periodStart && acc.periodEnd)
          ? weekRangeLabel(acc.periodStart, acc.periodEnd)
          : periodLabel(acc.periodKey, granularity),
        periodStart: acc.periodStart, periodEnd: acc.periodEnd, sedeName,
        totalVentas: acc.totalVentas, totalCompras: acc.totalCompras, utilidadBruta: acc.utilidadBruta,
        margenPct: acc.totalVentas === 0 ? 0 : acc.utilidadBruta / acc.totalVentas,
        weeks: acc.weeks
      }))
      .sort((a, b) => (a.periodKey < b.periodKey ? -1 : 1));
    bySede.set(sedeName, points);
    points.forEach(p => {
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

export function serializeReportesData(data) {
  return {
    granularity: data.granularity,
    bySede: Array.from(data.bySede.entries()).map(([sedeName, points]) => ({ sedeName, points })),
    byPeriod: Array.from(data.byPeriod.entries()).map(([periodKey, points]) => ({ periodKey, points })),
    periodKeysSorted: data.periodKeysSorted,
    sedeNames: data.sedeNames
  };
}
