-- ============================================================
-- MODULO: CHEQUES EMITIDOS (Tesoreria)
-- Cheques fisicos o e-cheq que la empresa emite desde SANTANDER.
-- La fecha_pago impacta como pasivo: ese dia hay que tener la plata.
-- ============================================================

CREATE TABLE IF NOT EXISTS cheques_emitidos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha_emision date        NOT NULL,
  destinatario  text        NOT NULL,
  monto         numeric     NOT NULL DEFAULT 0,
  fecha_pago    date        NOT NULL,
  banco         text        NOT NULL DEFAULT 'SANTANDER',
  tipo          text        NOT NULL DEFAULT 'fisico',   -- 'fisico' | 'echeq'
  numero        text,                                     -- N° de cheque (opcional)
  estado        text        NOT NULL DEFAULT 'pendiente', -- 'pendiente' | 'pagado' | 'anulado'
  created_by    text,                                     -- usuario de la app que lo genero
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- Desactivar RLS (las tablas nuevas quedan con RLS activada por
-- defecto y la app no ve las filas). Repetir SIEMPRE en tablas nuevas.
-- ------------------------------------------------------------
ALTER TABLE cheques_emitidos DISABLE ROW LEVEL SECURITY;
GRANT ALL ON cheques_emitidos TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';

-- ------------------------------------------------------------
-- Verificacion: rls_activada debe dar FALSE
-- ------------------------------------------------------------
SELECT relname, relrowsecurity AS rls_activada
FROM pg_class
WHERE relname IN ('cheques_emitidos');
