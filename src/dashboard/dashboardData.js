// Agregación consolidada de todas las sedes cargadas, para el panel
// comparativo y para el informe HTML interactivo exportable.

export function computeDashboardData(sedes) {
  const bySede = sedes.filter(s => s.reportPlan).map(ctx => ({
    sedeName: ctx.sedeName,
    totals: ctx.reportPlan.grandAgg.totals
  }));

  const byCategory = new Map();
  const allProductRows = [];

  sedes.forEach(ctx => {
    if (!ctx.reportPlan) return;
    ctx.reportPlan.sections.forEach(sec => {
      if (!byCategory.has(sec.category)) byCategory.set(sec.category, { disponible: 0, diferenciaKL: 0 });
      const agg = byCategory.get(sec.category);
      agg.disponible += sec.catAgg.totals.disponible;
      agg.diferenciaKL += sec.catAgg.totals.diferenciaKL;
      sec.itemsAgg.forEach(entry => {
        const catDisp = sec.catAgg.totals.disponible;
        const pct = catDisp === 0 ? 0 : entry.totals.diferenciaKL / catDisp;
        allProductRows.push({
          sede: ctx.sedeName, category: sec.category, code: entry.item.code, name: entry.item.name,
          diferenciaKL: entry.totals.diferenciaKL, disponible: entry.totals.disponible, pct
        });
      });
    });
  });

  const totalDisponible = bySede.reduce((a, s) => a + s.totals.disponible, 0);
  const totalDiferencia = bySede.reduce((a, s) => a + s.totals.diferenciaKL, 0);
  const totalProductosNeg = allProductRows.filter(p => p.diferenciaKL < -0.01).length;

  return { bySede, byCategory, allProductRows, totalDisponible, totalDiferencia, totalProductosNeg };
}

// Versión serializable (Map -> objeto) para embeber como JSON en el informe HTML exportable.
export function serializeDashboardData(data) {
  return {
    bySede: data.bySede,
    byCategory: Array.from(data.byCategory.entries()).map(([category, v]) => ({ category, ...v })),
    allProductRows: data.allProductRows,
    totalDisponible: data.totalDisponible,
    totalDiferencia: data.totalDiferencia,
    totalProductosNeg: data.totalProductosNeg
  };
}
