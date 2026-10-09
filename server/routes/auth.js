import { Router } from 'express';
import { query, isDbConfigured } from '../db.js';
import { verifyCredentials, setSessionCookie, clearSessionCookie, getSessionUser, touchLastSeen, hashPassword, requireAuth, requireAdmin } from '../auth.js';

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
// usuario — exclusivo del rol 'admin' (el creador de la plataforma; ni
// 'full' ni 'planta' lo ven), aunque /api/auth esté montado público en
// server/index.js (de ahí requireAuth + requireAdmin acá mismo, en la ruta puntual).
authRouter.get('/users', requireAuth, requireAdmin, async (req, res, next) => {
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

// Cambiar clave — exclusivo del rol 'admin', a pedido explícito del usuario
// ("permíteme solo a mi usuario cambiar la contraseña"): ni 'full' ni
// 'planta' pueden llamar esta ruta, aunque la pidan directo. Siempre opera
// sobre la CUENTA DE LA PROPIA SESIÓN (req.user.username) — no recibe
// ningún username en el body, así que tampoco sirve para cambiarle la clave
// a otra persona.
authRouter.post('/change-password', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    if (!isDbConfigured()) return res.status(503).json({ error: 'La base de datos no está configurada todavía.' });
    const { currentPassword, newPassword } = req.body || {};
    if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Falta la clave actual o la nueva.' });
    if (String(newPassword).length < 8) return res.status(400).json({ error: 'La clave nueva debe tener al menos 8 caracteres.' });
    const ok = await verifyCredentials(req.user.username, currentPassword);
    if (!ok) return res.status(401).json({ error: 'La clave actual no es correcta.' });
    const hash = await hashPassword(newPassword);
    await query('update app_users set password_hash = $1 where username = $2', [hash, req.user.username]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});
