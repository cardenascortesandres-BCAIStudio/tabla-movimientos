// Backfill de balance_weeks a partir de los archivos historicos reales
// (uno por sede, cada pestaña = una semana ya calculada a mano). Lee con
// ExcelJS por texto de etiqueta (no por celda fija) porque el layout de
// filas/columnas cambia de semana a semana y de sede a sede (columna de
// valor a veces G, a veces H; filas que se corren 1-2 posiciones; alguna
// sede usa "COSTO MARGEN VENTA" en vez de "CMV").
//
// Uso:
//   node scripts/backfill_balance_history.cjs           -> dry run (no escribe nada)
//   node scripts/backfill_balance_history.cjs --commit   -> inserta en Postgres
//     (requiere DATABASE_URL en el entorno, ej. `railway run --`)

const path = require('path');
const ExcelJS = require('exceljs');

// 2026-09-09: la carpeta de datos reales se movió de Desktop/INVENTARIOS a
// Desktop/BRANGUS/INVENTARIOS (mismo contenido). Además, cada sede ahora trae
// su propio archivo de Balance más reciente con TODA la historia como
// pestañas (en vez del archivo consolidado viejo en BALANCES/), así que cada
// entrada apunta directo a la carpeta de la semana más reciente de esa sede.
// Alameda, Casona y Jamundí nunca se habían backfilleado (no existían sus
// archivos en su momento) — esta corrida es su primer backfill.
const DIR = 'C:/Users/Supervisor_Puntos/Desktop/BRANGUS/INVENTARIOS/BALANCES';

const SEDES = [
  { dir: 'C:/Users/Supervisor_Puntos/Desktop/BRANGUS/INVENTARIOS/DECEPAZ/SEPTIEMBRE/31-06 SEPTIEMBRE', file: 'Balance 31-06 SEPTIEMBRE DECEPAZ.xlsx', sedeName: 'Decepaz' },
  { dir: 'C:/Users/Supervisor_Puntos/Desktop/BRANGUS/INVENTARIOS/NARANJOS/SEPTIEMBRE/01-06 SEPTIEMBRE', file: 'Balace 31-06 SEPTIEMBRE -2026 NARANJOS.xlsx', sedeName: 'Los Naranjos' },
  { dir: 'C:/Users/Supervisor_Puntos/Desktop/BRANGUS/INVENTARIOS/PLANTA POLLO/AGOSTO/03-09 AGOSTO', file: 'BALANCE 03-09 AGOSTO-PLANTA POLLO.xlsx', sedeName: 'Planta Pollo' },
  { dir: 'C:/Users/Supervisor_Puntos/Desktop/BRANGUS/INVENTARIOS/VILLA DEL LAGO/SEPTIEMBRE', file: 'BALANCE 31-06 SEPTIEMBRE AGOSTO  2026  VILLA DEL LAGO.xlsx', sedeName: 'Villa del Lago' },
  { dir: 'C:/Users/Supervisor_Puntos/Desktop/BRANGUS/INVENTARIOS/CHIMINANGOS/SEPTIEMBRE/01-06 SEPTEIMBRE', file: 'BALANCE 31-06 SEPTIEMBRE CHIMI.xlsx', sedeName: 'Chiminangos' },
  { dir: 'C:/Users/Supervisor_Puntos/Desktop/BRANGUS/INVENTARIOS/ALAMEDA/SEPTIEBRE/01-06 SEPTIEMBRE', file: 'BALANCE 31-06 SEPTIEMBRE 2026 ALAMEDA-.xlsx', sedeName: 'Alameda' },
  { dir: 'C:/Users/Supervisor_Puntos/Desktop/BRANGUS/INVENTARIOS/CASONA/SEPTIEMBRE/31-06 SEPTIEMBRE', file: 'BALANCE 31-06 SEPTIEMBREP 2026 - CASONA.xlsx', sedeName: 'Casona' },
  { dir: 'C:/Users/Supervisor_Puntos/Desktop/BRANGUS/INVENTARIOS/JAMUNDI/SEPTIEMBRE', file: 'BALANCE 01-06 septiembre 2026 JAMUNDI.xlsx', sedeName: 'Jamundí' },
];

const MAX_ROW = 45;
const COLS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];

