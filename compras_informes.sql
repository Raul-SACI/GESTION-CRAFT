-- ============================================================================
-- COMPRAS & STOCK · Informes de Compras
-- ----------------------------------------------------------------------------
-- Correr una sola vez en el SQL Editor de Supabase. Idempotente.
--
-- Guarda las importaciones de los dos reportes que arroja TANGO:
--   1) Ranking por artículo    -> compras_articulos_import
--   2) Ranking de proveedores  -> compras_proveedores_import
-- y las cotizaciones que carga el departamento de Compras para el top de
-- artículos por gasto:
--   3) Cotizaciones mensuales  -> compras_cotizaciones
--
-- El período se identifica con un texto 'YYYY-MM' (el archivo de Tango no trae
-- el mes adentro, así que se elige al importar).
-- Los códigos coinciden con stock_items.code (el Maestro de Insumos se armó con
-- los mismos códigos de Tango), por eso la reconciliación es automática.
-- ============================================================================

-- 1) Ranking por artículo (una fila por período + código) ---------------------
CREATE TABLE IF NOT EXISTS compras_articulos_import (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period             text NOT NULL,               -- 'YYYY-MM'
  code               text NOT NULL,               -- Cód. Artículo (= stock_items.code)
  description        text,
  cantidad           numeric,
  total              numeric,                      -- gasto del período (neto de Tango)
  pct_participacion  numeric,
  pct_acumulado      numeric,
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (period, code)
);
CREATE INDEX IF NOT EXISTS idx_compras_art_period ON compras_articulos_import (period);

-- 2) Ranking de proveedores (una fila por período + razón social) -------------
CREATE TABLE IF NOT EXISTS compras_proveedores_import (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period             text NOT NULL,               -- 'YYYY-MM'
  razon_social       text NOT NULL,
  total_neto         numeric,
  total              numeric,
  pct_participacion  numeric,
  pct_acumulado      numeric,
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (period, razon_social)
);
CREATE INDEX IF NOT EXISTS idx_compras_prov_period ON compras_proveedores_import (period);

-- 3) Cotizaciones del top de artículos (una fila por período + código) --------
--    precio_actual = lo que realmente se pagó (total/cantidad del ranking) y se
--    recalcula al importar; quotes guarda las cotizaciones de la competencia:
--    [{ "proveedor": "X", "precio": 1234 }, ...]
CREATE TABLE IF NOT EXISTS compras_cotizaciones (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period         text NOT NULL,
  code           text NOT NULL,
  description    text,
  precio_actual  numeric,                          -- auto = total/cantidad de Tango
  quotes         jsonb NOT NULL DEFAULT '[]'::jsonb,
  revisado_por   text,
  updated_at     timestamptz NOT NULL DEFAULT now(),
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (period, code)
);
CREATE INDEX IF NOT EXISTS idx_compras_cotiz_period ON compras_cotizaciones (period);

-- RLS permisivo (igual que el resto de las tablas del frontend) ----------------
ALTER TABLE compras_articulos_import   ENABLE ROW LEVEL SECURITY;
ALTER TABLE compras_proveedores_import ENABLE ROW LEVEL SECURITY;
ALTER TABLE compras_cotizaciones       ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "compras_art_all"   ON compras_articulos_import;
DROP POLICY IF EXISTS "compras_prov_all"  ON compras_proveedores_import;
DROP POLICY IF EXISTS "compras_cotiz_all" ON compras_cotizaciones;

CREATE POLICY "compras_art_all"   ON compras_articulos_import   FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "compras_prov_all"  ON compras_proveedores_import FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "compras_cotiz_all" ON compras_cotizaciones       FOR ALL USING (true) WITH CHECK (true);
