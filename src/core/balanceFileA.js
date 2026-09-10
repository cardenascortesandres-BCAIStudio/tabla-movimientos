// Parseo del archivo "Movimiento de Productos Por Grupo por Tipo de
// Documento" (crudo de Tecnocarnes). Estructura: una fila de encabezado con
// "TipoDoctos"/"Producto"/"Cantidad"/"Valor"/"Impuesto"/"Neto" (posición de
// columna variable), y debajo, bloques repetidos: fila de grupo (columna
// TipoDoctos con una etiqueta, resto vacío) -> filas de producto -> fila de
// subtotal (sin TipoDoctos ni Producto, con Valor numérico). El balance en sí
// solo usa el Valor del subtotal de cada bloque (nunca Neto/Impuesto), pero
// las filas de producto también se capturan (`items`) para poder reproducir
// la hoja de datos fuente del Excel exportado (ver balanceExcelExport.js),
// con fórmulas SUM() reales sobre esas mismas filas.

import { normText } from './normalize.js';

export function detectTipoDoctoHeader(rows, maxScan = 30) {
  const limit = Math.min(rows.length, maxScan);
  for (let r = 0; r < limit; r++) {
    const row = rows[r] || [];
    let colTipoDoctos = -1, colProducto = -1, colCantidad = -1, colValor = -1, colImpuesto = -1, colNeto = -1;
    for (let c = 0; c < row.length; c++) {
      const h = normText(row[c]);
      if (!h) continue;
      if (colTipoDoctos === -1 && h.includes('TIPODOCTOS')) colTipoDoctos = c;
      if (colProducto === -1 && h === 'PRODUCTO') colProducto = c;
      if (colCantidad === -1 && h === 'CANTIDAD') colCantidad = c;
      if (colValor === -1 && h === 'VALOR') colValor = c;
      if (colImpuesto === -1 && h === 'IMPUESTO') colImpuesto = c;
      if (colNeto === -1 && h === 'NETO') colNeto = c;
    }
    if (colTipoDoctos !== -1 && colValor !== -1) {
      return {
        headerRowIndex: r,
        colTipoDoctos,
        colProducto: colProducto !== -1 ? colProducto : null,
        colCantidad: colCantidad !== -1 ? colCantidad : null,
        colValor,
        colImpuesto: colImpuesto !== -1 ? colImpuesto : null,
        colNeto: colNeto !== -1 ? colNeto : null
      };
    }
  }
  return null;
}

function isBlankCell(v) { return v === undefined || v === null || String(v).trim() === ''; }
function numOrNull(v) { return typeof v === 'number' ? v : null; }

export function parseFileAGroups(rows, headerInfo) {
  const { headerRowIndex, colTipoDoctos, colProducto, colCantidad, colValor, colImpuesto, colNeto } = headerInfo;
  const blocks = [];
  const warnings = [];
  let current = null;

  for (let r = headerRowIndex + 1; r < rows.length; r++) {
    const row = rows[r] || [];
    const tipoDoctoCell = row[colTipoDoctos];
    const productoCell = colProducto != null ? row[colProducto] : undefined;
    const valorCell = row[colValor];

    if (!isBlankCell(tipoDoctoCell)) {
      if (current && current.valor == null) {
        warnings.push(`El bloque "${current.label}" no tuvo fila de subtotal detectada.`);
      }
      current = { label: String(tipoDoctoCell).trim(), rowStart: r, valor: null, items: [] };
      continue;
    }

    if (!current) continue; // filas de preámbulo antes del primer bloque

    if (!isBlankCell(productoCell)) {
      // Fila de producto: no participa del cálculo del balance, pero se
      // conserva para reproducir la hoja de datos fuente en el Excel exportado.
      current.items.push({
        producto: String(productoCell).trim(),
        cantidad: colCantidad != null ? numOrNull(row[colCantidad]) : null,
        valor: numOrNull(valorCell),
        impuesto: colImpuesto != null ? numOrNull(row[colImpuesto]) : null,
        neto: colNeto != null ? numOrNull(row[colNeto]) : null
      });
      continue;
    }

    if (typeof valorCell === 'number') {
      if (current.valor != null) {
        warnings.push(`El bloque "${current.label}" tiene más de una fila de subtotal; se usa la primera.`);
        continue;
      }
      current.valor = valorCell;
      blocks.push({ label: current.label, valor: current.valor, items: current.items, rowStart: current.rowStart, rowEnd: r });
      current = null;
    }
    // filas en blanco o de pie de página (ej. "TecnoCarnes") se ignoran
  }

  if (current && current.valor == null) {
    warnings.push(`El bloque "${current.label}" no tuvo fila de subtotal detectada.`);
  }

  return { blocks, warnings };
}
