# CRAFT · Guía para armar un entorno DEMO aislado

Objetivo: dar acceso a personas externas para que prueben algunos módulos **sin
que puedan ver ni tocar ningún dato real** de la empresa. La única forma segura
es una **instancia separada**: base de datos nueva + deploy nuevo. Los permisos
de las tablas están abiertos (RLS permisivo), así que el "solo lectura" es solo
de pantalla, no de la base — por eso NO alcanza con un usuario restringido en
producción.

Resultado final: `demo-craft.vercel.app` (URL aparte), con datos ficticios, y
usuarios que solo ven los módulos que elijas.

---

## Paso 1 · Crear la base de datos demo (Supabase)

Producción usa **dos** proyectos (histórico), pero **para la demo alcanza con UNO
solo**: se verificó que los nombres de tabla de Mantenimiento (`activos`,
`configuracion`, `mantenimientos`, `reparaciones`, `tareas`, `tareas_descartadas`)
**no chocan** con ninguno de la base principal (que usa `tasks`, no `tareas`).
Por eso ambos esquemas pueden convivir en el mismo proyecto.

- **Opción recomendada (1 proyecto):** crear **CRAFT DEMO** y meter ahí los dos
  esquemas. En Vercel, las 4 variables apuntan todas al mismo proyecto.
- **Opción alternativa (2 proyectos):** replicar exactamente producción con
  **CRAFT DEMO – Principal** y **CRAFT DEMO – Mantenimiento** por separado.

En cada proyecto que crees anotá, de *Settings → API*:
- Project URL
- anon public key

---

## Paso 2 · Recrear el esquema (las tablas) en cada base demo

Dos caminos. El **A** es el más exacto.

### Camino A (recomendado): copiar el esquema exacto con `pg_dump`

Copia la estructura (tablas, columnas, políticas) **sin copiar datos**:

```bash
# PRINCIPAL: de producción -> demo
pg_dump --schema-only --no-owner "postgresql://<CONN_PROD_PRINCIPAL>" > schema_principal.sql
psql "postgresql://<CONN_DEMO_PRINCIPAL>" -f schema_principal.sql

# MANTENIMIENTO: de producción -> demo
pg_dump --schema-only --no-owner "postgresql://<CONN_PROD_MANT>" > schema_mant.sql
psql "postgresql://<CONN_DEMO_MANT>" -f schema_mant.sql
```

Las cadenas de conexión (`CONN_*`) salen de *Supabase → Settings → Database →
Connection string*. `--schema-only` garantiza que **no se copia ningún dato
real**, solo la estructura.

> **Con 1 solo proyecto demo:** `CONN_DEMO_PRINCIPAL` y `CONN_DEMO_MANT` son la
> **misma** cadena (la del único proyecto demo). Corré los dos `psql` contra ese
> mismo proyecto: como no hay choque de nombres, quedan todas las tablas juntas.

### Camino B (alternativo): correr los SQL del repo

Si preferís no usar `pg_dump`, en el **SQL Editor de la base demo PRINCIPAL**
corré, en este orden:

1. `supabase_schema.sql` (base)
2. Migraciones (agregan columnas/tablas que se sumaron después):
   - `maestros_costo_codigo.sql`
   - `productos_maestro_activo.sql`
   - `pedidos_maestros_activo.sql`
   - `product_ranking_aliases.sql`
   - `inventory_logs_item_fk.sql`
   - `inventory_logs_encargado_shadow.sql`
   - `daily_wastage_reference_text.sql`
   - `performance_leader_configs.sql`
   - `performance_leader_branch_roles.sql`
   - `performance_black_flags.sql`
   - `performance_cierre_mes.sql`
   - `cheques_emitidos.sql` + `cheques_emitidos_fix_rls.sql`
   - `evaluacion_duenos.sql`
   - `informes_gestion.sql`
   - `direccion_actas_title.sql`
   - `venta_teorica_detalle.sql`
   - `sales_orders_monthly_rpc.sql`
   - `salary_positions_monthly_hours.sql`
   - `menu_items_product_link.sql`
   - `compras_informes.sql`
   - `fix_profiles_rls.sql`

En la base demo de **MANTENIMIENTO**: el esquema base de Mantenimiento **no está
en este repo** (es un proyecto aparte), así que para esa base usá **sí o sí el
Camino A** (`pg_dump` del proyecto de Mantenimiento de producción). Luego, si
hiciera falta, `mant_tareas_original_date.sql`.

