// Parseo de una página del PDF "Liquidación Detallada" (reporte semanal de
// Recursos Humanos, una página por empleado) — misma forma en las 7 sedes.
// Recibe los `textItems` YA EXTRAÍDOS de una página de pdfjs-dist (agnóstico
// a si vinieron del build de Node o del navegador, ver
// src/horasExtras/horasExtrasPdfLoader.js y scripts/import_horas_extras_history.cjs),
// como `{ str, x, y }[]`.
//
// La tabla se reconstruye por POSICIÓN, no por orden de aparición del texto
// (que en PDF no sigue necesariamente el layout visual): se ubica la fila de
// encabezado por las 12 etiquetas únicas de horas (Total/Comida/F/Hdo/Rn/
// Rndyf/Dom/D/Hefd/Hefn/He/Hen — se ignoran a propósito "Entrada"/"Salida",
// que se repiten 2 veces cada una y no hacen falta para el control de horas
// extra) para fijar la posición X de cada columna, y cada valor numérico de
// las filas de datos se asigna a la columna cuyo rango de X lo contiene.
//
// Un mismo día puede aparecer en más de una fila física cuando el empleado
// tiene más de 2 marcaciones ese día (la fila de continuación solo trae más
// Entrada/Salida, sin Total ni columnas de horas) — se detecta por el mismo
// texto de día repetido y se fusiona quedándose con el primer valor no nulo
// de cada columna.

import { normText, removeAccents } from './normalize.js';

const HOUR_COLUMNS = ['TOTAL', 'COMIDA', 'F', 'HDO', 'RN', 'RNDYF', 'DOM', 'D', 'HEFD', 'HEFN', 'HE', 'HEN'];
const DAY_RE = /^(LU|MA|MI|JU|VI|SA|DO)\s+\d{1,2}$/;
const Y_TOLERANCE = 2; // pts — dos items en la misma línea visual pueden diferir un poco en y

// Estricto a propósito (rechaza cualquier caracter que no sea número): un
// valor de hora tipo "08:07" no debe colarse como "8" en ninguna columna.
function toNum(v) {
  if (v == null) return null;
  const s = String(v).trim();
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  return parseFloat(s);
}

// Agrupa los text items en líneas (mismo y, con tolerancia), cada línea
// ordenada de izquierda a derecha, y las líneas de arriba hacia abajo.
function groupRows(items) {
  const clean = items.filter((it) => it.str != null && it.str.trim() !== '');
  const sorted = clean.slice().sort((a, b) => (b.y - a.y) || (a.x - b.x));
  const rows = [];
  for (const it of sorted) {
    const last = rows[rows.length - 1];
    if (last && Math.abs(last.y - it.y) <= Y_TOLERANCE) {
      last.items.push(it);
    } else {
      rows.push({ y: it.y, items: [it] });
    }
  }
  rows.forEach((r) => r.items.sort((a, b) => a.x - b.x));
  return rows;
}

function rowText(row) {
  return row.items.map((it) => it.str).join('').replace(/\s+/g, ' ').trim();
}

// Encuentra la fila de encabezado de la tabla (la que trae las 12 etiquetas
// de horas) y devuelve el mapa de columnas [{name, x}], en orden de X.
function findColumnHeader(rows) {
  for (const row of rows) {
    const byLabel = new Map();
    row.items.forEach((it) => {
      const label = normText(it.str);
      if (HOUR_COLUMNS.includes(label) && !byLabel.has(label)) byLabel.set(label, it.x);
    });
    if (HOUR_COLUMNS.every((c) => byLabel.has(c))) {
      const columns = HOUR_COLUMNS.map((name) => ({ name, x: byLabel.get(name) })).sort((a, b) => a.x - b.x);
      // "Entrada"/"Salida" (x2 cada una) no se necesitan como columnas propias,
      // pero SÍ hace falta saber dónde terminan para no dejar el límite
      // izquierdo de "Total" abierto a -Infinity — si no, un valor de hora
      // como "08:07" (x muy a la izquierda) se cuela en la columna Total
      // (parseFloat("08:07") da 8, un número "válido" aunque sin sentido).
      const leftAnchorX = row.items.reduce((max, it) => {
        const label = normText(it.str);
        return !HOUR_COLUMNS.includes(label) && it.x < columns[0].x && it.x > max ? it.x : max;
      }, -Infinity);
      return { columns, leftAnchorX };
    }
  }
  return null;
}

// Límites [xStart, xEnd) de cada columna, a medio camino entre encabezados
// consecutivos — el límite derecho del último se abre a +Infinity; el
// izquierdo del primero usa `leftAnchorX` (ver findColumnHeader) en vez de
// -Infinity, para no capturar las columnas de Entrada/Salida.
function columnBounds(columns, leftAnchorX) {
  return columns.map((col, i) => {
    const prev = columns[i - 1];
    const next = columns[i + 1];
    const xStart = prev ? (prev.x + col.x) / 2 : (col.x + leftAnchorX) / 2;
    const xEnd = next ? (col.x + next.x) / 2 : Infinity;
    return { name: col.name, xStart, xEnd };
  });
}

function assignColumn(x, bounds) {
  return bounds.find((b) => x >= b.xStart && x < b.xEnd) || null;
}

