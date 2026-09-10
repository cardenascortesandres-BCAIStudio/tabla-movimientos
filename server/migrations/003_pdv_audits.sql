-- Historial de "Auditorías PDV" — una fila por visita/auditoría de punto de
-- venta. `items` guarda el formulario completo (bloque -> ítems marcados +
-- observaciones) como jsonb; las columnas sueltas son las que Reportes
-- necesita filtrar/agrupar directamente sin tener que abrir el jsonb.

create table if not exists pdv_audits (
  id bigserial primary key,
  sede_slug text not null,
  sede_name text not null,
  audit_date date not null,
  audit_time text,
  auditor_name text,
  items jsonb not null,
  total_items integer not null,
  checked_items integer not null,
  pct_cumplimiento numeric not null,
  resultado text,
  hallazgos text,
  plan_accion text,
  fecha_seguimiento date,
  created_at timestamptz not null default now()
);

create index if not exists pdv_audits_sede_idx on pdv_audits (sede_slug, audit_date);