// Hojas que se excluyen del backfill a proposito. Las que datan del
// 2026-08-02 se re-mapearon al nombre del archivo nuevo (mismas hojas,
// mismo criterio, el archivo fuente solo se renombro/actualizo). Las nuevas
// (2026-09-09) se verificaron encadenando Inventario Inicial/Final entre
// semanas consecutivas (el invFinal de una semana debe igualar el invInicial
// de la siguiente) — ver detalle en cada comentario.
const EXCLUDE_SHEETS = new Set([
  // Decepaz: Ventas (y en 2 casos Compras) vacias en el archivo original —
  // no hay nada que recalcular, la semana nunca se registro.
  'Balance 31-06 SEPTIEMBRE DECEPAZ.xlsx::Balance 15-21  2025 (46)',
  'Balance 31-06 SEPTIEMBRE DECEPAZ.xlsx::Balance  12-18 MAYO  2025 (17)',
  'Balance 31-06 SEPTIEMBRE DECEPAZ.xlsx::Balance 28 ENE-24 (4)',
  // Decepaz: "23-01 FEB-2026 (56)" y "26-01 FEB-2026 (52)" tienen datos
  // REALMENTE distintos pero ambos nombres de hoja colisionan en la misma
  // fecha calculada -- sin forma confiable de asignarles fechas exactas
  // distintas. Se excluyen ambas (quedan como hueco, igual que antes).
  'Balance 31-06 SEPTIEMBRE DECEPAZ.xlsx::Balance 23-01 FEB-2026 (56)',
  'Balance 31-06 SEPTIEMBRE DECEPAZ.xlsx::Balance 26-01 FEB-2026 (52)',
  // Los Naranjos: mismo caso (Ventas y Compras vacias).
  'Balace 31-06 SEPTIEMBRE -2026 NARANJOS.xlsx::Balance 26-01 FEB-2026 (58)',
  'Balace 31-06 SEPTIEMBRE -2026 NARANJOS.xlsx::Balance 27-02 NOV-  2025 (44)',
  // Los Naranjos: semana duplicada (13-19 jul 2026) en dos pestañas casi
  // identicas — se conserva "18 JULIO", se excluye "19 JULIO".
  'Balace 31-06 SEPTIEMBRE -2026 NARANJOS.xlsx::Balance 19 JULIO -2026 (82)',
  // Los Naranjos: "(55)" y "(54)" tienen Inventario Inicial Y Final IDENTICOS
  // -> duplicado real de la misma semana. Se conserva "(55)".
  'Balace 31-06 SEPTIEMBRE -2026 NARANJOS.xlsx::Balance 05-11  ENER -2026 (54)',
  // NOTA: la semana "BALANCE 20-26 JULIO 2026" de Villa del Lago, excluida en
  // 2026-08-02 por venir con Inventario Final en blanco, YA tiene todos los
  // campos completos en este archivo (el usuario terminó el conteo físico) —
  // se deja de excluir a proposito, ya no aplica.
  // Villa del Lago: "29-12 MAYO-24" y "06-12 MAYO-24" comparten el mismo
  // Inventario Final pero el rango de dias "29-12" no cuadra como semana
  // (14 dias); se conserva "06-12" por ser el rango normal de 7 dias.
  'BALANCE 31-06 SEPTIEMBRE AGOSTO  2026  VILLA DEL LAGO.xlsx::Balance 29-12  MAYO-24 (18)',
  // Chiminangos: dos hojas con nombre IDENTICO ("23-01 MARZO 2026") e
  // Inventario Inicial/Final tambien identicos -> duplicado real. Se
  // conserva "(77)".
  'BALANCE 31-06 SEPTIEMBRE CHIMI.xlsx::23-01 MARZO 2026  (76)',
  // Chiminangos: mismo nombre "10-16 AGOSTO 2026" en 4 hojas (en realidad 4
  // semanas distintas de agosto, ver MANUAL_WEEKS) — la version SIN sufijo
  // ya cae bien en 10-16 agosto por si sola, las otras 3 se reasignan abajo.

  // --- Nuevo 2026-09-09: Alameda, Casona y Jamundí, primer backfill ---
  // Alameda: mismo patron de Villa del Lago (rango de 14 dias no es semana).
  'BALANCE 31-06 SEPTIEMBRE 2026 ALAMEDA-.xlsx::Balance 29-12  MAYO-24 (18)',
  // Alameda: duplicados EXACTOS (mismo invInicial/invFinal/totalVentas) —
  // no es indispensable excluirlos (el UNIQUE de Postgres ya los protege),
  // pero se listan para que el resumen del dry-run quede limpio.
  'BALANCE 31-06 SEPTIEMBRE 2026 ALAMEDA-.xlsx::Balance 08-14 JUNIO  (64)',
  'BALANCE 31-06 SEPTIEMBRE 2026 ALAMEDA-.xlsx::Balance  05-11  Mayo 202 (11)',
  // Alameda: hoja extraviada fuera de secuencia ("(59)" repetido, con "2026"
  // agregado al nombre) con Inventario Inicial/Final IDENTICOS a
  // "Balance 27-03 MAYO  (59)" -> duplicado real de la misma semana.
  'BALANCE 31-06 SEPTIEMBRE 2026 ALAMEDA-.xlsx::Balance 27-03 MAYO  2026  (59)',
  // Casona: 2 hojas realmente vacias (todos los campos core en null salvo
  // uno) — mismo criterio que las de Decepaz arriba.
  'BALANCE 31-06 SEPTIEMBREP 2026 - CASONA.xlsx::18-24  MAYO   -2026 (19)',
  'BALANCE 31-06 SEPTIEMBREP 2026 - CASONA.xlsx::10-16 FEB 2025 (11)',
  // Jamundí: duplicado EXACTO (mismo invInicial/invFinal/totalVentas).
  'BALANCE 01-06 septiembre 2026 JAMUNDI.xlsx::12-18 AGOSTO -24 (12)',
]);

