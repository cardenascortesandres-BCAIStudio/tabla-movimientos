// Backfill de movimientos_weeks a partir de los archivos reales "Tabla de
// Movimientos" (ya editados/corregidos a mano, con Disponible/Diferencia KL/
// % Diferencia calculados) en Desktop/BRANGUS/INVENTARIOS/<SEDE>/<MES>/<SEMANA>/.
// El CONTENIDO decide cuál archivo es el correcto en cada carpeta de semana
// (los nombres de archivo son muy inconsistentes entre sedes y meses) —
// se prueban TODOS los .xls/.xlsx de la carpeta y se toma el único que
// parsea como Tabla de Movimientos real (>20 productos con sus 12 bloques
// de categoría: Finas, Pulpas, Segundas, Molida, Costilla de Res, Vísceras,
// Pulpa de Cerdo, Tocineta y Costilla, Otros Cortes, Pollo, Pescado,
// Salsamentaria — ver src/core/movimientosBloques.js).
//
// A propósito NO se incluye Planta Pollo (ya no es un punto activo, ver
// commit "Unifica Presupuesto..."). La semana del 14-20 de septiembre de
// 2026 se excluyó en el primer backfill (2026-09-21, todavía en curso) y se
// habilitó el 2026-09-24 cuando el usuario terminó de cargarla a mano.
//
// Uso:
//   node scripts/import_movimientos_history.cjs           -> dry run (no escribe nada)
//   node scripts/import_movimientos_history.cjs --commit   -> upsert en Postgres

const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');

const BASE = 'C:/Users/Supervisor_Puntos/Desktop/BRANGUS/INVENTARIOS';
// Carpeta real -> nombre canónico de sede (mismo 1:1 usado en todo el
// proyecto para Balance/Ventas/Presupuesto) — evita tener que "adivinar" el
// nombre de sede desde el contenido del archivo (fuente de varios bugs de
// sedes duplicadas esta sesión).
const SEDES = [
  ['ALAMEDA', 'Alameda'],
  ['CASONA', 'Casona'],
  ['CHIMINANGOS', 'Chiminangos'],
  ['DECEPAZ', 'Decepaz'],
  ['JAMUNDI', 'Jamundí'],
  ['VILLA DEL LAGO', 'Villa del Lago'],
  ['NARANJOS', 'Los Naranjos'],
];

// Semana que estuvo excluida (en curso, sin terminar de cargar) hasta el
// 2026-09-24 — ya no se excluye ninguna, se deja el mecanismo por si hace
// falta de nuevo con una semana futura.
const EXCLUDED_WEEK_START = null;

