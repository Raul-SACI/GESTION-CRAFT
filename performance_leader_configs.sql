-- ============================================================================
-- PREMIOS DE LÍDERES
-- ============================================================================
-- Correr una sola vez en el SQL Editor de Supabase.
-- Es idempotente: se puede volver a correr sin romper nada.
--
-- Un LÍDER (rol de conducción: Líder de Encargados, Líder de Cocina, etc.) cobra
-- un porcentaje sobre la suma de los PREMIOS OBTENIDOS de las sucursales que se
-- le asignen. "Premio obtenido" = la suma de las variables alcanzadas en cada
-- sucursal (lo que quedó congelado al cerrar el mes desde el Dashboard), SIN los
-- descuentos por banderas rojas/negras: esas banderas las coloca el propio líder,
-- así que no tiene sentido que le descuenten a él.
--
-- Cada fila es una regla de premio para un líder, en un mes:
--
--   month         mes al que aplica (YYYY-MM). El % y las sucursales pueden
--                 cambiar mes a mes, por eso la regla se guarda por mes.
--   leader_name   nombre del líder (ej: "Líder de Encargados").
--   source_role   de qué rol se suman los premios obtenidos:
--                 'encargado' | 'jefe_cocina' | 'segundo_cocina' | 'all'.
--                 'all' suma los tres roles de cada sucursal elegida.
--   percentage    porcentaje sobre la suma de premios obtenidos (ej: 50).
--   branch_ids    array JSONB con las sucursales cuyos premios se suman.
--
-- El monto final NO se guarda: se calcula en vivo a partir de los reportes
-- congelados (performance_reports.results), igual que el resto de la app. Así el
-- premio del líder siempre refleja lo último que se cerró en cada sucursal.
-- ============================================================================

create table if not exists public.performance_leader_configs (
  id           uuid primary key default uuid_generate_v4(),
  month        text not null,                       -- YYYY-MM
  leader_name  text not null default '',
  source_role  text not null default 'encargado',
  percentage   numeric not null default 0,
  branch_ids   jsonb not null default '[]'::jsonb,
  created_at   timestamptz default now()
);

-- Red de seguridad: que 'branch_ids' sea siempre un array JSON.
alter table public.performance_leader_configs
  drop constraint if exists performance_leader_configs_branch_ids_is_array;

alter table public.performance_leader_configs
  add constraint performance_leader_configs_branch_ids_is_array
  check (jsonb_typeof(branch_ids) = 'array');

-- Índice para leer rápido todas las reglas de un mes.
create index if not exists performance_leader_configs_month_idx
  on public.performance_leader_configs (month);

-- Realtime (seguro): sumar la tabla a la publicación solo si falta.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'performance_leader_configs'
  ) then
    alter publication supabase_realtime add table public.performance_leader_configs;
  end if;
end $$;

-- Acceso público, igual que el resto de las tablas de la app.
alter table public.performance_leader_configs enable row level security;
drop policy if exists "Allow public access for performance_leader_configs" on public.performance_leader_configs;
create policy "Allow public access for performance_leader_configs"
  on public.performance_leader_configs for all using (true) with check (true);

-- ============================================================================
-- Verificación: tiene que devolver las columnas creadas.
-- ============================================================================
-- select column_name, data_type, column_default
--   from information_schema.columns
--  where table_name = 'performance_leader_configs'
--  order by ordinal_position;
