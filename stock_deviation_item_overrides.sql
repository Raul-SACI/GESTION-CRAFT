-- Desvío de stock cargado A MANO por insumo (por sucursal y mes), para el cálculo del premio.
-- Cuando hay al menos un insumo cargado para una sucursal/mes, el premio de desvío se calcula
-- con estos valores: cada insumo cargado usa su % en las 4 semanas; los insumos NO cargados
-- cuentan como sin premio. id = "<branch_id>_<month>_<item_id>".
create table if not exists public.stock_deviation_item_overrides (
  id         text primary key,
  branch_id  text not null,
  month      text not null,          -- 'YYYY-MM'
  item_id    text not null,
  pct        numeric not null default 0,   -- desvío % de ese insumo
  note       text,
  updated_at timestamptz not null default now(),
  unique (branch_id, month, item_id)
);
create index if not exists sdio_branch_month on public.stock_deviation_item_overrides (branch_id, month);

-- RLS off + permisos (mismo criterio que el resto de las tablas del dashboard)
alter table public.stock_deviation_item_overrides disable row level security;
grant all on public.stock_deviation_item_overrides to anon, authenticated;
