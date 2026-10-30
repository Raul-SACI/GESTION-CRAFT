-- Recetas · Productos Pedidos Ya: precio de venta (bruto) del plato en la plataforma.
-- Correr una vez. Idempotente. Solo se usa en las recetas tipo "pedidos_ya".
alter table public.op_recipes
  add column if not exists precio_venta numeric;

notify pgrst, 'reload schema';
