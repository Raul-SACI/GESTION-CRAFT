-- ============================================================================
-- LISTA DE PRECIOS · vínculo con el Maestro de Platos (products)
-- ----------------------------------------------------------------------------
-- Correr una sola vez en el SQL Editor de Supabase. Idempotente.
--
-- Cada ítem de la Lista de Precios (menu_items) queda vinculado a un plato del
-- Maestro de Platos (products) para traer su costo de receta y mostrar el
-- margen. NO se toca ningún precio ni el historial (menu_price_history).
--   product_id -> products.id  (NULL = todavía sin vincular)
-- La reconciliación inicial (por código y por nombre) la hace la app al cargar
-- el módulo; los que no matchean quedan en el panel "Platos sin vincular".
-- ============================================================================

alter table public.menu_items
  add column if not exists product_id uuid references public.products(id) on delete set null;

create index if not exists idx_menu_items_product_id on public.menu_items (product_id);
