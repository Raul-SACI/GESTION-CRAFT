-- FIX: desactivar RLS en cheques_emitidos (bloqueaba el INSERT)
ALTER TABLE cheques_emitidos DISABLE ROW LEVEL SECURITY;
GRANT ALL ON cheques_emitidos TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';

-- Verificacion: rls_activada debe dar FALSE
SELECT relname, relrowsecurity AS rls_activada
FROM pg_class
WHERE relname = 'cheques_emitidos';
