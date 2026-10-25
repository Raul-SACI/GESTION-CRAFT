-- Plan de Inversiones · Diagnóstico y arreglo de lectura (RLS).
-- Correr en Supabase → SQL Editor. El SQL Editor ignora RLS, así que el count
-- te dice si los datos SIGUEN EN LA BASE o si se borraron.

-- 1) ¿Cuántos ítems hay realmente guardados?
select count(*) as items_en_la_base from public.fin_inversiones_plan;
select count(*) as cuotas_en_la_base from public.fin_inversiones_pagos;

-- 2) Asegurar que la app (anon / authenticated) PUEDA LEER y escribir.
--    Si RLS quedó activado sin política, la app recibe 0 filas sin error:
--    esto deja una política permisiva (idempotente) para ambas tablas.
alter table public.fin_inversiones_plan enable row level security;
drop policy if exists fin_inversiones_plan_all on public.fin_inversiones_plan;
create policy fin_inversiones_plan_all on public.fin_inversiones_plan
  for all to anon, authenticated using (true) with check (true);
grant all on public.fin_inversiones_plan to anon, authenticated;

alter table public.fin_inversiones_pagos enable row level security;
drop policy if exists fin_inversiones_pagos_all on public.fin_inversiones_pagos;
create policy fin_inversiones_pagos_all on public.fin_inversiones_pagos
  for all to anon, authenticated using (true) with check (true);
grant all on public.fin_inversiones_pagos to anon, authenticated;

notify pgrst, 'reload schema';
