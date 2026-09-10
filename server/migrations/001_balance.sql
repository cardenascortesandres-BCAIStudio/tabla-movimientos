-- Esquema del historial de Balance. Idempotente (IF NOT EXISTS) para poder
-- correrlo en cada arranque del servidor sin necesitar un framework de
-- migraciones aparte — el volumen de cambios de esquema esperado es bajo.

create table if not exists balance_classification (
  sede_slug text not null,
  label_norm text not null,
  bucket text not null,
  side text not null,
  is_devolucion boolean not null default false,
  last_seen_at timestamptz not null default now(),
  primary key (sede_slug, label_norm)
);

create table if not exists balance_weeks (
  id bigserial primary key,
  sede_slug text not null,
  sede_name text not null,
  week_key text not null,
  week_start date,
  week_end date,
  inputs jsonb not null,
  computed jsonb not null,
  created_at timestamptz not null default now(),
  unique (sede_slug, week_key)
);

create index if not exists balance_weeks_sede_idx on balance_weeks (sede_slug, week_key);

-- Preparado para el fast-follow de Tabla de Movimientos (no se usa todavía).
create table if not exists movimientos_runs (
  id bigserial primary key,
  sede_slug text not null,
  sede_name text not null,
  periodo text,
  summary jsonb not null,
  created_at timestamptz not null default now()
);
