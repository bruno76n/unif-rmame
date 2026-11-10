# Base de datos

> **Qué cubre:** las convenciones de la base: nombres y tipos, columnas comunes, `version` y `xid_escritura`, estados y cancelaciones, nada se borra, llaves pendientes, candados en orden fijo, migraciones, siembra del sistema y datos de la muestra.
> **Estado:** Decidido.
> **Se construye en:** [fase 2](../fases/02-base-de-datos-y-pruebas.md).
> **Se conecta con:** [regla de base de datos](../../.claude/rules/base-de-datos.md) · [arquitectura](ARQUITECTURA.md) · [módulos](MODULOS.md) · [idempotencia y concurrencia](IDEMPOTENCIA-Y-CONCURRENCIA.md) · [sincronización](SINCRONIZACION.md) · [configuración](../modulos/admin/configuracion.md) · [libro de movimientos](../modulos/inventario/libro-de-movimientos.md) · [pruebas](PRUEBAS.md) · [infraestructura](INFRAESTRUCTURA.md) · [seguridad](SEGURIDAD.md)

## La base

- **Una sola:** PostgreSQL 18, administrada en Render. La escriben solo la API y el worker, a través de sus módulos. Nunca se expone a internet.
- **Una sola empresa:** ninguna tabla lleva empresa.
- **Dos roles de base:**
  - **el dueño**, que solo usan las migraciones: crea tablas, disparadores y permisos;
  - **la app**, con el que se conectan la API y el worker: lee y escribe, pero no puede borrar en las tablas de negocio, no puede cambiar las que solo crecen y en `comandos_recibidos` solo puede cambiar las columnas que su archivo dice. Así una regla de «nada se borra» la cuida la base, no solo el código.
- **Drizzle** define las tablas en el `tablas.ts` de cada módulo; **drizzle-kit** genera las migraciones.
- **Cada tabla tiene un solo módulo dueño,** que es el único que la escribe. El archivo de creación de cada tema dice qué tablas son suyas.

## Nombres y tipos

| Cosa | Regla |
|---|---|
| Tablas | Español, snake_case, plural: `movimientos`, `notas_entrega` |
| Columnas | Español, snake_case, singular: `cantidad`, `creado_en` |
| Llave primaria | `id uuid`, versión 7. Lo que nace en un aparato sin internet trae el `id` que hizo el aparato |
| Llaves foráneas | `<entidad>_id`: `lote_id`, `variante_id` |
| Folio | `folio text`, único en su tabla. Ver [folios](../modulos/admin/folios.md) |
| Dinero | `bigint` en centavos, con nombre terminado en `_centavos`: `precio_centavos` |
| Piezas | `integer` |
| Metros y otras unidades de material | `numeric(12,3)`, siempre con su unidad (en la columna o la del material) |
| Porcentajes | `numeric(6,3)`: 12.5 es 12.5 % |
| Momentos | `timestamptz`, en UTC, con nombre terminado en `_en`: `creado_en`, `pagado_en` |
| Día de negocio | `date`, en hora de México: `fecha`, `fecha_entrega` |
| Estados | `text` con CHECK de los valores permitidos, en snake_case: `por_surtir`, `en_transito` |
| Listas que el usuario agrega | Su propia tabla, nunca un CHECK: categorías de gasto, motivos de ajuste, defectos |
| JSON | `jsonb` solo para lo que de verdad es libre (el antes y el después de la bitácora); nunca para algo que se consulta o se suma |
| Comparar sin acentos ni mayúsculas | La función `sin_acentos(text)`, inmutable, sobre `unaccent` (la primera migración la crea con las extensiones `unaccent` y `pg_trgm`). La usan los índices únicos que no distinguen acentos (escuelas) y los buscadores (bitácora) |

Los CHECK de la base solo cuidan lo que nunca cambia (positivos, valores de estado, obligatorios según el tipo). Plazos, porcentajes y topes del negocio son parámetros y los revisa la API.

## Columnas comunes

Toda tabla de negocio lleva:

| Columna | Tipo | Qué es |
|---|---|---|
| `creado_en` | `timestamptz not null default now()` | Cuándo nació |
| `creado_por` | `uuid` → `usuarios.id` | Qué cuenta la hizo; nulo si la hizo un aparato o el sistema |
| `actualizado_en` | `timestamptz` | El último cambio |
| `version` | `bigint not null` | Sale de la secuencia global `version_global` y cambia en cada escritura. Sirve para que dos personas no se pisen (ver [idempotencia y concurrencia](IDEMPOTENCIA-Y-CONCURRENCIA.md)) |

