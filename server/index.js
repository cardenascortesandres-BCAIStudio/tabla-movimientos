// Servidor de la versión web (Railway). Sirve el build estático de
// vite.config.web.js (dist-web/) y expone la API de Balance bajo /api/balance.
// La versión de doble clic (npm run build -> dist/index.html) no usa este
// servidor en absoluto — sigue siendo 100% cliente, sin backend.

import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { balanceRouter } from './routes/balance.js';
import { movimientosRouter } from './routes/movimientos.js';
import { auditoriasRouter } from './routes/auditorias.js';
import { ventasRouter } from './routes/ventas.js';
import { horasExtrasRouter } from './routes/horasExtras.js';
import { horasExtrasPlantaRouter } from './routes/horasExtrasPlanta.js';
import { authRouter } from './routes/auth.js';
import { requireAuth, requireFullAccess } from './auth.js';
import { runMigrations } from './migrate.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_WEB = path.join(__dirname, '..', 'dist-web');
const PORT = process.env.PORT || 4173;

const app = express();
// Render termina TLS en su proxy y reenvía por HTTP puro hacia la app — sin
// esto, req.secure (usado para la cookie de sesión) daría false siempre.
app.set('trust proxy', 1);
// 8mb: alcanza para el payload de Auditorías PDV con foto de evidencia (se
// comprime/redimensiona en el navegador antes de enviarla, pero se deja
// margen) — el resto de rutas sigue mandando payloads mucho más chicos.
app.use(express.json({ limit: '8mb' }));
app.use(cookieParser());

// /api/auth/* es público (login no puede requerir estar ya logueado) y
// /api/health también — todo lo demás bajo /api/* exige sesión válida.
app.use('/api/auth', authRouter);
app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api', requireAuth);

// Horas Extras Planta: accesible para 'full' Y 'planta' (el rol 'planta'
// SOLO tiene esta ruta — ver requireFullAccess en el resto de abajo).
app.use('/api/horas-extras-planta', horasExtrasPlantaRouter);

// Todo lo demás exige rol 'full' — un usuario 'planta' recibe 403 acá aunque
// pida la URL directo, no depende de que la pantalla le oculte el botón.
app.use('/api/balance', requireFullAccess, balanceRouter);
app.use('/api/movimientos', requireFullAccess, movimientosRouter);
app.use('/api/auditorias', requireFullAccess, auditoriasRouter);
app.use('/api/ventas', requireFullAccess, ventasRouter);
app.use('/api/horas-extras', requireFullAccess, horasExtrasRouter);

app.use(express.static(DIST_WEB));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[server error]', err);
  res.status(500).json({ error: err.message || 'Error interno' });
});

runMigrations()
  .catch(err => console.error('[migrate] falló:', err.message))
  .finally(() => {
    app.listen(PORT, () => console.log(`[server] escuchando en :${PORT}`));
  });
