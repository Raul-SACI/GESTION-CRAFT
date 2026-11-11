-- Pedidos Ya · Performance comercial (Impresiones · Sesiones · CVR3 · Órdenes).
-- Informe mensual que envía Pedidos Ya, por sucursal y perfil (Resto / Café).
-- Correr una vez en Supabase. Idempotente.
create table if not exists public.py_performance (
  id           bigserial primary key,
  anio         integer not null,
  mes          integer not null,
  sucursal     text not null,
  marca        text not null default 'Resto',   -- 'Resto' | 'Café'
  impresiones  numeric default 0,
  sesiones     numeric default 0,
  ordenes      numeric default 0,
  cvr          numeric default 0,                -- CVR3 (%) tal cual la trae el informe
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);
create index if not exists py_performance_periodo_idx on public.py_performance (anio, mes);

alter table public.py_performance enable row level security;
drop policy if exists py_performance_all on public.py_performance;
create policy py_performance_all on public.py_performance for all to anon, authenticated using (true) with check (true);
grant all on public.py_performance to anon, authenticated;
grant usage, select on sequence public.py_performance_id_seq to anon, authenticated;

notify pgrst, 'reload schema';
