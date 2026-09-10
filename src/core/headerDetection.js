// Detección de la fila de encabezados. Dos métodos, en orden:
//   A) Palabras clave explícitas ("CODIGO"/"ITEM" + "DETALLE"/"DESCRIPCION").
//   B) Inferencia por forma: si el archivo no trae esas palabras (p. ej.
//      exportaciones de Tecnocarnes), se ubica la fila por la cantidad de
//      columnas de movimiento reconocibles, y se infiere cuál columna inicial
//      es el código (valores numéricos) y cuál es el detalle (texto).

import { normText, normalizeCode } from './normalize.js';
import { classifyHeader } from './classify.js';

export function detectHeaderRow(rows, maxScan = 30) {
  const limit = Math.min(rows.length, maxScan);

  // ---- Método A ----
  for (let r = 0; r < limit; r++) {
    const row = rows[r] || [];
    let codigoCol = -1, itemCol = -1, detCol = -1;
    for (let c = 0; c < row.length; c++) {
      const h = normText(row[c]);
      if (!h) continue;
      if (codigoCol === -1 && h.includes('CODIGO')) codigoCol = c;
      if (itemCol === -1 && h === 'ITEM') itemCol = c;
      if (detCol === -1 && (h.includes('DETALLE') || h.includes('DESCRIPCION'))) detCol = c;
    }
    const codeCol = codigoCol !== -1 ? codigoCol : itemCol;
    if (codeCol !== -1 && detCol !== -1) {
      return { headerRowIndex: r, codeCol, detCol, method: 'keyword' };
    }
  }

  // ---- Método B (respaldo por inferencia de forma) ----
  let bestRow = -1, bestCount = 0, bestFirstMovementCol = -1;
  for (let r = 0; r < limit; r++) {
    const row = rows[r] || [];
    let count = 0, firstMovementCol = -1;
    for (let c = 0; c < row.length; c++) {
      const h = normText(row[c]);
      if (!h) continue;
      const cls = classifyHeader(row[c]);
      if (cls.type !== 'unrecognized') {
        count++;
        if (firstMovementCol === -1) firstMovementCol = c;
      }
    }
    if (count > bestCount) { bestCount = count; bestRow = r; bestFirstMovementCol = firstMovementCol; }
  }

  if (bestRow === -1 || bestCount < 3 || bestFirstMovementCol < 1) return null;

  const leadingCols = [];
  for (let c = 0; c < bestFirstMovementCol; c++) leadingCols.push(c);
  if (leadingCols.length < 1) return null;

  const sampleStart = bestRow + 1;
  const sampleEnd = Math.min(rows.length, sampleStart + 40);
  const stats = leadingCols.map(c => ({ c, nonBlank: 0, codeLike: 0, textLike: 0 }));
  for (let r = sampleStart; r < sampleEnd; r++) {
    const row = rows[r] || [];
    stats.forEach(s => {
      const raw = row[s.c];
      if (raw === undefined || raw === null || String(raw).trim() === '') return;
      s.nonBlank++;
      const norm = normalizeCode(raw);
      if (norm && /^\d+$/.test(norm)) s.codeLike++;
      else if (/[A-ZÑ]/.test(normText(raw))) s.textLike++;
    });
  }

  const codeStat = stats.slice().sort((a, b) => b.codeLike - a.codeLike)[0];
  if (!codeStat || codeStat.codeLike === 0) return null;
  const remaining = stats.filter(s => s.c !== codeStat.c);
  const detStat = remaining.slice().sort((a, b) => b.textLike - a.textLike)[0];
  if (!detStat || detStat.textLike === 0) return null;

  return { headerRowIndex: bestRow, codeCol: codeStat.c, detCol: detStat.c, method: 'inferred' };
}
