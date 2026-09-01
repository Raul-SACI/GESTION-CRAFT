-- ============================================================================
-- INVENTARIO MENSUAL · permitir insumos de PRODUCCIÓN (recipe_masters)
-- ----------------------------------------------------------------------------
-- Correr una vez en el SQL Editor de Supabase (base principal). Idempotente.
--
-- Ahora el Inventario Mensual también lista los insumos del Maestro Recetas
-- Producción, cuyos ids son TEXTO (ej. rm_pro_1786...), no UUID. Para poder
-- guardarlos, monthly_inventory.item_id debe ser text y sin FK a stock_items.
-- (Si ya era text, estas sentencias no cambian nada.)
-- ============================================================================

do $$
declare fk record;
begin
  -- Quitar cualquier FK de monthly_inventory.item_id (suele apuntar a stock_items)
  for fk in
    select conname
    from pg_constraint
    where conrelid = 'public.monthly_inventory'::regclass
      and contype = 'f'
      and conkey = (
        select array_agg(attnum)
        from pg_attribute
        where attrelid = 'public.monthly_inventory'::regclass and attname = 'item_id'
      )
  loop
    execute format('alter table public.monthly_inventory drop constraint %I', fk.conname);
  end loop;
end $$;

alter table public.monthly_inventory
  alter column item_id type text using item_id::text;
