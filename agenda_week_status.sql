-- Estado de confirmación (portón) de la semana de la Agenda de Supervisores.
-- Una semana se marca "confirmada" solo cuando todos los horarios obligatorios están cubiertos,
-- o con una excepción escrita (has_override=true + override_reason). Si luego se reabre un hueco
-- obligatorio (sin excepción), la app la muestra como SIN confirmar automáticamente.
create table if not exists public.agenda_week_status (
  week_start      date primary key,        -- lunes de la semana (YYYY-MM-DD)
  confirmed_by    text,
  confirmed_at    timestamptz,
  has_override    boolean not null default false,
  override_reason text
);

alter table public.agenda_week_status disable row level security;
grant all on public.agenda_week_status to anon, authenticated;
