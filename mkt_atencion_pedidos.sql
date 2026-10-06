-- Atención al Cliente: columna "total de pedidos" (solo Pedidos Ya).
-- Ejecutar una vez en Supabase. Es idempotente.
alter table public.mkt_atencion_cliente
  add column if not exists pedidos integer not null default 0;
