-- Diseño Gráfico (Marketing · Tareas y Reuniones → pestaña Diseño Gráfico).
-- Tareas de diseño con seguimiento y archivos adjuntos por tarea.
-- Los archivos se guardan en el bucket de Storage "documents" (ya existente);
-- acá solo se guarda la referencia (path) y los metadatos.

create table if not exists public.mkt_design_tasks (
  id          uuid primary key,
  title       text not null,
  description text,
  responsible text,                 -- responsable / estudio de diseño
  date        date not null default current_date,
  due_date    date,
  progress    integer not null default 0,   -- % de avance (0-100)
  status      text not null default 'pendiente', -- pendiente | en_proceso | completada
  trello_id   text,                 -- id de la tarjeta de Trello (para reimportar sin duplicar)
  created_at  timestamptz not null default now()
);
-- Para bases donde la tabla ya existía sin la columna:
alter table public.mkt_design_tasks add column if not exists trello_id text;
create index if not exists mkt_design_tasks_trello_idx on public.mkt_design_tasks(trello_id);

create table if not exists public.mkt_design_files (
  id         uuid primary key,
  task_id    uuid not null references public.mkt_design_tasks(id) on delete cascade,
  name       text not null,          -- nombre original del archivo
  path       text not null,          -- path en el bucket "documents"
  size       bigint,
  mime       text,
  created_at timestamptz not null default now()
);
create index if not exists mkt_design_files_task_idx on public.mkt_design_files(task_id);

alter table public.mkt_design_tasks disable row level security;
alter table public.mkt_design_files disable row level security;
grant all on public.mkt_design_tasks to anon, authenticated;
grant all on public.mkt_design_files to anon, authenticated;
