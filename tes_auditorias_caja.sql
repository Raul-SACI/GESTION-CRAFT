-- Tesorería · Auditorías sorpresa de caja. Correr una vez. Idempotente.
-- Una persona de administración visita la caja de un restaurante, hace el arqueo
-- (efectivo + medios de pago), completa el checklist operativo y evalúa al cajero.
create table if not exists public.tes_auditorias_caja (
  id text primary key,
  branch_id text,
  fecha date,
  auditor text,
  cajero text,
  turno text,
  hora_inicio text,
  hora_fin text,
  sistema text,
  efectivo_denom jsonb,              -- { "20000": cantidad, "10000": cantidad, ... }
  total_efectivo_fisico numeric,     -- suma denominacion*cantidad
  caja_chica_inicial numeric,
  ventas_efectivo_sistema numeric,
  gastos_autorizados numeric,
  efectivo_neto_rendido numeric,     -- esperado = caja_chica + ventas - gastos
  diferencia_efectivo numeric,       -- fisico - esperado (sobrante + / faltante -)
  medios_pago jsonb,                 -- [{ medio, montoSistema, montoComprobantes }]
  checklist jsonb,                   -- [{ punto, resultado, obs }]
  eval_cajero jsonb,                 -- [{ pregunta, respuesta, obs }]
  observaciones text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.tes_auditorias_caja enable row level security;
drop policy if exists tes_auditorias_caja_all on public.tes_auditorias_caja;
create policy tes_auditorias_caja_all on public.tes_auditorias_caja for all to anon, authenticated using (true) with check (true);
grant all on public.tes_auditorias_caja to anon, authenticated;

-- Config general de Tesorería (checklist y preguntas al cajero editables).
create table if not exists public.tes_config (
  key text primary key,
  value jsonb,
  updated_at timestamptz default now()
);
alter table public.tes_config enable row level security;
drop policy if exists tes_config_all on public.tes_config;
create policy tes_config_all on public.tes_config for all to anon, authenticated using (true) with check (true);
grant all on public.tes_config to anon, authenticated;

notify pgrst, 'reload schema';
