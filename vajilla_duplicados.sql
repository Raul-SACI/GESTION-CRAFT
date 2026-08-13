-- ============================================================================
-- LIMPIAR ARTÍCULOS DUPLICADOS DE VAJILLA (por sucursal)
-- ============================================================================
-- Los duplicados se generaron porque las sucursales veían el botón "Importar"
-- (que era solo para la carga inicial del admin) y reimportaron la lista.
--
-- Un duplicado = mismo branch_id + misma categoría + mismo nombre (ignorando
-- mayúsculas y espacios). De cada grupo se CONSERVA UNO y se borran los demás.
--
-- Criterio para elegir cuál se conserva (en este orden):
--   1) el que tenga MÁS cargas de inventario (el que realmente se estuvo usando),
--   2) el de actividad más reciente,
--   3) el de id más chico (desempate estable).
--
-- IMPORTANTE: corré primero el PASO 1 para revisar. Recién cuando estés de
-- acuerdo, corré el PASO 2 (borra de verdad). El PASO 2 es irreversible.
-- ============================================================================


-- ============================================================================
-- PASO 1 · REVISAR: lista los grupos duplicados y marca cuál se conservaría.
-- ============================================================================
with norm as (
  select
    i.id,
    i.branch_id,
    i.name,
    i.category,
    i.ideal_stock,
    i.critical_stock,
    upper(btrim(i.category)) as cat_key,
    upper(btrim(i.name))     as name_key,
    (select count(*) from tableware_inventory v where v.item_id = i.id) as inv_count,
    (select max(v.date) from tableware_inventory v where v.item_id = i.id) as ultima_actividad
  from tableware_items i
),
ranked as (
  select
    n.*,
    count(*)  over (partition by n.branch_id, n.cat_key, n.name_key) as en_grupo,
    row_number() over (
      partition by n.branch_id, n.cat_key, n.name_key
      order by n.inv_count desc, n.ultima_actividad desc nulls last, n.id asc
    ) as rn
  from norm n
)
select
  b.name as sucursal,
  r.category,
  r.name,
  r.id,
  r.ideal_stock,
  r.critical_stock,
  r.inv_count      as cargas_inventario,
  r.ultima_actividad,
  case when r.rn = 1 then 'CONSERVAR' else 'BORRAR' end as accion
from ranked r
left join branches b on b.id = r.branch_id
where r.en_grupo > 1
order by b.name, r.cat_key, r.name_key, r.rn;


-- ============================================================================
-- PASO 2 · BORRAR: elimina los duplicados (y su historial de inventario).
-- ----------------------------------------------------------------------------
-- Descomentá todo el bloque (quitá las /* */) y ejecutalo cuando el PASO 1 esté OK.
-- ============================================================================
/*
create temporary table _vajilla_dup_del as
with norm as (
  select
    i.id,
    i.branch_id,
    upper(btrim(i.category)) as cat_key,
    upper(btrim(i.name))     as name_key,
    (select count(*) from tableware_inventory v where v.item_id = i.id) as inv_count,
    (select max(v.date) from tableware_inventory v where v.item_id = i.id) as ultima_actividad
  from tableware_items i
),
ranked as (
  select
    id,
    row_number() over (
      partition by branch_id, cat_key, name_key
      order by inv_count desc, ultima_actividad desc nulls last, id asc
    ) as rn
  from norm
)
select id from ranked where rn > 1;

-- 1) borrar el historial de inventario de los duplicados
delete from tableware_inventory where item_id in (select id from _vajilla_dup_del);

-- 2) borrar los artículos duplicados
delete from tableware_items where id in (select id from _vajilla_dup_del);

-- (opcional) ver cuántos se borraron:
-- select count(*) as duplicados_borrados from _vajilla_dup_del;

drop table _vajilla_dup_del;
*/
