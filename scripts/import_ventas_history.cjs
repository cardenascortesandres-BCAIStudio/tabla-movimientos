// Import histórico de Ventas Diarias (ventas_dias) a partir de los archivos
// reales en Desktop/BRANGUS/VENTAS/*.xls (uno por sede, histórico completo
// desde que existe la sede hasta el día de la descarga), más la siembra del
// presupuesto mensual (presupuestos_mensuales) desde los valores ya
// confirmados en PRESUPUESTO.jpeg (mes: septiembre 2026 en el momento en que
// se leyó la imagen — ajustar SEED_MES/SEED_ANIO si se corre en otro mes).
//
// Uso:
//   node scripts/import_ventas_history.cjs           -> dry run (no escribe nada)
//   node scripts/import_ventas_history.cjs --commit   -> hace upsert en Postgres
//     (requiere DATABASE_URL en el entorno, ej. vía el túnel SSH de Railway)

const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');

const DIR = 'C:/Users/Supervisor_Puntos/Desktop/BRANGUS/VENTAS';

const FILES = [
  'ALAMEDA ventas netas por dia.xls',
  'CASONA ventas Ventas por dia.xls',
  'CHIMINANGOS ventas netas por dia.xls',
  'DECEPAZ ventas netas por dia.xls',
  'NARANJOS ventas netas por dia.xls',
  'VILLA DEL LAGO ventas netas por dia.xls',
  // Jamundí y Planta Pollo: sin archivo de ventas todavía (pendiente que el
  // usuario los descargue) — no se listan aquí a propósito.
];

// Presupuesto mensual leído de Desktop/BRANGUS/VENTAS/PRESUPUESTO.jpeg
// (columna "PRESUPUESTO", confirmado con el usuario 2026-09-09).
const SEED_ANIO = 2026;
const SEED_MES = 9;
// Nombres en el MISMO Case exacto que ya usa balance_weeks (ver
// scripts/backfill_balance_history.cjs) — server/slug.js#resolveCanonicalSedeName
// también protege contra esto en tiempo de ejecución, pero conviene no
// reintroducir el desajuste aquí si este script se vuelve a correr (ej.
// cuando lleguen los archivos de Jamundí/Planta Pollo).
const SEED_PRESUPUESTOS = {
  'Alameda': 1165000000,
  'Casona': 560000000,
  'Jamundí': 600000000,
  'Decepaz': 450000000,
  'Villa del Lago': 320000000,
  'Los Naranjos': 350000000,
  'Chiminangos': 230000000,
  'Planta Pollo': 230000000,
};

