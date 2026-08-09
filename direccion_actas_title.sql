-- ============================================================================
-- NOMBRE DEL ACTA (Actas de Dirección)
-- ============================================================================
-- Correr una sola vez en el SQL Editor de Supabase.
-- Es idempotente: se puede volver a correr sin romper nada.
--
-- Hasta ahora cada acta se identificaba solo por su fecha ("Reunión 12/08/2026").
-- Con este cambio se le puede poner un NOMBRE propio y editable (ej: "Reunión de
-- Compras"). Es opcional: si el acta no tiene nombre, se sigue mostrando como
-- "Reunión <fecha>", así las actas ya cargadas no cambian en nada.
-- ============================================================================

alter table public.direccion_actas
  add column if not exists title text;

-- ============================================================================
-- Verificación: tiene que devolver una fila.
-- ============================================================================
-- select column_name, data_type
--   from information_schema.columns
--  where table_name = 'direccion_actas' and column_name = 'title';
