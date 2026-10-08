-- Usuarios de la plataforma — hoy el sitio es público (sin login), esto
-- agrega acceso real por usuario/clave. Solo 2 niveles por ahora: 'full'
-- (acceso a todo, como antes) y 'planta' (solo Horas Extras Planta, tanto
-- la carga como su informe en Reportes) — server/auth.js hace cumplir esto
-- en cada ruta /api/*, no solo oculta botones en pantalla.

create table if not exists app_users (
  id bigserial primary key,
  username text not null unique,
  password_hash text not null,
  display_name text not null,
  role text not null check (role in ('full', 'planta')),
  created_at timestamptz not null default now()
);
