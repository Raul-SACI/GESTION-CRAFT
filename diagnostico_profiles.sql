-- 1) ¿Cuántos perfiles hay?  (debe ser > 0)
SELECT count(*) AS cantidad_perfiles FROM profiles;

-- 2) ¿La tabla profiles tiene RLS activada?  (rls_activada debe ser FALSE)
SELECT relname, relrowsecurity AS rls_activada
FROM pg_class
WHERE relname IN ('profiles', 'roles_config');
