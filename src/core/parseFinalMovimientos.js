// Parseo de un Excel de "Tabla de Movimientos" YA GENERADO Y CORREGIDO A MANO
// (el archivo que descarga la herramienta, con Disponible/Diferencia KL/
// % Diferencia ya calculados, editado y ajustado por el usuario) — a
// diferencia de src/core/parse.js (que lee columnas de movimiento CRUDAS y
// recalcula todo desde cero), esto lee directamente los valores finales de
// esas 3 columnas, tal como quedaron después de la corrección manual, sin
// tocar ni recalcular nada.

import { detectHeaderRow } from './headerDetection.js';
import { normText, normalizeCode } from './normalize.js';
import { matchCanonicalBloque, BLOQUE_SIN_CLASIFICAR } from './movimientosBloques.js';

function findCol(headerRow, matchers) {
  for (let c = 0; c < headerRow.length; c++) {
    const h = normText(headerRow[c]);
    if (!h) continue;
    if (matchers.some(m => h.includes(m))) return c;
  }
  return -1;
}

function toNum(v) {
  if (typeof v === 'number') return v;
  if (v == null || String(v).trim() === '') return 0;
  const n = parseFloat(String(v).replace(/,/g, ''));
  return isNaN(n) ? 0 : n;
}

/**
 * @param {any[][]} rows  filas crudas (header:1) del archivo ya editado
 * @param {string} sedeName  nombre de la sede que el usuario confirmó en la UI
 * @returns {null | {bySede, byCategory, allProductRows, totalDisponible, totalDiferencia, totalProductosNeg}}
 *   Misma forma que computeDashboardData() (src/dashboard/dashboardData.js),
 *   para poder reusar tal cual serializeDashboardData()/buildInteractiveReportHtml().
 */
export function parseFinalMovimientosFile(rows, sedeName) {
  const headerInfo = detectHeaderRow(rows, 40);
  if (!headerInfo) return null;

  const headerRow = rows[headerInfo.headerRowIndex];
  const disponibleCol = findCol(headerRow, ['DISPONIBLE']);
  const diferenciaCol = findCol(headerRow, ['DIFERENCIA KL', 'DIFERENCIA']);
  const pctCol = findCol(headerRow, ['% DIFERENCIA', 'PORCENTAJE DIFERENCIA']);
  if (disponibleCol === -1 || diferenciaCol === -1) return null;

  const sections = [];
  let buffer = [];
  for (let r = headerInfo.headerRowIndex + 1; r < rows.length; r++) {
    const row = rows[r] || [];
    const codeRaw = row[headerInfo.codeCol];
    const nameRaw = row[headerInfo.detCol];
    const codeNorm = normalizeCode(codeRaw);
    const nameNorm = normText(nameRaw);

    const isRowEmpty = row.every(cell => cell === undefined || cell === null || String(cell).trim() === '');
    if (isRowEmpty) continue;

    if (!codeNorm && nameNorm && !nameNorm.startsWith('TOTAL')) {
      // Fila de subtotal de categoría (mismo convenio que todos los archivos
      // reales de esta empresa: código vacío + nombre de categoría en Detalle).
      sections.push({ category: nameNorm, items: buffer });
      buffer = [];
      continue;
    }
    if (!codeNorm) continue; // fila sin código útil (pie de página, fila de gran total, etc.)

    buffer.push({
      code: String(codeRaw),
      name: String(nameRaw == null ? '' : nameRaw).trim(),
      disponible: toNum(row[disponibleCol]),
      diferenciaKL: toNum(row[diferenciaCol]),
      pct: pctCol !== -1 ? toNum(row[pctCol]) : null
    });
  }
  if (buffer.length && !sections.length) return null; // no se encontró ninguna fila de subtotal/categoría

  const byCategory = new Map();
  const allProductRows = [];
  let totalDisponible = 0, totalDiferencia = 0;

  sections.forEach(sec => {
    // El nombre de categoría del archivo varía de mes a mes ("PULPA" vs
    // "PULPAS") y a veces una fila de producto sin código se confunde con un
    // encabezado de categoría (ver Casona 07-13 sep 2026) — se normaliza a
    // uno de los 12 bloques fijos del negocio, o a "Sin clasificar" si no
    // corresponde a ninguno (nunca se pierde el dato, pero tampoco infla un
    // bloque real con algo que no le pertenece).
    const category = matchCanonicalBloque(sec.category) || BLOQUE_SIN_CLASIFICAR;
    const catDisp = sec.items.reduce((a, i) => a + i.disponible, 0);
    const catDiff = sec.items.reduce((a, i) => a + i.diferenciaKL, 0);
    if (!byCategory.has(category)) byCategory.set(category, { disponible: 0, diferenciaKL: 0 });
    const agg = byCategory.get(category);
    agg.disponible += catDisp;
    agg.diferenciaKL += catDiff;
    sec.items.forEach(it => {
      const pct = it.pct != null ? it.pct : (catDisp === 0 ? 0 : it.diferenciaKL / catDisp);
      allProductRows.push({
        sede: sedeName, category, code: it.code, name: it.name,
        diferenciaKL: it.diferenciaKL, disponible: it.disponible, pct
      });
    });
    totalDisponible += catDisp;
    totalDiferencia += catDiff;
  });

  const totalProductosNeg = allProductRows.filter(p => p.diferenciaKL < -0.01).length;

  return {
    bySede: [{ sedeName, totals: { disponible: totalDisponible, diferenciaKL: totalDiferencia } }],
    byCategory,
    allProductRows,
    totalDisponible,
    totalDiferencia,
    totalProductosNeg
  };
}