// Semanas donde el nombre de hoja/texto de periodo no basta para fechar la
// semana automaticamente, resueltas a mano. Las de 2026-08-02 se re-mapearon
// al nombre del archivo nuevo (misma hoja). Las de 2026-09-09 se verificaron
// encadenando Inventario Inicial/Final entre semanas consecutivas (el
// invFinal de una debe igualar el invInicial de la siguiente) y/o por
// posicion en la secuencia de la sede — mismo metodo que las de agosto.
const MANUAL_WEEKS = {
  'Balance 31-06 SEPTIEMBRE DECEPAZ.xlsx::Balance 22-28  2025 (47)': { weekStart: '2025-12-22', weekEnd: '2025-12-28' },
  'Balance 31-06 SEPTIEMBRE DECEPAZ.xlsx::Balance 08-14  2025 (45)': { weekStart: '2025-12-08', weekEnd: '2025-12-14' },
  // "Balance  enero 30-05 ener-25": el mes ("enero") aparece ANTES del rango
  // de dias, rompe el parseo automatico (que espera dia-rango primero). Por
  // posicion en la secuencia (justo despues de "23-29 Dic-24") es 30 dic - 05 ene.
  'Balance 31-06 SEPTIEMBRE DECEPAZ.xlsx::Balance  enero 30-05 ener-25': { weekStart: '2024-12-30', weekEnd: '2025-01-05' },
  // Chiminangos: "JUNIO" sin año en 3 hojas seguidas — por posicion (entre
  // "30-06 JULIO 2025 (43)" y "26-01 JUNIO-2025 (39)") son junio 2025.
  'BALANCE 31-06 SEPTIEMBRE CHIMI.xlsx::16-22  JUNIO  (42)': { weekStart: '2025-06-16', weekEnd: '2025-06-22' },
  'BALANCE 31-06 SEPTIEMBRE CHIMI.xlsx::09-15  JUNIO  (41)': { weekStart: '2025-06-09', weekEnd: '2025-06-15' },
  'BALANCE 31-06 SEPTIEMBRE CHIMI.xlsx::02-08  JUNIO  (40)': { weekStart: '2025-06-02', weekEnd: '2025-06-08' },

  // --- Nuevo 2026-09-09 ---
  // Los Naranjos: ambas hojas se llaman igual ("Balance 09 agosto -2026") —
  // sus propios "RESULTADO ..." SI son distintos y confirmados por cadena de
  // inventario (invFinal de (85) == invInicial de (86)).
  'Balace 31-06 SEPTIEMBRE -2026 NARANJOS.xlsx::Balance 09 agosto -2026 (85)': { weekStart: '2026-08-03', weekEnd: '2026-08-09' },
  'Balace 31-06 SEPTIEMBRE -2026 NARANJOS.xlsx::Balance 09 agosto -2026 (86)': { weekStart: '2026-08-10', weekEnd: '2026-08-16' },
  // Los Naranjos: hoja mas reciente con nombre desactualizado ("24-30
  // AGOSTO (3)") pero su propio periodText dice "31-06 SEPTIEMBRE 2026", y
  // su invInicial encadena exacto con el invFinal de la semana 24-30 agosto.
  'Balace 31-06 SEPTIEMBRE -2026 NARANJOS.xlsx::Balance 24-30 AGOSTO 2026 (3)': { weekStart: '2026-08-31', weekEnd: '2026-09-06' },
  // Planta Pollo: dos hojas con el mismo nombre ("02 AGOSTO 2026"), sin año
  // en el rango de dias; confirmado por su propio periodText + cadena de
  // inventario (invFinal de la primera == invInicial de la segunda).
  'BALANCE 03-09 AGOSTO-PLANTA POLLO.xlsx::02 AGOSTO 2026': { weekStart: '2026-07-20', weekEnd: '2026-07-26' },
  'BALANCE 03-09 AGOSTO-PLANTA POLLO.xlsx::02 AGOSTO 2026 (2)': { weekStart: '2026-07-27', weekEnd: '2026-08-02' },
  // Chiminangos: 4 hojas con el mismo nombre "10-16 AGOSTO 2026" (en
  // realidad 4 semanas consecutivas de agosto/septiembre) — confirmado por
  // cadena de inventario sin cortes (invFinal de una == invInicial de la
  // siguiente) y por venta creciente semana a semana, plausible. La version
  // sin sufijo ya cae bien en 10-16 agosto por si sola.
  'BALANCE 31-06 SEPTIEMBRE CHIMI.xlsx::10-16 AGOSTO 2026 (2)': { weekStart: '2026-08-17', weekEnd: '2026-08-23' },
  'BALANCE 31-06 SEPTIEMBRE CHIMI.xlsx::10-16 AGOSTO 2026 (3)': { weekStart: '2026-08-24', weekEnd: '2026-08-30' },
  'BALANCE 31-06 SEPTIEMBRE CHIMI.xlsx::10-16 AGOSTO 2026 (4)': { weekStart: '2026-08-31', weekEnd: '2026-09-06' },
  // Alameda: "27-03 MAYO (59)" y "04-10 MAYO (60)" no traen año en el nombre
  // y su periodText esta desactualizado (pegado de una semana anterior) —
  // fechadas por posicion (encajan sin huecos entre "18-24 MAYO (61)" y
  // "20-26 ABRIL2026 (58)", ambas ya fechadas correctamente).
  'BALANCE 31-06 SEPTIEMBRE 2026 ALAMEDA-.xlsx::Balance 04-10  MAYO  (60)': { weekStart: '2026-05-04', weekEnd: '2026-05-10' },
  'BALANCE 31-06 SEPTIEMBRE 2026 ALAMEDA-.xlsx::Balance 27-03 MAYO  (59)': { weekStart: '2026-04-27', weekEnd: '2026-05-03' },
  // Alameda: "(5)" y "(4)" se llaman igual ("09-15 DIC 24") pero son 2
  // semanas reales distintas. Cadena de inventario completa y sin cortes
  // confirmada desde "18-24 Nov 24" -> "25-01 DIC 24 (2)" -> "02-08 DIC 24
  // (3)" -> "(4)" -> "(5)": cada una encaja exacto (invFinal de una =
  // invInicial de la siguiente), y las 3 primeras ya caen bien por su propio
  // nombre — eso ubica a "(4)" en 09-15 dic (su nombre SI es correcto) y a
  // "(5)" en la semana siguiente, 16-22 dic (su nombre quedo desactualizado).
  'BALANCE 31-06 SEPTIEMBRE 2026 ALAMEDA-.xlsx::Balance 09-15 DIC  24  (5)': { weekStart: '2024-12-16', weekEnd: '2024-12-22' },
  // Casona: semana mas reciente, nombre sin fecha ("31-06 SEPTIEMBRE") — por
  // posicion, es la semana siguiente a "24-30 AGOSTO-2026 (4)".
  'BALANCE 31-06 SEPTIEMBREP 2026 - CASONA.xlsx::31-06 SEPTIEMBRE': { weekStart: '2026-08-31', weekEnd: '2026-09-06' },
  // Casona: "abril" sin año, encajan sin huecos entre "21-27 abril (19)"
  // (2025-04-21) y "31-06 ABRIL 2025 (16)" (2025-03-31).
  'BALANCE 31-06 SEPTIEMBREP 2026 - CASONA.xlsx::14-20  abril (18)': { weekStart: '2025-04-14', weekEnd: '2025-04-20' },
  'BALANCE 31-06 SEPTIEMBREP 2026 - CASONA.xlsx::07-13  abril (17)': { weekStart: '2025-04-07', weekEnd: '2025-04-13' },
  // Casona: 9 hojas seguidas con nombre "DD- MES-24-24 (n)" donde el "-24-24"
  // final se confunde con un rango de dias y el parser automatico calcula
  // mal la fecha — su propio "RESULTADO ..." SI trae el rango correcto, y
  // las 9 fechas de abajo se confirmaron encadenando Inventario Inicial/
  // Final semana a semana sin ningun corte (invFinal de una == invInicial
  // exacto de la siguiente, las 9 en fila).
  'BALANCE 31-06 SEPTIEMBREP 2026 - CASONA.xlsx::27- OCTUBRE-24-24 (26)': { weekStart: '2024-10-21', weekEnd: '2024-10-27' },
  'BALANCE 31-06 SEPTIEMBREP 2026 - CASONA.xlsx::20- OCTUBRE-24-24 (25)': { weekStart: '2024-10-14', weekEnd: '2024-10-20' },
  'BALANCE 31-06 SEPTIEMBREP 2026 - CASONA.xlsx::13- OCTUBRE-24-24 (24)': { weekStart: '2024-10-07', weekEnd: '2024-10-13' },
  'BALANCE 31-06 SEPTIEMBREP 2026 - CASONA.xlsx::06- OCTUBRE-24-24 (23)': { weekStart: '2024-09-30', weekEnd: '2024-10-06' },
  'BALANCE 31-06 SEPTIEMBREP 2026 - CASONA.xlsx::29 SEPT-24-24 (22)': { weekStart: '2024-09-23', weekEnd: '2024-09-29' },
  'BALANCE 31-06 SEPTIEMBREP 2026 - CASONA.xlsx::22 SEPT-24-24 (21)': { weekStart: '2024-09-16', weekEnd: '2024-09-22' },
  'BALANCE 31-06 SEPTIEMBREP 2026 - CASONA.xlsx::15 SEPT-24-24 (20)': { weekStart: '2024-09-09', weekEnd: '2024-09-15' },
  'BALANCE 31-06 SEPTIEMBREP 2026 - CASONA.xlsx::08 SEPT-24-24 (19)': { weekStart: '2024-09-02', weekEnd: '2024-09-08' },
  'BALANCE 31-06 SEPTIEMBREP 2026 - CASONA.xlsx::01 SEPT-24-24 (18)': { weekStart: '2024-08-26', weekEnd: '2024-09-01' },
};

