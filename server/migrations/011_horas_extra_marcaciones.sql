-- Marcaciones reales (hora de entrada/salida, "08:07") por día — a pedido
-- explícito del usuario, para poder identificar anomalías (entradas tarde,
-- salidas muy tempranas, marcaciones faltantes) directamente en el detalle
-- por empleado, no solo los totales ya calculados. Se guardan como texto
-- ("HH:MM") porque solo se muestran, no se hacen cuentas con ellas.

alter table horas_extra_dias add column if not exists entrada1 text;
alter table horas_extra_dias add column if not exists salida1 text;
alter table horas_extra_dias add column if not exists entrada2 text;
alter table horas_extra_dias add column if not exists salida2 text;

alter table horas_extra_planta_dias add column if not exists entrada1 text;
alter table horas_extra_planta_dias add column if not exists salida1 text;
alter table horas_extra_planta_dias add column if not exists entrada2 text;
alter table horas_extra_planta_dias add column if not exists salida2 text;
