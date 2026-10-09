-- Para el panel "👥 Usuarios" (quién está en línea y cuándo ingresó cada
-- uno por última vez, visible solo para el rol 'full' — ver
-- GET /api/auth/users). last_login_at se actualiza en cada login exitoso;
-- last_seen_at se actualiza en cada request autenticado (requireAuth) y se
-- limpia al cerrar sesión, para que "en línea" refleje la actividad real.

alter table app_users add column if not exists last_login_at timestamptz;
alter table app_users add column if not exists last_seen_at timestamptz;
