// Cliente de la API de Auditorías PDV (server/routes/auditorias.js).
// Mismo patrón de caché en localStorage que src/balance/balanceApi.js y
// src/movimientos/movimientosApi.js.

const CACHE_PREFIX = 'auditorias:cache:';

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

export function getAllAudits() {
  return withCacheFallback('audits:all', () => apiFetch('/api/auditorias/audits'));
}

export async function saveAudit(auditRecord) {
  return apiFetch('/api/auditorias/audits', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(auditRecord)
  });
}

export function getSedesConHistorial() {
  return withCacheFallback('sedes', () => apiFetch('/api/auditorias/sedes'));
}
