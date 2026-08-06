-- ============================================================================
-- CIERRE DE MES DE PREMIOS
-- ============================================================================
-- Correr una sola vez en el SQL Editor de Supabase. Es idempotente.
--
-- Hasta ahora los resultados de cada sucursal se cargaban a mano en
-- Administracion de Premios > Carga de Resultados. Eso se elimina: los numeros
-- salen del DASHBOARD del encargado, que ya los calcula en vivo desde las
-- ventas, el CMV, los desvios de stock y horas, las reputaciones y las
-- supervisiones.
--
-- El administrador cierra el mes desde el dashboard y en ese momento se
-- congela la foto en performance_reports. A partir de ahi la pestana de
-- Resultados solo lee, y lo unico editable a mano son las banderas negras.
--
--   closed_at             cuando se cerro. NULL = mes todavia abierto.
--   closed_by             quien lo cerro, para poder auditarlo.
--   black_flags_at_close  cuantas banderas negras habia al momento del cierre.
--                         Sirve para avisar si despues se cargaron mas y el
--                         premio congelado quedo desactualizado.
-- ============================================================================

alter table public.performance_reports
  add column if not exists closed_at timestamptz;

alter table public.performance_reports
  add column if not exists closed_by text;

alter table public.performance_reports
  add column if not exists black_flags_at_close integer not null default 0;

-- ============================================================================
-- Verificacion: tiene que devolver tres filas.
-- ============================================================================
-- select column_name, data_type
--   from information_schema.columns
--  where table_name = 'performance_reports'
--    and column_name in ('closed_at', 'closed_by', 'black_flags_at_close');