function removeAccents(str) { return String(str).normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
function normText(v) { return removeAccents(String(v == null ? '' : v).toUpperCase()).trim().replace(/\s+/g, ' '); }
function sedeSlug(sedeName) { return normText(sedeName).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'sede'; }

// ---- mismo parser que src/core/ventasFileParse.js, duplicado en CommonJS
// (este script corre fuera de Vite/ESM) — si cambia el formato del archivo,
// actualizar también allá. ----
const HEADER_WORDS = { fecha: 'FECHA', kilos: 'KILOS', unidades: 'UNIDADES', descuento: 'DESCUENTO', clientes: 'NRO CLIENTES', valor: 'VALOR VENTA' };

function detectVentasHeaderRow(rows, maxScan = 30) {
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
    if (colFecha !== -1 && colValor !== -1) return { headerRowIndex: r, colFecha, colKilos, colUnidades, colDescuento, colClientes, colValor };
  }
  return null;
}
const DATE_RE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
function parseFechaCell(v) {
  if (v == null || v === '') return null;
  const m = String(v).trim().match(DATE_RE);
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
function parseVentasDiariasFile(rows) {
  const headerInfo = detectVentasHeaderRow(rows);
  if (!headerInfo) return null;
  const { headerRowIndex, colFecha, colKilos, colUnidades, colDescuento, colClientes, colValor } = headerInfo;
  const dias = [];
  for (let r = headerRowIndex + 1; r < rows.length; r++) {
    const row = rows[r] || [];
    const fechaCell = row[colFecha];
    if (fechaCell != null && normText(fechaCell).startsWith('GRAND TOTAL')) break;
    const fecha = parseFechaCell(fechaCell);
    if (!fecha) continue;
    const valorVenta = numOrNull(row[colValor]);
    if (valorVenta == null) continue;
    dias.push({
      fecha, kilos: colKilos != null ? numOrNull(row[colKilos]) : null, unidades: colUnidades != null ? numOrNull(row[colUnidades]) : null,
      descuento: colDescuento != null ? numOrNull(row[colDescuento]) : null, nroClientes: colClientes != null ? numOrNull(row[colClientes]) : null, valorVenta
    });
  }
  return dias.length ? { dias } : null;
}
function guessSedeFromVentasRows(rows, knownSedeNames) {
  const upper = knownSedeNames.map(n => normText(n));
  for (let r = 0; r < Math.min(rows.length, 15); r++) {
    for (const cell of (rows[r] || [])) {
      const norm = normText(cell);
      if (!norm || norm.length < 4) continue;
      const idx = upper.findIndex(u => norm.includes(u) || u.includes(norm));
      if (idx !== -1) return knownSedeNames[idx];
    }
  }
  return null;
}

function main() {
  const results = [];
  for (const file of FILES) {
    const buf = fs.readFileSync(path.join(DIR, file));
    const wb = XLSX.read(buf, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true });
    const parsed = parseVentasDiariasFile(rows);
    const sedeName = guessSedeFromVentasRows(rows, Object.keys(SEED_PRESUPUESTOS)) || file.split(' ')[0];
    if (!parsed) { console.log(file, '-> NO SE PUDO PARSEAR (revisar encabezado)'); continue; }
    const totalVenta = parsed.dias.reduce((a, d) => a + d.valorVenta, 0);
    results.push({ file, sedeName, slug: sedeSlug(sedeName), dias: parsed.dias, totalVenta });
    console.log(`${sedeName.padEnd(16)} <- ${file}  |  ${parsed.dias.length} días  |  ${parsed.dias[0].fecha} -> ${parsed.dias[parsed.dias.length - 1].fecha}  |  venta total: ${Math.round(totalVenta).toLocaleString('es-CO')}`);
  }

  const totalDias = results.reduce((a, r) => a + r.dias.length, 0);
  console.log('\nTOTAL días a importar (todas las sedes):', totalDias);
  console.log('Presupuesto a sembrar:', SEED_MES + '/' + SEED_ANIO, '->', Object.entries(SEED_PRESUPUESTOS).map(([s, m]) => s + ': ' + m.toLocaleString('es-CO')).join(' | '));

  const shouldCommit = process.argv.includes('--commit');
  if (!shouldCommit) {
    console.log('\n(dry run — no se escribió nada en la base de datos. Correr con --commit para insertar.)');
    return Promise.resolve();
  }
  if (!process.env.DATABASE_URL) {
    console.error('\nERROR: --commit requiere DATABASE_URL en el entorno.');
    process.exitCode = 1;
    return Promise.resolve();
  }

  const { Pool } = require('pg');
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false },
  });

  return (async () => {
    let upserted = 0;
    for (const r of results) {
      for (const d of r.dias) {
        await pool.query(
          `insert into ventas_dias (sede_slug, sede_name, fecha, kilos, unidades, descuento, nro_clientes, valor_venta, updated_at)
           values ($1, $2, $3, $4, $5, $6, $7, $8, now())
           on conflict (sede_slug, fecha)
           do update set sede_name = excluded.sede_name, kilos = excluded.kilos, unidades = excluded.unidades,
                         descuento = excluded.descuento, nro_clientes = excluded.nro_clientes,
                         valor_venta = excluded.valor_venta, updated_at = now()`,
          [r.slug, r.sedeName, d.fecha, d.kilos, d.unidades, d.descuento, d.nroClientes, d.valorVenta]
        );
        upserted++;
      }
    }
    console.log('\nVentas — filas insertadas/actualizadas:', upserted);

    let presUpserted = 0;
    for (const [sedeName, monto] of Object.entries(SEED_PRESUPUESTOS)) {
      await pool.query(
        `insert into presupuestos_mensuales (sede_slug, sede_name, anio, mes, monto, updated_at)
         values ($1, $2, $3, $4, $5, now())
         on conflict (sede_slug, anio, mes) do update set sede_name = excluded.sede_name, monto = excluded.monto, updated_at = now()`,
        [sedeSlug(sedeName), sedeName, SEED_ANIO, SEED_MES, monto]
      );
      presUpserted++;
    }
    console.log('Presupuestos — filas insertadas/actualizadas:', presUpserted);
    await pool.end();
  })();
}

main().catch((err) => { console.error(err); process.exitCode = 1; });