// ---- mismas reglas que server/slug.js + src/core/normalize.js (duplicadas
// aquí porque este script corre en CommonJS fuera de Vite/ESM) ----
function removeAccents(str) {
  return String(str).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}
function normText(v) {
  return removeAccents(String(v == null ? '' : v).toUpperCase()).trim().replace(/\s+/g, ' ');
}
function sedeSlug(sedeName) {
  return normText(sedeName).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'sede';
}

function cellText(cell) {
  let v = cell.value;
  if (v == null) return '';
  if (typeof v === 'object' && v.richText) return v.richText.map((t) => t.text).join('');
  if (typeof v === 'object' && v.formula) return ''; // las formulas no cuentan como etiqueta de texto
  if (typeof v === 'object') return '';
  return String(v);
}
function cellNumber(cell) {
  let v = cell.value;
  if (v == null || v === '') return null;
  if (typeof v === 'object' && v.formula) v = v.result;
  if (typeof v === 'object') return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}
function normLabel(s) {
  return normText(s).replace(/:$/, '').trim();
}

const LABEL_MATCHERS = {
  invInicial: (n) => n === 'INVENTARIO INICIAL',
  invFinal: (n) => n === 'INVENTARIO FINAL',
  cmv: (n) => n === 'CMV' || n === 'COSTO MARGEN VENTA',
  utilidadBruta: (n) => n === 'UTILIDAD BRUTA',
  margenPct: (n) => n.startsWith('MARGEN'),
  totalVentas: (n) => n.includes('TOTAL VENTAS'),
  totalCompras: (n) => n.includes('TOTAL') && n.includes('COMPRAS') && n.includes('ENTRADAS'),
};

