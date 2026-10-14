-- Plan de Inversiones: tipo "Obra" con sub-gastos (rubros). Correr una vez. Idempotente.
-- sub_gastos guarda un arreglo JSON: [{ "id": "...", "nombre": "Albañilería", "presupuesto": 150000 }, ...]
alter table public.fin_inversiones_plan
  add column if not exists sub_gastos jsonb;