function parseDayLabel(str) {
  const norm = normText(str).replace('Á', 'A');
  return DAY_RE.test(removeAccents(norm)) ? str.trim() : null;
}

// "Ma 01" -> día del mes (1). El año/mes real del día sale del rango del
// período (periodoInicio/periodoFin), no de esta etiqueta (que no trae mes).
function dayNumberFromLabel(label) {
  const m = /(\d{1,2})\s*$/.exec(label);
  return m ? parseInt(m[1], 10) : null;
}

// Reconstruye la fecha real (YYYY-MM-DD) de un día del periodo a partir del
// número de día y el rango periodoInicio..periodoFin — el periodo real
// puede cruzar de mes (ver "01 al 22 de sep", pero también podría empezar
// en agosto), así que se busca, dentro de ese rango de fechas, el día cuyo
// "día del mes" coincide.
function resolveFecha(dayNum, periodoInicio, periodoFin) {
  if (dayNum == null || !periodoInicio || !periodoFin) return null;
  const start = new Date(periodoInicio + 'T00:00:00Z');
  const end = new Date(periodoFin + 'T00:00:00Z');
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    if (d.getUTCDate() === dayNum) return d.toISOString().slice(0, 10);
  }
  return null;
}

export function parseLiquidacionPage(items) {
  const rows = groupRows(items);
  if (rows.length < 4) return null;

  // Metadata: nombre+ID, empresa/sucursal/cargo, periodo/estado — en las
  // primeras filas de texto de la página (antes de la tabla).
  let empleadoId = null, nombre = null, sede = null, cargo = null;
  let periodoInicio = null, periodoFin = null, estado = null;
  for (const row of rows.slice(0, 6)) {
    const text = rowText(row);
    const mNombre = /^(.+?)\s*\(ID:\s*([^)]+)\)$/.exec(text);
    if (mNombre) { nombre = mNombre[1].trim(); empleadoId = mNombre[2].trim(); continue; }
    const mSede = /Sucursal:\s*([^·]+?)\s*(?:·|$)/.exec(text);
    if (mSede) sede = mSede[1].trim();
    const mCargo = /Cargo:\s*([^·]+?)\s*(?:·|$)/.exec(text);
    if (mCargo) cargo = mCargo[1].trim();
    const mPeriodo = /Periodo:\s*(\d{4}-\d{2}-\d{2})\s*hasta\s*(\d{4}-\d{2}-\d{2})/.exec(text);
    if (mPeriodo) { periodoInicio = mPeriodo[1]; periodoFin = mPeriodo[2]; }
    const mEstado = /Estado:\s*(\S+)/.exec(text);
    if (mEstado) estado = mEstado[1].trim();
  }
  if (!empleadoId || !periodoInicio || !periodoFin) return null;

  const headerInfo = findColumnHeader(rows);
  if (!headerInfo) return null;
  const bounds = columnBounds(headerInfo.columns, headerInfo.leftAnchorX);
  const headerRowY = rows.find((r) => HOUR_COLUMNS.every((c) => r.items.some((it) => normText(it.str) === c)))?.y;

  const diasByLabel = new Map(); // "Ma 01" -> registro acumulado
  for (const row of rows) {
    if (headerRowY != null && row.y >= headerRowY) continue; // metadata/encabezado, ya procesados
    if (row.items.some((it) => normText(it.str) === 'TOTALES')) break; // fin de la tabla de días

    const dayItem = row.items.find((it) => parseDayLabel(it.str));
    if (!dayItem) continue; // fila que no arranca con etiqueta de día (no debería pasar, pero no se rompe)
    const label = dayItem.str.trim();
    if (!diasByLabel.has(label)) {
      diasByLabel.set(label, { label, estadoDia: 'trabajado' });
      HOUR_COLUMNS.forEach((c) => { diasByLabel.get(label)[c] = null; });
    }
    const acc = diasByLabel.get(label);

    const restText = normText(row.items.filter((it) => it !== dayItem).map((it) => it.str).join(' '));
    if (restText.includes('INASISTENCIA')) { acc.estadoDia = 'inasistencia'; continue; }
    if (restText.includes('DESCANSO')) { acc.estadoDia = 'descanso'; continue; }

    row.items.forEach((it) => {
      if (it === dayItem) return;
      const col = assignColumn(it.x, bounds);
      if (!col) return; // fuera de las columnas de horas (Entrada/Salida) — no hace falta
      const n = toNum(it.str);
      if (n != null && acc[col.name] == null) acc[col.name] = n;
    });
  }

  const dias = [];
  diasByLabel.forEach((acc) => {
    const dayNum = dayNumberFromLabel(acc.label);
    const fecha = resolveFecha(dayNum, periodoInicio, periodoFin);
    if (!fecha) return; // no se pudo ubicar la fecha real — se descarta esta fila, no toda la página
    dias.push({
      fecha,
      estadoDia: acc.estadoDia,
      total: acc.TOTAL, comida: acc.COMIDA, f: acc.F, hdo: acc.HDO, rn: acc.RN,
      rndyf: acc.RNDYF, dom: acc.DOM, d: acc.D, hefd: acc.HEFD, hefn: acc.HEFN,
      he: acc.HE, hen: acc.HEN
    });
  });

  return { empleadoId, nombre, sede, cargo, periodoInicio, periodoFin, estado, dias };
}
