-- ============================================================================
-- Decomisos: permitir decomisar también elaborados (Recetas Producción/Sucursal)
-- ----------------------------------------------------------------------------
-- daily_wastage.reference_id guardaba ids de stock_items / products (UUID). Los
-- artículos de recipe_masters (Recetas Producción/Sucursal) tienen ids de TEXTO
-- (ej. "rm_pro_..."), así que si la columna es uuid el guardado falla (22P02).
-- Quitamos cualquier FK sobre reference_id y la pasamos a TEXT. Idempotente.
-- ============================================================================

DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT con.conname, cl.relname AS tabla
    FROM pg_constraint con
    JOIN pg_class cl ON cl.oid = con.conrelid
    WHERE con.contype = 'f'
      AND cl.relname = 'daily_wastage'
      AND EXISTS (
        SELECT 1 FROM unnest(con.conkey) k
        JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k
        WHERE a.attname = 'reference_id')
  LOOP
    EXECUTE format('ALTER TABLE %I DROP CONSTRAINT %I', c.tabla, c.conname);
  END LOOP;
END $$;

ALTER TABLE daily_wastage ALTER COLUMN reference_id TYPE text USING reference_id::text;
