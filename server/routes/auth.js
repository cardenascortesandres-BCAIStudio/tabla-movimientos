import { Router } from 'express';
import { isDbConfigured } from '../db.js';
import { verifyCredentials, setSessionCookie, clearSessionCookie, getSessionUser } from '../auth.js';

export const authRouter = Router();

authRouter.post('/login', async (req, res, next) => {
  try {
    if (!isDbConfigured()) return res.status(503).json({ error: 'La base de datos no está configurada todavía.' });
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: 'Usuario y clave son obligatorios.' });
    const user = await verifyCredentials(username, password);
    if (!user) return res.status(401).json({ error: 'Usuario o clave incorrectos.' });
    setSessionCookie(req, res, user);
    res.json({ ok: true, username: user.username, displayName: user.display_name, role: user.role });
  } catch (err) { next(err); }
});

authRouter.post('/logout', (req, res) => {
  clearSessionCookie(req, res);
  res.json({ ok: true });
});

authRouter.get('/me', (req, res) => {
  const user = getSessionUser(req);
  if (!user) return res.status(401).json({ error: 'No autenticado.' });
  res.json({ username: user.username, displayName: user.displayName, role: user.role });
});