// ---- normalización de texto (igual que src/core/normalize.js) ----
function removeAccents(str) { return String(str).normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
function normText(v) { return removeAccents(String(v == null ? '' : v).toUpperCase()).trim().replace(/\s+/g, ' '); }
function sedeSlug(sedeName) { return normText(sedeName).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'sede'; }

// ---- bloques canónicos (puerto de src/core/movimientosBloques.js) ----
const BLOQUE_ALIASES = {
  finas: 'Finas',
  pulpa: 'Pulpas', pulpas: 'Pulpas',
  segundas: 'Segundas',
  molida: 'Molida',
  'costilla de res': 'Costilla de Res',
  visceras: 'Vísceras',
  'pulpa de cerdo': 'Pulpa de Cerdo',
  'tocineta y costilla': 'Tocineta y Costilla', 'tocineta costilla': 'Tocineta y Costilla',
  'otros cortes': 'Otros Cortes',
  pollo: 'Pollo',
  pescado: 'Pescado',
  salsamentaria: 'Salsamentaria',
};
const BLOQUE_SIN_CLASIFICAR = 'Sin clasificar';
function matchCanonicalBloque(nameRaw) {
  const norm = normText(nameRaw).toLowerCase().replace(/[&+]/g, 'y').replace(/\s+/g, ' ').trim();
  return BLOQUE_ALIASES[norm] || null;
}

// ---- parseo de fecha en español (puerto de scripts/backfill_balance_history.cjs) ----
const MONTHS = {
  ENE: 1, ENERO: 1, FEB: 2, FEBRERO: 2, MAR: 3, MARZO: 3, ABR: 4, ABRIL: 4, MAY: 5, MAYO: 5,
  JUN: 6, JUNIO: 6, JUL: 7, JULIO: 7, AGO: 8, AGOS: 8, AGOSTO: 8, AGOST: 8,
  SEP: 9, SEPT: 9, SEPTIEMBRE: 9, SEPTEIMBRE: 9, SEPTIEBRE: 9,
  OCT: 10, OCTUBRE: 10, NOV: 11, NOVIEMBRE: 11, DIC: 12, DICIEMBRE: 12,
};
const MONTH_RE = new RegExp('\\b(' + Object.keys(MONTHS).join('|') + ')\\b', 'i');
function toISO(y, m, d) {
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
}
// A diferencia del backfill de Balance, casi ninguna hoja/carpeta de
// Movimientos trae el año explícito ("10-16 AGOSTO", sin "2026") — todos
// los archivos de BRANGUS/INVENTARIOS son de 2026, así que se asume ese año
// cuando no aparece uno explícito en el texto.
const DEFAULT_YEAR = 2026;
// Estrategia general (probada contra los ~50 nombres reales de carpeta/hoja
// de este backfill, con formatos muy distintos entre sedes: "10-16 AGOSTO",
// "14 20 septiembre" (guion perdido al pasar a nombre de hoja de Excel),
// "03 AGOSTO AL 09 AGOSTO", "DEL 03 AL 09 DE AGOSTO", "27 JULIO AL 02
// AGOSTO"...): se quitan las palabras conectoras sin valor de fecha
// (DEL/DE/AL/A), se toma el ÚLTIMO mes mencionado (es el mes de cierre en
// todos los formatos vistos, incluso cuando el rango cruza de mes) y el
// ÚLTIMO número de 1-2 dígitos como día de cierre — el día de inicio nunca
// hace falta calcularlo directo: se confía en "día de cierre menos 6" (más
// robusto que reconstruir el mes de inicio a mano, igual que en el backfill
// de Balance).
function parseWeekFromText(rawText) {
  if (!rawText) return null;
  const text = normText(rawText).replace(/(\d)([A-Z])/g, '$1 $2').replace(/([A-Z])(\d)/g, '$1 $2')
    .replace(/\b(DEL|DE|AL|A)\b/g, ' ');
  const monthMatches = Array.from(text.matchAll(new RegExp(MONTH_RE.source, 'gi')));
  if (!monthMatches.length) return null;
  const month = MONTHS[monthMatches[monthMatches.length - 1][1].toUpperCase()];
  const m4 = text.match(/\b(20\d{2})\b/);
  const year = m4 ? parseInt(m4[1], 10) : DEFAULT_YEAR;

  const dayTokens = Array.from(text.matchAll(/\b(\d{1,2})\b/g)).map((m) => parseInt(m[1], 10)).filter((d) => d >= 1 && d <= 31);
  if (!dayTokens.length) return null;
  const endDay = dayTokens[dayTokens.length - 1];
  const endISO = toISO(year, month, endDay);
  if (!endISO) return null;
  const endDate = new Date(endISO + 'T00:00:00Z');
  const startDate = new Date(endDate);
  startDate.setUTCDate(endDate.getUTCDate() - 6);
  const startISO = startDate.toISOString().slice(0, 10);
  return { weekStart: startISO, weekEnd: endISO };
}

// ---- parseo de la tabla ya editada (puerto de src/core/parseFinalMovimientos.js) ----
function findCol(headerRow, matchers) {
  for (let c = 0; c < headerRow.length; c++) {
    const h = normText(headerRow[c]);
    if (!h) continue;
    if (matchers.some((m) => h.includes(m))) return c;
  }
  return -1;
}
function toNum(v) {
  if (typeof v === 'number') return v;
  if (v == null || String(v).trim() === '') return 0;
  const n = parseFloat(String(v).replace(/,/g, ''));
  return isNaN(n) ? 0 : n;
}
function normalizeCode(raw) {
  if (raw == null) return '';
  let s = String(raw).trim().replace(/,/g, '').replace(/\s+/g, '');
  if (/^\d+\.0+$/.test(s)) s = s.replace(/\.0+$/, '');
  return s;
}
function detectHeaderRowSimple(rows, maxScan) {
  const limit = Math.min(rows.length, maxScan);
  for (let r = 0; r < limit; r++) {
    const row = rows[r] || [];
    let codeCol = -1, detCol = -1;
    for (let c = 0; c < row.length; c++) {
      const h = normText(row[c]);
      if (!h) continue;
      if (codeCol === -1 && (h === 'CODIGO' || h === 'ITEM')) codeCol = c;
      if (detCol === -1 && (h === 'DETALLE' || h === 'PRODUCTO' || h === 'DESCRIPCION')) detCol = c;
    }
    if (codeCol !== -1 && detCol !== -1) return { headerRowIndex: r, codeCol, detCol };
  }
  return null;
}
function parseFinalMovimientosFile(rows, sedeName) {
  const headerInfo = detectHeaderRowSimple(rows, 40);
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
    const isRowEmpty = row.every((cell) => cell === undefined || cell === null || String(cell).trim() === '');
    if (isRowEmpty) continue;
    if (!codeNorm && nameNorm && !nameNorm.startsWith('TOTAL')) {
      sections.push({ category: nameNorm, items: buffer });
      buffer = [];
      continue;
    }
    if (!codeNorm) continue;
    buffer.push({
      code: String(codeRaw), name: String(nameRaw == null ? '' : nameRaw).trim(),
      disponible: toNum(row[disponibleCol]), diferenciaKL: toNum(row[diferenciaCol]),
      pct: pctCol !== -1 ? toNum(row[pctCol]) : null,
    });
  }
  if (buffer.length && !sections.length) return null;

  const byCategory = new Map();
  const allProductRows = [];
  let totalDisponible = 0, totalDiferencia = 0;
  sections.forEach((sec) => {
    const category = matchCanonicalBloque(sec.category) || BLOQUE_SIN_CLASIFICAR;
    const catDisp = sec.items.reduce((a, i) => a + i.disponible, 0);
    const catDiff = sec.items.reduce((a, i) => a + i.diferenciaKL, 0);
    if (!byCategory.has(category)) byCategory.set(category, { disponible: 0, diferenciaKL: 0 });
    const agg = byCategory.get(category);
    agg.disponible += catDisp;
    agg.diferenciaKL += catDiff;
    sec.items.forEach((it) => {
      allProductRows.push({ sede: sedeName, category, code: it.code, name: it.name, diferenciaKL: it.diferenciaKL, disponible: it.disponible });
    });
    totalDisponible += catDisp;
    totalDiferencia += catDiff;
  });
  const totalProductosNeg = allProductRows.filter((p) => p.diferenciaKL < -0.01).length;
  return { byCategory, allProductRows, totalDisponible, totalDiferencia, totalProductosNeg };
}

