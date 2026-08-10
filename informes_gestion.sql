-- ============================================================================
-- INFORMES DE GESTIÓN (Gerencia General)
-- ============================================================================
-- Correr una sola vez en el SQL Editor de Supabase.
-- Es idempotente: se puede volver a correr sin romper nada.
--
-- Dos tablas:
--
--   informes_templates    La DEFINICIÓN del informe que arma el gerente:
--                          nombre, periodicidad, responsable (por rol y/o
--                          usuario), próxima fecha de presentación y la
--                          ESTRUCTURA (secciones con campos tipados y tablas),
--                          guardada como JSONB.
--
--   informes_submissions   Una ENTREGA por período. El responsable la completa
--                          hasta la fecha límite y el gerente la revisa:
--                          queda registro de si fue aprobada u observada, con
--                          las observaciones/anotaciones y quién/cuándo revisó.
--
-- Estados de una entrega (status):
--   pendiente   creada, el responsable todavía no la entregó
--   entregado   el responsable la completó y la entregó
--   aprobado    el gerente la revisó y la aprobó
--   observado   el gerente la devolvió con observaciones para corregir
-- ============================================================================

-- 1) Definición del informe
create table if not exists public.informes_templates (
  id                    text primary key,
  name                  text not null default '',
  description           text,
  periodicity           text not null default 'mensual',
  structure             jsonb not null default '[]'::jsonb,
  responsible_role      text,
  responsible_user_id   text,
  responsible_user_name text,
  next_due_date         date,
  is_active             boolean not null default true,
  created_by            text,
  created_at            timestamptz default now(),
  updated_at            timestamptz default now()
);

alter table public.informes_templates
  drop constraint if exists informes_templates_structure_is_array;
alter table public.informes_templates
  add constraint informes_templates_structure_is_array
  check (jsonb_typeof(structure) = 'array');

-- 2) Entregas (una por período)
create table if not exists public.informes_submissions (
  id            text primary key,
  template_id   text not null references public.informes_templates(id) on delete cascade,
  period_label  text not null default '',
  due_date      date,
  status        text not null default 'pendiente',
  values        jsonb not null default '{}'::jsonb,
  submitted_at  timestamptz,
  submitted_by  text,
  reviewed_at   timestamptz,
  reviewed_by   text,
  observations  text,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

create index if not exists informes_submissions_template_idx
  on public.informes_submissions (template_id);
create index if not exists informes_submissions_status_idx
  on public.informes_submissions (status);

-- Realtime (seguro): sumar las tablas a la publicación solo si faltan.
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'informes_templates') then
    alter publication supabase_realtime add table public.informes_templates;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'informes_submissions') then
    alter publication supabase_realtime add table public.informes_submissions;
  end if;
end $$;

-- Acceso público, igual que el resto de las tablas de la app.
alter table public.informes_templates enable row level security;
drop policy if exists "Allow public access for informes_templates" on public.informes_templates;
create policy "Allow public access for informes_templates" on public.informes_templates for all using (true) with check (true);

alter table public.informes_submissions enable row level security;
drop policy if exists "Allow public access for informes_submissions" on public.informes_submissions;
create policy "Allow public access for informes_submissions" on public.informes_submissions for all using (true) with check (true);

-- ============================================================================
-- Verificación: tienen que existir las dos tablas con sus columnas.
-- ============================================================================
-- select table_name, count(*) from information_schema.columns
--  where table_name in ('informes_templates','informes_submissions')
--  group by table_name;
