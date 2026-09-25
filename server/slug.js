import { normText } from '../src/core/normalize.js';

// Alias conocidos: el nombre de archivo o el contenido de un reporte a veces
// omite una palabra del nombre oficial de la sede (ej. archivo "NARANJOS"
// para la sede real "Los Naranjos"), lo que generaría un slug distinto y una
// sede duplicada en vez de fusionarse con la existente. Lista fija porque son
// las 8 sedes reales del negocio, no un caso genérico.
const SEDE_SLUG_ALIASES = {
  naranjos: 'los-naranjos',
};

// Clave estable por sede para las tablas balance_* — insensible a acentos,
// mayúsculas y espacios (reusa normText, ya probado en el flujo de movimientos).
export function sedeSlug(sedeName) {
  const base = normText(sedeName)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'sede';
  return SEDE_SLUG_ALIASES[base] || base;
}

// Nombre canónico para un slug de sede, buscado en TODOS los módulos (no solo
// en la tabla que está guardando ahora mismo) — así si Balance ya escribió
// "Los Naranjos" para el slug "los-naranjos", el módulo de Ventas reusa
// exactamente ese nombre en vez de guardar "NARANJOS" (u otra variante de
// mayúsculas/acentos) como una sede aparte. balance_weeks va primero porque
// es la fuente más antigua/completa (todas las sedes reales pasan por ahí).
// `query` es la función exportada por server/db.js (pasada por quien llama,
// para no crear una dependencia circular con db.js).
const CANONICAL_LOOKUP_TABLES = ['balance_weeks', 'movimientos_weeks', 'ventas_dias', 'presupuestos_mensuales', 'pdv_audits', 'horas_extra_dias'];

export async function resolveCanonicalSedeName(query, slug, typedName) {
  for (const table of CANONICAL_LOOKUP_TABLES) {
    try {
      const { rows } = await query(`select sede_name from ${table} where sede_slug = $1 limit 1`, [slug]);
      if (rows[0]?.sede_name) return rows[0].sede_name;
    } catch {
      // la tabla puede no existir todavía en instalaciones muy viejas sin
      // migrar — se ignora y se sigue probando las demás.
    }
  }
  return typedName;
}
