-- Historial de Horas Extras por empleado/día, a partir del PDF "Liquidación
-- Detallada" que Recursos Humanos envía cada semana (una página por
-- empleado, formato idéntico en las 7 sedes activas). La sede viene
-- explícita en el propio PDF (no hay que adivinarla). `empleado_id` (cédula)
-- es la identidad estable entre reportes semanales — el mismo empleado
-- puede cambiar de cargo/sede con el tiempo, pero no de cédula.

create table if not exists horas_extra_dias (
  id bigserial primary key,
  sede_slug text not null,
  sede_name text not null,
  empleado_id text not null,
  empleado_nombre text not null,
  cargo text,
  fecha date not null,
  estado_dia text, -- 'trabajado' | 'inasistencia' | 'descanso'
  total numeric,
  comida numeric,
  f numeric,
  hdo numeric,
  rn numeric,
  rndyf numeric,
  dom numeric,
  d numeric,
  hefd numeric,
  hefn numeric,
  he numeric,
  hen numeric,
  updated_at timestamptz not null default now(),
  unique (empleado_id, fecha)
);

create index if not exists horas_extra_dias_sede_idx on horas_extra_dias (sede_slug, fecha);
create index if not exists horas_extra_dias_empleado_idx on horas_extra_dias (empleado_id, fecha);