> Archivos que **NO** hay que correr (son diagnósticos o limpiezas de un solo
> uso, no esquema): `diagnostico_*.sql`, `productos_duplicados.sql`,
> `vajilla_duplicados.sql`, `diagnostico_profiles.sql`.

---

## Paso 3 · Deployar la copia demo (Vercel)

1. Crear un **nuevo proyecto Vercel** desde el mismo repositorio (o una branch
   `demo`).
2. En *Settings → Environment Variables*, cargar **las 4** apuntando a las bases
   demo:

   | Variable | Valor |
   |---|---|
   | `VITE_SUPABASE_URL` | URL del demo **Principal** |
   | `VITE_SUPABASE_ANON_KEY` | anon key del demo **Principal** |
   | `VITE_MANT_SUPABASE_URL` | URL del demo **Mantenimiento** |
   | `VITE_MANT_SUPABASE_ANON_KEY` | anon key del demo **Mantenimiento** |

   > Las dos de `MANT_` son nuevas: si no se cargan, la app cae en la base de
   > Mantenimiento **de producción** (por eso hay que cargarlas en la demo).
   >
   > **Si usás 1 solo proyecto** (opción recomendada): poné la misma URL en
   > `VITE_SUPABASE_URL` y `VITE_MANT_SUPABASE_URL`, y la misma key en
   > `VITE_SUPABASE_ANON_KEY` y `VITE_MANT_SUPABASE_ANON_KEY`.
3. Deploy. Queda en una URL propia (ej. `demo-craft.vercel.app`).

**Producción no se toca**: sigue sin esas variables `MANT_` y usa su base real.

---

## Paso 4 · Crear el rol demo y los usuarios (desde la app, sin programar)

En la demo, entrá a **Usuarios/Roles** y:

1. Creá un rol nuevo, ej. **"Demo USA"**, con acceso **solo** a estos módulos:
   - `presupuesto_horas` — Presupuestador de Horas
   - `aprobacion_presupuestos` — Aprobación de Presupuestos
   - `gestion_sueldos` — Maestro de Personal
   - `control_agendas` — Agenda Supervisores
   - `registro_supervision` — Registro de Supervisión
   - `supervisiones_operativas` — Supervisiones Realizadas
   - `supervision_banderas` — Configuración de Supervisiones
   - Mantenimiento: `mant_panel`, `mant_inventario`, `mant_tareas`,
     `mant_preventivo`, `mant_valorizacion`, `mant_costos`, `mant_config`
2. Creá los usuarios de tus amigos con el rol **Demo USA**.
3. **Importante:** NO les des el rol `administrador` ni `dueño` — esos ven TODOS
   los módulos (saltean los permisos). El rol Demo USA es el que acota la vista.
4. Como es data ficticia, podés dejarles **edición** para que prueben de verdad.

Cuando quieras mostrarles otro módulo, lo tildás en el rol Demo USA y aparece.

---

## Paso 5 · Cargar datos ficticios

Lo más simple y seguro: **cargarlos desde la propia app demo** (así no hay riesgo
y de paso probás los flujos):

- **Sucursales**: creá 2–3 inventadas (ej. "Demo Downtown", "Demo Beach").
- **Maestro de Personal**: unos empleados falsos.
- **Escala salarial**: unos puestos con sueldos de ejemplo.
- **Presupuestador de Horas**: cargá un mes y aprobá un par en Aprobación de
  Presupuestos (para que se vea la comparación).
- **Supervisiones**: configurá una o dos y registrá alguna.
- **Mantenimiento**: unos activos y tareas de muestra.

(Opcional) Si querés, se puede preparar un script SQL de inserts de datos
ficticios para sembrar todo de una; pedilo y lo armamos con las columnas exactas.

---

## Mantenimiento / Reset

- Para "empezar de cero" la demo: borrás los datos de las tablas demo (o recreás
  el proyecto) y volvés a sembrar. Producción nunca se ve afectada.
- La anon key va en el frontend (es pública por diseño); la seguridad acá la da
  el **aislamiento de base**, no la clave.

---

## Uso comercial (bonus)

Esta misma receta —base propia + deploy propio + rol acotado— es exactamente lo
que le entregarías a un **cliente** si te encargan "un CRAFT para su empresa".
La demo te sirve doble: para la prueba de ahora y como molde de venta.
