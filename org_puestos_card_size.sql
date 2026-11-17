-- Organigrama · tamaño individual de cada recuadro (ancho y alto).
-- Cada puesto/asesor puede tener su propio tamaño, arrastrando la esquina
-- inferior derecha de la tarjeta. Si queda null, usa el tamaño por defecto
-- (los sliders de la vista). Correr una vez en Supabase. Idempotente.
alter table public.org_puestos add column if not exists card_w numeric;
alter table public.org_puestos add column if not exists card_h numeric;

notify pgrst, 'reload schema';
