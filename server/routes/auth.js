import { Router } from 'express';
import { query, isDbConfigured } from '../db.js';
import { verifyCredentials, setSessionCookie, clearSessionCookie, getSessionUser, touchLastSeen, requireAuth, requireFullAccess } from '../auth.js';

export const authRouter = Router();

authRouter.post('/login', async (req, res, next) => {
  try {
    if (!isDbConfigured()) return res.status(503).json({ error: 'La base de datos no está configurada todavía.' });
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: 'Usuario y clave son obligatorios.' });
    const user = await verifyCredentials(username, password);
    if (!user) return res.status(401).json({ error: 'Usuario o clave incorrectos.' });
    setSessionCookie(req, res, user);
    // Para el panel "👥 Usuarios" (ver GET /users más abajo): último ingreso
    // real, distinto de "última actividad" (que sigue refrescándose durante
    // toda la sesión vía touchLastSeen).
    query('update app_users set last_login_at = now(), last_seen_at = now() where username = $1', [user.username]).catch(() => {});
    res.json({ ok: true, username: user.username, displayName: user.display_name, role: user.role });
  } catch (err) { next(err); }
});

authRouter.post('/logout', (req, res) => {
  const user = getSessionUser(req);
  clearSessionCookie(req, res);
  // Se marca "desconectado" de una vez (en vez de esperar a que expire la
  // ventana de "en línea") para que el panel de Usuarios lo refleje al toque.
  if (user) query('update app_users set last_seen_at = null where username = $1', [user.username]).catch(() => {});
  res.json({ ok: true });
});

authRouter.get('/me', (req, res) => {
  const user = getSessionUser(req);
  if (!user) return res.status(401).json({ error: 'No autenticado.' });
  // El frontend llama /me periódicamente mientras la sesión está abierta
  // (ver main.js) — esto hace que esa misma llamada cuente como actividad,
  // sin necesitar un endpoint de "heartbeat" aparte.
  touchLastSeen(user.username);
  res.json({ username: user.username, displayName: user.displayName, role: user.role });
});

// Quién está en línea ahora mismo y cuándo ingresó/actuó por última vez cada
// usuario — solo para el rol 'full' (el creador de la plataforma y quien
// más acceso tenga), aunque /api/auth esté montado público en server/index.js
// (de ahí requireAuth + requireFullAccess acá mismo, en la ruta puntual).
authRouter.get('/users', requireAuth, requireFullAccess, async (req, res, next) => {
  try {
    if (!isDbConfigured()) return res.status(503).json({ error: 'La base de datos no está configurada todavía.' });
    const { rows } = await query(
      `select username, display_name as "displayName", role,
              last_login_at as "lastLoginAt", last_seen_at as "lastSeenAt",
              (last_seen_at is not null and last_seen_at > now() - interval '2 minutes') as online
       from app_users order by display_name asc`
    );
    res.json({ users: rows });
  } catch (err) { next(err); }
});
