-- ============================================================================
-- Reprogramación de tareas de Mantenimiento
-- ----------------------------------------------------------------------------
-- Guarda la fecha ORIGINAL de una tarea cuando se la reprograma a otro día
-- desde el calendario, para poder mostrar "reprogramada · de DD/MM".
-- Se ejecuta en el proyecto de Supabase de MANTENIMIENTO (supabaseMant).
-- Idempotente.
-- ============================================================================

ALTER TABLE tareas ADD COLUMN IF NOT EXISTS original_date date;
