-- ============================================================================
-- DETALLE DE VENTA TEÓRICA DE UN INSUMO (ej. PAPAS FRITAS BOLSA)
-- ----------------------------------------------------------------------------
-- Muestra, para una sucursal / mes / semana, qué productos del Ranking de
-- Artículos vendidos están sumando venta teórica de ese insumo y cuánto aporta
-- cada uno. El total de la última columna es el número que ves en Control de Stock.
--
-- Reglas de semana (igual que la app):
--   Semana 1 = días 1-7   |  Semana 2 = 8-14  |  Semana 3 = 15-21  |  Semana 4 = 22+
--
-- 1) Primero corré esta línea para ver los IDs de tus sucursales:
--        SELECT id, name FROM branches ORDER BY name;
-- 2) Completá los 4 valores del bloque "params" de abajo y ejecutá.
-- ============================================================================

WITH params AS (
  SELECT
    '00000000-0000-0000-0000-000000000000'::uuid AS branch_id,   -- <<< ID de la sucursal
    '2026-07'                                     AS month,        -- <<< Mes AAAA-MM
    1                                             AS week_number,  -- <<< Semana (1..4)
    'PAPAS FRITAS BOLSA'                          AS insumo_name   -- <<< Nombre del insumo
),
insumo AS (
  SELECT id, name
  FROM stock_items, params p
  WHERE regexp_replace(upper(trim(name)), '\s+', ' ', 'g') = regexp_replace(upper(trim(p.insumo_name)), '\s+', ' ', 'g')
  LIMIT 1
),
norm_prod AS (
  SELECT id, name, regexp_replace(upper(trim(name)), '\s+', ' ', 'g') AS nname
  FROM products
),
ranking AS (
  SELECT pr.product_name, pr.quantity,
         regexp_replace(upper(trim(pr.product_name)), '\s+', ' ', 'g') AS nname
  FROM product_rankings pr, params p
  WHERE pr.branch_id   = p.branch_id
    AND pr.month       = p.month
    AND pr.week_number = p.week_number
)
SELECT
  r.product_name                                    AS producto_vendido,
  r.quantity                                        AS unidades_vendidas,
  rc.quantity                                       AS insumo_por_unidad,
  ROUND((r.quantity * rc.quantity)::numeric, 3)     AS aporte_venta_teorica
FROM ranking r
JOIN norm_prod np ON np.nname = r.nname
JOIN recipes  rc  ON rc.product_id = np.id
JOIN insumo   i   ON i.id = rc.item_id
WHERE r.quantity <> 0 AND rc.quantity <> 0
ORDER BY aporte_venta_teorica DESC;

-- ----------------------------------------------------------------------------
-- TOTAL (debe coincidir con la columna VENTA TEÓRICA de Control de Stock)
-- ----------------------------------------------------------------------------
WITH params AS (
  SELECT
    '00000000-0000-0000-0000-000000000000'::uuid AS branch_id,
    '2026-07'                                     AS month,
    1                                             AS week_number,
    'PAPAS FRITAS BOLSA'                          AS insumo_name
),
insumo AS (
  SELECT id FROM stock_items, params p
  WHERE regexp_replace(upper(trim(name)), '\s+', ' ', 'g') = regexp_replace(upper(trim(p.insumo_name)), '\s+', ' ', 'g')
  LIMIT 1
),
norm_prod AS (
  SELECT id, regexp_replace(upper(trim(name)), '\s+', ' ', 'g') AS nname FROM products
),
ranking AS (
  SELECT pr.quantity, regexp_replace(upper(trim(pr.product_name)), '\s+', ' ', 'g') AS nname
  FROM product_rankings pr, params p
  WHERE pr.branch_id = p.branch_id AND pr.month = p.month AND pr.week_number = p.week_number
)
SELECT ROUND(SUM(r.quantity * rc.quantity)::numeric, 3) AS venta_teorica_total
FROM ranking r
JOIN norm_prod np ON np.nname = r.nname
JOIN recipes  rc  ON rc.product_id = np.id
JOIN insumo   i   ON i.id = rc.item_id;

-- ============================================================================
-- SI EL TOTAL NO COINCIDE, revisá productos vendidos SIN receta cargada
-- (esos NO suman venta teórica de ningún insumo):
-- ----------------------------------------------------------------------------
--   WITH params AS (SELECT '<BRANCH_ID>'::uuid AS branch_id, '2026-07' AS month, 1 AS week_number)
--   SELECT pr.product_name, pr.quantity
--   FROM product_rankings pr, params p
--   WHERE pr.branch_id = p.branch_id AND pr.month = p.month AND pr.week_number = p.week_number
--     AND regexp_replace(upper(trim(pr.product_name)),'\s+',' ','g') NOT IN (
--       SELECT regexp_replace(upper(trim(name)),'\s+',' ','g') FROM products
--       WHERE id IN (SELECT DISTINCT product_id FROM recipes))
--   ORDER BY pr.quantity DESC;
-- ============================================================================
