// Construye el layout de columnas de salida (dinámico según lo que traiga
// cada sede): Código, Detalle, Inventario Inicial, bloques de columnas crudas
// por tipo, totales calculados, Teórico, Disponible, Inventario Final,
// Diferencia KL, % Diferencia.
//
// El orden aquí definido es la única fuente de verdad tanto para la tabla en
// pantalla como para el Excel exportado (los "bloques" contiguos permiten
// generar fórmulas SUM(rango) sin tener que recalcular posiciones dos veces).

import { groupColumns } from '../core/aggregate.js';

export function buildColumnLayout(movementCols) {
  const colGroups = groupColumns(movementCols);
  const cols = [];
  const blocks = {};

  cols.push({ key: 'code', label: 'Código', kind: 'code' });
  cols.push({ key: 'producto', label: 'Detalle', kind: 'text' });
  cols.push({ key: 'invInicial', label: 'Inventario Inicial', kind: 'invInicial' });

  // "subgroups" separa las columnas base ("compra"/"venta") de sus devoluciones
  // dentro del mismo bloque contiguo — quedan una al lado de la otra en el
  // Excel, pero el TOTAL se calcula como base MENOS devolución (no una suma),
  // así que hace falta poder generar dos rangos SUM() distintos por bloque.
  function pushBlock(name, subgroups) {
    const start = cols.length;
    subgroups.forEach(([subName, arr]) => {
      arr.forEach(mc => cols.push({ key: 'raw_' + mc.colIndex, label: mc.header || '(sin nombre)', kind: 'raw', colIndex: mc.colIndex, group: name, subgroup: subName }));
    });
    const end = cols.length - 1;
    blocks[name] = end >= start ? { start, end } : { start: -1, end: -1 };
  }

  pushBlock('compra', [['base', colGroups.groups.compra], ['dev', colGroups.groups.dev_compra]]);
  cols.push({ key: 'totalCompras', label: 'TOTAL COMPRAS', kind: 'totalCompras' });
  pushBlock('entrada', [['base', colGroups.groups.entrada]]);
  cols.push({ key: 'totalEntradas', label: 'TOTAL ENTRADAS', kind: 'totalEntradas' });
  pushBlock('venta', [['base', colGroups.groups.venta], ['dev', colGroups.groups.dev_venta]]);
  cols.push({ key: 'totalVenta', label: 'TOTAL VENTA', kind: 'totalVenta' });
  pushBlock('salida', [['base', colGroups.groups.salida]]);
  cols.push({ key: 'totalSalida', label: 'TOTAL SALIDA', kind: 'totalSalida' });
  pushBlock('transformacion', [['base', colGroups.groups.transformacion]]);

  cols.push({ key: 'teorico', label: 'TEÓRICO', kind: 'teorico' });
  cols.push({ key: 'invFinal', label: 'Inventario Final', kind: 'invFinal' });
  cols.push({ key: 'disponible', label: 'DISPONIBLE', kind: 'disponible' });
  cols.push({ key: 'diferenciaKL', label: 'DIFERENCIA KL', kind: 'diferenciaKL' });
  cols.push({ key: 'pctDiferencia', label: '% DIFERENCIA', kind: 'pctDiferencia' });

  return { cols, blocks, colGroups };
}
