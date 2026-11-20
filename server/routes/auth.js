import { Router } from 'express';
import { query, isDbConfigured } from '../db.js';
import { verifyCredentials, setSessionCookie, clearSessionCookie, getSessionUser, touchLastSeen, hashPassword, requireAuth, requireAdmin } from '../auth.js';

export const authRouter = Router();

// Mismos roles que exige la restricción CHECK de app_users (migración 013)
// — se valida acá ANTES de llegar a la base de datos para devolver un
// mensaje claro ("rol inválido") en vez de un error crudo de Postgres.
const ROLES_VALIDOS = ['full', 'planta', 'admin', 'gestionh'];

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

// Crear usuario — exclusivo del rol 'admin', a pedido explícito del usuario
// ("quiero poder crear nuevos usuarios con contraseñas... para no depender
// de ti"): antes solo se podía hacer a mano por SQL directo contra la base
// de datos. El username se normaliza igual que en el login (minúsculas,
// sin espacios) para que no se puedan crear 2 cuentas que solo difieran en
// mayúsculas.
authRouter.post('/users', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    if (!isDbConfigured()) return res.status(503).json({ error: 'La base de datos no está configurada todavía.' });
    const { username, displayName, password, role } = req.body || {};
    if (!username || !displayName || !password || !role) {
      return res.status(400).json({ error: 'Usuario, nombre, clave y rol son obligatorios.' });
    }
    if (String(password).length < 8) return res.status(400).json({ error: 'La clave debe tener al menos 8 caracteres.' });
    if (!ROLES_VALIDOS.includes(role)) return res.status(400).json({ error: 'Rol inválido.' });
    const normalizedUsername = String(username).trim().toLowerCase();
    if (!normalizedUsername) return res.status(400).json({ error: 'Usuario inválido.' });
    const hash = await hashPassword(password);
    try {
      await query(
        'insert into app_users (username, password_hash, display_name, role) values ($1, $2, $3, $4)',
        [normalizedUsername, hash, String(displayName).trim(), role]
      );
    } catch (err) {
      if (err.code === '23505') return res.status(409).json({ error: `Ya existe un usuario "${normalizedUsername}".` });
      throw err;
    }
    res.json({ ok: true, username: normalizedUsername });
  } catch (err) { next(err); }
});

// Cambiar la clave de CUALQUIER usuario (a diferencia de /change-password,
// que solo cambia la propia) — exclusivo de 'admin', no exige la clave
// actual del usuario objetivo (el admin no la conoce ni tiene por qué).
authRouter.post('/users/:username/reset-password', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    if (!isDbConfigured()) return res.status(503).json({ error: 'La base de datos no está configurada todavía.' });
    const { newPassword } = req.body || {};
    if (!newPassword) return res.status(400).json({ error: 'Falta la clave nueva.' });
    if (String(newPassword).length < 8) return res.status(400).json({ error: 'La clave nueva debe tener al menos 8 caracteres.' });
    const username = String(req.params.username).trim().toLowerCase();
    const hash = await hashPassword(newPassword);
    const { rowCount } = await query('update app_users set password_hash = $1 where username = $2', [hash, username]);
    if (!rowCount) return res.status(404).json({ error: `No existe el usuario "${username}".` });
    res.json({ ok: true });
  } catch (err) { next(err); }
});
