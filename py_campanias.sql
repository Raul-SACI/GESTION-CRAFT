-- Campañas del Mes de Pedidos Ya (carga manual de promociones por marca).
-- Cada fila es un producto en promoción, con su precio normal y con descuento,
-- las fechas de vigencia y la marca (Craft Resto / Craft Café).
create table if not exists public.py_campanias (
  id          bigint generated always as identity primary key,
  marca       text not null default 'Craft',   -- 'Craft' (Resto) | 'Craft Café'
  campania    text,                              -- nombre de la campaña
  detalle     text,                              -- aclaraciones / observación
  producto    text not null,
  precio      numeric not null default 0,        -- precio normal
  precio_desc numeric not null default 0,        -- precio con descuento
  desde       date,
  hasta       date,
  created_at  timestamptz not null default now()
);

alter table public.py_campanias disable row level security;
grant all on public.py_campanias to anon, authenticated;