Y según el caso:

- **Lo que llega de un aparato** lleva también `dispositivo_id` y `persona_id` (quien cobró o registró, que no tiene cuenta).
- **Lo que baja a un aparato** lleva `xid_escritura xid8 not null`, con índice: el número de la transacción que lo escribió. Con él la [sincronización](SINCRONIZACION.md) entrega los cambios hasta un tope seguro y nunca se salta un renglón; `version` se queda solo para las pisadas. Hoy bajan a la tablet: `lotes`, `lote_tallas`, `bultos`, `productos`, `variantes`, `tallas`, `flujos`, `flujo_operaciones`, `operaciones`, `registros_operacion`, `personas`, `pines`, `maquinas`, `fallas`, `motivos_falla`, `materiales`, `parametros`, `tarifas_operacion` y `dispositivos`. Las de la caja de tienda se agregan con el POS.

**Un solo disparador las pone.** Una función de la base, puesta en cada tabla de negocio, llena `version` con `nextval('version_global')`, `actualizado_en` con `now()` en cada cambio y, en las tablas que bajan, `xid_escritura` con `pg_current_xact_id()`. El código nunca las escribe a mano.

**Tablas técnicas,** fuera de esta regla: `bitacora`, `parametros_historial` y `respaldos` solo crecen (sin `version` ni `actualizado_en`); `comandos_recibidos`, `sesiones`, `dispositivos_sync`, `eventos` e `intentos_recientes` son del funcionamiento del sistema y no bajan a aparatos. Cada una dice en su archivo qué columnas lleva.

## Nada se borra

- **No hay `DELETE` en tablas de negocio.** El rol de la app no tiene permiso de borrar en ellas.
- **Un documento se cancela:** `estado` cancelado, con `cancelado_en`, `cancelado_por` y `motivo_cancelacion`. El estado concuerda con el documento (`cancelada` en la orden de compra y la nota de entrega, `cancelado` en el pedido); por eso las consultas comunes preguntan por `cancelado_en`, no por el texto del estado.
- **Un catálogo se da de baja:** `baja_en`, `baja_por` y `motivo_baja`; se reactiva con `reactivado_en`.
- **Un documento cerrado no se modifica:** una nota entregada, una factura, una nómina pagada o un corte de caja se corrigen con otro documento ligado (una nota de crédito, un ajuste, una diferencia, un renglón negativo en la siguiente nómina).
- **Las tablas que solo crecen** no se cambian nunca: `bitacora`, `parametros_historial`, `respaldos`, y las que su archivo marque igual. El rol de la app no tiene permiso de `UPDATE` en ellas.
- **Lo único que se depura** son tablas técnicas que lo dicen en su archivo: los `eventos` ya procesados y los `intentos_recientes`.

## Tablas que crecen sin parar

`bitacora` y `eventos` se parten por mes. En una tabla partida la llave primaria lleva la columna de la partición (`id`, `ocurrido_en` en la bitácora; `id`, `creado_en` en los eventos). Las demás tablas no se parten: con el tamaño de la fábrica no hace falta.

## Llaves que apuntan a una fase posterior

Las fases construyen las tablas en orden, y a veces una tabla apunta a otra que todavía no existe (la bitácora de la fase 4 guarda `usuario_id`, pero `usuarios` llega en la fase 5).

1. La columna se crea sin su llave foránea y lleva en `tablas.ts` la marca TSDoc `@llavePendiente usuarios.id`.
2. La fase que crea la tabla apuntada busca `@llavePendiente <tabla>`, agrega esas llaves foráneas en su migración y quita las marcas.
3. `pnpm revision` falla si una marca apunta a una tabla que ya existe: ninguna llave se queda olvidada.

## Candados

Varias acciones pelean por los mismos renglones (una venta, un surtido y una reserva en línea de la misma variante). Para que nunca se bloqueen entre sí:

1. **Orden fijo:** toda transacción que mueve inventario bloquea sus renglones de `existencias` con `SELECT … FOR UPDATE` en el orden (`ubicacion_id`, `variante_id`), y los de material en el orden (`ubicacion_id`, `material_id`, `rollo_id`).
2. **Un candado por variante** (`pg_advisory_xact_lock`) antes de escoger o reasignar reservas.
3. **Si Postgres corta por bloqueo o por serialización** (`40P01`, `40001`), el núcleo reintenta la transacción completa hasta tres veces, con la misma clave de idempotencia. Después responde el error.
4. **Transacciones cortas.** Una transacción abierta frena el tope seguro de la sincronización para todos los aparatos. La base lleva `idle_in_transaction_session_timeout`, y los trabajos largos van por tramos.

