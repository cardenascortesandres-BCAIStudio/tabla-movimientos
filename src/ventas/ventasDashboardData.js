// Agregación del historial de Ventas (todas las sedes, todas las filas
// diarias guardadas) por día/semana/mes/año — mismo patrón que
// src/balance/balanceDashboardData.js#aggregateByPeriod (suma valores del
// periodo, nunca promedia %), pero la fuente aquí ya es diaria (no semanal),
// así que "day" es la granularidad más fina y las demás agrupan hacia arriba.

export const GRANULARITIES = ['day', 'week', 'month', 'year'];

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

// La API devuelve `fecha` (columna date de Postgres) como datetime ISO
// completo (ver la misma nota en balanceDashboardData.js) — quedarse solo con
// los primeros 10 caracteres evita fechas inválidas al parsear.
function dateOnly(fecha) {
  return String(fecha).slice(0, 10);
}

// Lunes de la semana ISO que contiene `fecha` (convención propia para
// agrupar ventas diarias — Balance/Movimientos no la necesitan porque ya
// llegan agregados por semana).
function isoWeekStart(fecha) {
  const iso = dateOnly(fecha);
  const d = new Date(iso + 'T00:00:00Z');
  const dow = d.getUTCDay(); // 0=domingo..6=sábado
  const diffToMonday = dow === 0 ? 6 : dow - 1;
  d.setUTCDate(d.getUTCDate() - diffToMonday);
  return d.toISOString().slice(0, 10);
}

export function periodKeyFor(fecha, granularity) {
  const iso = dateOnly(fecha);
  if (granularity === 'day') return iso;
  if (granularity === 'week') return isoWeekStart(fecha);
  const d = new Date(iso + 'T00:00:00Z');
  const y = d.getUTCFullYear();
  if (granularity === 'year') return String(y);
  return `${y}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function periodLabel(periodKey, granularity) {
  if (granularity === 'year') return periodKey;
  if (granularity === 'day') {
    const d = new Date(periodKey + 'T00:00:00Z');
    return `${String(d.getUTCDate()).padStart(2, '0')} ${MESES[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  }
  if (granularity === 'week') {
    const d = new Date(periodKey + 'T00:00:00Z');
    return `sem. ${String(d.getUTCDate()).padStart(2, '0')} ${MESES[d.getUTCMonth()]}`;
  }
  const [y, m] = periodKey.split('-');
  return `${MESES[parseInt(m, 10) - 1]} ${y}`;
}

export function aggregateByPeriod(diaRows, granularity = 'day') {
  if (!GRANULARITIES.includes(granularity)) throw new Error('granularidad invalida: ' + granularity);

  const accBySede = new Map(); // sedeName -> Map(periodKey -> acumulador)
  diaRows.forEach(row => {
    const sedeName = row.sede_name;
    const periodKey = periodKeyFor(row.fecha, granularity);
    if (!accBySede.has(sedeName)) accBySede.set(sedeName, new Map());
    const periods = accBySede.get(sedeName);
    if (!periods.has(periodKey)) {
      periods.set(periodKey, { periodKey, sedeName, valorVenta: 0, kilos: 0, dias: 0 });
    }
    const acc = periods.get(periodKey);
    acc.valorVenta += Number(row.valor_venta) || 0;
    acc.kilos += Number(row.kilos) || 0;
    acc.dias += 1;
  });

  const bySede = new Map();
  const byPeriod = new Map();
  accBySede.forEach((periods, sedeName) => {
    const points = Array.from(periods.values())
      .map(acc => ({
        periodKey: acc.periodKey, periodLabel: periodLabel(acc.periodKey, granularity), sedeName,
        valorVenta: acc.valorVenta, kilos: acc.kilos, dias: acc.dias
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

export function serializeVentasData(data) {
  return {
    granularity: data.granularity,
    bySede: Array.from(data.bySede.entries()).map(([sedeName, points]) => ({ sedeName, points })),
    byPeriod: Array.from(data.byPeriod.entries()).map(([periodKey, points]) => ({ periodKey, points })),
    periodKeysSorted: data.periodKeysSorted,
    sedeNames: data.sedeNames
  };
}

// Proyección de fin de mes para una sede: usa el ritmo de venta acumulado del
// mes hasta la última fecha con datos reales (no el reloj del navegador, por
// si la carga del día va atrasada) y lo extrapola a los días totales del mes.
export function computeProjection(diaRowsDelMes, anio, mes) {
  if (!diaRowsDelMes.length) return null;
  const acumulado = diaRowsDelMes.reduce((a, r) => a + (Number(r.valor_venta) || 0), 0);
  const ultimaFecha = diaRowsDelMes.reduce((max, r) => {
    const f = dateOnly(r.fecha);
    return !max || f > max ? f : max;
  }, null);
  const diasTranscurridos = new Date(ultimaFecha + 'T00:00:00Z').getUTCDate();
  const diasDelMes = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  const proyeccion = diasTranscurridos > 0 ? (acumulado / diasTranscurridos) * diasDelMes : 0;
  return { acumulado, diasTranscurridos, diasDelMes, ultimaFecha, proyeccion };
}

// El periodo (del granularity elegido) con mayor venta — para "¿cuándo se
// vendió más?". `points` ya viene filtrado a la sede/alcance deseado.
export function findBestPeriod(points) {
  if (!points.length) return null;
  return points.reduce((best, p) => (p.valorVenta > best.valorVenta ? p : best), points[0]);
}
