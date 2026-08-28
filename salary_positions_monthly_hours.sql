-- ============================================================================
-- MAESTRO DE SALARIOS · horas mensuales por puesto
-- ----------------------------------------------------------------------------
-- Correr una sola vez en el SQL Editor de Supabase. Idempotente.
--
-- Permite definir, por puesto MENSUAL, cuántas horas mensuales representa el
-- sueldo, para convertirlo a valor hora en el Presupuestador de Horas.
--   valor hora = sueldo mensual / monthly_hours   (si es NULL, se asume 240)
-- Ej.: Encargado de Delivery $640.000 con 130 h/mes -> $4.923/h.
-- ============================================================================

alter table public.salary_positions
  add column if not exists monthly_hours numeric;
