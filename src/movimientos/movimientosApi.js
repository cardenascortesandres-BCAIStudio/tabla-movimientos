// Cliente de la API de Reportes de Tabla de Movimientos (server/routes/movimientos.js).
// Mismo patrón de caché en localStorage que src/balance/balanceApi.js.

const CACHE_PREFIX = 'movimientos:cache:';

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

export function getAllWeeks() {
  return withCacheFallback('weeks:all', () => apiFetch('/api/movimientos/weeks'));
}

export function getWeeks(sedeName) {
  return withCacheFallback('weeks:' + sedeName, () =>
    apiFetch(`/api/movimientos/weeks/${encodeURIComponent(sedeName)}`));
}

export async function saveWeek(weekRecord) {
  const result = await apiFetch('/api/movimientos/weeks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(weekRecord)
  });
  const cacheKey = 'weeks:' + weekRecord.sedeName;
  const cached = cacheGet(cacheKey) || { sedeSlug: result.sedeSlug, weeks: [] };
  const weeks = (cached.weeks || []).filter(w => w.week_key !== weekRecord.weekKey);
  weeks.push({
    sede_slug: result.sedeSlug, sede_name: weekRecord.sedeName, week_key: weekRecord.weekKey,
    week_start: weekRecord.weekStart, week_end: weekRecord.weekEnd, computed: weekRecord.computed
  });
  cacheSet(cacheKey, { sedeSlug: result.sedeSlug, weeks });
  return result;
}

export function getSedesConHistorial() {
  return withCacheFallback('sedes', () => apiFetch('/api/movimientos/sedes'));
}