function scanSheet(ws) {
  const found = {};
  let periodText = null;
  let titleText = null;

  for (let r = 1; r <= Math.min(MAX_ROW, ws.rowCount || MAX_ROW); r++) {
    for (let ci = 0; ci < COLS.length; ci++) {
      const col = COLS[ci];
      const cell = ws.getCell(col + r);
      const text = cellText(cell);
      if (!text || !text.trim()) continue;
      const norm = normLabel(text);

      if (norm.startsWith('RENDIMIENTO') && !titleText) titleText = text.trim();
      if (norm.startsWith('RESULTADO') && norm !== 'RESULTADO DEL BALANCE' && !periodText) periodText = text.trim();

      for (const [key, matches] of Object.entries(LABEL_MATCHERS)) {
        if (found[key] != null) continue;
        if (!matches(norm)) continue;
        // valor: primera celda numerica a la derecha, hasta 6 columnas
        for (let k = ci + 1; k < Math.min(ci + 7, COLS.length); k++) {
          const vCell = ws.getCell(COLS[k] + r);
          const n = cellNumber(vCell);
          if (n != null) {
            found[key] = n;
            break;
          }
          const t = cellText(vCell).trim();
          if (t) break; // texto no numerico antes de llegar a un numero -> abandonar esta fila
        }
      }
    }
  }
  return { found, periodText, titleText };
}

