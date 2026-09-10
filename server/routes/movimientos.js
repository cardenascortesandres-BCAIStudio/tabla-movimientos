import { Router } from 'express';
import { query, isDbConfigured } from '../db.js';
import { sedeSlug, resolveCanonicalSedeName } from '../slug.js';

export const movimientosRouter = Router();

movimientosRouter.use((req, res, next) => {
  if (!isDbConfigured()) {
    return res.status(503).json({ error: 'La base de datos no está configurada todavía (falta DATABASE_URL).' });
  }
  next();
});

// Todas las sedes en una sola llamada (Reportes de Tabla de Movimientos).
movimientosRouter.get('/weeks', async (req, res, next) => {
  try {
    const { rows } = await query(
      'select sede_slug, sede_name, week_key, week_start, week_end, computed, created_at from movimientos_weeks order by sede_name asc, week_key asc'
    );
    res.json({ weeks: rows });
  } catch (err) { next(err); }
});

movimientosRouter.get('/weeks/:sede', async (req, res, next) => {
  try {
    const slug = sedeSlug(req.params.sede);
    const { rows } = await query(
      'select sede_slug, sede_name, week_key, week_start, week_end, computed, created_at from movimientos_weeks where sede_slug = $1 order by week_key asc',
      [slug]
    );
    res.json({ sedeSlug: slug, weeks: rows });
  } catch (err) { next(err); }
});

movimientosRouter.post('/weeks', async (req, res, next) => {
  try {
    const { sedeName, weekKey, weekStart, weekEnd, computed } = req.body || {};
    if (!sedeName || !weekKey || !computed) {
      return res.status(400).json({ error: 'Faltan campos: sedeName, weekKey y computed son obligatorios.' });
    }
    const slug = sedeSlug(sedeName);
    // Igual que en balance_weeks: usa el sede_name ya guardado para esta
    // sede (si existe) para que no queden dos sedes distintas por un
    // cambio de mayúsculas/minúsculas al escribir el nombre.
    const canonicalName = await resolveCanonicalSedeName(query, slug, sedeName);
    const { rows } = await query(
      `insert into movimientos_weeks (sede_slug, sede_name, week_key, week_start, week_end, computed)
       values ($1, $2, $3, $4, $5, $6)
       on conflict (sede_slug, week_key)
       do update set sede_name = excluded.sede_name, week_start = excluded.week_start, week_end = excluded.week_end,
                     computed = excluded.computed
       returning id`,
      [slug, canonicalName, weekKey, weekStart || null, weekEnd || null, computed]
    );
    res.json({ ok: true, id: rows[0].id, sedeSlug: slug });
  } catch (err) { next(err); }
});

movimientosRouter.get('/sedes', async (req, res, next) => {
  try {
    const { rows } = await query(
      'select sede_slug, max(sede_name) as sede_name, count(*) as weeks from movimientos_weeks group by sede_slug order by sede_name'
    );
    res.json({ sedes: rows });
  } catch (err) { next(err); }
});
