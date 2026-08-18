-- ============================================================================
-- Columnas "sombra" del valor cargado por el ENCARGADO en Control de Stock.
-- ----------------------------------------------------------------------------
-- Control de Stock (encargado) y Control de Desvíos (admin) escriben la MISMA
-- columna principal (ei, compras, ef, ...). El valor que manda para cálculos y
-- premios es el de Administración (la columna principal, como hasta ahora).
--
-- Estas columnas *_enc guardan además el valor que cargó el encargado en Control
-- de Stock, para poder mostrar "encargado vs admin vs diferencia" sin cambiar qué
-- valor se usa en los cálculos. Solo las escribe Control de Stock.
-- ============================================================================

ALTER TABLE inventory_logs ADD COLUMN IF NOT EXISTS ei_enc                  numeric;
ALTER TABLE inventory_logs ADD COLUMN IF NOT EXISTS ef_enc                  numeric;
ALTER TABLE inventory_logs ADD COLUMN IF NOT EXISTS compras_enc             numeric;
ALTER TABLE inventory_logs ADD COLUMN IF NOT EXISTS prestamos_recibidos_enc numeric;
ALTER TABLE inventory_logs ADD COLUMN IF NOT EXISTS prestamos_enviados_enc  numeric;
ALTER TABLE inventory_logs ADD COLUMN IF NOT EXISTS consumo_personal_enc    numeric;