// ---- parseo de fecha en español a partir del texto del periodo o del nombre de hoja ----
const MONTHS = {
  ENE: 1, ENERO: 1, ENRO: 1,
  FEB: 2, FEBRERO: 2,
  MAR: 3, MARZ: 3, MARZO: 3, MAERZO: 3,
  ABR: 4, ABRIL: 4, ABRI: 4,
  MAY: 5, MAYO: 5,
  JUN: 6, JUNIO: 6,
  JUL: 7, JULIO: 7,
  AGO: 8, AGOS: 8, AGOSTO: 8, AGOST: 8, // AGOST: typo visto en Alameda
  SEP: 9, SEPT: 9, SEPTIEMBRE: 9,
  OCT: 10, OCTU: 10, OCTUBRE: 10,
  NOV: 11, NOVIEMBRE: 11, INV: 11, NIV: 11, // INV/NIV: typos de "NOV" vistos en Jamundí
  DIC: 12, DICIEMBRE: 12,
};
const MONTH_RE = new RegExp('\\b(' + Object.keys(MONTHS).join('|') + ')\\b', 'i');

function parseYear(text, afterIndex) {
  // Un año de 4 digitos es inequivoco en cualquier parte del texto.
  const m4 = text.match(/\b(20\d{2})\b/);
  if (m4) return parseInt(m4[1], 10);
  // Un año de 2 digitos ("-24", "- 24", "24)") solo se busca DESPUES del mes:
  // antes del mes suelen ir los numeros del rango de dias ("23-29 DICIEMBRE"),
  // que si se buscan en todo el texto se confunden con el año.
  const suffix = afterIndex != null ? text.slice(afterIndex) : text;
  const m2 = suffix.match(/[-\s](\d{2})\b/);
  if (m2) {
    const yy = parseInt(m2[1], 10);
    if (yy <= 39) return 2000 + yy; // rango plausible (2000-2039); descarta nros de secuencia tipo "(52)"
  }
  return null;
}

function toISO(y, m, d) {
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
}

