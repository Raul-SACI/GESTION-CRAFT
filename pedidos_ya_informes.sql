-- ============================================================================
-- PEDIDOS YA · INFORMES (Fase 1)
-- ----------------------------------------------------------------------------
-- Correr una vez en el SQL Editor de Supabase (base principal). Idempotente.
--
-- Tablas para importar y guardar la información que exporta Pedidos Ya semana
-- a semana. Dos calendarios conviven:
--   · Indicadores comerciales/operativos  -> a nivel DÍA (re-agrupables por la
--     semana fija del negocio: 1-7, 8-14, 15-21, 22-fin).
--   · Liquidaciones (lo que paga Pedidos Ya) -> por período de Pedidos Ya
--     (domingo a sábado), tal cual el "Historial de pagos".
--
-- Marca: se deriva del nombre de la sucursal ("Café"/"Cafe" -> Craft Café; si
-- no, Craft). La sucursal se guarda con el nombre tal cual viene en el archivo.
-- ============================================================================

-- ── Comercial por período (fuente: resumen de ventas, todos los locales) ──────
-- Un archivo trae el total por local del rango descargado. Como no trae fechas,
-- se etiqueta con la semana del negocio elegida al importar (0 = mes completo).
create table if not exists public.py_comercial_periodo (
  anio       integer not null,
  mes        integer not null,
  semana     integer not null default 0,  -- 0=mes completo, 1..4 semanas
  sucursal   text    not null,
  marca      text    not null default 'Craft',
  pedidos    integer not null default 0,
  venta      numeric not null default 0,
  ticket     numeric not null default 0,
  updated_at timestamptz not null default now(),
  primary key (anio, mes, semana, sucursal)
);
create index if not exists py_comercial_periodo_am on public.py_comercial_periodo (anio, mes);

-- ── Comercial diario por sucursal (fuente: estado de cuenta XLSX, por pedido) ─
create table if not exists public.py_comercial_dia (
  fecha             date    not null,
  sucursal          text    not null,
  marca             text    not null default 'Craft',
  pedidos           integer not null default 0,
  venta_bruta       numeric not null default 0,
  venta_neta        numeric not null default 0,
  comision          numeric not null default 0,
  -- medio de pago (dentro / fuera de la app)
  venta_app         numeric not null default 0,
  venta_fuera_app   numeric not null default 0,
  pedidos_app       integer not null default 0,
  pedidos_fuera_app integer not null default 0,
  -- tipo de entrega (envío Pedidos Ya / retiro en el local)
  venta_envio       numeric not null default 0,
  venta_retiro      numeric not null default 0,
  pedidos_envio     integer not null default 0,
  pedidos_retiro    integer not null default 0,
  descuentos        numeric not null default 0,
  rechazados        integer not null default 0,
  updated_at        timestamptz not null default now(),
  primary key (fecha, sucursal)
);
create index if not exists py_comercial_dia_fecha on public.py_comercial_dia (fecha);
create index if not exists py_comercial_dia_marca on public.py_comercial_dia (marca);

-- ── Publicidad / Ads (fuente: reporte detallado de campañas, por día) ─────────
-- Trae fechas, así que se re-agrupa por la semana del negocio automáticamente.
create table if not exists public.py_ads_dia (
  fecha      date    not null,
  sucursal   text    not null,
  marca      text    not null default 'Craft',
  campania   text    not null default '—',  -- Keyword / Gold Vip / Display...
  clicks     integer not null default 0,
  ordenes    integer not null default 0,
  ingresos   numeric not null default 0,     -- ventas atribuidas a ads
  costo      numeric not null default 0,     -- inversión en ads
  updated_at timestamptz not null default now(),
  primary key (fecha, sucursal, campania)
);
create index if not exists py_ads_dia_fecha on public.py_ads_dia (fecha);

-- ── Operativo por período (fuente: opsSummary, todos los locales) ─────────────
-- Un archivo con el total por local del rango. Sin fechas -> se etiqueta con la
-- semana del negocio elegida al importar (0 = mes completo).
create table if not exists public.py_operativo_periodo (
  anio        integer not null,
  mes         integer not null,
  semana      integer not null default 0,
  sucursal    text    not null,
  marca       text    not null default 'Craft',
  no_disp_seg numeric not null default 0,   -- tiempo no disponible (segundos)
  rechazo     numeric not null default 0,   -- cancelaciones evitables (%)
  espera      numeric not null default 0,   -- tiempo de espera evitable (%)
  prep_seg    numeric not null default 0,   -- tiempo de preparación promedio (segundos)
  reclamos    numeric not null default 0,   -- pedidos con reclamos (%)
  listos      numeric not null default 0,   -- pedidos marcados como listos (%)
  updated_at  timestamptz not null default now(),
  primary key (anio, mes, semana, sucursal)
);
create index if not exists py_operativo_periodo_am on public.py_operativo_periodo (anio, mes);

