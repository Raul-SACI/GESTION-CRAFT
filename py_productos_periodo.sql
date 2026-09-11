-- Ranking de "Ventas por producto" de Pedidos Ya (consolidado, todos los locales).
-- Se importa desde Pedidos Ya → Informes → RANKING. Sin fechas: el período (año/mes/semana)
-- lo elige el usuario al importar. Reimportar el mismo período reemplaza los datos, no duplica.
create table if not exists public.py_productos_periodo (
  anio      integer not null,
  mes       integer not null,
  semana    integer not null default 0,   -- 0 = mes completo; 1..4 = semana del negocio
  producto  text    not null,
  unidades  numeric not null default 0,   -- unidades vendidas (columna "Total")
  importe   numeric not null default 0,   -- importe vendido (columna "Ventas")
  updated_at timestamptz not null default now(),
  primary key (anio, mes, semana, producto)
);
create index if not exists py_productos_periodo_am on public.py_productos_periodo (anio, mes);

-- RLS off + permisos (mismo criterio que el resto de las tablas py_*)
alter table public.py_productos_periodo disable row level security;
grant all on public.py_productos_periodo to anon, authenticated;
