-- ============================================================================
-- inventory_logs.item_id: permitir insumos del Maestro de Insumos (stock_items)
-- Y artículos del Maestro Recetas Producción (recipe_masters).
-- ----------------------------------------------------------------------------
-- Originalmente inventory_logs.item_id tenía una clave foránea a stock_items,
-- por lo que al controlar un artículo de "Recetas Producción" en los desvíos,
-- el guardado fallaba (violación de FK) y el campo no se podía cargar.
--
-- Como item_id ahora puede referenciar a dos maestros distintos, quitamos la
-- clave foránea (queda como UUID libre). El resto de la lógica no cambia.
-- Idempotente: se puede correr varias veces sin error.
-- ============================================================================

DO $$
DECLARE
  fk_name text;
BEGIN
  FOR fk_name IN
    SELECT tc.constraint_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
     AND tc.table_schema = kcu.table_schema
    WHERE tc.table_name = 'inventory_logs'
      AND tc.constraint_type = 'FOREIGN KEY'
      AND kcu.column_name = 'item_id'
  LOOP
    EXECUTE format('ALTER TABLE inventory_logs DROP CONSTRAINT %I', fk_name);
  END LOOP;
END $$;