-- ── Conectividad / desconexión (fuente: offlineDurationPerDay, por día) ───────
create table if not exists public.py_conectividad_dia (
  fecha       date    not null,
  sucursal    text    not null,
  marca       text    not null default 'Craft',
  min_no_disp numeric not null default 0,  -- minutos no disponible
  min_prog    numeric not null default 0,  -- minutos programados
  updated_at  timestamptz not null default now(),
  primary key (fecha, sucursal)
);
create index if not exists py_conectividad_dia_fecha on public.py_conectividad_dia (fecha);

-- ── Tiempo de preparación (fuente: preparationTimePerDay, por día) ────────────
create table if not exists public.py_prep_dia (
  fecha      date    not null,
  sucursal   text    not null,
  marca      text    not null default 'Craft',
  prep_min   numeric not null default 0,  -- promedio del día (minutos)
  demorados  integer not null default 0,  -- pedidos demorados
  total      integer not null default 0,  -- pedidos del día (reconstruido de la tasa)
  updated_at timestamptz not null default now(),
  primary key (fecha, sucursal)
);
create index if not exists py_prep_dia_fecha on public.py_prep_dia (fecha);

-- ── Reclamos y reintegros (fuente: estado de cuenta XLSX, hojas 2 y 3) ────────
create table if not exists public.py_reclamos (
  id           bigint generated always as identity primary key,
  fecha        date    not null,
  sucursal     text    not null,
  marca        text    not null default 'Craft',
  tipo         text    not null,          -- 'reclamo' | 'reintegro'
  nro_pedido   text,
  motivo       text,
  monto        numeric not null default 0,-- impacto (negativo = costo para el local)
  updated_at   timestamptz not null default now()
);
create index if not exists py_reclamos_fecha on public.py_reclamos (fecha);

-- ── Liquidaciones (fuente: estado de cuenta PDF, resumen de toda la cuenta) ───
create table if not exists public.py_liquidacion (
  period_start              date primary key,
  period_end                date not null,
  ventas_netas              numeric not null default 0,
  ventas_netas_app          numeric not null default 0,
  ventas_netas_fuera        numeric not null default 0,
  servicios_pedidosya       numeric not null default 0,  -- comisión
  cargos_operativos         numeric not null default 0,
  publicidad                numeric not null default 0,
  pub_gold_vip              numeric not null default 0,
  pub_keywords              numeric not null default 0,
  pub_display               numeric not null default 0,
  reintegros                numeric not null default 0,
  ajustes                   numeric not null default 0,
  impuestos                 numeric not null default 0,
  ventas_fuera_app_cobradas numeric not null default 0,
  total_liquidado           numeric not null default 0,
  detalle                   jsonb,
  imported_at               timestamptz not null default now()
);

-- ── Configuración (umbrales de semáforos, mapeos, etc.) ───────────────────────
create table if not exists public.py_config (
  key    text primary key,
  value  jsonb not null,
  updated_at timestamptz not null default now()
);

-- Permisos (RLS abierto, igual que el resto del proyecto)
alter table public.py_comercial_periodo disable row level security;
alter table public.py_comercial_dia disable row level security;
alter table public.py_ads_dia       disable row level security;
alter table public.py_operativo_periodo disable row level security;
alter table public.py_conectividad_dia disable row level security;
alter table public.py_prep_dia       disable row level security;
alter table public.py_reclamos      disable row level security;
alter table public.py_liquidacion   disable row level security;
alter table public.py_config        disable row level security;

grant all on public.py_comercial_periodo to anon, authenticated;
grant all on public.py_comercial_dia to anon, authenticated;
grant all on public.py_ads_dia       to anon, authenticated;
grant all on public.py_operativo_periodo to anon, authenticated;
grant all on public.py_conectividad_dia to anon, authenticated;
grant all on public.py_prep_dia       to anon, authenticated;
grant all on public.py_reclamos      to anon, authenticated;
grant all on public.py_liquidacion   to anon, authenticated;
grant all on public.py_config        to anon, authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;
