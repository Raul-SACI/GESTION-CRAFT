-- ============================================================================
-- EXPORTAR EL ESQUEMA (molde de tablas) DESDE PRODUCCIÓN — 100% navegador
-- ----------------------------------------------------------------------------
-- Cómo usarlo (NO copia ningún dato, solo la estructura):
--
-- 1) Abrí el SQL Editor de tu proyecto de PRODUCCIÓN (el principal).
-- 2) Pegá y ejecutá TODO este archivo.
-- 3) El resultado es UNA celda de texto larga con todos los "CREATE TABLE".
--    Click en la celda -> copiar todo.
-- 4) Abrí el SQL Editor del proyecto DEMO, pegá ese texto y ejecutá.
-- 5) Repetí los pasos 1-4 en tu proyecto de PRODUCCIÓN de MANTENIMIENTO
--    (y pegá su resultado también en el MISMO proyecto demo).
--
-- Genera columnas (con tipos y defaults exactos) + claves primarias y únicas.
-- No genera claves foráneas (no hacen falta para la demo y evitan errores de
-- orden). Si al pegar en la demo algún CREATE ya existe, no pasa nada: usa
-- IF NOT EXISTS.
-- ============================================================================

SELECT string_agg(ddl, E'\n\n' ORDER BY tabla) AS pegar_esto_en_la_demo
FROM (
  SELECT
    c.relname AS tabla,
    'CREATE TABLE IF NOT EXISTS public.' || quote_ident(c.relname) || E' (\n' ||
    string_agg(
      '  ' || quote_ident(a.attname) || ' ' || format_type(a.atttypid, a.atttypmod) ||
      CASE WHEN a.attnotnull THEN ' NOT NULL' ELSE '' END ||
      COALESCE(' DEFAULT ' || pg_get_expr(ad.adbin, ad.adrelid), ''),
      E',\n' ORDER BY a.attnum
    ) ||
    COALESCE((
      SELECT E',\n' || string_agg(
        '  CONSTRAINT ' || quote_ident(con.conname) || ' ' || pg_get_constraintdef(con.oid),
        E',\n')
      FROM pg_constraint con
      WHERE con.conrelid = c.oid AND con.contype IN ('p','u')
    ), '') ||
    E'\n);' AS ddl
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
  LEFT JOIN pg_attrdef ad ON ad.adrelid = c.oid AND ad.adnum = a.attnum
  WHERE n.nspname = 'public' AND c.relkind = 'r'
  GROUP BY c.oid, c.relname
) x;
