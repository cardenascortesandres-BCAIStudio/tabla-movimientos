// Cliente de la API de Horas Extras — mismo molde cache-en-localStorage que
// src/ventas/ventasApi.js / src/balance/balanceApi.js: si la API falla, se
// devuelve la última copia guardada (modo lectura, offline-friendly).
// Fábrica porque hay DOS instancias: PDV (/api/horas-extras) y Planta
// (/api/horas-extras-planta) — mismo backend, tabla y caché separados para
// controlar cada una por su cuenta, a pedido explícito del usuario.

function cacheGet(prefix, key) {
  try { const raw = localStorage.getItem(prefix + key); return raw ? JSON.parse(raw) : null; }
  catch { return null; }
}
function cacheSet(prefix, key, value) {
  try { localStorage.setItem(prefix + key, JSON.stringify(value)); }
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

export function createHorasExtrasApi(basePath, cachePrefix) {
  return {
    async getAllDias() {
      try {
        const data = await apiFetch(basePath + '/dias');
        cacheSet(cachePrefix, 'dias', data);
        return data;
      } catch (err) {
        const cached = cacheGet(cachePrefix, 'dias');
        if (cached) return { ...cached, fromCache: true, cacheError: err.message };
        throw err;
      }
    },
    async saveDias(dias) {
      return apiFetch(basePath + '/dias', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dias })
      });
    }
  };
}

// Instancia PDV — mismo nombre/forma que antes (se usaba como `import * as
// horasExtrasApi` en toda la app), para no tener que tocar nada más ahí.
export const { getAllDias, saveDias } = createHorasExtrasApi('/api/horas-extras', 'horasExtras:cache:');
