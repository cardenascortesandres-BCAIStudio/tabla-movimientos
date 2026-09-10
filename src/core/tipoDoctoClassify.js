// Clasificación de cada etiqueta de "Tipo Docto" del Archivo A en uno de los
// 6 baldes fijos del Balance. Heurística de partida por palabras clave, en
// el mismo estilo de cadena de prioridades que classify.js — SIEMPRE
// corregible en la pantalla de revisión, nunca un mapeo silencioso: se
// confirmó con un caso real que la palabra clave sola no basta (la etiqueta
// "SALIDA DECEPAZ A PLANTA" contiene "PLANTA" pero el usuario la clasifica
// bajo Puntos de Venta, no Planta Acopio).

import { normText } from './normalize.js';

export const BALANCE_BUCKETS = ['electronica_compras', 'planta_acopio', 'salsamentaria', 'puntos_venta', 'planta_pollo', 'consumo_interno'];

export const BALANCE_BUCKET_LABELS = {
  electronica_compras: 'Electrónica / Compras',
  planta_acopio: 'Planta Acopio',
  salsamentaria: 'Salsamentaría (Planta Procesados)',
  puntos_venta: 'Puntos de Venta',
  planta_pollo: 'Planta Pollo',
  consumo_interno: 'Consumo Interno'
};

// Nombres de sedes/puntos de venta conocidos: cualquier etiqueta de traslado
// (ENTRADA/SALIDA) que mencione uno de estos nombres se agrupa en "Puntos de
// Venta". Se revisa DESPUÉS de la regla de Electrónica/Compras (más abajo)
// para que una etiqueta como "VENTA ELECTRONICA CONTADO NARANJOS" no la
// capture por error el nombre de la propia sede.
const SEDE_KEYWORDS = ['ALAMEDA', 'CASONA', 'JAMUNDI', 'NARANJOS', 'DECEPAZ', 'CHIMINANGOS', 'VILLA/LAGO', 'VILLA DE LAGO', 'VILLA DEL LAGO'];

function detectSide(h) {
  if (h.includes('COMPRA') || h.includes('ENTRADA')) return 'compra';
  if (h.includes('VENTA') || h.includes('FACTURA') || h.includes('POS') || h.includes('SALIDA') || h.includes('CONSUMO')) return 'venta';
  return null;
}

function finalize(bucket, side, isDevolucion) {
  if (!bucket || !side) return { bucket, side, isDevolucion, uncertain: true, type: 'unrecognized' };
  return { bucket, side, isDevolucion, type: 'classified' };
}

export function classifyTipoDocto(labelRaw) {
  const h = normText(labelRaw);
  if (!h) return { bucket: null, side: null, isDevolucion: false, type: 'unrecognized' };

  if (h.includes('TRANSFORMACION')) return { bucket: null, side: null, isDevolucion: false, type: 'ignored_transformacion' };
  if (h.includes('INVENTARIO') && h.includes('INICIAL')) return { bucket: null, side: null, isDevolucion: false, type: 'inv_inicial' };
  if (h.includes('INVENTARIO') && h.includes('FINAL')) return { bucket: null, side: null, isDevolucion: false, type: 'inv_final' };

  const isDevolucion = h.includes('DEVOLUCION') || /^NC /.test(h) || /^DV /.test(h);
  const side = detectSide(h);

  if (h.includes('CONSUMO INTERNO')) return finalize('consumo_interno', side, isDevolucion);
  if (h.includes('FACTURA') || h.includes('POS') || h.includes('COMPRA') || h.includes('VENTA')) return finalize('electronica_compras', side, isDevolucion);
  if (h.includes('POLLO')) return finalize('planta_pollo', side, isDevolucion);
  if (h.includes('ACOPIO')) return finalize('planta_acopio', side, isDevolucion);
  if (h.includes('PROCESADOS') || h.includes('PROCESO') || h.includes('SALSAMENTARIA')) return finalize('salsamentaria', side, isDevolucion);
  if (SEDE_KEYWORDS.some(k => h.includes(k))) return finalize('puntos_venta', side, isDevolucion);

  // "PLANTA" a secas (sin ACOPIO/POLLO/PROCESO) es ambiguo por sí solo: en una
  // ENTRADA casi siempre significa "la planta central" (Acopio, confirmado
  // con "ENTRADA MERCANCIA DE PLANTA" de Decepaz); en una SALIDA se confirmó
  // que puede significar un traslado a otro punto de venta (ver comentario
  // de arriba). Por eso solo se asume Planta Acopio para el lado ENTRADA.
  if (h.includes('PLANTA') && side === 'compra') return finalize('planta_acopio', side, isDevolucion);

  return { bucket: null, side, isDevolucion, type: 'unrecognized' };
}
