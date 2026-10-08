// Cliente de /api/auth/* — sin caché en localStorage a propósito (a
// diferencia de balanceApi/ventasApi/etc.): la sesión SIEMPRE se valida
// contra el servidor, nunca se asume válida solo porque hay algo guardado.

async function apiFetch(path, options) {
  const res = await fetch(path, { credentials: 'same-origin', ...options });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = new Error(body.error || `Error ${res.status} al llamar ${path}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

// null si no hay sesión válida (401), lanza en cualquier otro error (red, 5xx).
export async function getCurrentUser() {
  try {
    return await apiFetch('/api/auth/me');
  } catch (err) {
    if (err.status === 401) return null;
    throw err;
  }
}

export function login(username, password) {
  return apiFetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
}

export function logout() {
  return apiFetch('/api/auth/logout', { method: 'POST' });
}
