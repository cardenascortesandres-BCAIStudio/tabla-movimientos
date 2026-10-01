import { Router } from 'express';
import { query, isDbConfigured } from '../db.js';
import { sedeSlug, resolveCanonicalSedeName } from '../slug.js';

export const auditoriasRouter = Router();

auditoriasRouter.use((req, res, next) => {
  if (!isDbConfigured()) {
    return res.status(503).json({ error: 'La base de datos no está configurada todavía (falta DATABASE_URL).' });
  }
  next();
});

// Todas las auditorías en una sola llamada (Reportes > Auditorías) — SIN la
// foto (puede pesar varios cientos de KB cada una; con el historial completo
// inflaría la respuesta y el caché en localStorage). Se marca `tiene_foto`
// para saber si vale la pena pedirla, y se sirve aparte bajo demanda.
auditoriasRouter.get('/audits', async (req, res, next) => {
  try {
    const { rows } = await query(
      `select id, sede_slug, sede_name, audit_date, audit_time, auditor_name, items, total_items,
              checked_items, pct_cumplimiento, resultado, hallazgos, plan_accion, fecha_seguimiento, created_at,
              (foto_data_url is not null) as tiene_foto
       from pdv_audits order by sede_name asc, audit_date asc`
    );
    res.json({ audits: rows });
  } catch (err) { next(err); }
});

auditoriasRouter.get('/audits/:sede', async (req, res, next) => {
  try {
    const slug = sedeSlug(req.params.sede);
    const { rows } = await query(
      `select id, sede_slug, sede_name, audit_date, audit_time, auditor_name, items, total_items,
              checked_items, pct_cumplimiento, resultado, hallazgos, plan_accion, fecha_seguimiento, created_at,
              (foto_data_url is not null) as tiene_foto
       from pdv_audits where sede_slug = $1 order by audit_date asc`,
      [slug]
    );
    res.json({ sedeSlug: slug, audits: rows });
  } catch (err) { next(err); }
});

// Foto de una auditoría puntual, pedida solo cuando el usuario abre el
// detalle de esa visita en el histórico de novedades.
auditoriasRouter.get('/audits/:id/foto', async (req, res, next) => {
  try {
    const { rows } = await query('select foto_data_url from pdv_audits where id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Auditoría no encontrada.' });
    res.json({ fotoDataUrl: rows[0].foto_data_url || null });
  } catch (err) { next(err); }
});

auditoriasRouter.post('/audits', async (req, res, next) => {
  try {
    const {
      sedeName, auditDate, auditTime, auditorName, items,
      totalItems, checkedItems, pctCumplimiento, resultado, hallazgos, planAccion, fechaSeguimiento, fotoDataUrl
    } = req.body || {};
    if (!sedeName || !auditDate || !items || totalItems == null || checkedItems == null) {
      return res.status(400).json({ error: 'Faltan campos: sedeName, auditDate, items, totalItems y checkedItems son obligatorios.' });
    }
    const slug = sedeSlug(sedeName);
    // Mismo criterio que balance_weeks/movimientos_weeks: reusa el sede_name
    // ya guardado para esta sede si existe, para no duplicar sedes por un
    // cambio de mayúsculas/minúsculas al escribir el nombre.
    const canonicalName = await resolveCanonicalSedeName(query, slug, sedeName);
    const { rows } = await query(
      `insert into pdv_audits (sede_slug, sede_name, audit_date, audit_time, auditor_name, items, total_items,
                                checked_items, pct_cumplimiento, resultado, hallazgos, plan_accion, fecha_seguimiento, foto_data_url)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       returning id`,
      [slug, canonicalName, auditDate, auditTime || null, auditorName || null, items, totalItems,
        checkedItems, pctCumplimiento, resultado || null, hallazgos || null, planAccion || null, fechaSeguimiento || null,
        fotoDataUrl || null]
    );
    res.json({ ok: true, id: rows[0].id, sedeSlug: slug });
  } catch (err) { next(err); }
});

auditoriasRouter.get('/sedes', async (req, res, next) => {
  try {
    const { rows } = await query(
      'select sede_slug, max(sede_name) as sede_name, count(*) as audits from pdv_audits group by sede_slug order by sede_name'
    );
    res.json({ sedes: rows });
  } catch (err) { next(err); }
});
