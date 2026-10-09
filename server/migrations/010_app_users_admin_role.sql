-- Un nivel por encima de 'full': 'admin' ve todo lo que 'full' ve, más el
-- panel "👥 Usuarios" (quién está en línea / último ingreso), que el propio
-- usuario pidió dejar exclusivo para él como creador de la plataforma — ni
-- 'full' (Johana) ni 'planta' lo ven, ni por la pantalla ni por la API
-- (ver requireAdmin en server/auth.js).

alter table app_users drop constraint if exists app_users_role_check;
alter table app_users add constraint app_users_role_check check (role in ('full', 'planta', 'admin'));

update app_users set role = 'admin' where username = 'andres';
