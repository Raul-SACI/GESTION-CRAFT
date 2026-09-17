-- Configuración del módulo Marketing & Comercial · Informes.
-- Guarda, entre otras cosas, qué categorías del ranking (Rubro de la Carta) cuentan como
-- "Agregados" y cuáles como "Postres". key='informes_categorias', value = { agregados:[], postres:[] }.
create table if not exists public.mkt_config (
  key        text primary key,
  value      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.mkt_config disable row level security;
grant all on public.mkt_config to anon, authenticated;
