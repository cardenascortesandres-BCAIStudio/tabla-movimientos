// Autenticación por usuario/clave — hoy el sitio es público (cualquiera con
// el link ve todo), esto lo cierra de verdad: el token se firma con HMAC
// (sin dependencias nuevas de sesión/JWT) y se verifica en CADA request a
// /api/* vía requireAuth/requireFullAccess — no es solo "ocultar botones" en
// pantalla, server/index.js aplica estos middlewares a las rutas, así que un
// usuario "planta" no puede pedir /api/balance/weeks ni con la URL directa.

import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { query } from './db.js';

const COOKIE_NAME = 'rpdv_session';
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 días — herramienta interna, sesión larga por comodidad.

// En producción DEBE venir de una variable de entorno real (Render: Settings
// > Environment > SESSION_SECRET) — el valor por defecto solo evita que el
// servidor truene en desarrollo local sin .env completo.
const SECRET = process.env.SESSION_SECRET || 'dev-insecure-secret-cambiar-en-produccion';

function sign(payloadB64) {
  return crypto.createHmac('sha256', SECRET).update(payloadB64).digest('base64url');
}

function issueToken(user) {
  const payload = { username: user.username, role: user.role, displayName: user.display_name, iat: Date.now() };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return payloadB64 + '.' + sign(payloadB64);
}

function verifyToken(token) {
  if (!token || !token.includes('.')) return null;
  const idx = token.lastIndexOf('.');
  const payloadB64 = token.slice(0, idx), sig = token.slice(idx + 1);
  let expected;
  try { expected = sign(payloadB64); } catch { return null; }
  // Comparación a tiempo constante — evita filtrar la firma por timing.
  const a = Buffer.from(sig), b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    if (Date.now() - payload.iat > MAX_AGE_MS) return null;
    return payload;
  } catch { return null; }
}

// `req.secure` ya refleja HTTPS real del cliente porque server/index.js
// activa `trust proxy` (Render termina TLS en su proxy y reenvía por HTTP
// puro hacia la app; sin trust proxy, req.secure saldría false siempre).
export function setSessionCookie(req, res, user) {
  res.cookie(COOKIE_NAME, issueToken(user), {
    httpOnly: true, sameSite: 'lax', secure: req.secure, maxAge: MAX_AGE_MS
  });
}
export function clearSessionCookie(req, res) {
  res.clearCookie(COOKIE_NAME, { httpOnly: true, sameSite: 'lax', secure: req.secure });
}

export function getSessionUser(req) {
  return verifyToken(req.cookies?.[COOKIE_NAME]);
}

export async function verifyCredentials(username, password) {
  const { rows } = await query('select * from app_users where username = $1', [String(username).trim().toLowerCase()]);
  if (!rows.length) return null;
  const ok = await bcrypt.compare(password, rows[0].password_hash);
  return ok ? rows[0] : null;
}

export async function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

// Refresca "última actividad" (para el panel "👥 Usuarios" — quién está en
// línea ahora mismo) — toda la lógica vive acá para no tocar cada ruta por
// separado. Fire-and-forget: nunca bloquea ni rompe la respuesta real si la
// DB está caída, y el `and` evita escribir en cada request (basta una vez
// cada 30s por usuario para que "en línea" se vea al momento sin golpear la
// base de datos en cada llamada).
export function touchLastSeen(username) {
  query(
    `update app_users set last_seen_at = now() where username = $1
     and (last_seen_at is null or last_seen_at < now() - interval '30 seconds')`,
    [username]
  ).catch(() => {});
}

// Requiere sesión válida (cualquier rol) — se monta sobre TODAS las rutas
// /api/* menos /api/auth/* y /api/health.
export function requireAuth(req, res, next) {
  const user = getSessionUser(req);
  if (!user) return res.status(401).json({ error: 'No autenticado.' });
  req.user = user;
  touchLastSeen(user.username);
  next();
}

// Requiere rol 'full' — el rol 'planta' recibe 403 acá, aunque pida la URL
// directo (no depende de que la pantalla le oculte el botón).
export function requireFullAccess(req, res, next) {
  if (req.user?.role !== 'full') return res.status(403).json({ error: 'No tienes acceso a esta sección.' });
  next();
}
