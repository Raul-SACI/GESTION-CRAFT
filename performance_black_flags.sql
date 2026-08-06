-- ============================================================================
-- BANDERAS NEGRAS (comentarios negativos de clientes)
-- ============================================================================
-- Correr una sola vez en el SQL Editor de Supabase.
-- Es idempotente: se puede volver a correr sin romper nada.
--
-- La bandera negra funciona como la roja (descuenta plata del premio), pero
-- ademas queda documentada: cada una guarda su fecha y el motivo por el que
-- se coloco. Por eso son dos cambios distintos:
--
--   1) El VALOR de la bandera va en performance_role_configs, que ya esta
--      indexada por sucursal + mes + rol. Asi el valor puede ser distinto
--      para el encargado y para el jefe de cocina, y distinto cada mes,
--      sin ningun trabajo extra.
--
--   2) El DETALLE va en performance_reports como un array JSONB, igual que
--      'variables' y 'results' que ya se guardan asi en estas mismas tablas.
--      Cada elemento tiene la forma: {"id": "...", "date": "2026-08-12",
--      "reason": "Cliente se quejo por demora en la entrega"}
--
--      La cantidad de banderas NO se guarda como numero: se deriva del largo
--      del array. De esa forma la penalidad nunca puede quedar desfasada de
--      los motivos documentados.
-- ============================================================================

-- 1) Valor de la bandera negra, por sucursal / mes / rol.
--    Arranca en 0 para que los meses ya cargados no cambien de premio hasta
--    que alguien cargue un valor a proposito.
alter table public.performance_role_configs
  add column if not exists black_flag_penalty numeric not null default 0;

-- 2) Detalle de las banderas negras del mes.
alter table public.performance_reports
  add column if not exists black_flags jsonb not null default '[]'::jsonb;

-- 3) Red de seguridad: que 'black_flags' sea siempre un array JSON, nunca un
--    objeto o un string suelto.
--    Se hace en dos statements sueltos en lugar de un bloque DO: es igual de
--    idempotente y no depende de que el editor SQL ejecute bloques anonimos.
alter table public.performance_reports
  drop constraint if exists performance_reports_black_flags_is_array;

alter table public.performance_reports
  add constraint performance_reports_black_flags_is_array
  check (jsonb_typeof(black_flags) = 'array');

-- ============================================================================
-- Verificacion: las tres consultas de abajo tienen que devolver una fila cada una.
-- ============================================================================
-- select column_name, data_type, column_default
--   from information_schema.columns
--  where table_name = 'performance_role_configs' and column_name = 'black_flag_penalty';
--
-- select column_name, data_type, column_default
--   from information_schema.columns
--  where table_name = 'performance_reports' and column_name = 'black_flags';
--
-- select conname from pg_constraint
--  where conname = 'performance_reports_black_flags_is_array';