function parseWeekFromText(rawText) {
  if (!rawText) return null;
  // Espacia digito-letra ("18-24AGOSTO" -> "18-24 AGOSTO") para que \b del
  // regex de mes no falle cuando el nombre de hoja no tiene espacio, y
  // normaliza "14 AL 20"/"14 A 20" (rango en palabras) a "14-20" para que el
  // regex de rango de dias los reconozca igual que un guion.
  const text = normText(rawText).replace(/(\d)([A-Z])/g, '$1 $2').replace(/([A-Z])(\d)/g, '$1 $2')
    .replace(/(\d{1,2})\s+(?:AL|A)\s+(\d{1,2})\b/, '$1-$2');
  const monthMatch = text.match(MONTH_RE);
  if (!monthMatch) return null;
  const month = MONTHS[monthMatch[1].toUpperCase()];
  const year = parseYear(text, monthMatch.index + monthMatch[0].length);
  if (!year) return null;

  const dayRange = text.match(/(\d{1,2})\s*[-–]\s*(\d{1,2})/);
  let endDay, startDay;
  if (dayRange) {
    startDay = parseInt(dayRange[1], 10);
    endDay = parseInt(dayRange[2], 10);
  } else {
    const single = text.match(/\b(\d{1,2})\b/);
    if (!single) return null;
    endDay = parseInt(single[1], 10);
    startDay = null;
  }

  const endISO = toISO(year, month, endDay);
  if (!endISO) return null;
  const endDate = new Date(endISO + 'T00:00:00Z');

  let startISO;
  if (startDay != null) {
    // el mes de inicio puede ser el mismo o el anterior (rangos como "31-06 ABRIL" o "24-02 MAR")
    let startDate = new Date(endDate);
    startDate.setUTCDate(endDate.getUTCDate() - 6);
    // si el numero de dia calculado no coincide con startDay pero la diferencia es de un mes, se acepta igual:
    // confiamos en "endDay menos 6" como fuente de verdad (mas robusto que reconstruir el mes de inicio a mano).
    startISO = startDate.toISOString().slice(0, 10);
  } else {
    const startDate = new Date(endDate);
    startDate.setUTCDate(endDate.getUTCDate() - 6);
    startISO = startDate.toISOString().slice(0, 10);
  }
  return { weekStart: startISO, weekEnd: endISO };
}

const CORE_FIELDS = ['invInicial', 'invFinal', 'cmv', 'utilidadBruta', 'margenPct', 'totalVentas', 'totalCompras'];

async function processFile({ dir, file, sedeName }) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path.join(dir || DIR, file));
  const slug = sedeSlug(sedeName);

  const rows = [];
  const skippedEmpty = [];
  const missingFields = [];
  const dateFallback = [];
  const unparsedDate = [];

  const excludedCount = { n: 0 };
  for (const ws of wb.worksheets) {
    if (EXCLUDE_SHEETS.has(file + '::' + ws.name)) {
      excludedCount.n++;
      continue;
    }
    const { found, periodText, titleText } = scanSheet(ws);
    const hasAnyCore = CORE_FIELDS.some((k) => found[k] != null);
    if (!hasAnyCore) {
      skippedEmpty.push(ws.name);
      continue;
    }

    const missing = CORE_FIELDS.filter((k) => found[k] == null);
    if (missing.length) missingFields.push({ sheet: ws.name, missing });

    // El nombre de hoja es la fuente primaria: Excel garantiza que sea unico
    // dentro del archivo, mientras que el texto de "RESULTADO ..." a veces
    // quedo pegado de una semana anterior (tab duplicado sin actualizar el
    // encabezado) — eso causaba colisiones de fecha entre semanas distintas.
    const manual = MANUAL_WEEKS[file + '::' + ws.name];
    let week = manual || parseWeekFromText(ws.name);
    let dateSource = manual ? 'manual' : 'nombre_hoja';
    if (!week) {
      week = parseWeekFromText(periodText);
      dateSource = 'periodo';
    }
    if (!week) {
      unparsedDate.push(ws.name);
      dateSource = 'sin_fecha';
    } else if (dateSource === 'periodo') {
      dateFallback.push(ws.name);
    }

    const weekKey = week ? week.weekStart : 'sinfecha-' + normText(ws.name).toLowerCase().replace(/[^a-z0-9]+/g, '-');

    rows.push({
      sedeSlug: slug,
      sedeName,
      sheetName: ws.name,
      periodText,
      titleText,
      dateSource,
      weekKey,
      weekStart: week ? week.weekStart : null,
      weekEnd: week ? week.weekEnd : null,
      computed: {
        totalVentas: found.totalVentas ?? null,
        totalCompras: found.totalCompras ?? null,
        invInicial: found.invInicial ?? null,
        invFinal: found.invFinal ?? null,
        cmv: found.cmv ?? null,
        utilidadBruta: found.utilidadBruta ?? null,
        margenPct: found.margenPct ?? null,
      },
    });
  }

  rows.sort((a, b) => (a.weekStart || '9999').localeCompare(b.weekStart || '9999'));

  return { sedeName, slug, file, rows, skippedEmpty, missingFields, dateFallback, unparsedDate, excluded: excludedCount.n };
}

