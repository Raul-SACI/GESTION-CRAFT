-- ============================================================================
-- ESQUEMA DEMO (curado a mano) — solo las tablas que necesitan los módulos demo
-- ----------------------------------------------------------------------------
-- Pegá TODO esto en el SQL Editor del proyecto DEMO USA y ejecutá.
-- No hace falta tocar producción. Después corré demo_seed.sql para los datos.
-- RLS desactivado en cada tabla para que la app (anon key) pueda leer/escribir,
-- igual que en producción.
-- ============================================================================

create extension if not exists "uuid-ossp";
create extension if not exists pgcrypto;

-- ── Núcleo / acceso ─────────────────────────────────────────────────────────
create table if not exists public.branches (
  id text primary key,
  name text not null,
  location text,
  is_active boolean default true,
  created_at timestamptz default now()
);

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  role text not null,
  branch_name text,
  branch_id text,
  branch_ids jsonb,
  password text,
  created_at timestamptz default now()
);

create table if not exists public.roles_config (
  id text primary key,
  name text not null,
  description text,
  is_read_only boolean default false,
  access_scope text default 'all_branches',
  allowed_modules jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

-- ── Maestro de Personal ─────────────────────────────────────────────────────
create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  legajo text,
  name text not null,
  branch_id text,
  position text,
  username text unique,
  password text default '',
  active boolean default true,
  sexo text, dni text, fecha_ingreso text, fecha_nacimiento text,
  talle_remera text, talle_pantalon text, telefono text, email text, domicilio text,
  created_at timestamptz default now()
);

-- ── Escala salarial (Presupuestador) ────────────────────────────────────────
create table if not exists public.salary_positions (
  id text primary key,
  name text,
  title text,
  area text,
  sector text,
  type text default 'hourly',
  base_value numeric default 0,
  base_hourly_rate numeric default 0,
  base_month text,
  prev_base_value numeric default 0,
  prev_base_month text,
  monthly_hours numeric,
  notes text,
  history jsonb default '[]'::jsonb,
  created_at timestamptz default now()
);

-- ── Presupuestos de horas (Presupuestador + Aprobación) ─────────────────────
create table if not exists public.hour_budgets (
  id uuid primary key default gen_random_uuid(),
  branch_id text,
  month text,
  position_id text,
  position_name text,
  week1 numeric default 0, week2 numeric default 0, week3 numeric default 0,
  week4 numeric default 0, week5 numeric default 0,
  total_hours numeric default 0,
  total_cost numeric default 0,
  hourly_rate numeric default 0,
  hours_per_day numeric default 0,
  shift text,
  status text default 'pending',
  staff_by_date jsonb default '{}'::jsonb,
  holidays_json jsonb default '[]'::jsonb,
  created_at timestamptz default now()
);

-- ── Supervisiones ───────────────────────────────────────────────────────────
create table if not exists public.supervision_checklists (
  id text primary key,
  name text,
  questions jsonb default '[]'::jsonb,
  active boolean default true,
  created_at timestamptz default now()
);

create table if not exists public.supervision_schedules (
  id uuid primary key default gen_random_uuid(),
  checklist_id text,
  branch_id text,
  frequency text,
  start_date date,
  created_at timestamptz default now()
);

create table if not exists public.supervision_responses (
  id uuid primary key default gen_random_uuid(),
  branch_id text,
  checklist_id text,
  date date default current_date,
  scores jsonb default '{}'::jsonb,
  annulled boolean default false,
  created_at timestamptz default now()
);

create table if not exists public.supervisor_agenda (
  id uuid primary key default gen_random_uuid(),
  supervisor_name text,
  date date,
  branch_id text,
  start_time text,
  end_time text,
  created_at timestamptz default now()
);

create table if not exists public.supervisor_tasks (
  id text primary key default gen_random_uuid()::text,
  supervisor_name text,
  date date,
  time text,
  task text,
  note text,
  done boolean default false,
  created_at timestamptz default now()
);

-- ── MANTENIMIENTO (en la misma base demo) ───────────────────────────────────
-- Los IDs son text con default para aceptar tanto los que genera la app como
-- los autogenerados.
create table if not exists public.configuracion (
  id text primary key,
  data jsonb default '[]'::jsonb
);

create table if not exists public.activos (
  id text primary key default gen_random_uuid()::text,
  name text not null,
  category text,
  branch text,
  location text,
  asset_brand text,
  asset_model text,
  created_at timestamptz default now()
);

create table if not exists public.mantenimientos (
  id text primary key default gen_random_uuid()::text,
  asset_id text,
  branch text,
  maint_type text,
  description text,
  next_date date,
  interval_days numeric default 30,
  done boolean default false,
  created_at timestamptz default now()
);

create table if not exists public.tareas (
  id text primary key default gen_random_uuid()::text,
  task_type text,
  asset_id text,
  branch text,
  description text,
  priority text default 'normal',
  scheduled_date date,
  status text default 'pendiente',
  created_by text,
  responsible text,
  external_entity text,
  supervisor text,
  source_plan_id text,
  source_date text,
  original_date date,
  created_at timestamptz default now()
);

create table if not exists public.tareas_descartadas (
  id text primary key default gen_random_uuid()::text,
  source_plan_id text,
  source_date text,
  created_at timestamptz default now()
);

create table if not exists public.reparaciones (
  id text primary key default gen_random_uuid()::text,
  asset_id text,
  total_cost numeric default 0,
  date date,
  description text,
  created_at timestamptz default now()
);

-- ── Desactivar RLS en todas (acceso abierto, como en producción) ────────────
do $$
declare t text;
begin
  foreach t in array array[
    'branches','profiles','roles_config','employees','salary_positions','hour_budgets',
    'supervision_checklists','supervision_schedules','supervision_responses',
    'supervisor_agenda','supervisor_tasks',
    'configuracion','activos','mantenimientos','tareas','tareas_descartadas','reparaciones'
  ]
  loop
    execute format('alter table public.%I disable row level security', t);
  end loop;
end $$;
