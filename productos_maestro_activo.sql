-- ============================================================================
-- INHABILITAR EN EL MAESTRO DE PRODUCTOS
-- ============================================================================
-- Correr una sola vez en el SQL Editor de Supabase. Idempotente.
--
-- Completa el "ojito" de habilitar/inhabilitar en los 5 maestros: los otros
-- (Insumos, Recetas Producción, Recetas Sucursales, Secciones Carta) ya usan
-- is_active; esto lo agrega también al Maestro de Productos.
--
-- Un producto con is_active = false queda INHABILITADO: no se ofrece para
-- elegir, pero no se borra. Arranca en true para que todo lo ya cargado siga
-- disponible.
-- ============================================================================

alter table public.products
  add column if not exists is_active boolean not null default true;

-- ============================================================================
-- Verificación: tiene que devolver una fila.
-- ============================================================================
-- select column_name, data_type, column_default
--   from information_schema.columns
--  where table_name = 'products' and column_name = 'is_active';
