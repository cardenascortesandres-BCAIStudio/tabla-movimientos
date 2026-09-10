// Cliente de la API de Ventas (server/routes/ventas.js). Mismo patrón de
// caché en localStorage que src/balance/balanceApi.js y
// src/movimientos/movimientosApi.js.

const CACHE_PREFIX = 'ventas:cache:';

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

export function getAllDias() {
  return withCacheFallback('dias:all', () => apiFetch('/api/ventas/dias'));
}

export async function saveDias(sedeName, dias) {
  const result = await apiFetch('/api/ventas/dias', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sedeName, dias })
  });
  cacheGet('dias:all'); // invalida implícitamente: el próximo getAllDias() reintenta el server primero
  return result;
}

export function getSedesConHistorial() {
  return withCacheFallback('sedes', () => apiFetch('/api/ventas/sedes'));
}

export function getPresupuestos() {
  return withCacheFallback('presupuesto:all', () => apiFetch('/api/ventas/presupuesto'));
}

export function savePresupuesto(sedeName, anio, mes, monto) {
  return apiFetch('/api/ventas/presupuesto', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sedeName, anio, mes, monto })
  });
}
