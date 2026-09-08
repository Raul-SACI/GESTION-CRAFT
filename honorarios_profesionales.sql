-- ============================================================================
-- HONORARIOS PROFESIONALES (Finanzas)
-- Correr una vez en el SQL Editor de Supabase (base principal). Idempotente.
--
-- Registro de asesores externos permanentes y sus pagos mensuales. Cada pago
-- (con fecha + importe) impacta el Flujo de Caja Estimado en la semana de su
-- fecha, en la línea HONORARIOS de EGRESOS ESTIMADOS.
-- item_id: línea del flujo estimado (hon_abog_1, hon_cont, hon_abog_2,
-- hon_rrhh, hon_franco, hon_domo, hon_other).
-- cuenta: medio de pago (efectivo, santander, bbva, ciudad, nacion, macro, mp).
-- ============================================================================

create table if not exists public.honorarios_asesores (
  id            text primary key,
  nombre        text not null,
  tipo          text,
  monto_mensual numeric not null default 0,
  dia_pago      integer not null default 10,   -- día del mes sugerido para el pago
  cuenta        text not null default 'efectivo',
  item_id       text not null default 'hon_other',
  activo        boolean not null default true,
  notas         text,
  orden         integer not null default 0,
  updated_at    timestamptz not null default now()
);

create table if not exists public.honorarios_pagos (
  id          text primary key,             -- ej. "<asesor_id>_2026-09"
  asesor_id   text,
  nombre      text,
  tipo        text,
  mes         text not null,                -- 'YYYY-MM'
  fecha_pago  date not null,
  importe     numeric not null default 0,
  cuenta      text not null default 'efectivo',
  item_id     text not null default 'hon_other',
  estado      text not null default 'pendiente',  -- 'pendiente' | 'pagado'
  notas       text,
  updated_at  timestamptz not null default now()
);
create index if not exists honorarios_pagos_mes on public.honorarios_pagos (mes);
create index if not exists honorarios_pagos_fecha on public.honorarios_pagos (fecha_pago);

-- Permisos (RLS abierto, igual que el resto del proyecto)
alter table public.honorarios_asesores disable row level security;
alter table public.honorarios_pagos    disable row level security;
grant all on public.honorarios_asesores to anon, authenticated;
grant all on public.honorarios_pagos    to anon, authenticated;

-- Asesores iniciales (no se duplican si ya existen)
insert into public.honorarios_asesores (id, nombre, tipo, item_id, orden) values
  ('abogados',      'Estudio de Abogados',      'Legal',              'hon_abog_1', 1),
  ('contable',      'Estudio Contable',         'Contable',           'hon_cont',   2),
  ('abogada_gastro','Abogada Gastronomía',      'Legal Gastronómico', 'hon_abog_2', 3),
  ('rrhh',          'Asesor en RRHH',           'RRHH',               'hon_rrhh',   4),
  ('community',     'Community Manager',        'Marketing',          'hon_other',  5),
  ('sistemas',      'Asesor en Sistemas',       'Sistemas',           'hon_other',  6),
  ('diseno',        'Estudio de Diseño Gráfico','Diseño Gráfico',     'hon_other',  7)
on conflict (id) do nothing;
