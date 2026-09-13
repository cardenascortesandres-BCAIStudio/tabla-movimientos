// Cobertura mínima de src/balance/balanceDashboardData.js: no tenía tests
// todavía. Se agrega acá el caso concreto que motivó weekRangeLabel — el
// usuario pidió que el filtro "Fechas" muestre el rango exacto de días de
// cada semana ("semana del 01 al 09 Sep"), no solo la fecha de inicio.
import { describe, it, expect } from 'vitest';
import { aggregateByPeriod, weekRangeLabel } from '../src/balance/balanceDashboardData.js';

describe('balanceDashboardData#weekRangeLabel', () => {
  it('arma el rango completo cuando la semana no cruza de mes', () => {
    expect(weekRangeLabel('2026-09-01', '2026-09-09')).toBe('semana del 01 al 09 Sep');
  });

  it('muestra ambos meses cuando la semana cruza de mes', () => {
    expect(weekRangeLabel('2026-08-31', '2026-09-06')).toBe('semana del 31 Ago al 06 Sep');
  });
});

describe('balanceDashboardData#aggregateByPeriod (granularidad semana)', () => {
  it('usa el week_start/week_end real de la fila (no lunes-a-domingo asumido) para el periodLabel', () => {
    const rows = [
      { sede_name: 'Casona', week_start: '2025-03-17', week_end: '2025-03-23', computed: { totalVentas: 100, totalCompras: 50, utilidadBruta: 50 } }
    ];
    const data = aggregateByPeriod(rows, 'week');
    const point = data.bySede.get('Casona')[0];
    expect(point.periodLabel).toBe('semana del 17 al 23 Mar');
  });
});
