-- Un mismo día puede traer más de 2 marcaciones reales (turno doble/nocturno
-- que aparece como una "fila de continuación" en el PDF) — entrada1/salida1/
-- entrada2/salida2 (migración 011) solo alcanzaban para 1 fila; se agregan
-- 2 pares más para cubrir la fila de continuación sin perder datos (bug
-- real reportado por el usuario, ver src/core/horasExtrasPdfParse.js).

alter table horas_extra_dias add column if not exists entrada3 text;
alter table horas_extra_dias add column if not exists salida3 text;
alter table horas_extra_dias add column if not exists entrada4 text;
alter table horas_extra_dias add column if not exists salida4 text;

alter table horas_extra_planta_dias add column if not exists entrada3 text;
alter table horas_extra_planta_dias add column if not exists salida3 text;
alter table horas_extra_planta_dias add column if not exists entrada4 text;
alter table horas_extra_planta_dias add column if not exists salida4 text;
