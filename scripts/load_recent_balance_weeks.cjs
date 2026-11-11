// Carga las semanas de Balance que faltan en produccion (2026-09-21 en
// adelante) para cada sede. A diferencia de scripts/backfill_balance_history.cjs
// (que confia en el nombre de pestaña/texto de periodo para fechar cada
// semana, resuelto a mano con EXCLUDE_SHEETS/MANUAL_WEEKS para el archivo
// consolidado viejo), aqui la fecha de cada semana viene de la CARPETA en la
// que el usuario la organizo a mano (mismo criterio ya probado en
// import_movimientos_history.cjs) — el archivo de Balance dentro de esa
// carpeta trae esa semana como su primera pestaña (la mas nueva), y es esa
// pestaña la que se lee, sin importar si su propio nombre/periodo interno
// quedo desactualizado (bug ya visto: pestañas nuevas sin año en el nombre).
//
// Cada semana se valida encadenando Inventario Final/Inicial contra la
// semana anterior (de la base de datos o de esta misma corrida) antes de
// aceptarla — si no encadena, se marca y NO se inserta sin revision.
//
// CASONA se omite a proposito: el usuario la esta cargando/corrigiendo a
// mano (2026-11-11) y pidio explicitamente no tocarla todavia.
// PLANTA POLLO tampoco se incluye: ya no es un punto activo.
//
// Uso:
//   node --env-file=.env scripts/load_recent_balance_weeks.cjs           -> dry run
//   node --env-file=.env scripts/load_recent_balance_weeks.cjs --commit  -> upsert en Postgres

const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');

const BASE = 'C:/Users/Supervisor_Puntos/Desktop/BRANGUS/INVENTARIOS';

const WEEKS = [
  { weekStart: '2026-09-21', weekEnd: '2026-09-27' },
  { weekStart: '2026-09-28', weekEnd: '2026-10-04' },
  { weekStart: '2026-10-05', weekEnd: '2026-10-11' },
  { weekStart: '2026-10-12', weekEnd: '2026-10-18' },
  { weekStart: '2026-10-19', weekEnd: '2026-10-25' },
  { weekStart: '2026-10-26', weekEnd: '2026-11-01' },
  { weekStart: '2026-11-02', weekEnd: '2026-11-08' },
];

