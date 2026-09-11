-- Ranking de "Ventas por producto" de Pedidos Ya, separado por marca (Craft Resto / Craft Café).
-- El archivo de Pedidos Ya es consolidado (no trae la marca): se baja uno por marca
-- (seleccionando esos locales en el portal) y al importar se elige la marca.
-- Sin fechas: el período (año/mes/semana) lo elige el usuario al importar.
-- Reimportar el mismo período + marca reemplaza esos datos, no los duplica.
create table if not exists public.py_productos_periodo (
  anio      integer not null,
  mes       integer not null,
  semana    integer not null default 0,   -- 0 = mes completo; 1..4 = semana del negocio
  marca     text    not null default 'Craft',  -- 'Craft' (Resto) o 'Craft Café'
  producto  text    not null,
  unidades  numeric not null default 0,   -- unidades vendidas (columna "Total")
  importe   numeric not null default 0,   -- importe vendido (columna "Ventas")
  updated_at timestamptz not null default now(),
  primary key (anio, mes, semana, marca, producto)
);
create index if not exists py_productos_periodo_am on public.py_productos_periodo (anio, mes);

-- RLS off + permisos (mismo criterio que el resto de las tablas py_*)
alter table public.py_productos_periodo disable row level security;
grant all on public.py_productos_periodo to anon, authenticated;

-- ── MIGRACIÓN si la tabla YA existía sin la columna 'marca' ──────────────────
-- (correr solo si ya habías creado la tabla antes de esta versión)
alter table public.py_productos_periodo add column if not exists marca text not null default 'Craft';
alter table public.py_productos_periodo drop constraint if exists py_productos_periodo_pkey;
alter table public.py_productos_periodo add primary key (anio, mes, semana, marca, producto);
