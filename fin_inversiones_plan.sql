-- ============================================================================
-- FINANZAS · Plan de Inversiones y Gastos Proyectados (Fase 1)
-- ----------------------------------------------------------------------------
-- Correr una vez en el SQL Editor de Supabase (base principal). Idempotente.
--
-- Cada ítem es un "Gasto / Inversión" (ej. "Sillas Interior") agrupado por una
-- Categoría (ej. "Remodelación"), con tipo (gasto/inversión), importancia,
-- urgencia, presupuesto estimado, fecha probable, estado y costo real.
-- Un ítem puede pagarse en varias cuotas en distintos meses (tabla de pagos).
-- RLS desactivado (igual que el resto del proyecto).
-- ============================================================================

create table if not exists public.fin_inversiones_plan (
  id              uuid primary key default gen_random_uuid(),
  tipo            text    not null default 'inversion',   -- 'gasto' | 'inversion'
  nombre          text    not null,                        -- Gasto / Inversión (ej. "Sillas Interior")
  categoria       text,                                    -- (ej. "Remodelación")
  branch_id       text,                                    -- sucursal/área; vacío/null = General
  importancia     text    not null default 'importante',   -- 'deseable' | 'importante' | 'muy_importante'
  urgencia        text    not null default 'no_urgente',   -- 'no_urgente' | 'urgente'
  presupuesto     numeric not null default 0,              -- presupuesto estimado
  fecha_estimada  date,                                    -- fecha probable de ejecución
  estado          text    not null default 'pendiente',    -- pendiente|aprobado|en_curso|hecho|descartado
  costo_real      numeric,                                 -- null hasta ejecutar
  proveedor       text,
  notas           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists fin_inv_plan_fecha on public.fin_inversiones_plan (fecha_estimada);
create index if not exists fin_inv_plan_estado on public.fin_inversiones_plan (estado);

-- Cuotas / pagos previstos de cada ítem (un ítem puede pagarse en partes).
create table if not exists public.fin_inversiones_pagos (
  id          uuid primary key default gen_random_uuid(),
  plan_id     uuid not null references public.fin_inversiones_plan(id) on delete cascade,
  fecha       date not null,                 -- fecha/mes del pago
  monto       numeric not null default 0,
  descripcion text,
  pagado      boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists fin_inv_pagos_plan on public.fin_inversiones_pagos (plan_id);
create index if not exists fin_inv_pagos_fecha on public.fin_inversiones_pagos (fecha);

alter table public.fin_inversiones_plan  disable row level security;
alter table public.fin_inversiones_pagos disable row level security;
grant all on public.fin_inversiones_plan  to anon, authenticated;
grant all on public.fin_inversiones_pagos to anon, authenticated;
