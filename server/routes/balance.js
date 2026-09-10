import { Router } from 'express';
import { query, isDbConfigured } from '../db.js';
import { sedeSlug, resolveCanonicalSedeName } from '../slug.js';

export const balanceRouter = Router();

balanceRouter.use((req, res, next) => {
  if (!isDbConfigured()) {
    return res.status(503).json({ error: 'La base de datos no está configurada todavía (falta DATABASE_URL).' });
  }
  next();
});

// ---------------- Clasificación por sede ----------------

balanceRouter.get('/classification/:sede', async (req, res, next) => {
  try {
    const slug = sedeSlug(req.params.sede);
    const { rows } = await query(
      'select label_norm, bucket, side, is_devolucion from balance_classification where sede_slug = $1',
      [slug]
    );
    const labels = {};
    for (const r of rows) {
      labels[r.label_norm] = { bucket: r.bucket, side: r.side, isDevolucion: r.is_devolucion };
    }
    res.json({ sedeSlug: slug, labels });
  } catch (err) { next(err); }
});

balanceRouter.put('/classification/:sede', async (req, res, next) => {
  try {
    const slug = sedeSlug(req.params.sede);
    const labels = req.body?.labels || {};
    const entries = Object.entries(labels);
    for (const [labelNorm, cls] of entries) {
      await query(
        `insert into balance_classification (sede_slug, label_norm, bucket, side, is_devolucion, last_seen_at)
         values ($1, $2, $3, $4, $5, now())
         on conflict (sede_slug, label_norm)
         do update set bucket = excluded.bucket, side = excluded.side, is_devolucion = excluded.is_devolucion, last_seen_at = now()`,
        [slug, labelNorm, cls.bucket, cls.side, !!cls.isDevolucion]
      );
    }
    res.json({ ok: true, saved: entries.length });
  } catch (err) { next(err); }
});

// ---------------- Historial semanal por sede ----------------

// Todas las sedes en una sola llamada (usado por Reportes: evita N+1 pedidos
// — antes el cliente llamaba /sedes y luego /weeks/:sede una vez por sede).
balanceRouter.get('/weeks', async (req, res, next) => {
  try {
    const { rows } = await query(
      'select sede_slug, sede_name, week_key, week_start, week_end, inputs, computed, created_at from balance_weeks order by sede_name asc, week_key asc'
    );
    res.json({ weeks: rows });
  } catch (err) { next(err); }
});

balanceRouter.get('/weeks/:sede', async (req, res, next) => {
  try {
    const slug = sedeSlug(req.params.sede);
    const { rows } = await query(
      'select sede_slug, sede_name, week_key, week_start, week_end, inputs, computed, created_at from balance_weeks where sede_slug = $1 order by week_key asc',
      [slug]
    );
    res.json({ sedeSlug: slug, weeks: rows });
  } catch (err) { next(err); }
});

balanceRouter.post('/weeks', async (req, res, next) => {
  try {
    const { sedeName, weekKey, weekStart, weekEnd, inputs, computed } = req.body || {};
    if (!sedeName || !weekKey || !inputs || !computed) {
      return res.status(400).json({ error: 'Faltan campos: sedeName, weekKey, inputs y computed son obligatorios.' });
    }
    const slug = sedeSlug(sedeName);
    // Usa el sede_name ya guardado para esta sede (si existe) en vez del que
    // el usuario acaba de escribir — evita que "Chiminangos" y "CHIMINANGOS"
    // (mismo slug, distinto texto literal) queden como dos sedes separadas
    // en Reportes, que agrupa por sede_name.
    const canonicalName = await resolveCanonicalSedeName(query, slug, sedeName);
    const { rows } = await query(
      `insert into balance_weeks (sede_slug, sede_name, week_key, week_start, week_end, inputs, computed)
       values ($1, $2, $3, $4, $5, $6, $7)
       on conflict (sede_slug, week_key)
       do update set sede_name = excluded.sede_name, week_start = excluded.week_start, week_end = excluded.week_end,
                     inputs = excluded.inputs, computed = excluded.computed
       returning id`,
      [slug, canonicalName, weekKey, weekStart || null, weekEnd || null, inputs, computed]
    );
    res.json({ ok: true, id: rows[0].id, sedeSlug: slug });
  } catch (err) { next(err); }
});

// ---------------- Sedes con historial (para el informe comparativo) ----------------

balanceRouter.get('/sedes', async (req, res, next) => {
  try {
    const { rows } = await query(
      'select sede_slug, max(sede_name) as sede_name, count(*) as weeks from balance_weeks group by sede_slug order by sede_name'
    );
    res.json({ sedes: rows });
  } catch (err) { next(err); }
});
