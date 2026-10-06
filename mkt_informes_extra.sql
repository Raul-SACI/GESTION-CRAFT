-- Informes extra de Marketing (Marketing · Informes):
--   1) Atención al Cliente  2) Presupuesto e Inversión  3) Campañas Meta Ads

-- 1) ATENCIÓN AL CLIENTE (por semana, sucursal y fuente: google / pedidosya / instagram)
create table if not exists public.mkt_atencion_cliente (
  id              uuid primary key default gen_random_uuid(),
  anio            integer not null,
  mes             integer not null,
  semana          integer not null,
  fuente          text not null,          -- 'google' | 'pedidosya' / 'pedidosya_resto' / 'pedidosya_cafe' | 'instagram'
  branch_id       text not null,
  pedidos         integer not null default 0,   -- total de pedidos (solo Pedidos Ya)
  cantidad        integer not null default 0,   -- cantidad de reseñas
  estrellas_altas integer not null default 0,   -- 5-3 estrellas
  estrellas_bajas integer not null default 0,   -- 2-1 estrellas
  comentarios     text,
  created_at      timestamptz not null default now(),
  unique (anio, mes, semana, fuente, branch_id)
);

-- 2) PRESUPUESTO E INVERSIÓN (mensual)
create table if not exists public.mkt_inversion_plan (
  id         uuid primary key,
  anio       integer not null,
  mes        integer not null,
  rubro      text,
  detalle    text,
  importe    numeric not null default 0,
  created_at timestamptz not null default now()
);
-- Tope de presupuesto por mes (funciona como límite del total del mes)
create table if not exists public.mkt_inversion_mes (
  anio       integer not null,
  mes        integer not null,
  tope       numeric not null default 0,
  updated_at timestamptz not null default now(),
  primary key (anio, mes)
);
create table if not exists public.mkt_gastos_reales (
  id           uuid primary key,
  anio         integer not null,
  mes          integer not null,
  pedido       text,
  detalle      text,
  estado       text not null default 'Pendiente', -- Pendiente | En Diseño | En imprenta | Entregado
  pagado       boolean not null default false,
  factura_path text,          -- path en el bucket "documents"
  factura_name text,
  created_at   timestamptz not null default now()
);

-- 3) CAMPAÑAS META ADS (mensual)
create table if not exists public.mkt_meta_ads (
  id              uuid primary key,
  anio            integer not null,
  mes             integer not null,
  nombre          text,
  piezas          text,       -- piezas / pautas (carga manual)
  objetivo        text,       -- objetivo de campaña (carga manual)
  resultados      text,
  costo_resultado numeric not null default 0,
  presupuesto     numeric not null default 0,
  importe_gastado numeric not null default 0,
  impresiones     numeric not null default 0,
  alcance         numeric not null default 0,
  created_at      timestamptz not null default now()
);

alter table public.mkt_atencion_cliente disable row level security;
alter table public.mkt_inversion_plan   disable row level security;
alter table public.mkt_inversion_mes     disable row level security;
alter table public.mkt_gastos_reales    disable row level security;
alter table public.mkt_meta_ads         disable row level security;
grant all on public.mkt_atencion_cliente to anon, authenticated;
grant all on public.mkt_inversion_plan   to anon, authenticated;
grant all on public.mkt_inversion_mes     to anon, authenticated;
grant all on public.mkt_gastos_reales    to anon, authenticated;
grant all on public.mkt_meta_ads         to anon, authenticated;
