-- ============================================================================
-- DEMO · Dashboard de Encargados ('dashboard') + Control Stock ('stock')
-- Pegá TODO en el SQL Editor de DEMO USA y ejecutá. Ctrl+F5 en la demo.
-- (Módulos pesados: si alguno da pantalla blanca, F12 -> Console -> pasame el error.)
-- ============================================================================

-- 1) Tablas que leen estos módulos -------------------------------------------
create table if not exists public.products (
  id text primary key, name text, code text, category text, cost numeric);

create table if not exists public.stock_items (
  id text primary key, name text, unit text, cost numeric, code text, category text);

create table if not exists public.recipe_masters (
  id text primary key, tipo text, name text, unit text, code text, cost numeric);

create table if not exists public.recipes (
  id uuid primary key default gen_random_uuid(),
  product_id text, item_id text, quantity numeric);

create table if not exists public.product_rankings (
  id uuid primary key default gen_random_uuid(),
  branch_id text, month text, product_code text, product_name text,
  quantity numeric, week_number int);

create table if not exists public.product_ranking_aliases (
  id uuid primary key default gen_random_uuid(),
  alias_name text, product_id text, ignore boolean default false);

create table if not exists public.inventory_logs (
  id uuid primary key default gen_random_uuid(),
  branch_id text, item_id text, date date, week_number int, month text,
  field text, value numeric, touched_fields jsonb, created_at timestamptz default now());

create table if not exists public.monthly_controlled_items (
  id uuid primary key default gen_random_uuid(),
  branch_id text, month text, item_ids jsonb default '[]'::jsonb);

create table if not exists public.daily_wastage (
  id uuid primary key default gen_random_uuid(),
  branch_id text, month text, date date, reference_id text, quantity numeric, type text);

create table if not exists public.inventory_week_closures (
  id uuid primary key default gen_random_uuid(),
  branch_id text, month text, week_number int, item_id text);

create table if not exists public.stock_deviation_overrides (
  id text primary key default gen_random_uuid()::text,
  branch_id text, item_id text, week_number int, month text, value numeric, note text);

create table if not exists public.performance_adjustments (
  id text primary key default gen_random_uuid()::text,
  branch_id text, month text, role text, amount numeric, reason text, created_by text,
  created_at timestamptz default now());

create table if not exists public.performance_reports (
  id uuid primary key default gen_random_uuid(),
  branch_id text, month text, role text, black_flags jsonb default '[]'::jsonb,
  closed_at timestamptz, closed_by text);

create table if not exists public.performance_role_configs (
  id uuid primary key default gen_random_uuid(),
  branch_id text, role text, config jsonb default '{}'::jsonb);

create table if not exists public.evaluacion_duenos_responses (
  id uuid primary key default gen_random_uuid(),
  branch_id text, month text, date date, answers jsonb default '{}'::jsonb, scores jsonb default '{}'::jsonb);

-- Permisos + RLS off
do $$
declare t text;
begin
  foreach t in array array[
    'products','stock_items','recipe_masters','recipes','product_rankings','product_ranking_aliases',
    'inventory_logs','monthly_controlled_items','daily_wastage','inventory_week_closures',
    'stock_deviation_overrides','performance_adjustments','performance_reports',
    'performance_role_configs','evaluacion_duenos_responses'
  ]
  loop
    execute format('alter table public.%I disable row level security', t);
    execute format('grant all on public.%I to anon, authenticated', t);
  end loop;
end $$;

-- 2) DATOS base coherentes ----------------------------------------------------
insert into public.stock_items (id, name, unit, cost, code) values
  ('i1','HARINA','kg',500,'900001'),
  ('i2','QUESO','kg',3000,'900002'),
  ('i3','TOMATE','kg',800,'900003')
on conflict (id) do nothing;

insert into public.products (id, name, code, cost) values
  ('p1','PIZZA MUZZARELLA','PZ001',1560),
  ('p2','EMPANADA','EM001',180),
  ('p3','MILANESA NAPOLITANA','MI001',900)
on conflict (id) do nothing;

insert into public.recipes (product_id, item_id, quantity) values
  ('p1','i1',0.30), ('p1','i2',0.20),
  ('p2','i1',0.05), ('p2','i3',0.03),
  ('p3','i2',0.10), ('p3','i3',0.05)
on conflict do nothing;

-- Ranking de ventas del mes (Agosto 2026) para las 2 sucursales
insert into public.product_rankings (branch_id, month, product_code, product_name, quantity, week_number) values
  ('demo-norte','2026-08','PZ001','PIZZA MUZZARELLA', 320, 31),
  ('demo-norte','2026-08','EM001','EMPANADA',         540, 31),
  ('demo-norte','2026-08','MI001','MILANESA NAPOLITANA',210, 31),
  ('demo-centro','2026-08','PZ001','PIZZA MUZZARELLA', 280, 31),
  ('demo-centro','2026-08','EM001','EMPANADA',         500, 31);

-- Insumos controlados del mes por sucursal
insert into public.monthly_controlled_items (branch_id, month, item_ids) values
  ('demo-norte','2026-08', '["i1","i2","i3"]'::jsonb),
  ('demo-centro','2026-08', '["i1","i2","i3"]'::jsonb);

-- 3) Habilitar los dos módulos en el rol Demo USA -----------------------------
update public.roles_config
set allowed_modules = allowed_modules || '{"dashboard":"edit","stock":"edit"}'::jsonb
where id = 'demo_usa';
