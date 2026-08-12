-- ============================================================================
-- AGREGACIÓN MENSUAL DE ÓRDENES (para Dashboard de Socios · Tickets/Órdenes)
-- ============================================================================
-- Correr una sola vez en el SQL Editor de Supabase. Idempotente.
--
-- Antes, el dashboard traía TODAS las filas de sales_tickets al navegador y las
-- contaba ahí. Con el histórico desde 2023 eso son cientos de miles de filas
-- por sucursal (millones en la vista consolidada), así que la paginación se
-- cortaba (tope de páginas) y solo se veía el año en curso.
--
-- Esta función hace el conteo en el servidor y devuelve una fila por mes:
--   month        -> 'YYYY-MM'
--   orders       -> cantidad de órdenes del mes
--   days_loaded  -> días distintos con datos cargados (para proyectar el mes en curso)
--
-- Regla de conteo (idéntica a la que hacía el frontend):
--   * Si el ticket tiene comprobante  -> se cuentan comprobantes DISTINTOS por
--     sucursal y día (un mismo comprobante repetido el mismo día no se cuenta dos
--     veces; si se repite en días distintos, son ventas legítimas distintas).
--   * Si NO tiene comprobante          -> se suma la columna "orders".
--
-- p_scope = 'consolidated' agrega todas las sucursales; si no, filtra por branch_id.
-- ============================================================================

create or replace function public.sales_orders_monthly(p_scope text)
returns table (month text, orders bigint, days_loaded integer)
language sql
stable
as $$
  with per_day as (
    select
      left(date::text, 7)                                   as ym,
      date,
      count(distinct nullif(btrim(comprobante), ''))        as cnt_comp,
      coalesce(
        sum(coalesce(orders, 0))
          filter (where nullif(btrim(comprobante), '') is null),
        0
      )                                                     as cnt_null
    from public.sales_tickets
    where date is not null
      and (p_scope = 'consolidated' or branch_id = p_scope)
    group by left(date::text, 7), branch_id, date
  )
  select
    ym                              as month,
    sum(cnt_comp + cnt_null)::bigint as orders,
    count(distinct date)::integer    as days_loaded
  from per_day
  group by ym
  order by ym;
$$;

grant execute on function public.sales_orders_monthly(text) to anon, authenticated;

-- ============================================================================
-- Verificación (opcional): órdenes por mes de una sucursal / consolidado.
-- ============================================================================
-- select * from public.sales_orders_monthly('consolidated') order by month;
