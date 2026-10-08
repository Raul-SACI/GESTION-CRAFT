-- Organigrama · Asesores externos (staff) con línea punteada y posición libre.
-- Correr una vez en Supabase. Idempotente.
alter table public.org_puestos
  add column if not exists es_asesor boolean not null default false,
  add column if not exists pos_x     numeric,
  add column if not exists pos_y     numeric,
  add column if not exists asesor_de uuid references public.org_puestos(id) on delete set null;
