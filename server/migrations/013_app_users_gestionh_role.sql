-- Nuevo rol 'gestionh' (Gestión Humana) — ve exclusivamente el informe de
-- Horas Extras PDV (sin Balance/Mermas/Ventas/Margen), descargable desde su
-- propia pantalla (ver gestionHScreen en index.html). requireHorasAccess en
-- server/auth.js es quien hace cumplir esto en /api/horas-extras.

alter table app_users drop constraint if exists app_users_role_check;
alter table app_users add constraint app_users_role_check check (role in ('full', 'planta', 'admin', 'gestionh'));
