// Agregación del historial de Auditorías PDV (todas las sedes, todas las
// auditorías guardadas) por semana/mes/año — mismo patrón que
// src/movimientos/movimientosDashboardData.js#aggregateByPeriod: suma ítems
// marcados/totales de las auditorías de cada periodo y recalcula el
// % de cumplimiento desde esos totales, además de un desglose por bloque
// (para detectar qué bloque falla más seguido).

import { AUDIT_BLOCKS } from '../data/auditChecklist.js';

export const GRANULARITIES = ['week', 'month', 'year'];

function dateOnly(d) {
  return String(d).slice(0, 10);
}

export function periodKeyFor(auditDate, granularity) {
  const iso = dateOnly(auditDate);
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

export function aggregateByPeriod(auditRows, granularity = 'week') {
  if (!GRANULARITIES.includes(granularity)) throw new Error('granularidad invalida: ' + granularity);

  const accBySede = new Map(); // sedeName -> Map(periodKey -> acumulador)
  auditRows.forEach(a => {
    const sedeName = a.sede_name;
    const periodKey = periodKeyFor(a.audit_date, granularity);
    if (!accBySede.has(sedeName)) accBySede.set(sedeName, new Map());
    const periods = accBySede.get(sedeName);
    if (!periods.has(periodKey)) {
      periods.set(periodKey, {
        periodKey, sedeName, totalItems: 0, checkedItems: 0, audits: 0,
        blockTotals: {}, blockChecked: {}, periodStart: a.audit_date, periodEnd: a.audit_date
      });
    }
    const acc = periods.get(periodKey);
    acc.totalItems += a.total_items || 0;
    acc.checkedItems += a.checked_items || 0;
    acc.audits += 1;
    const items = a.items || {};
    Object.entries(items).forEach(([blockId, block]) => {
      const checks = (block && block.checks) || [];
      acc.blockTotals[blockId] = (acc.blockTotals[blockId] || 0) + checks.length;
      acc.blockChecked[blockId] = (acc.blockChecked[blockId] || 0) + checks.filter(Boolean).length;
    });
    if (a.audit_date && a.audit_date < acc.periodStart) acc.periodStart = a.audit_date;
    if (a.audit_date && a.audit_date > acc.periodEnd) acc.periodEnd = a.audit_date;
  });

  const bySede = new Map();
  const byPeriod = new Map();
  accBySede.forEach((periods, sedeName) => {
    const points = Array.from(periods.values())
      .map(acc => ({
        periodKey: acc.periodKey,
        periodLabel: periodLabel(acc.periodKey, granularity),
        periodStart: acc.periodStart, periodEnd: acc.periodEnd, sedeName,
        totalItems: acc.totalItems, checkedItems: acc.checkedItems,
        pctCumplimiento: acc.totalItems === 0 ? 0 : acc.checkedItems / acc.totalItems,
        audits: acc.audits,
        blockPct: Object.fromEntries(
          Object.keys(acc.blockTotals).map(bid => [bid, acc.blockTotals[bid] === 0 ? 0 : acc.blockChecked[bid] / acc.blockTotals[bid]])
        )
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

// Combina blockPct de varios puntos (ej. todos los de un periodo, o todos los
// visibles con el filtro actual) en un solo promedio ponderado por ítems —
// usado para el gráfico "cumplimiento por bloque".
export function combineBlockPct(points) {
  const totals = {}, checked = {};
  points.forEach(p => {
    AUDIT_BLOCKS.forEach(b => {
      const bid = String(b.id);
      const pct = p.blockPct[bid];
      if (pct == null) return;
      // reconstruye aproximadamente checked/total del bloque a partir del %
      // guardado en el punto (ya viene agregado); como no tenemos el total
      // exacto del bloque en el punto combinado, usamos el número de ítems
      // del bloque (fijo, definido en AUDIT_BLOCKS) por auditoría contada.
      const blockSize = b.items.length;
      totals[bid] = (totals[bid] || 0) + blockSize * p.audits;
      checked[bid] = (checked[bid] || 0) + pct * blockSize * p.audits;
    });
  });
  return Object.fromEntries(AUDIT_BLOCKS.map(b => {
    const bid = String(b.id);
    const t = totals[bid] || 0;
    return [bid, t === 0 ? null : checked[bid] / t];
  }));
}
