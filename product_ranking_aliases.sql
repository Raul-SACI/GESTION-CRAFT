-- ============================================================================
-- ALIAS DE VENTAS  (product_ranking_aliases)
-- ----------------------------------------------------------------------------
-- Resuelve el caso en que el nombre del producto en el RANKING de ventas (POS)
-- no coincide exacto con el nombre en el MAESTRO de productos, y por eso su
-- consumo teórico de insumos no se estaba sumando en Control de Stock.
--
--   alias_name = nombre tal cual aparece en product_rankings.product_name
--   product_id = producto del maestro (products.id) al que corresponde
--   ignore     = TRUE si esa venta NO consume ningún insumo controlado
--                (ej. bebidas): así deja de aparecer en la alerta.
--
-- La app (Control de Stock) lee esta tabla al calcular las ventas teóricas.
-- También se puede administrar desde el panel "ventas sin vincular" dentro de
-- Control de Stock (solo administrador / dueño).
-- ============================================================================

CREATE TABLE IF NOT EXISTS product_ranking_aliases (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alias_name  text NOT NULL UNIQUE,
  product_id  uuid REFERENCES products(id) ON DELETE CASCADE,
  ignore      boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- (Opcional) permitir acceso desde el frontend con la anon key, como el resto de tablas
ALTER TABLE product_ranking_aliases ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "aliases_all" ON product_ranking_aliases;
CREATE POLICY "aliases_all" ON product_ranking_aliases FOR ALL USING (true) WITH CHECK (true);

-- ----------------------------------------------------------------------------
-- Caso concreto: los dos nombres del POS que corresponden al mismo sándwich
-- "SANDWICH CHICKEN & CHEESE BLT" (id 493ec54e-83b9-48c7-b869-90383581a4a9).
-- (La variante "...BLT ME" es otro producto y NO se toca.)
-- ----------------------------------------------------------------------------
INSERT INTO product_ranking_aliases (alias_name, product_id) VALUES
  ('SANDWICH CHICKEN & CHEESE', '493ec54e-83b9-48c7-b869-90383581a4a9'),
  ('CHICKEN & CHEESE BLT',      '493ec54e-83b9-48c7-b869-90383581a4a9')
ON CONFLICT (alias_name) DO UPDATE
  SET product_id = EXCLUDED.product_id, ignore = false;
