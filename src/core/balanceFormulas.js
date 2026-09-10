// Fórmulas puras del Balance semanal — mismo estilo que aggregate.js: sumar
// primero (netBucketSide), luego un bloque de aritmética plana, con guarda
// de división por cero en el margen.

export const TRASLADO_BUCKETS = ['planta_acopio', 'salsamentaria', 'puntos_venta', 'planta_pollo', 'consumo_interno'];

// blocks: [{ label, valor, bucket, side, isDevolucion }] ya clasificados
// (ver tipoDoctoClassify.js). Una devolución resta dentro de su mismo
// balde+lado (ej. Compras - Devolución de Compras, Electrónica - Devolución
// de Venta electrónica).
export function netBucketSide(blocks, bucket, side) {
  return blocks
    .filter(b => b.bucket === bucket && b.side === side)
    .reduce((sum, b) => sum + (b.isDevolucion ? -b.valor : b.valor), 0);
}

export function computeTotales(blocks) {
  const electronica = netBucketSide(blocks, 'electronica_compras', 'venta');
  const compras = netBucketSide(blocks, 'electronica_compras', 'compra');

  const traslados = {};
  let trasladosVenta = 0, trasladosCompra = 0;
  for (const bucket of TRASLADO_BUCKETS) {
    const venta = netBucketSide(blocks, bucket, 'venta');
    const compra = netBucketSide(blocks, bucket, 'compra');
    traslados[bucket] = { venta, compra };
    trasladosVenta += venta;
    trasladosCompra += compra;
  }

  const totalVentas = electronica + trasladosVenta;
  const totalCompras = compras + trasladosCompra;
  return { electronica, compras, traslados, totalVentas, totalCompras };
}

// Semana N usa el Inventario Final de la semana N-1 si ya existe historial
// guardado para la sede (encadenado automático); si es la primera semana que
// se registra para esa sede (sin historial), usa el valor que el usuario
// escribió a mano — cada sede arranca en un punto distinto, no hay forma de
// adivinarlo desde el archivo.
export function computeInventarioInicial(prevWeekInvFinal, manualInvInicial) {
  return typeof prevWeekInvFinal === 'number' ? prevWeekInvFinal : (manualInvInicial || 0);
}

export function computeCMV({ invInicial, totalCompras, invFinal }) {
  return invInicial + totalCompras - invFinal;
}

// El +1.046 es un ajuste fijo que la empresa siempre incluye en esta
// operación (confirmado explícitamente por el usuario — no es un residuo de
// redondeo de una sola semana, va en la fórmula todas las semanas).
export function computeUtilidadBruta({ totalVentas, cmv }) {
  return totalVentas - cmv + 1.046;
}

export function computeMargenPct({ utilidadBruta, totalVentas }) {
  return totalVentas === 0 ? 0 : utilidadBruta / totalVentas;
}

// Orden y título de cada sección — igual orden que las filas de la hoja
// "Balance" (Ventas primero, luego Compras), para que la hoja de datos y la
// vista previa en pantalla sean fáciles de cruzar contra el balance.
export const VENTA_SECTIONS = [
  { bucket: 'electronica_compras', side: 'venta', title: 'VENTAS · ELECTRÓNICA' },
  { bucket: 'planta_acopio', side: 'venta', title: 'VENTAS · PLANTA ACOPIO' },
  { bucket: 'salsamentaria', side: 'venta', title: 'VENTAS · SALSAMENTARIA' },
  { bucket: 'puntos_venta', side: 'venta', title: 'VENTAS · PUNTOS DE VENTA' },
  { bucket: 'planta_pollo', side: 'venta', title: 'VENTAS · PLANTA POLLO' },
  { bucket: 'consumo_interno', side: 'venta', title: 'VENTAS · CONSUMO INTERNO' }
];
export const COMPRA_SECTIONS = [
  { bucket: 'electronica_compras', side: 'compra', title: 'COMPRAS · COMPRAS' },
  { bucket: 'planta_acopio', side: 'compra', title: 'COMPRAS · PLANTA ACOPIO' },
  { bucket: 'salsamentaria', side: 'compra', title: 'COMPRAS · SALSAMENTARIA' },
  { bucket: 'puntos_venta', side: 'compra', title: 'COMPRAS · PUNTOS DE VENTA' },
  { bucket: 'planta_pollo', side: 'compra', title: 'COMPRAS · PLANTA POLLO' }
];
export const ALL_SECTIONS = [...VENTA_SECTIONS, ...COMPRA_SECTIONS];

// Agrupa los bloques clasificados en las mismas secciones/orden que la hoja
// "Balance", juntando cada base con sus devoluciones (base primero,
// devoluciones después) para poder mostrar "compra menos devolución" (o
// "venta menos devolución") como un solo neto — tanto en la vista previa de
// la app como en la hoja "Datos" del Excel exportado. Compartido para que
// las dos vistas queden siempre organizadas igual.
export function groupBlocksIntoSections(blocks) {
  const sections = ALL_SECTIONS.map(def => {
    const members = blocks.filter(b => b.bucket === def.bucket && b.side === def.side);
    if (!members.length) return null;
    const ordered = [...members.filter(b => !b.isDevolucion), ...members.filter(b => b.isDevolucion)];
    return { ...def, members: ordered, net: netBucketSide(blocks, def.bucket, def.side), isNetted: ordered.length > 1 };
  }).filter(Boolean);

  const otros = blocks.filter(b => !b.bucket);
  return { sections, otros };
}

// Conveniencia: corre las 4 fórmulas encadenadas de una vez a partir de los
// bloques ya clasificados + el inventario inicial/final ya resueltos.
export function computeBalance({ blocks, invInicial, invFinal }) {
  const { electronica, compras, traslados, totalVentas, totalCompras } = computeTotales(blocks);
  const cmv = computeCMV({ invInicial, totalCompras, invFinal });
  const utilidadBruta = computeUtilidadBruta({ totalVentas, cmv });
  const margenPct = computeMargenPct({ utilidadBruta, totalVentas });
  return { electronica, compras, traslados, totalVentas, totalCompras, invInicial, invFinal, cmv, utilidadBruta, margenPct };
}
