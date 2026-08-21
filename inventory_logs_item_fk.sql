-- ============================================================================
-- Permitir controlar/consumir artículos del Maestro Recetas Producción
-- ----------------------------------------------------------------------------
-- Los ids del Maestro de Insumos (stock_items) son UUID, pero los del Maestro
-- Recetas Producción (recipe_masters) son TEXTO (ej. "rm_pro_178656082476059w8").
-- Como inventory_logs.item_id y recipes.item_id eran de tipo uuid CON clave
-- foránea a stock_items, guardar un artículo de Producción fallaba con:
--   23503 (violación de FK)  y/o  22P02 (invalid input syntax for type uuid).
--
-- Solución: quitar la FK y cambiar item_id a TEXT, así puede referenciar tanto
-- un insumo (uuid de stock_items) como una receta de producción (id de texto).
-- Idempotente: se puede correr varias veces sin error.
-- ============================================================================

-- 1) Quitar cualquier clave foránea que quede sobre item_id en esas tablas.
DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT con.conname, cl.relname AS tabla
    FROM pg_constraint con
    JOIN pg_class cl ON cl.oid = con.conrelid
    WHERE con.contype = 'f'
      AND cl.relname IN ('inventory_logs','recipes')
      AND EXISTS (
        SELECT 1 FROM unnest(con.conkey) k
        JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k
        WHERE a.attname = 'item_id')
  LOOP
    EXECUTE format('ALTER TABLE %I DROP CONSTRAINT %I', c.tabla, c.conname);
  END LOOP;
END $$;

-- 2) Cambiar item_id de uuid a text (los uuid existentes quedan como su texto).
ALTER TABLE inventory_logs ALTER COLUMN item_id TYPE text USING item_id::text;
ALTER TABLE recipes        ALTER COLUMN item_id TYPE text USING item_id::text;