// carpeta (relativa a BASE) para cada una de las 7 semanas de arriba, en el
// mismo orden, por sede.
const SEDES = {
  Alameda: [
    'ALAMEDA/SEPTIEBRE/21-27 SEPTIEMBRE',
    'ALAMEDA/SEPTIEBRE/28 SEPTIEMBRE- 04 OCTUBRE',
    'ALAMEDA/OCTUBRE/05-11 OCTUBRE',
    'ALAMEDA/OCTUBRE/12-18 OCTUBRE',
    'ALAMEDA/OCTUBRE/19-25 OCTUBRE',
    'ALAMEDA/OCTUBRE/26-01 Noviembre',
    'ALAMEDA/NOVIEMBRE/02-08',
  ],
  Chiminangos: [
    'CHIMINANGOS/SEPTIEMBRE/21-27 SEPTIEMBRE',
    'CHIMINANGOS/SEPTIEMBRE/28 SEPTIEMBRE AL 04 OCTUBRE',
    'CHIMINANGOS/OCTUBRE/05-11 OCTUBRE',
    'CHIMINANGOS/OCTUBRE/12-18 OCTUBRE',
    'CHIMINANGOS/OCTUBRE/19-25 OCTUBRE',
    'CHIMINANGOS/OCTUBRE/26 Octubre-01 Noviembre',
    'CHIMINANGOS/NOVIEMBRE/02-08',
  ],
  Decepaz: [
    'DECEPAZ/SEPTIEMBRE/21-27 SEPTIEMBRE',
    'DECEPAZ/SEPTIEMBRE/28 SEPTIEMBRE AL 04 OCTUBRE',
    'DECEPAZ/OCTUBRE/05-11 OCTUBRE',
    'DECEPAZ/OCTUBRE/12-18 OCTUBRE',
    'DECEPAZ/OCTUBRE/19-25 OCTUBRE',
    'DECEPAZ/OCTUBRE/26 Octubre-01 Noviembre',
    'DECEPAZ/NOVIEMBRE/02-08',
  ],
  'Jamundí': [
    'JAMUNDI/SEPTIEMBRE/21-27 SEPTIEMBRE',
    'JAMUNDI/SEPTIEMBRE/28 SEPTIEMBRE AL 04 OCTUBRE',
    'JAMUNDI/OCTUBRE/05-11 OCTUBRE',
    'JAMUNDI/OCTUBRE/12-18 OCTUBRE',
    'JAMUNDI/OCTUBRE/19-25 OCTUBRE',
    'JAMUNDI/OCTUBRE/26 Octubre-01 Noviembre',
    'JAMUNDI/NOVIEMBRE/02-08',
  ],
  'Villa del Lago': [
    'VILLA DEL LAGO/SEPTIEMBRE/21-27 SEPTIEMBRE',
    'VILLA DEL LAGO/SEPTIEMBRE/28 SEPTIEMBRE 04 OCTUBRE',
    'VILLA DEL LAGO/OCTUBRE/05-11 OCTUBRE',
    'VILLA DEL LAGO/OCTUBRE/12-18 OCTUBRE',
    'VILLA DEL LAGO/OCTUBRE/19-25 OCTUBRE',
    'VILLA DEL LAGO/OCTUBRE/26 Octubre 01 Noviembre',
    'VILLA DEL LAGO/NOVIEMBRE/02-08',
  ],
  'Los Naranjos': [
    'NARANJOS/SEPTIEMBRE/21-27 SEPTIEMBRE',
    'NARANJOS/SEPTIEMBRE/28 SEPTIEMBRE AL 04 DE OCTUBRE',
    'NARANJOS/OCTUBRE/05-11 OCTUBRE',
    'NARANJOS/OCTUBRE/12-18 OCTUBRE',
    'NARANJOS/OCTUBRE/19-25 OCTUBRE',
    'NARANJOS/OCTUBRE/26 Octubre 01 Noviembre',
    'NARANJOS/NOVIEMBRE/02-08',
  ],
  Casona: [
    'CASONA/SEPTIEMBRE/21-27 SEPTIEMBRE',
    'CASONA/SEPTIEMBRE/28 SEPTIEMBRE 04 OCTUBRE',
    'CASONA/OCTUBRE/05-11 OCTUBRE',
    'CASONA/OCTUBRE/12-18 OCTUBRE',
    'CASONA/OCTUBRE/19-25 OCTUBRE',
    'CASONA/OCTUBRE/26 Octubre 01 Noviembre',
    'CASONA/NOVIEMBRE/02-08',
  ],
};

const MAX_ROW = 45;
const COLS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];

function removeAccents(str) { return String(str).normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
function normText(v) { return removeAccents(String(v == null ? '' : v).toUpperCase()).trim().replace(/\s+/g, ' '); }
function sedeSlug(sedeName) { return normText(sedeName).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'sede'; }

function cellText(cell) {
  let v = cell.value;
  if (v == null) return '';
  if (typeof v === 'object' && v.richText) return v.richText.map((t) => t.text).join('');
  if (typeof v === 'object' && v.formula) return '';
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
function normLabel(s) { return normText(s).replace(/:$/, '').trim(); }

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
        for (let k = ci + 1; k < Math.min(ci + 7, COLS.length); k++) {
          const vCell = ws.getCell(COLS[k] + r);
          const n = cellNumber(vCell);
          if (n != null) { found[key] = n; break; }
          const t = cellText(vCell).trim();
          if (t) break;
        }
      }
    }
  }
  return { found, periodText, titleText };
}