Cada archivo que mueve inventario dice qué candados toma; el detalle de las reservas está en [reservas](../modulos/inventario/reservas.md).

## Migraciones

1. Se cambia el `tablas.ts` del módulo y `pnpm base:generar` escribe la migración nueva en `apps/api/migraciones/`.
2. Lo que drizzle-kit no genera (disparadores, permisos de los roles, vistas, particiones, índices parciales con funciones) va en la misma migración, escrito a mano en SQL.
3. Se revisa el SQL antes de aplicarlo y se aplica con `pnpm base:migrar`, con el rol dueño.
4. **Una migración aplicada nunca se edita:** un cambio es una migración nueva. La revisión completa aplica todas desde cero sobre una base vacía y falla si una migración que ya está en la rama principal cambió.
5. En producción las migraciones corren antes de que arranque la API nueva (ver [infraestructura](INFRAESTRUCTURA.md)).

## Siembra del sistema y datos de la muestra

**La siembra del sistema** es lo que tiene que existir en toda base, también en producción: los departamentos, las ubicaciones, los parámetros con su valor inicial, las listas con sus valores, los contadores de folio. Cada módulo declara la suya (los parámetros en su `parametros.ts`). Corre sola después de cada `pnpm base:migrar`: agrega lo que falta y **nunca cambia lo que ya existe**, para no pisar un valor que la dueña ya cambió.

**Los datos de la muestra** son los de la muestra aprobada (Instituto Juan Pablo II, PE-0145, L-2026-122, R-0452…), para trabajar en local y para las pruebas. Nunca llegan a producción.

- Viven en `apps/api/semillas/` y se cargan con `pnpm base:sembrar`.
- Se cargan con las mismas acciones del sistema siempre que se pueda, para que todo cuadre como cuadraría lo real. Lo que no tiene acción (un historial viejo) se inserta directo, y al final corre el cuadre de inventario, que tiene que salir sin residuo.
- Cada fase agrega los datos de la muestra de sus tablas.

## Cómo se prueba

Todo contra un Postgres 18 real (ver [pruebas](PRUEBAS.md)):

- el disparador pone `version`, `actualizado_en` y `xid_escritura` en cada escritura, y el código no puede ponerlos a mano;
- el rol de la app no puede borrar en una tabla de negocio ni cambiar una que solo crece;
- dos transacciones que se cruzan en orden fijo no se bloquean, y una que choca se reintenta sola;
- las migraciones aplican desde cero y la siembra corre dos veces sin cambiar nada la segunda.

## Cómo está hecho

**Fase 2.** Todo lo del núcleo de la base vive en `apps/api/src/nucleo/base/`.

- **La conexión** (`conexion.ts`): `abrirConexiones(direccion)` abre un `pg.Pool`, y `crearBase(conexiones)` lo envuelve con Drizzle (`drizzle-orm/node-postgres`). Las variables las lee y valida `apps/api/src/nucleo/entorno.ts` con Zod (`ENTORNO`, `BASE_DATOS_URL`, `BASE_DATOS_URL_DUENO`); si falta una, dice su nombre y nunca su valor.
- **Los roles:** el dueño es el que aplica las migraciones (`uniformame_dueno` en local y en las pruebas). La primera migración (`apps/api/migraciones/0000_base.sql`) crea `uniformame_app` sin entrada (decisión 335) y le pone `idle_in_transaction_session_timeout = 60s`; su entrada y su clave las pone cada máquina.
- **Las transacciones con reintento** (`transacciones.ts`): `enTransaccion(base, trabajo)` corre `base.transaction(trabajo)` y, si el error (o el que envuelve Drizzle en su `cause`) trae `40P01` o `40001`, repite la transacción completa hasta `reintentosPorChoque` (3) veces; a la cuarta lanza el error. Cualquier otro error sale a la primera. `codigoDePostgres(error)` saca el código.

**Las pruebas:** `transacciones.prueba.ts`, con dos conexiones a la vez: dos transacciones en orden fijo terminan sin reintentos; dos en orden cruzado chocan (`40P01`), la que pierde se repite sola y terminan las dos; una que siempre choca (`40001`) se intenta cuatro veces; un error que no es choque no se repite.
