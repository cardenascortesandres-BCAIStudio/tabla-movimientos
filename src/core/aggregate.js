// Agrupación de columnas por tipo (con overrides manuales aplicados) y cálculo
// de los totales de fila/categoría/gran total (las mismas fórmulas que se
// escriben luego en el Excel exportado — ver src/export/excelExport.js).

export function groupColumns(movementCols) {
  const groups = { compra: [], dev_compra: [], entrada: [], venta: [], dev_venta: [], salida: [], transformacion: [] };
  const invInicialCols = [];
  const invFinalCols = [];
  movementCols.forEach(mc => {
    const t = mc.manualOverride || mc.type;
    if (t === 'ignore') return;
    if (t === 'inv_inicial') { invInicialCols.push(mc); return; }
    if (t === 'inv_final') { invFinalCols.push(mc); return; }
    if (groups[t]) groups[t].push(mc);
  });
  return { groups, invInicialCols, invFinalCols };
}

export function computeRowTotals(values, colGroups) {
  const sum = (cols) => cols.reduce((acc, mc) => acc + (values[mc.colIndex] || 0), 0);
  const invInicial = sum(colGroups.invInicialCols);
  const invFinal = sum(colGroups.invFinalCols);
  const totalCompras = sum(colGroups.groups.compra) - sum(colGroups.groups.dev_compra);
  const totalEntradas = sum(colGroups.groups.entrada);
  const totalVenta = sum(colGroups.groups.venta) - sum(colGroups.groups.dev_venta);
  const totalSalida = sum(colGroups.groups.salida);
  const transformaciones = sum(colGroups.groups.transformacion);
  const teorico = invInicial + totalCompras + totalEntradas - totalVenta - totalSalida + transformaciones;
  const disponible = invInicial + totalCompras + totalEntradas;
  const diferenciaKL = invFinal - teorico;
  return { invInicial, invFinal, totalCompras, totalEntradas, totalVenta, totalSalida, transformaciones, teorico, disponible, diferenciaKL };
}

export function computeAggregate(items, colGroups) {
  let totals = null;
  const raw = {};
  items.forEach(it => {
    const t = computeRowTotals(it.values, colGroups);
    totals = totals ? sumInto(totals, t) : Object.assign({}, t);
    Object.keys(it.values).forEach(k => { raw[k] = (raw[k] || 0) + it.values[k]; });
  });
  if (!totals) {
    totals = { invInicial: 0, invFinal: 0, totalCompras: 0, totalEntradas: 0, totalVenta: 0, totalSalida: 0, transformaciones: 0, teorico: 0, disponible: 0, diferenciaKL: 0 };
  }
  return { totals, raw };
}

function sumInto(acc, t) { Object.keys(t).forEach(k => acc[k] = (acc[k] || 0) + t[k]); return acc; }
