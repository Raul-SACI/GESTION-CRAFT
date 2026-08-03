-- SOLO si el diagnóstico mostró rls_activada = TRUE en profiles/roles_config.
-- Vuelve a permitir que la app lea la lista de usuarios en el login.
ALTER TABLE profiles      DISABLE ROW LEVEL SECURITY;
ALTER TABLE roles_config  DISABLE ROW LEVEL SECURITY;
GRANT ALL ON profiles      TO anon, authenticated, service_role;
GRANT ALL ON roles_config  TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';

-- Verificación: ambas deben dar FALSE
SELECT relname, relrowsecurity AS rls_activada
FROM pg_class
WHERE relname IN ('profiles', 'roles_config');
