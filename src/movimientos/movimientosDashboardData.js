// Agregación del historial de Tabla de Movimientos (todas las sedes, todas
// las semanas guardadas desde Reportes) por semana/mes/año — mismo patrón
// que src/balance/balanceDashboardData.js#aggregateByPeriod: suma
// Disponible/Diferencia KL de las semanas de cada periodo y recalcula
// % Diferencia desde esos totales (promediar los % semanales daría un
// número distinto y menos correcto que diferencia total / disponible total).

export const GRANULARITIES = ['week', 'month', 'year'];

// La API devuelve columnas `date` de Postgres ya serializadas como datetime
// ISO completo (ej. "2026-07-27T05:00:00.000Z", con el desfase de huso
// horario del servidor) — quedarse solo con los primeros 10 caracteres evita
// construir una fecha inválida al concatenar "T00:00:00Z" más abajo.
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

export function periodLabel(periodKey, granularity) {
  if (granularity === 'year' || granularity === 'week') return periodKey;
  const [y, m] = periodKey.split('-');
  const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
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
      periods.set(periodKey, { periodKey, sedeName, disponible: 0, diferenciaKL: 0, weeks: 0, periodStart: w.week_start, periodEnd: w.week_end });
    }
    const acc = periods.get(periodKey);
    acc.disponible += c.totalDisponible || 0;
    acc.diferenciaKL += c.totalDiferencia || 0;
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
        periodLabel: periodLabel(acc.periodKey, granularity),
        periodStart: acc.periodStart, periodEnd: acc.periodEnd, sedeName,
        disponible: acc.disponible, diferenciaKL: acc.diferenciaKL,
        pctDiferencia: acc.disponible === 0 ? 0 : acc.diferenciaKL / acc.disponible,
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
