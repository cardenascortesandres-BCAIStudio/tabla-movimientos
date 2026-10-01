-- Foto de evidencia de la visita, al final del formulario de Auditorías PDV.
-- Se guarda como data URL (base64) directo en la fila — no hay que montar
-- almacenamiento de archivos aparte para una sola foto por visita. NO se
-- incluye en el SELECT de /api/auditorias/audits (la lista que alimenta
-- Reportes) para no inflar esa respuesta ni el caché en localStorage; se
-- sirve aparte, bajo demanda, en /api/auditorias/audits/:id/foto.

alter table pdv_audits add column if not exists foto_data_url text;
