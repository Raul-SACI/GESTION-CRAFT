-- ============================================================================
-- Rol por sucursal para los premios de líderes.
-- ----------------------------------------------------------------------------
-- Permite que un mismo líder cobre variable sobre roles distintos según la
-- sucursal (ej. Jefes de Cocina en unas sucursales y Encargado en el Almacén).
-- Si una sucursal no está en branch_roles, usa el rol por defecto (source_role).
--   branch_roles = { "<branch_id>": "jefe_cocina" | "encargado" | "segundo_cocina" | "all" }
-- ============================================================================

ALTER TABLE performance_leader_configs ADD COLUMN IF NOT EXISTS branch_roles jsonb NOT NULL DEFAULT '{}'::jsonb;
