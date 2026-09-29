-- Archivos adjuntos de las tareas de Marketing (módulo Tareas y Reuniones · pestaña Tareas).
-- Los archivos se guardan en el bucket de Storage "documents" (ya existente);
-- acá solo se guarda la referencia (path) y los metadatos. Una tarea puede tener varios.
create table if not exists public.mkt_task_files (
  id         uuid primary key,
  task_id    text not null,          -- id de mkt_tasks (texto, ej. mt_...)
  name       text not null,          -- nombre original del archivo
  path       text not null,          -- path en el bucket "documents"
  size       bigint,
  mime       text,
  created_at timestamptz not null default now()
);
create index if not exists mkt_task_files_task_idx on public.mkt_task_files(task_id);

alter table public.mkt_task_files disable row level security;
grant all on public.mkt_task_files to anon, authenticated;
