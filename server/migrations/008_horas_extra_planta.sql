-- Historial de Horas Extras de PLANTA — misma forma exacta que
-- horas_extra_dias (005_horas_extras.sql), pero en su propia tabla para
-- controlar planta por separado de los puntos de venta (PDV), a pedido
-- explícito del usuario. Mismo PDF "Liquidación Detallada" de RH, mismo
-- parser (src/core/horasExtrasPdfParse.js) — solo cambia a qué tabla se
-- guarda y quién puede verla (ver server/auth.js: el rol 'planta' solo
-- tiene acceso a esta tabla, nunca a horas_extra_dias de PDV).

create table if not exists horas_extra_planta_dias (
  id bigserial primary key,
  sede_slug text not null,
  sede_name text not null,
  empleado_id text not null,
  empleado_nombre text not null,
  cargo text,
  fecha date not null,
  estado_dia text,
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

create index if not exists horas_extra_planta_dias_sede_idx on horas_extra_planta_dias (sede_slug, fecha);
create index if not exists horas_extra_planta_dias_empleado_idx on horas_extra_planta_dias (empleado_id, fecha);
