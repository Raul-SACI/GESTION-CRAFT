-- 1) Cuantos dias distintos tiene cargados cada sucursal en julio 2026
SELECT b.name AS sucursal, COUNT(DISTINCT s.date) AS dias_cargados
FROM sales_tickets s
JOIN branches b ON b.id = s.branch_id
WHERE s.date >= '2026-07-01' AND s.date <= '2026-07-31'
GROUP BY b.name
ORDER BY b.name;

-- 2) Que dias de julio tiene cargados Mate de Luna (para ver los 2 que faltan)
SELECT DISTINCT s.date
FROM sales_tickets s
JOIN branches b ON b.id = s.branch_id
WHERE b.name ILIKE '%mate%'
  AND s.date >= '2026-07-01' AND s.date <= '2026-07-31'
ORDER BY s.date;
