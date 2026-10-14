-- Plan de Inversiones: responsable del gasto/inversión. Correr una vez. Idempotente.
alter table public.fin_inversiones_plan
  add column if not exists responsable text;
