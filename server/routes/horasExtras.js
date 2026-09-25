import { Router } from 'express';
import { query, isDbConfigured } from '../db.js';
import { sedeSlug, resolveCanonicalSedeName } from '../slug.js';

export const horasExtrasRouter = Router();

horasExtrasRouter.use((req, res, next) => {
  if (!isDbConfigured()) {
    return res.status(503).json({ error: 'La base de datos no está configurada todavía (falta DATABASE_URL).' });
  }
  next();
});

// Todo el historial, todas las sedes (para Reportes > Horas Extras).
horasExtrasRouter.get('/dias', async (req, res, next) => {
  try {
    const { rows } = await query(
      `select sede_slug, sede_name, empleado_id, empleado_nombre, cargo, fecha, estado_dia,
              total, comida, f, hdo, rn, rndyf, dom, d, hefd, hefn, he, hen
       from horas_extra_dias order by sede_name asc, empleado_nombre asc, fecha asc`
    );
    res.json({ dias: rows });
  } catch (err) { next(err); }
});

const COLS = ['sede_slug', 'sede_name', 'empleado_id', 'empleado_nombre', 'cargo', 'fecha', 'estado_dia',
  'total', 'comida', 'f', 'hdo', 'rn', 'rndyf', 'dom', 'd', 'hefd', 'hefn', 'he', 'hen'];

// Upsert masivo: re-subir el mismo PDF (misma cédula + fecha) reafirma los
// valores en vez de duplicar — mismo patrón que ventasRouter.post('/dias').
horasExtrasRouter.post('/dias', async (req, res, next) => {
  try {
    const { dias } = req.body || {};
    if (!Array.isArray(dias) || !dias.length) {
      return res.status(400).json({ error: 'Falta el campo dias (arreglo no vacío).' });
    }
    const validDias = dias.filter((d) => d.empleadoId && d.fecha && d.sedeName);

    // Resolver el nombre canónico una vez por sede (normalmente son 7), no
    // una vez por fila — con archivos de cientos de días esto evitaba
    // cientos de consultas secuenciales solo para el nombre de sede.
    const sedeCache = new Map();
    for (const sedeName of new Set(validDias.map((d) => d.sedeName))) {
      const slug = sedeSlug(sedeName);
      sedeCache.set(sedeName, { slug, canonicalName: await resolveCanonicalSedeName(query, slug, sedeName) });
    }

    const CHUNK = 300;
    let upserted = 0;
    for (let i = 0; i < validDias.length; i += CHUNK) {
      const chunk = validDias.slice(i, i + CHUNK);
      const values = [];
      const params = [];
      for (const d of chunk) {
        const { slug, canonicalName } = sedeCache.get(d.sedeName);
        const rowValues = [
          slug, canonicalName, d.empleadoId, d.empleadoNombre, d.cargo ?? null, d.fecha, d.estadoDia ?? null,
          d.total ?? null, d.comida ?? null, d.f ?? null, d.hdo ?? null, d.rn ?? null, d.rndyf ?? null,
          d.dom ?? null, d.d ?? null, d.hefd ?? null, d.hefn ?? null, d.he ?? null, d.hen ?? null
        ];
        const base = params.length;
        values.push(`(${rowValues.map((_, j) => `$${base + j + 1}`).join(', ')}, now())`);
        params.push(...rowValues);
      }
      await query(
        `insert into horas_extra_dias (${COLS.join(', ')}, updated_at)
         values ${values.join(', ')}
         on conflict (empleado_id, fecha)
         do update set sede_slug = excluded.sede_slug, sede_name = excluded.sede_name,
                       empleado_nombre = excluded.empleado_nombre, cargo = excluded.cargo,
                       estado_dia = excluded.estado_dia, total = excluded.total, comida = excluded.comida,
                       f = excluded.f, hdo = excluded.hdo, rn = excluded.rn, rndyf = excluded.rndyf,
                       dom = excluded.dom, d = excluded.d, hefd = excluded.hefd, hefn = excluded.hefn,
                       he = excluded.he, hen = excluded.hen, updated_at = now()`,
        params
      );
      upserted += chunk.length;
    }
    res.json({ ok: true, upserted });
  } catch (err) { next(err); }
});
