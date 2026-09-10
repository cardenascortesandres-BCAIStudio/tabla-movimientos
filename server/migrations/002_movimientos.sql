-- Historial de "Tabla de Movimientos" — una fila por semana YA EDITADA/
-- corregida a mano y guardada desde el apartado Reportes (no las cargas
-- crudas de la pantalla principal, que no se guardan). Mismo diseño que
-- balance_weeks (ver 001_balance.sql) para reusar el mismo patrón de
-- Reportes (semanal/mensual/anual, por sede y consolidado).

create table if not exists movimientos_weeks (
  id bigserial primary key,
  sede_slug text not null,
  sede_name text not null,
  week_key text not null,
  week_start date,
  week_end date,
  computed jsonb not null,
  created_at timestamptz not null default now(),
  unique (sede_slug, week_key)
);

create index if not exists movimientos_weeks_sede_idx on movimientos_weeks (sede_slug, week_key);
