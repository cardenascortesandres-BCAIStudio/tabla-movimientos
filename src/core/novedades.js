// Detección de "novedades" de inventario: productos cuyo % Diferencia (misma
// regla que el resto del sistema — Diferencia KL de la fila ÷ Disponible de SU
// CATEGORÍA, ver aggregate.js) supera el umbral en cualquier dirección. Se
// marcan como "Faltante" (diferencia negativa) o "Sobrante" (diferencia
// positiva). No hay curación manual: es automático y determinista sobre datos
// ya calculados, nada se inventa.

export function computeNovedades(sections, thresholdPct = 0.04) {
  const novedades = [];
  sections.forEach(sec => {
    const catDisponible = sec.catAgg.totals.disponible;
    sec.itemsAgg.forEach(entry => {
      const diferenciaKL = entry.totals.diferenciaKL;
      const pctDiferencia = catDisponible === 0 ? 0 : diferenciaKL / catDisponible;
      if (Math.abs(pctDiferencia) > thresholdPct) {
        novedades.push({
          code: entry.item.code,
          name: entry.item.name,
          category: sec.category,
          diferenciaKL,
          pctDiferencia,
          novedad: diferenciaKL < 0 ? 'Faltante' : 'Sobrante'
        });
      }
    });
  });
  return novedades;
}