// ---- descubrimiento de archivos (mismo criterio ya verificado manualmente) ----
function walk(dir) {
  let out = [];
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out = out.concat(walk(full));
    else if (/\.(xlsx|xls)$/i.test(e.name)) out.push(full);
  }
  return out;
}

async function main() {
  const allResults = [];
  for (const [folderName, sedeName] of SEDES) {
    const sedeDir = path.join(BASE, folderName);
    if (!fs.existsSync(sedeDir)) { console.log('=== ' + sedeName + ': CARPETA NO EXISTE, se omite ==='); continue; }
    const files = walk(sedeDir);
    const byFolder = new Map();
    files.forEach((f) => {
      const folder = path.dirname(f);
      if (!byFolder.has(folder)) byFolder.set(folder, []);
      byFolder.get(folder).push(f);
    });

    console.log('\n########## ' + sedeName + ' ##########');
    for (const folder of Array.from(byFolder.keys()).sort()) {
      const rel = folder.replace(sedeDir, '').replace(/^[\\/]/, '');
      const candidates = [];
      for (const f of byFolder.get(folder)) {
        try {
          const wb = XLSX.readFile(f);
          for (const sheetName of wb.SheetNames.slice(0, 3)) {
            const ws = wb.Sheets[sheetName];
            const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true });
            const data = parseFinalMovimientosFile(rows, sedeName);
            if (data && data.allProductRows.length > 20) {
              candidates.push({ file: path.basename(f), sheetName, data });
              break;
            }
          }
        } catch { /* archivo no legible como Excel, se ignora */ }
      }
      if (!candidates.length) continue;
      if (candidates.length > 1) {
        console.log('  [' + rel + ']  ⚠ ' + candidates.length + ' archivos parecen válidos — se omite, requiere revisión manual:');
        candidates.forEach((c) => console.log('      - ' + c.file + ' (hoja "' + c.sheetName + '")'));
        continue;
      }
      const { file, sheetName, data } = candidates[0];
      // La carpeta (organizada a mano por semana) es más confiable que el
      // nombre de la hoja de Excel: se vieron hojas con typos reales ("10 19
      // agosto" en vez de "10 16") y hojas sin mes ("24-30 ALAMEDA"). Se
      // prueba solo el nombre INMEDIATO de la carpeta (no la ruta completa:
      // "AGOSTO\24-30 AGOSTO" repite "AGOSTO" dos veces y el regex tomaba la
      // primera aparición, la del mes-padre, en vez de la del rango real).
      const week = parseWeekFromText(path.basename(folder)) || parseWeekFromText(sheetName);
      if (!week) {
        console.log('  [' + rel + ']  ⚠ ' + file + ' — NO se pudo determinar la semana (fecha), se omite.');
        continue;
      }
      if (week.weekStart === EXCLUDED_WEEK_START) {
        console.log('  [' + rel + ']  (excluida a propósito: semana en curso 14-20 sep 2026)');
        continue;
      }
      const cats = Array.from(data.byCategory.keys());
      const extra = cats.filter((c) => c === BLOQUE_SIN_CLASIFICAR);
      const flag = extra.length ? '  ⚠ tiene productos sin clasificar (ver detalle)' : '';
      console.log('  [' + rel + ']  ' + file + ' -> semana ' + week.weekStart + ' a ' + week.weekEnd + ' | disp=' + Math.round(data.totalDisponible) + ' dif=' + Math.round(data.totalDiferencia * 100) / 100 + ' bloques=' + cats.length + flag);
      allResults.push({
        sedeName, slug: sedeSlug(sedeName), weekKey: week.weekStart, weekStart: week.weekStart, weekEnd: week.weekEnd,
        sourceFile: file, sourceSheet: sheetName,
        computed: {
          totalDisponible: data.totalDisponible, totalDiferencia: data.totalDiferencia, totalProductosNeg: data.totalProductosNeg,
          byCategory: Array.from(data.byCategory.entries()).map(([category, v]) => ({ category, ...v })),
          allProductRows: data.allProductRows, // detalle por producto — ver "Diferencia KL por bloque" en Reportes > Tabla de Movimientos
        },
      });
    }
  }

  console.log('\n========================================');
  console.log('TOTAL semanas a importar:', allResults.length);
  const bySede = {};
  allResults.forEach((r) => { (bySede[r.sedeName] ||= []).push(r.weekKey); });
  Object.entries(bySede).forEach(([sede, weeks]) => console.log('  ' + sede + ': ' + weeks.length + ' semana(s) —', weeks.sort().join(', ')));

  const shouldCommit = process.argv.includes('--commit');
  if (!shouldCommit) {
    console.log('\n(dry run — no se escribió nada en la base de datos. Correr con --commit para insertar.)');
    return;
  }
  if (!process.env.DATABASE_URL) {
    console.error('\nERROR: --commit requiere DATABASE_URL en el entorno.');
    process.exitCode = 1;
    return;
  }
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  let inserted = 0, updated = 0;
  for (const r of allResults) {
    const res = await pool.query(
      `insert into movimientos_weeks (sede_slug, sede_name, week_key, week_start, week_end, computed)
       values ($1, $2, $3, $4, $5, $6)
       on conflict (sede_slug, week_key)
       do update set sede_name = excluded.sede_name, week_start = excluded.week_start, week_end = excluded.week_end, computed = excluded.computed
       returning (xmax = 0) as inserted`,
      [r.slug, r.sedeName, r.weekKey, r.weekStart, r.weekEnd, JSON.stringify(r.computed)]
    );
    if (res.rows[0].inserted) inserted++; else updated++;
  }
  console.log('\nInsertadas:', inserted, '| actualizadas (ya existían):', updated);
  await pool.end();
}

main().catch((err) => { console.error(err); process.exitCode = 1; });
