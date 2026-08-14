-- ============================================================================
-- COLUMNAS DE COSTO / CÓDIGO EN LOS MAESTROS
-- ============================================================================
-- Correr una sola vez en el SQL Editor de Supabase. Idempotente.
--
-- - recipe_masters (Recetas Producción / Sucursales): se agrega COSTO (o precio),
--   para cargarlo desde la plantilla y usarlo al nutrir recetas.
--   (Secciones de la Carta usa la misma tabla pero no carga costo ni unidad.)
-- - products (Maestro de Productos): se agregan CÓDIGO y COSTO.
-- ============================================================================

alter table public.recipe_masters
  add column if not exists cost numeric;

alter table public.products
  add column if not exists code text,
  add column if not exists cost numeric;

-- ============================================================================
-- Verificación (opcional):
-- ============================================================================
-- select column_name, data_type from information_schema.columns
--   where table_name = 'recipe_masters' and column_name = 'cost';
-- select column_name, data_type from information_schema.columns
--   where table_name = 'products' and column_name in ('code','cost');
