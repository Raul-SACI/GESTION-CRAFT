-- ============================================================================
-- EVALUACIÓN DE DUEÑOS
-- ============================================================================
-- Correr una sola vez en el SQL Editor de Supabase. Idempotente.
--
-- Una evaluación que ejecutan los dueños. Al empezar se elige la SUCURSAL:
--   - Almacén Central  -> preguntas de la sección "almacen".
--   - Resto de sucursales -> se elige "servicio" o "estado_general".
--
-- Todas las preguntas tienen 3 respuestas fijas (no se guardan por pregunta):
--   cumple | advertencia | no_cumple  (No cumple = Bandera Negra)
-- Cada respuesta puede llevar una nota de texto y una foto (bucket "documents").
--
-- Dos tablas:
--   evaluacion_duenos_questions   la estructura (preguntas por sección)
--   evaluacion_duenos_responses   cada evaluación cargada
-- ============================================================================

-- 1) Estructura: preguntas por sección
create table if not exists public.evaluacion_duenos_questions (
  id          text primary key,
  grupo       text not null,          -- 'almacen' | 'servicio' | 'estado_general'
  text        text not null default '',
  sort_order  integer not null default 0,
  created_at  timestamptz default now()
);

create index if not exists evaluacion_duenos_questions_grupo_idx
  on public.evaluacion_duenos_questions (grupo, sort_order);

-- 2) Evaluaciones cargadas
create table if not exists public.evaluacion_duenos_responses (
  id          text primary key,
  branch_id   text not null,
  date        date not null,
  seccion     text not null,          -- 'almacen' | 'servicio' | 'estado_general'
  -- answers: { [questionId]: { status, note, photo, target } }
  --   status: 'cumple' | 'advertencia' | 'no_cumple'
  --   target (solo No cumple): 'encargado' | 'cocina' | 'ambos'
  answers     jsonb not null default '{}'::jsonb,
  notes       text,
  created_by  text,
  created_at  timestamptz default now()
);

create index if not exists evaluacion_duenos_responses_branch_idx
  on public.evaluacion_duenos_responses (branch_id, date);

-- Realtime (seguro)
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='evaluacion_duenos_questions') then
    alter publication supabase_realtime add table public.evaluacion_duenos_questions;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='evaluacion_duenos_responses') then
    alter publication supabase_realtime add table public.evaluacion_duenos_responses;
  end if;
end $$;

-- Acceso público, igual que el resto de la app.
alter table public.evaluacion_duenos_questions enable row level security;
drop policy if exists "Allow public access for evaluacion_duenos_questions" on public.evaluacion_duenos_questions;
create policy "Allow public access for evaluacion_duenos_questions" on public.evaluacion_duenos_questions for all using (true) with check (true);

alter table public.evaluacion_duenos_responses enable row level security;
drop policy if exists "Allow public access for evaluacion_duenos_responses" on public.evaluacion_duenos_responses;
create policy "Allow public access for evaluacion_duenos_responses" on public.evaluacion_duenos_responses for all using (true) with check (true);
