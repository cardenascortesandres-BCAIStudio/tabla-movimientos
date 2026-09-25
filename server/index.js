// Servidor de la versión web (Railway). Sirve el build estático de
// vite.config.web.js (dist-web/) y expone la API de Balance bajo /api/balance.
// La versión de doble clic (npm run build -> dist/index.html) no usa este
// servidor en absoluto — sigue siendo 100% cliente, sin backend.

import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { balanceRouter } from './routes/balance.js';
import { movimientosRouter } from './routes/movimientos.js';
import { auditoriasRouter } from './routes/auditorias.js';
import { ventasRouter } from './routes/ventas.js';
import { horasExtrasRouter } from './routes/horasExtras.js';
import { runMigrations } from './migrate.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_WEB = path.join(__dirname, '..', 'dist-web');
const PORT = process.env.PORT || 4173;

const app = express();
app.use(express.json({ limit: '2mb' }));

app.use('/api/balance', balanceRouter);
app.use('/api/movimientos', movimientosRouter);
app.use('/api/auditorias', auditoriasRouter);
app.use('/api/ventas', ventasRouter);
app.use('/api/horas-extras', horasExtrasRouter);

app.get('/api/health', (req, res) => res.json({ ok: true }));

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
