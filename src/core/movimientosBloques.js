// Los 12 bloques de categoría del negocio (fijos, confirmados contra los
// archivos reales "Tabla de Movimientos" de las 7 sedes — ver
// Desktop/BRANGUS/INVENTARIOS/<SEDE>/<MES>/<SEMANA>/tabla_movimientos_*.xlsx).
// El nombre de la categoría varía un poco de un mes a otro en el mismo
// archivo real (ej. "PULPA" en agosto/septiembre vs "PULPAS" en julio) — este
// normalizador los hace caer siempre en el mismo bloque canónico, igual que
// ya se hace con nombres de sede (ver server/slug.js#resolveCanonicalSedeName
// y SEDE_SLUG_ALIASES).

import { normText } from './normalize.js';

export const BLOQUES_CANONICOS = [
  'Finas', 'Pulpas', 'Segundas', 'Molida', 'Costilla de Res', 'Vísceras',
  'Pulpa de Cerdo', 'Tocineta y Costilla', 'Otros Cortes', 'Pollo', 'Pescado', 'Salsamentaria'
];

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
  salsamentaria: 'Salsamentaria'
};

// Nombre de categoría "sin clasificar": producto con código faltante en el
// archivo original que el parser confunde con un encabezado de categoría
// (ver Casona semana 07-13 sep 2026, "TOCINETA BARRIGA PREMIUM AL VAC ENT")
// — se separa del bloque real en vez de perderse o inflar un bloque ajeno.
export const BLOQUE_SIN_CLASIFICAR = 'Sin clasificar';

export function matchCanonicalBloque(categoryNameRaw) {
  const norm = normText(categoryNameRaw).toLowerCase().replace(/[&+]/g, 'y').replace(/\s+/g, ' ').trim();
  return BLOQUE_ALIASES[norm] || null;
}