async function main() {
  const results = [];
  for (const s of SEDES) {
    results.push(await processFile(s));
  }

  for (const r of results) {
    console.log('\n========================================');
    console.log(r.sedeName, '(' + r.slug + ')  —', r.file);
    console.log('  semanas detectadas:', r.rows.length, '  (excluidas a proposito:', r.excluded + ')');
    console.log('  hojas vacias/omitidas:', r.skippedEmpty.length, r.skippedEmpty.length ? JSON.stringify(r.skippedEmpty) : '');
    console.log('  hojas con campos faltantes:', r.missingFields.length);
    r.missingFields.slice(0, 10).forEach((m) => console.log('    -', m.sheet, '-> falta:', m.missing.join(', ')));
    if (r.missingFields.length > 10) console.log('    ... y', r.missingFields.length - 10, 'mas');
    console.log('  fecha por texto de periodo (nombre de hoja no bastaba):', r.dateFallback.length);
    console.log('  fecha NO parseada (usa week_key basado en el nombre de hoja):', r.unparsedDate.length);
    if (r.unparsedDate.length) console.log('    hojas:', JSON.stringify(r.unparsedDate));
    const byKey = {};
    for (const row of r.rows) (byKey[row.weekKey] ||= []).push(row.sheetName);
    const dupes = Object.entries(byKey).filter(([, v]) => v.length > 1);
    if (dupes.length) {
      console.log('  ATENCION - week_key duplicado (solo se insertaria el primero):');
      dupes.forEach(([k, v]) => console.log('    ', k, '<-', JSON.stringify(v)));
    }
    if (r.rows.length) {
      const withDate = r.rows.filter((x) => x.weekStart);
      if (withDate.length) console.log('  rango de fechas:', withDate[0].weekStart, '→', withDate[withDate.length - 1].weekStart);
      console.log('  muestra (primeras 3):');
      r.rows.slice(0, 3).forEach((x) => console.log('   ', x.weekKey, JSON.stringify(x.computed)));
      console.log('  muestra (ultimas 3):');
      r.rows.slice(-3).forEach((x) => console.log('   ', x.weekKey, JSON.stringify(x.computed)));
    }
  }

  const totalRows = results.reduce((a, r) => a + r.rows.length, 0);
  console.log('\n========================================');
  console.log('TOTAL semanas parseadas en las 4 sedes:', totalRows);

  const shouldCommit = process.argv.includes('--commit');
  if (!shouldCommit) {
    console.log('\n(dry run — no se escribio nada en la base de datos. Correr con --commit para insertar.)');
    return;
  }

  if (!process.env.DATABASE_URL) {
    console.error('\nERROR: --commit requiere DATABASE_URL en el entorno (ej. `railway run -- node scripts/backfill_balance_history.cjs --commit`).');
    process.exitCode = 1;
    return;
  }

  const { Pool } = require('pg');
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false },
  });

  let inserted = 0, skippedExisting = 0;
  for (const r of results) {
    for (const row of r.rows) {
      const res = await pool.query(
        `insert into balance_weeks (sede_slug, sede_name, week_key, week_start, week_end, inputs, computed)
         values ($1, $2, $3, $4, $5, $6, $7)
         on conflict (sede_slug, week_key) do nothing
         returning id`,
        [
          row.sedeSlug,
          row.sedeName,
          row.weekKey,
          row.weekStart,
          row.weekEnd,
          JSON.stringify({ backfilled: true, sourceFile: r.file, sourceSheet: row.sheetName, periodText: row.periodText, titleText: row.titleText, dateSource: row.dateSource }),
          JSON.stringify(row.computed),
        ]
      );
      if (res.rows.length) inserted++; else skippedExisting++;
    }
  }
  console.log('\nInsertadas:', inserted, '| ya existian (sin tocar):', skippedExisting);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
