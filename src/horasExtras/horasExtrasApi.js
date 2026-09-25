// Cliente de la API de Horas Extras — mismo molde cache-en-localStorage que
// src/ventas/ventasApi.js / src/balance/balanceApi.js: si la API falla, se
// devuelve la última copia guardada (modo lectura, offline-friendly).

const CACHE_PREFIX = 'horasExtras:cache:';

function cacheGet(key) {
  try { const raw = localStorage.getItem(CACHE_PREFIX + key); return raw ? JSON.parse(raw) : null; }
  catch { return null; }
}
function cacheSet(key, value) {
  try { localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(value)); }
  catch { /* localStorage lleno o no disponible — no es crítico, solo se pierde el respaldo offline */ }
}

async function apiFetch(path, options) {
  const res = await fetch(path, options);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Error ${res.status} al llamar ${path}`);
  }
  return res.json();
}

export async function getAllDias() {
  try {
    const data = await apiFetch('/api/horas-extras/dias');
    cacheSet('dias', data);
    return data;
  } catch (err) {
    const cached = cacheGet('dias');
    if (cached) return { ...cached, fromCache: true, cacheError: err.message };
    throw err;
  }
}

export async function saveDias(dias) {
  return apiFetch('/api/horas-extras/dias', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dias })
  });
}
