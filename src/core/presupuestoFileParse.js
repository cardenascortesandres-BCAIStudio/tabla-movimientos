// Parseo del archivo "PRESUPUESTO.xlsx" (Desktop/BRANGUS/PRESUPUESTO.xlsx):
// una sola hoja, una fila por sede con la meta mensual fija que da la
// empresa, más columnas de referencia con ventas reales de meses puntuales
// (no se usan acá, la platforma ya tiene esos reales en ventas_dias).
//
// Estructura real:
//   fila de encabezado: "", "PRESUPUESTO", "<MES> DE <AÑO>", "<MES> DE <AÑO>", ...
//   filas de dato: "<SEDE>", <monto presupuesto>, <real mes 1>, <real mes 2>, ...
//   fila final: "TOTAL", <suma>, ... -> se ignora

import { normText } from './normalize.js';

export function detectPresupuestoHeaderRow(rows, maxScan = 10) {
  const limit = Math.min(rows.length, maxScan);
  for (let r = 0; r < limit; r++) {
    const row = rows[r] || [];
    for (let c = 0; c < row.length; c++) {
      if (normText(row[c]) === 'PRESUPUESTO') return { headerRowIndex: r, colMonto: c };
    }
  }
  return null;
}

function numOrNull(v) {
  if (typeof v === 'number') return v;
  if (v == null || v === '') return null;
  const n = parseFloat(String(v).replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

// Devuelve [{ sedeName, monto }, ...] — el nombre de sede viene tal como está
// en el archivo (mayúsculas); se canoniza más adelante igual que en la carga
// de Ventas (mismo resolveCanonicalSedeName por slug).
export function parsePresupuestoFile(rows) {
  const headerInfo = detectPresupuestoHeaderRow(rows);
  if (!headerInfo) return null;
  const { headerRowIndex, colMonto } = headerInfo;
  const colSede = 0;

  const sedes = [];
  for (let r = headerRowIndex + 1; r < rows.length; r++) {
    const row = rows[r] || [];
    const sedeCell = row[colSede];
    const sedeName = sedeCell != null ? String(sedeCell).trim() : '';
    if (!sedeName || normText(sedeName) === 'TOTAL') continue;

    const monto = numOrNull(row[colMonto]);
    if (monto == null) continue;

    sedes.push({ sedeName, monto });
  }

  if (!sedes.length) return null;
  return { sedes };
}