const CORE_FIELDS = ['invInicial', 'invFinal', 'cmv', 'utilidadBruta', 'margenPct', 'totalVentas', 'totalCompras'];

function findBalanceFiles(folder) {
  let entries;
  try { entries = fs.readdirSync(folder, { withFileTypes: true }); } catch { return []; }
  return entries
    .filter((e) => e.isFile() && /\.(xlsx|xls)$/i.test(e.name) && /balan[cç]|balace/i.test(e.name))
    .map((e) => path.join(folder, e.name));
}

// Casos donde la pestaña 0 (la mas nueva) del archivo de esa semana NO es la
// semana real que le corresponde a esa carpeta (nombre de pestaña rezagado
// de la semana anterior, bien real sin terminar de llenar con Inventario
// Final/Compras) — confirmado semana por semana encadenando Inventario
// Inicial/Final contra la semana anterior ya cargada. Formato: 'Sede|weekStart' -> indice de pestaña.
const SHEET_INDEX_OVERRIDE = {
  // Decepaz 26 oct-01 nov: la pestaña 0 ("Balance 02-08 Noviembre") es en
  // realidad un borrador de la semana SIGUIENTE sin terminar (Inventario
  // Final y Compras en blanco); la pestaña 1 ("Balance 26 Octubre-01
  // Noviembre") es la semana real, completa, y encadena exacto con la
  // semana anterior (invInicial 61.050.400 = invFinal de 19-25 oct) y con la
  // semana siguiente (invFinal 57.105.675 = invInicial de 02-08 nov).
  'Decepaz|2026-10-26': 1,
};

// Semanas donde se acepta un corte en la cadena de inventario porque la
// semana anterior nunca se encontro guardada en ningun archivo (hueco real
// de captura, no un error de lectura) — confirmado revisando a mano todas
// las pestañas de los archivos de esa semana y de la semana siguiente.
const ACCEPT_CHAIN_BREAK = new Set([
  // Alameda 26 oct-01 nov: ningun archivo disponible trae esa semana como
  // pestaña (el archivo de esa carpeta todavia esta en 19-25 oct, y el de
  // 02-08 nov salta directo a 02-08 nov sin pasar por 26 oct-01 nov) — la
  // semana en si queda como hueco (no se inserta), pero su Inventario Final
  // SI fue usado como Inventario Inicial de 02-08 nov por el propio usuario
  // en el archivo real, asi que esa semana siguiente se acepta igual.
  'Alameda|2026-11-02',
  // Casona 05-11 oct: la semana anterior (28 sep-04 oct) nunca se encontro
  // en ningun archivo (ver mas abajo) — hueco real, se acepta el corte.
  'Casona|2026-10-05',
]);

// Casona: entre las carpetas "05-11 OCTUBRE" y "12-18 OCTUBRE" los archivos
// de Balance quedaron con la pestaña 0 desfasada (cada carpeta trae en su
// propio archivo la semana de la carpeta VECINA en el indice 0, nunca la
// suya) — confirmado encadenando Inventario Inicial/Final: la pestaña
// "Balance 05-11 Octubre" (invInicial 72.744.985,6 -> invFinal
// 107.009.126,4) es la semana real del 05-11 de octubre, y "Balance 12-18
// Octubre" (invInicial 107.009.126,4 -> invFinal 86.410.109,7, que ademas
// encadena exacto con "Balance 19-25 Octubre") es la del 12-18. Se usan los
// valores ya verificados directamente en vez de adivinar que pestaña leer.
const MANUAL_ROWS = {
  'Casona|2026-10-05': {
    sourceFile: 'BALANCE 05-11 OCTUBRE 2026 - CASONA.xlsx', sourceSheet: 'Balance 05-11 Octubre',
    found: { totalVentas: 109703314.55099998, totalCompras: 120679659, invInicial: 72744985.6, invFinal: 107009126.4, cmv: 86415518, utilidadBruta: 23287797, margenPct: 0.2123 },
  },
  'Casona|2026-10-12': {
    sourceFile: 'BALANCE 05-11 OCTUBRE 2026 - CASONA.xlsx', sourceSheet: 'Balance 12-18 Octubre',
    found: { totalVentas: 113889219.51525, totalCompras: 67272064, invInicial: 107009126.4, invFinal: 86410109.7, cmv: 87871080, utilidadBruta: 26018139, margenPct: 0.2285 },
  },
};
// Casona 28 sep-04 oct: no existe en ningun archivo disponible una pestaña
// cuyo Inventario Inicial encadene con el Inventario Final de 21-27 sep
// (113.002.583,4) — se reviso a fondo el archivo completo de esa carpeta
// (149 pestañas) sin encontrar ningun valor cercano. Hueco real de captura,
// no se inventa un numero.
const SKIP_WEEKS = new Set(['Casona|2026-09-28']);

