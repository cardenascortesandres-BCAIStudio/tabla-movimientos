// Clasificación de columnas de movimiento, según las reglas de prioridad del
// prompt maestro original. Ver README para la lista completa de reglas.

import { normText } from './normalize.js';

export const TYPE_LABELS = {
  inv_inicial: 'Inventario Inicial',
  inv_final: 'Inventario Final',
  transformacion: 'Transformación',
  compra: 'Compra',
  dev_compra: 'Devolución de Compra',
  entrada: 'Entrada',
  venta: 'Venta',
  dev_venta: 'Devolución de Venta',
  salida: 'Salida',
  unrecognized: 'No reconocida',
  ignore: 'Ignorar esta columna'
};

export function classifyHeader(headerRaw) {
  const h = normText(headerRaw);
  if (!h) return { type: 'unrecognized', reason: 'sin encabezado de texto' };

  if (h.includes('INVENTARIO') && h.includes('INICIAL')) return { type: 'inv_inicial' };
  if (h.includes('INVENTARIO') && h.includes('FINAL')) return { type: 'inv_final' };
  if (h.includes('TRANSFORMACION')) return { type: 'transformacion' };

  // "DEVOLUCION" completo, o las siglas abreviadas que también se usan en
  // los archivos reales: "DV" (devolución) y "NC" (nota crédito) — ambas
  // se restan de compras/ventas igual que una devolución completa.
  if (h.includes('DEVOLUCION') || /\bDV\b/.test(h) || /\bNC\b/.test(h)) {
    if (h.includes('VENTA') || h.includes('FACTURA') || h.includes('POS')) return { type: 'dev_venta' };
    if (h.includes('COMPRA')) return { type: 'dev_compra' };
    return { type: 'dev_venta', uncertain: true };
  }

  if (h.includes('COMPRA')) return { type: 'compra' };
  if (h.includes('ENTRADA')) return { type: 'entrada' };
  if (h.includes('SALIDA') || h === 'CONSUMO INTERNO') return { type: 'salida' };
  if (h.includes('VENTA') || h.includes('FACTURA')) return { type: 'venta' };

  return { type: 'unrecognized' };
}
