-- ============================================================================
-- GERENCIA GENERAL · Organigrama y Manual de Funciones (Fase 1)
-- ----------------------------------------------------------------------------
-- Correr una vez en el SQL Editor de Supabase (base principal). Idempotente.
--
-- Puestos en árbol jerárquico ("reporta a" = parent_id). A cada puesto se le
-- asignan empleados (employees); un puesto puede tener varios o ninguno
-- (vacante, ej. mozos a contratar). Manual de funciones por puesto con
-- secciones fijas (objetivo, funciones, requisitos; "reporta a"/"supervisa a"
-- se derivan del árbol). RLS desactivado (igual que el resto del proyecto).
-- ============================================================================

create table if not exists public.org_puestos (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null,                         -- ej. "Gerente General", "Mozo"
  area        text,                                  -- ej. "Dirección", "Operaciones", "Cocina", "Salón"
  parent_id   uuid references public.org_puestos(id) on delete set null,  -- reporta a
  branch_id   text,                                  -- sucursal; vacío/null = General
  objetivo    text,                                  -- Manual: objetivo del puesto
  funciones   text,                                  -- Manual: funciones/responsabilidades (una por línea)
  requisitos  text,                                  -- Manual: requisitos (una por línea)
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists org_puestos_parent on public.org_puestos (parent_id);

-- Empleados asignados a cada puesto (0..n).
create table if not exists public.org_asignaciones (
  id          uuid primary key default gen_random_uuid(),
  puesto_id   uuid not null references public.org_puestos(id) on delete cascade,
  empleado_id text not null,                         -- employees.id
  created_at  timestamptz not null default now(),
  unique (puesto_id, empleado_id)
);
create index if not exists org_asig_puesto on public.org_asignaciones (puesto_id);

alter table public.org_puestos      disable row level security;
alter table public.org_asignaciones disable row level security;
grant all on public.org_puestos      to anon, authenticated;
grant all on public.org_asignaciones to anon, authenticated;
