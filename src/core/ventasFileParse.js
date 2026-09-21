// Parseo del reporte "Ventas Netas Por Dia" (crudo de Tecnocarnes, uno por
// sede). El archivo trae SIEMPRE el historial completo desde que existe la
// sede hasta el día de la descarga (no es un archivo "de un solo día") — por
// eso la carga en la plataforma siempre hace upsert por (sede, fecha), nunca
// un insert ciego: volver a subir el mismo archivo al día siguiente es
// exactamente el flujo esperado (ver server/routes/ventas.js).
//
// Estructura real (columna "Nro Clientes"/"Valor Venta" cambia de posición
// entre sedes — se detecta por texto, igual que el resto de este proyecto):
//   fila de encabezado: "Fecha","Kilos","Unidades","Descuento","Nro Clientes",("",)"Valor Venta"
//   filas de dato: "DD/MM/YYYY", kilos, unidades, descuento, nroClientes, (vacío), valorVenta
//   filas de subtotal mensual: Fecha en blanco, resto numérico -> se ignoran
//   marcador de mes suelto (ej. "11"): Fecha no es una fecha válida -> se ignora
//   "Grand Total:" -> fin de los datos, todo lo de después (pie de página) se ignora

import { normText } from './normalize.js';

const HEADER_WORDS = { fecha: 'FECHA', kilos: 'KILOS', unidades: 'UNIDADES', descuento: 'DESCUENTO', clientes: 'NRO CLIENTES', valor: 'VALOR VENTA' };

export function detectVentasHeaderRow(rows, maxScan = 30) {
  const limit = Math.min(rows.length, maxScan);
  for (let r = 0; r < limit; r++) {
    const row = rows[r] || [];
    let colFecha = -1, colKilos = -1, colUnidades = -1, colDescuento = -1, colClientes = -1, colValor = -1;
    for (let c = 0; c < row.length; c++) {
      const h = normText(row[c]);
      if (!h) continue;
      if (colFecha === -1 && h === HEADER_WORDS.fecha) colFecha = c;
      if (colKilos === -1 && h === HEADER_WORDS.kilos) colKilos = c;
      if (colUnidades === -1 && h === HEADER_WORDS.unidades) colUnidades = c;
      if (colDescuento === -1 && h === HEADER_WORDS.descuento) colDescuento = c;
      if (colClientes === -1 && h === HEADER_WORDS.clientes) colClientes = c;
      if (colValor === -1 && h === HEADER_WORDS.valor) colValor = c;
    }
    if (colFecha !== -1 && colValor !== -1) {
      return { headerRowIndex: r, colFecha, colKilos, colUnidades, colDescuento, colClientes, colValor };
    }
  }
  return null;
}

const DATE_RE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;

function parseFechaCell(v) {
  if (v == null || v === '') return null;
  const s = String(v).trim();
  const m = s.match(DATE_RE);
  if (!m) return null;
  const day = parseInt(m[1], 10), month = parseInt(m[2], 10), year = parseInt(m[3], 10);
  const dt = new Date(Date.UTC(year, month - 1, day));
  if (dt.getUTCFullYear() !== year || dt.getUTCMonth() !== month - 1 || dt.getUTCDate() !== day) return null;
  return dt.toISOString().slice(0, 10);
}

function numOrNull(v) {
  if (typeof v === 'number') return v;
  if (v == null || v === '') return null;
  const n = parseFloat(String(v).replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

// Compara `candidate` contra la lista de sedes ya conocidas por inclusión en
// ambos sentidos — el archivo o el nombre del archivo a veces traen texto
// extra pegado al nombre de la sede ("DECEPAZ CALLE 123 # 25B -08",
// "DECEPAZ 14-20 SEPTIEMBRE.xls"), y sin este cruce esa cadena completa se
// guarda como si fuera una sede nueva en vez de reusar la sede real. Se usa
// tanto para el nombre detectado en el CONTENIDO del archivo como para el
// nombre adivinado a partir del NOMBRE DEL ARCHIVO (ver createVentUploader
// en src/main.js) — ambos caminos pueden producir esta misma cadena "sucia".
export function matchKnownSede(candidate, knownSedeNames) {
  const norm = normText(candidate);
  if (!norm) return null;
  const idx = knownSedeNames.findIndex(n => {
    const u = normText(n);
    return norm.includes(u) || u.includes(norm);
  });
  return idx !== -1 ? knownSedeNames[idx] : null;
}

// Detecta el nombre de sede a partir del contenido del archivo (varias filas
// iniciales solo traen el nombre de la sede en mayúsculas, en su propia
// celda) — respaldo para cuando el nombre de archivo no basta.
export function guessSedeFromVentasRows(rows, knownSedeNames) {
  for (let r = 0; r < Math.min(rows.length, 15); r++) {
    const row = rows[r] || [];
    for (const cell of row) {
      if (String(cell).length < 4) continue;
      const match = matchKnownSede(cell, knownSedeNames);
      if (match) return match;
    }
  }
  return null;
}

// Parsea el archivo completo a filas diarias { fecha, kilos, unidades, descuento, nroClientes, valorVenta }.
// No agrega nada (ni recalcula totales): cada fila es tal como viene en el archivo.
export function parseVentasDiariasFile(rows) {
  const headerInfo = detectVentasHeaderRow(rows);
  if (!headerInfo) return null;
  const { headerRowIndex, colFecha, colKilos, colUnidades, colDescuento, colClientes, colValor } = headerInfo;

  const dias = [];
  const warnings = [];
  for (let r = headerRowIndex + 1; r < rows.length; r++) {
    const row = rows[r] || [];
    const fechaCell = row[colFecha];
    if (fechaCell != null && normText(fechaCell).startsWith('GRAND TOTAL')) break;

    const fecha = parseFechaCell(fechaCell);
    if (!fecha) continue; // subtotal mensual, marcador de mes suelto, o fila en blanco

    const valorVenta = numOrNull(row[colValor]);
    if (valorVenta == null) { warnings.push(`Fila con fecha ${fecha} sin Valor Venta numérico — se omite.`); continue; }

    dias.push({
      fecha,
      kilos: colKilos != null ? numOrNull(row[colKilos]) : null,
      unidades: colUnidades != null ? numOrNull(row[colUnidades]) : null,
      descuento: colDescuento != null ? numOrNull(row[colDescuento]) : null,
      nroClientes: colClientes != null ? numOrNull(row[colClientes]) : null,
      valorVenta
    });
  }

  if (!dias.length) return null;
  return { dias, warnings };
}
