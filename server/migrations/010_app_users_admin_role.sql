-- Un nivel por encima de 'full': 'admin' ve todo lo que 'full' ve, más el
-- panel "👥 Usuarios" (quién está en línea / último ingreso), que el propio
-- usuario pidió dejar exclusivo para él como creador de la plataforma — ni
-- 'full' (Johana) ni 'planta' lo ven, ni por la pantalla ni por la API
-- (ver requireAdmin en server/auth.js).
--
-- La restricción de `role` (antes acá mismo, solo 'full'/'planta'/'admin')
-- se quitó de este archivo (2026-11-05): como las migraciones se vuelven a
-- correr completas en cada arranque (no hay tabla de versiones, ver
-- migrate.js), esta restricción se volvía a imponer cada vez y rompía en
-- cuanto existiera un usuario con un rol más nuevo (ej. 'gestionh',
-- agregado en 013) — el CHECK vivo de verdad es el de la migración MÁS
-- RECIENTE que lo toque (ver 013_app_users_gestionh_role.sql).

update app_users set role = 'admin' where username = 'andres';
