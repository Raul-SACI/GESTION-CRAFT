-- ============================================================================
-- LIMPIAR PRODUCTOS DUPLICADOS DEL MAESTRO DE PRODUCTOS
-- ============================================================================
-- Los duplicados aparecieron porque la importación insertaba siempre (ahora ya
-- es idempotente y actualiza en vez de duplicar).
--
-- Criterio: por NOMBRE, se CONSERVA el producto que tenga CÓDIGO (el nuevo, del
-- último Excel). Los duplicados sin código se borran, y sus recetas de desvíos
-- se repuntan al producto conservado para no perder nada.
--
-- IMPORTANTE: corré primero el PASO 1 (revisar). Recién cuando estés de acuerdo,
-- corré el PASO 2 (borra de verdad, es irreversible).
-- ============================================================================


-- ============================================================================
-- PASO 1 · REVISAR: muestra los nombres con duplicados y cuál se conservaría.
-- ============================================================================
with norm as (
  select id, name, category, code,
    upper(btrim(name)) as nkey,
    row_number() over (
      partition by upper(btrim(name))
      order by (case when nullif(btrim(code), '') is not null then 0 else 1 end), id
    ) as rn,
    count(*) over (partition by upper(btrim(name))) as en_grupo
  from products
)
select
  name, category, code,
  case when rn = 1 then 'CONSERVAR' else 'BORRAR' end as accion,
  (select count(*) from recipes r where r.product_id = norm.id) as recetas
from norm
where en_grupo > 1
order by nkey, rn;


-- ============================================================================
-- PASO 2 · LIMPIAR: repunta recetas y borra los duplicados. Descomentá y ejecutá.
-- ============================================================================
/*
-- 2a) Repuntar las recetas de los duplicados al producto que se conserva
--     (evitando duplicar la misma combinación producto+insumo).
update recipes r
set product_id = sub.keep_id
from (
  with norm as (
    select id, upper(btrim(name)) as nkey, code,
      row_number() over (partition by upper(btrim(name))
        order by (case when nullif(btrim(code), '') is not null then 0 else 1 end), id) as rn
    from products
  ),
  canon as (select nkey, id as keep_id from norm where rn = 1)
  select n.id as dup_id, c.keep_id
  from norm n join canon c using (nkey)
  where n.rn > 1
) sub
where r.product_id = sub.dup_id
  and not exists (select 1 from recipes r2 where r2.product_id = sub.keep_id and r2.item_id = r.item_id);

-- 2b) Borrar los productos duplicados (las recetas sobrantes se borran por cascade).
delete from products where id in (
  with norm as (
    select id, upper(btrim(name)) as nkey, code,
      row_number() over (partition by upper(btrim(name))
        order by (case when nullif(btrim(code), '') is not null then 0 else 1 end), id) as rn
    from products
  )
  select id from norm where rn > 1
);

-- (opcional) ver cuántos productos quedaron:
-- select count(*) as productos_finales from products;
*/
