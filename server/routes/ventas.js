import { Router } from 'express';
import { query, isDbConfigured } from '../db.js';
import { sedeSlug, resolveCanonicalSedeName } from '../slug.js';

export const ventasRouter = Router();

ventasRouter.use((req, res, next) => {
  if (!isDbConfigured()) {
    return res.status(503).json({ error: 'La base de datos no está configurada todavía (falta DATABASE_URL).' });
  }
  next();
});

// Todas las sedes en una sola llamada (Reportes > Ventas).
ventasRouter.get('/dias', async (req, res, next) => {
  try {
    const { rows } = await query(
      'select sede_slug, sede_name, fecha, kilos, unidades, descuento, nro_clientes, valor_venta from ventas_dias order by sede_name asc, fecha asc'
    );
    res.json({ dias: rows });
  } catch (err) { next(err); }
});

// Upsert masivo: re-subir el mismo archivo (con el histórico completo hasta
// hoy) es el flujo normal, así que cada fecha se reafirma con el valor más
// reciente en vez de acumularse.
ventasRouter.post('/dias', async (req, res, next) => {
  try {
    const { sedeName, dias } = req.body || {};
    if (!sedeName || !Array.isArray(dias) || !dias.length) {
      return res.status(400).json({ error: 'Faltan campos: sedeName y dias (arreglo no vacío) son obligatorios.' });
    }
    const slug = sedeSlug(sedeName);
    const canonicalName = await resolveCanonicalSedeName(query, slug, sedeName);

    // Sin transacción envolvente (igual que balance.js/movimientos.js): cada
    // fila es un upsert independiente e idempotente por (sede_slug, fecha),
    // así que una falla a mitad de camino solo deja menos filas actualizadas
    // — no hay riesgo de corrupción, y volver a subir el archivo lo completa.
    let upserted = 0;
    for (const d of dias) {
      if (!d.fecha || typeof d.valorVenta !== 'number') continue;
      await query(
        `insert into ventas_dias (sede_slug, sede_name, fecha, kilos, unidades, descuento, nro_clientes, valor_venta, updated_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, now())
         on conflict (sede_slug, fecha)
         do update set sede_name = excluded.sede_name, kilos = excluded.kilos, unidades = excluded.unidades,
                       descuento = excluded.descuento, nro_clientes = excluded.nro_clientes,
                       valor_venta = excluded.valor_venta, updated_at = now()`,
        [slug, canonicalName, d.fecha, d.kilos ?? null, d.unidades ?? null, d.descuento ?? null, d.nroClientes ?? null, d.valorVenta]
      );
      upserted++;
    }
    res.json({ ok: true, sedeSlug: slug, upserted });
  } catch (err) { next(err); }
});

ventasRouter.get('/sedes', async (req, res, next) => {
  try {
    const { rows } = await query(
      'select sede_slug, max(sede_name) as sede_name, count(*) as dias, min(fecha) as desde, max(fecha) as hasta from ventas_dias group by sede_slug order by sede_name'
    );
    res.json({ sedes: rows });
  } catch (err) { next(err); }
});

// Presupuesto mensual por sede.
ventasRouter.get('/presupuesto', async (req, res, next) => {
  try {
    const { rows } = await query('select sede_slug, sede_name, anio, mes, monto from presupuestos_mensuales order by anio asc, mes asc, sede_name asc');
    res.json({ presupuestos: rows });
  } catch (err) { next(err); }
});

ventasRouter.put('/presupuesto', async (req, res, next) => {
  try {
    const { sedeName, anio, mes, monto } = req.body || {};
    if (!sedeName || !anio || !mes || typeof monto !== 'number') {
      return res.status(400).json({ error: 'Faltan campos: sedeName, anio, mes y monto son obligatorios.' });
    }
    const slug = sedeSlug(sedeName);
    const canonicalName = await resolveCanonicalSedeName(query, slug, sedeName);
    await query(
      `insert into presupuestos_mensuales (sede_slug, sede_name, anio, mes, monto, updated_at)
       values ($1, $2, $3, $4, $5, now())
       on conflict (sede_slug, anio, mes)
       do update set sede_name = excluded.sede_name, monto = excluded.monto, updated_at = now()`,
      [slug, canonicalName, anio, mes, monto]
    );
    res.json({ ok: true, sedeSlug: slug });
  } catch (err) { next(err); }
});
