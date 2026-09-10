// Parseo de las filas de datos de un archivo ya con encabezado detectado.

import { normText, normalizeCode } from './normalize.js';

// Productos que no son carne/pescado (insumos, empaques, aseo, domicilios) —
// se excluyen del conteo aunque tengan código y aparezcan en el archivo.
const EXCLUDED_NAME_KEYWORDS = ['ADOBO', 'CANASTILLA', 'BOLSA', 'HIPOCLORITO', 'DETERGENTE', 'DOMICILIO'];

function isExcludedProduct(nameNorm) {
  return EXCLUDED_NAME_KEYWORDS.some(kw => nameNorm.includes(kw));
}

export function parseDataRows(rows, headerInfo, movementCols) {
  const products = [];
  let totalRow = null;
  let skippedNoCode = 0;
  let skippedExcluded = 0;

  for (let r = headerInfo.headerRowIndex + 1; r < rows.length; r++) {
    const row = rows[r] || [];
    const codeRaw = row[headerInfo.codeCol];
    const nameRaw = row[headerInfo.detCol];
    const codeNorm = normalizeCode(codeRaw);
    const nameNorm = normText(nameRaw);

    const isRowEmpty = row.every(cell => cell === undefined || cell === null || String(cell).trim() === '');
    if (isRowEmpty) continue;

    if (!codeNorm && (!nameNorm || nameNorm.startsWith('TOTAL'))) {
      // Fila de "Total" del archivo (la palabra puede venir en cualquier
      // columna, o no venir), o texto de pie de página sin datos reales.
      const hasMovementData = movementCols.some(mc => {
        const v = row[mc.colIndex];
        if (v === undefined || v === null || String(v).trim() === '') return false;
        const num = (typeof v === 'number') ? v : parseFloat(String(v).replace(/,/g, ''));
        return !isNaN(num) && num !== 0;
      });
      if (hasMovementData && !totalRow) {
        const vals = {};
        movementCols.forEach(mc => {
          const v = row[mc.colIndex];
          vals[mc.colIndex] = (typeof v === 'number') ? v : (parseFloat(String(v).replace(/,/g, '')) || 0);
        });
        totalRow = { rowIndex: r, values: vals };
      } else {
        skippedNoCode++;
      }
      continue;
    }

    if (!codeNorm) { skippedNoCode++; continue; }
    if (isExcludedProduct(nameNorm)) { skippedExcluded++; continue; }

    const values = {};
    movementCols.forEach(mc => {
      const raw = row[mc.colIndex];
      let num = 0;
      if (typeof raw === 'number') num = raw;
      else if (raw != null && String(raw).trim() !== '') {
        const cleaned = String(raw).replace(/,/g, '').trim();
        const parsed = parseFloat(cleaned);
        num = isNaN(parsed) ? 0 : parsed;
      }
      values[mc.colIndex] = num;
    });

    products.push({
      rawCode: String(codeRaw),
      normCode: codeNorm,
      rawName: String(nameRaw == null ? '' : nameRaw).trim(),
      values
    });
  }

  return { products, totalRow, skippedNoCode, skippedExcluded };
}
