-- ============================================================================
-- INHABILITAR ARTÍCULOS EN LOS MAESTROS (Pedidos Internos)
-- ============================================================================
-- Correr una sola vez en el SQL Editor de Supabase.
-- Es idempotente: se puede volver a correr sin romper nada.
--
-- Agrega una bandera "is_active" a los dos maestros que se ofrecen al armar un
-- Pedido Interno:
--
--   stock_items       -> Maestro de Insumos (se ofrece en "Pedido de Compras")
--   recipe_masters    -> Maestro Recetas Producción (se ofrece en "Pedido a Producción")
--
-- Un artículo con is_active = false queda INHABILITADO: no se le ofrece al
-- encargado para elegirlo en el pedido, pero NO se borra (sigue en el maestro,
-- en el historial y en las recetas, y se puede volver a habilitar cuando haga
-- falta). Arranca en true para que todo lo ya cargado siga disponible igual.
-- ============================================================================

alter table public.stock_items
  add column if not exists is_active boolean not null default true;

alter table public.recipe_masters
  add column if not exists is_active boolean not null default true;

-- ============================================================================
-- Verificación: las dos consultas tienen que devolver una fila cada una.
-- ============================================================================
-- select column_name, data_type, column_default
--   from information_schema.columns
--  where table_name = 'stock_items' and column_name = 'is_active';
--
-- select column_name, data_type, column_default
--   from information_schema.columns
--  where table_name = 'recipe_masters' and column_name = 'is_active';
