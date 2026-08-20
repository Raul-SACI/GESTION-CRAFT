-- ============================================================================
-- Permitir controlar/consumir artículos del Maestro Recetas Producción
-- ----------------------------------------------------------------------------
-- inventory_logs.item_id y recipes.item_id tenían una clave foránea a
-- stock_items(id). Eso rechazaba cualquier id proveniente de recipe_masters
-- (Maestro Recetas Producción): por eso no se podían cargar en la Planilla
-- Semanal ni vincular como componente de una receta.
--
-- Quitamos esas claves foráneas para que item_id pueda referenciar tanto un
-- insumo (stock_items) como una receta de producción (recipe_masters).
-- Las tablas ya tienen RLS abierta, así que no hace falta nada más.
--
-- Idempotente: se puede correr varias veces sin error.
-- ============================================================================

DO $$
DECLARE
  fk_name text;
  tbl     text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['inventory_logs', 'recipes'] LOOP
    FOR fk_name IN
      SELECT tc.constraint_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
       AND tc.table_schema = kcu.table_schema
      WHERE tc.table_name = tbl
        AND tc.constraint_type = 'FOREIGN KEY'
        AND kcu.column_name = 'item_id'
    LOOP
      EXECUTE format('ALTER TABLE %I DROP CONSTRAINT %I', tbl, fk_name);
    END LOOP;
  END LOOP;
END $$;
