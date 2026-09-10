// Cliente de la API de Balance (server/routes/balance.js). Cada respuesta
// exitosa se espeja en localStorage como respaldo de solo lectura: si la API
// no responde (ej. sin conexión momentánea), la UI puede seguir mostrando el
// último historial conocido en vez de romperse. La base de datos siempre es
// la fuente de verdad — este caché nunca sustituye una escritura real.

const CACHE_PREFIX = 'balance:cache:';

function cacheGet(key) {
  try { const raw = localStorage.getItem(CACHE_PREFIX + key); return raw ? JSON.parse(raw) : null; }
  catch { return null; }
}
function cacheSet(key, value) {
  try { localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(value)); }
  catch { /* almacenamiento lleno o no disponible: se ignora, es solo respaldo */ }
}

async function apiFetch(path, options) {
  const res = await fetch(path, options);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Error ${res.status} al llamar ${path}`);
  }
  return res.json();
}

async function withCacheFallback(cacheKey, fetcher) {
  try {
    const data = await fetcher();
    cacheSet(cacheKey, data);
    return { ...data, fromCache: false };
  } catch (err) {
    const cached = cacheGet(cacheKey);
    if (cached) return { ...cached, fromCache: true, cacheError: err.message };
    throw err;
  }
}

export function getClassification(sedeName) {
  return withCacheFallback('classification:' + sedeName, () =>
    apiFetch(`/api/balance/classification/${encodeURIComponent(sedeName)}`));
}

export function saveClassification(sedeName, labels) {
  return apiFetch(`/api/balance/classification/${encodeURIComponent(sedeName)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ labels })
  });
}

export function getWeeks(sedeName) {
  return withCacheFallback('weeks:' + sedeName, () =>
    apiFetch(`/api/balance/weeks/${encodeURIComponent(sedeName)}`));
}

export async function saveWeek(weekRecord) {
  const result = await apiFetch('/api/balance/weeks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(weekRecord)
  });
  const cacheKey = 'weeks:' + weekRecord.sedeName;
  const cached = cacheGet(cacheKey) || { sedeSlug: result.sedeSlug, weeks: [] };
  const weeks = (cached.weeks || []).filter(w => w.week_key !== weekRecord.weekKey);
  weeks.push({
    sede_slug: result.sedeSlug, sede_name: weekRecord.sedeName, week_key: weekRecord.weekKey,
    week_start: weekRecord.weekStart, week_end: weekRecord.weekEnd,
    inputs: weekRecord.inputs, computed: weekRecord.computed
  });
  cacheSet(cacheKey, { sedeSlug: result.sedeSlug, weeks });
  return result;
}

// Todas las sedes en una sola llamada (Reportes) — evita el N+1 de pedir
// /sedes y luego /weeks/:sede una vez por cada una.
export function getAllWeeks() {
  return withCacheFallback('weeks:all', () => apiFetch('/api/balance/weeks'));
}

export function getSedesConHistorial() {
  return withCacheFallback('sedes', () => apiFetch('/api/balance/sedes'));
}

// Respaldo exportable/importable manualmente (botón "Exportar respaldo" en la
// UI) — junta todo lo que haya en caché para las sedes indicadas.
export function exportBackupJSON(sedeNames) {
  const backup = {};
  sedeNames.forEach(name => {
    backup[name] = {
      classification: cacheGet('classification:' + name),
      weeks: cacheGet('weeks:' + name)
    };
  });
  return backup;
}

export function importBackupJSON(backup) {
  Object.entries(backup || {}).forEach(([name, data]) => {
    if (data.classification) cacheSet('classification:' + name, data.classification);
    if (data.weeks) cacheSet('weeks:' + name, data.weeks);
  });
}
