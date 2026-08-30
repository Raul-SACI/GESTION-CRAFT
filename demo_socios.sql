-- ============================================================================
-- DEMO · Módulo "Dashboard de Socios": tablas + datos + habilitar en el rol
-- ----------------------------------------------------------------------------
-- Pegá TODO esto en el SQL Editor de DEMO USA y ejecutá. Después Ctrl+F5 en la
-- demo y elegí el mes AGOSTO 2026 en el dashboard.
-- ============================================================================

-- 1) Tablas que lee el Dashboard de Socios ------------------------------------
create table if not exists public.sales_tickets (
  id uuid primary key default gen_random_uuid(),
  branch_id text, date date, shift text, hour text, payment_method text,
  gross_sales numeric, net_sales numeric, orders numeric, covers numeric,
  iva numeric, week_number int, day_name text, comprobante text,
  created_at timestamptz default now());

create table if not exists public.cmv_monthly (
  id uuid primary key default gen_random_uuid(),
  branch_id text, month text, initial_existence numeric default 0,
  final_existence numeric default 0, cmv_amount numeric, net_sales numeric,
  created_at timestamptz default now());

create table if not exists public.cmv_details (
  id uuid primary key default gen_random_uuid(),
  branch_id text, month text, type text, amount numeric, period_end date,
  created_at timestamptz default now());

create table if not exists public.hour_logs (
  id uuid primary key default gen_random_uuid(),
  branch_id text, month text, hours_actual numeric, position text,
  position_id text, week_number int, created_at timestamptz default now());

create table if not exists public.hr_hour_logs (
  id uuid primary key default gen_random_uuid(),
  branch_id text, month text, hours_rrhh numeric, position_name text,
  position_id text, week_number int, created_at timestamptz default now());

create table if not exists public.pedidos_ya_ratings (
  id uuid primary key default gen_random_uuid(),
  branch_id text, month text, rating numeric, channel text,
  created_at timestamptz default now());

-- Permisos + RLS off (para la clave pública)
do $$
declare t text;
begin
  foreach t in array array['sales_tickets','cmv_monthly','cmv_details','hour_logs','hr_hour_logs','pedidos_ya_ratings']
  loop
    execute format('alter table public.%I disable row level security', t);
    execute format('grant all on public.%I to anon, authenticated', t);
  end loop;
end $$;

-- 2) DATOS: ventas diarias de Julio y Agosto 2026 (2 sucursales) --------------
insert into public.sales_tickets (branch_id, date, shift, payment_method, gross_sales, net_sales, orders, covers, week_number, comprobante)
select b.b, g.d::date, 'TARDE', 'EFECTIVO',
  round((400000 + random()*250000)::numeric),
  round((330000 + random()*200000)::numeric),
  round((80 + random()*70)::numeric),
  round((100 + random()*90)::numeric),
  extract(week from g.d)::int,
  'DEMO-' || b.b || '-' || to_char(g.d,'YYYYMMDD')
from (values ('demo-norte'), ('demo-centro')) as b(b),
     generate_series(date '2026-07-01', date '2026-08-30', interval '1 day') as g(d);

-- 3) CMV de Agosto 2026 (existencias + compras) -------------------------------
insert into public.cmv_monthly (branch_id, month, initial_existence, final_existence) values
  ('demo-norte',  '2026-08', 1500000, 1400000),
  ('demo-centro', '2026-08', 1200000, 1100000);

insert into public.cmv_details (branch_id, month, type, amount, period_end) values
  ('demo-norte',  '2026-08', 'purchase', 3200000, '2026-08-30'),
  ('demo-centro', '2026-08', 'purchase', 2600000, '2026-08-30');

-- 4) Horas Agosto 2026 (presupuesto aprobado + reales + RRHH) ------------------
insert into public.hour_budgets (branch_id, month, position_id, position_name, total_hours, status)
values ('demo-norte','2026-08','demo_encargado','ENCARGADO', 720, 'approved'),
       ('demo-centro','2026-08','demo_encargado','ENCARGADO', 700, 'approved');

insert into public.hour_logs (branch_id, month, hours_actual, position, position_id, week_number) values
  ('demo-norte','2026-08', 180, 'ENCARGADO','demo_encargado', 31),
  ('demo-norte','2026-08', 190, 'ENCARGADO','demo_encargado', 32),
  ('demo-centro','2026-08', 175, 'ENCARGADO','demo_encargado', 31);

insert into public.hr_hour_logs (branch_id, month, hours_rrhh, position_name, position_id, week_number) values
  ('demo-norte','2026-08', 185, 'ENCARGADO','demo_encargado', 31),
  ('demo-centro','2026-08', 178, 'ENCARGADO','demo_encargado', 31);

-- 5) Ratings Pedidos Ya Agosto 2026 -------------------------------------------
insert into public.pedidos_ya_ratings (branch_id, month, rating, channel) values
  ('demo-norte','2026-08', 4.7, 'resto'),
  ('demo-norte','2026-08', 4.5, 'cafe'),
  ('demo-centro','2026-08', 4.8, 'resto'),
  ('demo-centro','2026-08', 4.6, 'cafe');

-- 6) Habilitar el módulo en el rol Demo USA -----------------------------------
update public.roles_config
set allowed_modules = allowed_modules || '{"socios_dashboard":"edit"}'::jsonb
where id = 'demo_usa';
