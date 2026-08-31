-- ============================================================================
-- DATOS FICTICIOS PARA LA DEMO  (correr DESPUÉS de recrear el esquema)
-- ----------------------------------------------------------------------------
-- Pegá esto en el SQL Editor del proyecto DEMO y ejecutá.
-- Está dividido en secciones: si alguna te da error por una columna, saltala
-- y avisame el error para ajustarla (las bases pueden tener variantes).
-- Todo es inventado; no hay ningún dato real de la empresa.
-- ============================================================================

-- 1) ROL DEMO (solo los módulos que van a probar) -----------------------------
INSERT INTO public.roles_config (id, name, description, is_read_only, access_scope, allowed_modules)
VALUES (
  'demo_usa', 'Demo USA', 'Rol de prueba para invitados', false, 'all_branches',
  '{
    "presupuesto_horas":"edit",
    "aprobacion_presupuestos":"edit",
    "gestion_sueldos":"edit",
    "control_agendas":"edit",
    "registro_supervision":"edit",
    "supervisiones_operativas":"edit",
    "supervision_banderas":"edit",
    "mant_panel":"edit",
    "mant_inventario":"edit",
    "mant_tareas":"edit",
    "mant_preventivo":"edit",
    "mant_valorizacion":"edit",
    "mant_costos":"edit",
    "mant_config":"edit"
  }'::jsonb
)
ON CONFLICT (id) DO UPDATE SET allowed_modules = EXCLUDED.allowed_modules, name = EXCLUDED.name;

-- 2) USUARIOS DE LOGIN DEMO (aparecen en la pantalla de ingreso) ---------------
--    Ingresan eligiendo el usuario + esta clave.
INSERT INTO public.profiles (name, role, branch_name, password)
VALUES
  ('DEMO USA 1', 'demo_usa', 'TODAS LAS SUCURSALES', '1234'),
  ('DEMO USA 2', 'demo_usa', 'TODAS LAS SUCURSALES', '1234');

-- 3) SUCURSALES FICTICIAS ------------------------------------------------------
INSERT INTO public.branches (id, name, location, is_active) VALUES
  ('demo-norte',  'DEMO NORTE',  'Miami, FL',        true),
  ('demo-centro', 'DEMO CENTRO', 'Miami Beach, FL',  true)
ON CONFLICT (id) DO NOTHING;

-- 4) ESCALA SALARIAL (puestos con sueldos de ejemplo) --------------------------
--    'monthly' con horas mensuales para el valor hora del presupuestador.
INSERT INTO public.salary_positions (id, title, name, area, sector, type, base_value, base_hourly_rate, base_month, monthly_hours)
VALUES
  ('demo_encargado',  'ENCARGADO',            'ENCARGADO',            'SUCURSAL', 'SUCURSAL', 'monthly', 900000, 900000, '2026-01', 200),
  ('demo_delivery',   'ENCARGADO DE DELIVERY','ENCARGADO DE DELIVERY','SUCURSAL', 'SUCURSAL', 'monthly', 640000, 640000, '2026-01', 130),
  ('demo_cocinero',   'COCINERO',             'COCINERO',             'SUCURSAL', 'SUCURSAL', 'monthly', 720000, 720000, '2026-01', 200),
  ('demo_cajero',     'CAJERO',               'CAJERO',               'SUCURSAL', 'SUCURSAL', 'monthly', 600000, 600000, '2026-01', 200)
ON CONFLICT (id) DO NOTHING;

-- 5) EMPLEADOS FICTICIOS (Maestro de Personal) --------------------------------
INSERT INTO public.employees (legajo, name, branch_id, position, username, password, active)
VALUES
  ('D001', 'JOHN DEMO',   'demo-norte',  'ENCARGADO', 'john.demo',   '', true),
  ('D002', 'JANE DEMO',   'demo-norte',  'CAJERO',    'jane.demo',   '', true),
  ('D003', 'MIKE DEMO',   'demo-centro', 'COCINERO',  'mike.demo',   '', true),
  ('D004', 'SARAH DEMO',  'demo-centro', 'ENCARGADO DE DELIVERY', 'sarah.demo', '', true)
ON CONFLICT DO NOTHING;

-- 6) UN PRESUPUESTO DE HORAS CARGADO Y APROBADO (para Aprobación) --------------
--    Mes de ejemplo: 2026-09. Ajustá el mes si querés verlo en otro.
INSERT INTO public.hour_budgets
  (branch_id, month, position_id, position_name, week1, week2, week3, week4, week5,
   total_hours, total_cost, hourly_rate, hours_per_day, shift, status, staff_by_date, holidays_json)
VALUES
  ('demo-norte','2026-09','demo_encargado','ENCARGADO', 45,45,45,45,0, 180, 810000, 4500, 7.5, 'TARDE', 'approved', '{}'::jsonb, '[]'::jsonb),
  ('demo-norte','2026-09','demo_cocinero', 'COCINERO',  45,45,45,45,0, 180, 648000, 3600, 7.5, 'TARDE', 'approved', '{}'::jsonb, '[]'::jsonb),
  ('demo-centro','2026-09','demo_encargado','ENCARGADO',45,45,45,45,0, 180, 810000, 4500, 7.5, 'TARDE', 'pending',  '{}'::jsonb, '[]'::jsonb)
ON CONFLICT DO NOTHING;

-- 7) MANTENIMIENTO: config de sucursales/categorías/ubicaciones ----------------
--    (Mantenimiento maneja las sucursales por NOMBRE en la tabla configuracion)
-- OJO: 'categories' es un OBJETO agrupado {grupo: [cat...]}, no una lista plana
-- (Inventario recorre Object.values(...).forEach(arr => arr.forEach(...))).
INSERT INTO public.configuracion (id, data) VALUES
  ('branches',   '["DEMO NORTE","DEMO CENTRO"]'::jsonb),
  ('categories', '{"General": ["Cocina","Frío","Salón","Instalaciones"]}'::jsonb),
  ('locations',  '["Cocina","Depósito","Salón","Baños"]'::jsonb)
ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data;

-- 8) MANTENIMIENTO: activos y tareas de ejemplo --------------------------------
INSERT INTO public.activos (name, category, branch, location) VALUES
  ('Heladera Exhibidora', 'Frío',   'DEMO NORTE', 'Cocina'),
  ('Horno Pizzero',       'Cocina', 'DEMO NORTE', 'Cocina'),
  ('Aire Acondicionado',  'Instalaciones', 'DEMO CENTRO', 'Salón');

INSERT INTO public.tareas
  (task_type, asset_id, branch, description, priority, scheduled_date, status, created_by, responsible, external_entity, supervisor)
VALUES
  ('especifico', NULL, 'DEMO NORTE',  'Revisar burletes de la heladera', 'normal', CURRENT_DATE, 'pendiente', 'Demo', 'interno', '', ''),
  ('general',    NULL, 'DEMO CENTRO', 'Limpieza de filtros del aire',    'normal', CURRENT_DATE, 'pendiente', 'Demo', 'interno', '', '');

-- ============================================================================
-- Listo. Con esto la demo arranca con contenido. El resto (más empleados,
-- más presupuestos, supervisiones, etc.) se puede cargar desde la propia app.
-- ============================================================================
