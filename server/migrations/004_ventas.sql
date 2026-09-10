-- Historial de Ventas por día (una fila por sede/fecha). A diferencia de
-- balance_weeks/movimientos_weeks (una fila por semana YA cerrada), el
-- archivo fuente ("Ventas Netas Por Dia") trae SIEMPRE el histórico completo
-- desde que existe la sede hasta el día de la descarga, y el usuario lo
-- vuelve a subir seguido (a diario) — por eso la carga siempre hace upsert
-- por (sede_slug, fecha), nunca un insert ciego.

create table if not exists ventas_dias (
  id bigserial primary key,
  sede_slug text not null,
  sede_name text not null,
  fecha date not null,
  kilos numeric,
  unidades numeric,
  descuento numeric,
  nro_clientes numeric,
  valor_venta numeric not null,
  updated_at timestamptz not null default now(),
  unique (sede_slug, fecha)
);

create index if not exists ventas_dias_sede_idx on ventas_dias (sede_slug, fecha);

-- Meta de venta (presupuesto) mensual por sede — editable desde la pestaña
-- Reportes > Ventas. Un solo monto por sede/mes (no por semana): el usuario
-- confirmó que así es como maneja el presupuesto hoy.
create table if not exists presupuestos_mensuales (
  id bigserial primary key,
  sede_slug text not null,
  sede_name text not null,
  anio integer not null,
  mes integer not null,
  monto numeric not null,
  updated_at timestamptz not null default now(),
  unique (sede_slug, anio, mes)
);