async function readWeekFromFolder(folderRel, sedeName, weekStart) {
  if (SKIP_WEEKS.has(sedeName + '|' + weekStart)) return { error: 'semana sin Balance guardado en ningun archivo (hueco real, revisado a fondo)' };
  const manual = MANUAL_ROWS[sedeName + '|' + weekStart];
  if (manual) {
    return { file: manual.sourceFile, sheetName: manual.sourceSheet, periodText: null, titleText: null, found: manual.found, missing: CORE_FIELDS.filter((k) => manual.found[k] == null), otherFiles: [] };
  }
  const folder = path.join(BASE, folderRel);
  const files = findBalanceFiles(folder);
  if (!files.length) return { error: 'sin archivo de Balance en la carpeta' };
  if (files.length > 1) {
    // si hay varios, se usa el modificado mas recientemente (copia mas nueva)
    files.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  }
  const file = files[0];
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const sheetIndex = SHEET_INDEX_OVERRIDE[sedeName + '|' + weekStart] ?? 0;
  const ws = wb.worksheets[sheetIndex];
  const { found, periodText, titleText } = scanSheet(ws);
  const missing = CORE_FIELDS.filter((k) => found[k] == null);
  return {
    file: path.basename(file), sheetName: ws.name, periodText, titleText, found, missing,
    otherFiles: files.length > 1 ? files.slice(1).map((f) => path.basename(f)) : [],
  };
}

function fmt(n) { return n == null ? 'null' : Math.round(n).toLocaleString('es-CO'); }
function chainOk(a, b) { return a != null && b != null && Math.abs(a - b) < 1; }

