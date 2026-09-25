// Backfill de horas_extra_dias a partir de los PDF "Liquidación Detallada"
// que Recursos Humanos envía (uno por sede, con una página por empleado).
// La sede viene explícita dentro de cada página del PDF — no hace falta
// adivinarla por nombre de archivo/carpeta como en Balance/Movimientos.
//
// Uso:
//   node scripts/import_horas_extras_history.cjs           -> dry run (no escribe nada)
//   node scripts/import_horas_extras_history.cjs --commit   -> upsert en Postgres

const path = require('path');
const fs = require('fs');

const DIR = 'C:/Users/Supervisor_Puntos/Desktop/BRANGUS/HORAS EXTRAS';

async function main() {
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const { parseLiquidacionPage } = await import('../src/core/horasExtrasPdfParse.js');

  const files = fs.readdirSync(DIR).filter((f) => /\.pdf$/i.test(f));
  if (!files.length) {
    console.error('No se encontró ningún PDF en', DIR);
    process.exitCode = 1;
    return;
  }

  const allDias = []; // filas planas listas para el POST /api/horas-extras/dias
  const bySede = {};

  for (const file of files) {
    const full = path.join(DIR, file);
    const data = new Uint8Array(fs.readFileSync(full));
    const doc = await pdfjsLib.getDocument({ data, useWorkerFetch: false, isEvalSupported: false, useSystemFonts: true }).promise;
    console.log('\n########## ' + file + ' (' + doc.numPages + ' páginas) ##########');
    let empleados = 0, omitidas = 0;
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      const items = content.items.map((it) => ({ str: it.str, x: it.transform[4], y: it.transform[5] }));
      const result = parseLiquidacionPage(items);
      if (!result) { omitidas++; console.log('  [pág ' + p + '] ⚠ no se pudo parsear (no calza con el formato esperado)'); continue; }
      empleados++;
      const sedeName = result.sede;
      (bySede[sedeName] ||= { empleados: 0, dias: 0, horaExtraTotal: 0 });
      bySede[sedeName].empleados++;
      result.dias.forEach((d) => {
        const horaExtra = (d.he || 0) + (d.hen || 0) + (d.hefd || 0) + (d.hefn || 0);
        bySede[sedeName].dias++;
        bySede[sedeName].horaExtraTotal += horaExtra;
        allDias.push({
          sedeName, empleadoId: result.empleadoId, empleadoNombre: result.nombre, cargo: result.cargo,
          fecha: d.fecha, estadoDia: d.estadoDia, total: d.total, comida: d.comida, f: d.f, hdo: d.hdo,
          rn: d.rn, rndyf: d.rndyf, dom: d.dom, d: d.d, hefd: d.hefd, hefn: d.hefn, he: d.he, hen: d.hen
        });
      });
    }
    console.log('  empleados: ' + empleados + ' | páginas omitidas: ' + omitidas);
  }

  console.log('\n========================================');
  console.log('TOTAL filas (empleado x día) a importar:', allDias.length);
  Object.entries(bySede).forEach(([sede, s]) => {
    console.log('  ' + sede + ': ' + s.empleados + ' empleado(s), ' + s.dias + ' día(s), horaExtraTotal=' + Math.round(s.horaExtraTotal * 100) / 100);
  });

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
  const { sedeSlug, resolveCanonicalSedeName } = await import('../server/slug.js');
  const queryFn = (sql, params) => pool.query(sql, params);

  const sedeCache = new Map();
  for (const sedeName of new Set(allDias.map((d) => d.sedeName))) {
    const slug = sedeSlug(sedeName);
    sedeCache.set(sedeName, { slug, canonicalName: await resolveCanonicalSedeName(queryFn, slug, sedeName) });
  }

  const COLS = ['sede_slug', 'sede_name', 'empleado_id', 'empleado_nombre', 'cargo', 'fecha', 'estado_dia',
    'total', 'comida', 'f', 'hdo', 'rn', 'rndyf', 'dom', 'd', 'hefd', 'hefn', 'he', 'hen'];
  const CHUNK = 300;
  let upserted = 0;
  for (let i = 0; i < allDias.length; i += CHUNK) {
    const chunk = allDias.slice(i, i + CHUNK);
    const values = [];
    const params = [];
    for (const d of chunk) {
      const { slug, canonicalName } = sedeCache.get(d.sedeName);
      const rowValues = [
        slug, canonicalName, d.empleadoId, d.empleadoNombre, d.cargo ?? null, d.fecha, d.estadoDia ?? null,
        d.total ?? null, d.comida ?? null, d.f ?? null, d.hdo ?? null, d.rn ?? null, d.rndyf ?? null,
        d.dom ?? null, d.d ?? null, d.hefd ?? null, d.hefn ?? null, d.he ?? null, d.hen ?? null
      ];
      const base = params.length;
      values.push('(' + rowValues.map((_, j) => '$' + (base + j + 1)).join(', ') + ', now())');
      params.push(...rowValues);
    }
    await pool.query(
      `insert into horas_extra_dias (${COLS.join(', ')}, updated_at)
       values ${values.join(', ')}
       on conflict (empleado_id, fecha)
       do update set sede_slug = excluded.sede_slug, sede_name = excluded.sede_name,
                     empleado_nombre = excluded.empleado_nombre, cargo = excluded.cargo,
                     estado_dia = excluded.estado_dia, total = excluded.total, comida = excluded.comida,
                     f = excluded.f, hdo = excluded.hdo, rn = excluded.rn, rndyf = excluded.rndyf,
                     dom = excluded.dom, d = excluded.d, hefd = excluded.hefd, hefn = excluded.hefn,
                     he = excluded.he, hen = excluded.hen, updated_at = now()`,
      params
    );
    upserted += chunk.length;
  }
  console.log('\nUpserted:', upserted);
  await pool.end();
}

main().catch((err) => { console.error(err); process.exitCode = 1; });