async function main() {
  const { Pool } = require('pg');
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false },
  });

  const lastRow = {};
  const res = await pool.query(
    `select sede_name, week_start, computed from balance_weeks
     where (sede_name, week_start) in (
       select sede_name, max(week_start) from balance_weeks where sede_name = any($1) group by sede_name
     )`,
    [Object.keys(SEDES)]
  );
  res.rows.forEach((r) => { lastRow[r.sede_name] = { weekStart: r.week_start.toISOString().slice(0, 10), invFinal: r.computed.invFinal }; });

  const allRows = [];
  for (const [sedeName, folders] of Object.entries(SEDES)) {
    console.log('\n########## ' + sedeName + ' (ultima semana en BD: ' + (lastRow[sedeName] ? lastRow[sedeName].weekStart + ', invFinal=' + fmt(lastRow[sedeName].invFinal) : 'ninguna') + ') ##########');
    let prevInvFinal = lastRow[sedeName] ? lastRow[sedeName].invFinal : null;
    for (let i = 0; i < WEEKS.length; i++) {
      const { weekStart, weekEnd } = WEEKS[i];
      const r = await readWeekFromFolder(folders[i], sedeName, weekStart);
      if (r.error) { console.log('  [' + weekStart + ' a ' + weekEnd + ']  ⚠ ' + r.error + ' (' + folders[i] + ')'); continue; }
      const f = r.found;
      const accepted = ACCEPT_CHAIN_BREAK.has(sedeName + '|' + weekStart);
      const chain = chainOk(prevInvFinal, f.invInicial) || accepted;
      const chainMsg = prevInvFinal == null ? '(sin semana previa para validar)' : (chainOk(prevInvFinal, f.invInicial) ? 'OK' : (accepted ? '⚠ NO ENCADENA pero se acepta (hueco real en la semana anterior, ver comentario en el script)' : '⚠ NO ENCADENA (esperado invInicial=' + fmt(prevInvFinal) + ')'));
      console.log('  [' + weekStart + ' a ' + weekEnd + ']  ' + r.file + ' / hoja "' + r.sheetName + '"' + (r.otherFiles.length ? '  (ignorados en la misma carpeta: ' + r.otherFiles.join(', ') + ')' : ''));
      console.log('      ventas=' + fmt(f.totalVentas) + ' compras=' + fmt(f.totalCompras) + ' invIni=' + fmt(f.invInicial) + ' invFin=' + fmt(f.invFinal) + ' cmv=' + fmt(f.cmv) + ' util=' + fmt(f.utilidadBruta) + ' margen=' + (f.margenPct != null ? (f.margenPct * 100).toFixed(2) + '%' : 'null'));
      console.log('      cadena inventario: ' + chainMsg + (r.missing.length ? '  | ⚠ faltan campos: ' + r.missing.join(', ') : ''));
      allRows.push({
        sedeSlug: sedeSlug(sedeName), sedeName, weekKey: weekStart, weekStart, weekEnd,
        sourceFile: r.file, sourceSheet: r.sheetName, periodText: r.periodText, titleText: r.titleText,
        missing: r.missing, chainOk: chain || prevInvFinal == null,
        computed: {
          totalVentas: f.totalVentas ?? null, totalCompras: f.totalCompras ?? null,
          invInicial: f.invInicial ?? null, invFinal: f.invFinal ?? null,
          cmv: f.cmv ?? null, utilidadBruta: f.utilidadBruta ?? null, margenPct: f.margenPct ?? null,
        },
      });
      prevInvFinal = f.invFinal;
    }
  }

  console.log('\n========================================');
  const problems = allRows.filter((r) => !r.chainOk || r.missing.length);
  console.log('TOTAL semanas leidas:', allRows.length, '| con problemas (no se insertan):', problems.length);
  problems.forEach((r) => console.log('  -', r.sedeName, r.weekKey, r.chainOk ? '' : '[cadena rota]', r.missing.length ? '[faltan: ' + r.missing.join(',') + ']' : ''));

  const shouldCommit = process.argv.includes('--commit');
  if (!shouldCommit) {
    console.log('\n(dry run — no se escribio nada en la base de datos. Correr con --commit para insertar.)');
    await pool.end();
    return;
  }

  let inserted = 0, skippedExisting = 0, skippedProblem = 0;
  for (const row of allRows) {
    if (!row.chainOk || row.missing.length) { skippedProblem++; continue; }
    const r = await pool.query(
      `insert into balance_weeks (sede_slug, sede_name, week_key, week_start, week_end, inputs, computed)
       values ($1, $2, $3, $4, $5, $6, $7)
       on conflict (sede_slug, week_key) do nothing
       returning id`,
      [
        row.sedeSlug, row.sedeName, row.weekKey, row.weekStart, row.weekEnd,
        JSON.stringify({ backfilled: true, sourceFile: row.sourceFile, sourceSheet: row.sourceSheet, periodText: row.periodText, titleText: row.titleText }),
        JSON.stringify(row.computed),
      ]
    );
    if (r.rows.length) inserted++; else skippedExisting++;
  }
  console.log('\nInsertadas:', inserted, '| ya existian (sin tocar):', skippedExisting, '| omitidas por problema:', skippedProblem);
  await pool.end();
}

main().catch((err) => { console.error(err); process.exitCode = 1; });
