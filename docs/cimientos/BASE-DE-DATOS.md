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
- **Las transacciones con reintento** (`transacciones.ts`): `enTransaccion(base, trabajo)` corre `base.transaction(trabajo)` (si `base` ya es una transacción, la de adentro queda en un `SAVEPOINT` y no se repite: la que se repite completa es la de afuera) y, si el error (o el que envuelve Drizzle en su `cause`) trae `40P01` o `40001`, repite la transacción completa hasta `reintentosPorChoque` (3) veces, con una espera corta al azar entre intentos; a la cuarta lanza el error. Cualquier otro error sale a la primera. `codigoDePostgres(error)` saca el código.

- **La primera migración** (`apps/api/migraciones/0000_base.sql`): la secuencia `version_global` (declarada en `nucleo/base/tablas.ts` con `pgSequence`, la genera drizzle-kit) y, escrito a mano, `unaccent`, `pg_trgm` y `sin_acentos(text)` (minúsculas y sin acentos, inmutable); el rol de la app; los permisos por omisión de las tablas y secuencias nuevas del esquema `public` para la app (`SELECT`, `INSERT`, `UPDATE`; nunca `DELETE` ni `TRUNCATE`); y tres funciones:
  - `poner_columnas_comunes()`, el disparador `BEFORE INSERT OR UPDATE`, que pisa `version` con `nextval('public.version_global')`, `actualizado_en` con `now()` y, si se puso con `'baja_a_aparatos'`, `xid_escritura` con `pg_current_xact_id()`. Corre con `search_path = pg_catalog, public`, así que ninguna secuencia temporal la engaña (migración `0001_disparador_seguro.sql`, que además le quita a todos el permiso de crear objetos temporales en la base y falla si no lo pudo quitar);
  - `poner_disparador_comun(tabla, baja_a_aparatos)`, que cada migración llama al crear una tabla de negocio;
  - `marcar_solo_crece(tabla)`, que le quita el `UPDATE` a la app en una tabla que solo crece.

  Las dos últimas son solo de las migraciones: la app no las puede correr. Lo que se depura (`eventos`, `intentos_recientes`) le concede el `DELETE` su propia migración.
- **Los ayudantes de Drizzle** (`columnas.ts`): `columnasComunes()` (`creado_en`, `creado_por`, `actualizado_en`, `version` con valor por omisión 0, que el disparador pisa, para no gastar dos números de la secuencia), `columnaXidEscritura()` (`xid8` como texto), `columnasDeAparato()`, `columnasDeCancelacion()` y `columnasDeBaja()`. Las columnas que apuntan a `usuarios`, `dispositivos` y `personas` llevan `@llavePendiente`.
- **Las migraciones:** drizzle-kit lee `nucleo/base/tablas.ts` y los `modulos/*/tablas.ts` (`apps/api/drizzle.config.ts`) y escribe en `apps/api/migraciones/`. `pnpm base:generar` corre `drizzle-kit generate`; `pnpm base:migrar` corre `nucleo/base/migrar.ts` con `BASE_DATOS_URL_DUENO`: `migrate` de Drizzle y luego la siembra.
- **La revisión de las migraciones** (`scripts/migraciones.ts`, un paso de `pnpm revision` después de las pruebas): compara con `origin/main` y con `main` (las que existan; si no hay ninguna, falla y pide `git fetch origin main`) y falla si un archivo de `apps/api/migraciones/` que está ahí cambió o se borró, o si cambió una entrada de `meta/_journal.json`; también falla si una marca `@llavePendiente <tabla>` (con o sin `.columna`) de `apps/api/src/` apunta a una tabla que ya existe: con su `pgTable` en un `tablas.ts` o con su `CREATE TABLE` en una migración.
- **La siembra del sistema** (`siembra.ts`): cada semilla es una tabla de Drizzle con sus renglones; `sembrarSistema` los inserta con `onConflictDoNothing`, así que lo que ya existe nunca cambia. `semillasDelSistema()` de `migrar.ts` las junta; hasta la fase 3 no hay módulos.
- **Los datos de la muestra:** viven en `apps/api/semillas/`; `pnpm base:sembrar` (`semillas/sembrar.ts`) migra, siembra y corre `cargasDeLaMuestra`, a la que cada fase agrega las de sus tablas (desde la fase 5, las cuentas: `semillas/cuentas.ts`; desde la fase 7, las personas: `semillas/personas.ts`; desde la fase 8, el catálogo: `semillas/catalogo.ts`). Se niega a correr con `ENTORNO=produccion`. La base plantilla de las pruebas también la carga.

**Fase 8.** El catálogo de la muestra (`semillas/catalogo.ts`) es la primera carga que corre las acciones del sistema: `correrAccion` del corredor, como Rosa Méndez (Catálogo), en una sesión sin token que se cierra al terminar (decisión 456). Da de alta las seis escuelas, los tipos de prenda que usan los productos, los 32 productos con sus tallas y los precios de Mostrador, Mayoreo y En línea; agrega en la ficha las tallas de pedido especial, da de baja las dos tallas y descontinúa los dos productos de la muestra. Un producto con escuela que la muestra marca en línea queda sin ese canal, como pide la regla (decisión 457). Las etiquetas impresas se marcan directo: su acción necesita el tipo `prenda`, que llega en la fase 20 (decisión 458). Si las escuelas ya están, no hace nada. Lo prueba `semillas/catalogo.prueba.ts`.

**Fase 10.** Compras y Patronaje de la muestra (`semillas/compras-y-patronaje.ts`) los carga Rosa Méndez con Compras y Patronaje, con las mismas acciones: los siete proveedores, los 24 materiales (con su unidad de receta y su consumo inicial), las recetas de 23 prendas (la tela escala por talla desde lo medido en la talla de en medio entre 1 más su desperdicio; los avíos en la unidad de Patronaje), los cinco desarrollos llevados a su etapa y las órdenes abiertas (OC-0224 a OC-0229). Lo que el sistema todavía no hace se ajusta: las recetas quedan sin verificar; las órdenes se levantan con su acción y se marcan enviadas directo (enviar guarda la hoja de la fase 20); la recibida en parte entra enviada, y las recibidas y cerradas llegan con sus recepciones y pagos (fases 11 y 17); el desarrollo en catálogo se liga con su interna (decisión 553). Correr las acciones en una sesión de carga es `semillas/correr.ts`, que comparten el catálogo y esta carga (decisión 554). Si los proveedores ya están, no hace nada. Lo prueba `semillas/compras-y-patronaje.prueba.ts`; las pruebas que usaban nombres de la muestra (Textiles Aurora, Gabardina azul marino…) ahora usan otros.

**Fase 11.** Aduana y Bodega de la muestra (`semillas/aduana-y-bodega.ts`) los carga Javier con Aduana y Bodega, con las mismas acciones y en el día que dice la muestra (`Hacer` de `semillas/correr.ts` recibe la hora): Aduana recibe las cinco órdenes que llegaron (OC-0218 a OC-0223), las despacha a Bodega y Bodega las recibe; la OC-0226 recibe sus 300 m y se queda en aduana. Las órdenes que llegaron las levanta y deja enviadas la carga de Compras, antes que las abiertas, porque un proveedor tiene un solo borrador (decisión 577). Cada tela llega con los rollos de la muestra y su partida, y lo que falta para lo pedido en un rollo más de su partida principal (decisión 576). Si ya hay recepciones de proveedor, no hace nada. Lo prueba `semillas/aduana-y-bodega.prueba.ts`.

**Fase 12.** Producción de la muestra (`semillas/produccion.ts`): Tomás arma los siete flujos desde «Una sola operación» (mete las operaciones antes del empaque y quita la que sobra), Rosa le pone su flujo a cada prenda y las tarifas desde el 1 de septiembre, y Tomás levanta las doce órdenes de temporada y de reabasto en su día, con sus tallas repartidas como la muestra. Se cortan el lote de pants de la Tienda 2 (terminado) y el de polos de temporada (en proceso) con la tela de su receta que hay en Bodega; la tablet del taller (que entra directo, como un aparato ya registrado, con su folio DV- del contador) sube sus registros a nombre de quien hace cada operación, bulto por bulto y sin pasar del tope, con `aplicarComando` y `guardarComando` como la subida. Las órdenes de un pedido nacen con Ventas (fase 16) y los folios siguen al contador (decisión 617). Lo prueba `semillas/produccion.prueba.ts`.

**Fase 9.** El orden de los candados vale para toda la transacción, no solo para cada movimiento (decisión 500): primero el candado de cada variante (`pg_advisory_xact_lock(hashtextextended('variante:'+id, 0))`, en orden por id), luego los traspasos (`FOR NO KEY UPDATE`, en orden por id), luego `existencias` por (`ubicacion_id`, `variante_id`) y al final `existencias_material` por (`ubicacion_id`, `material_id`, `rollo_id`), con el rollo vacío primero (`NULLS FIRST` en el cuadre). Una acción que escribe más de un movimiento, o cambia el estado de un traspaso y luego escribe su movimiento, toma sus variantes y sus traspasos al principio con `tomarCandadosDeInventario` (`modulos/inventario/dominio/candados.ts`); lo que pida después ya lo tiene. Las primeras acciones así llegan en la fase 11. Quien reparte un traspaso pide solo las variantes que reparte (decisión 511). Lo prueba `modulos/inventario/dominio/candados.prueba.ts`, sin el reintento del núcleo.

**Fase 6.** `disparadores-de-tablas.prueba.ts` revisa en el catálogo de la base que toda tabla con `version` lleve el disparador `columnas_comunes`, y toda tabla con `xid_escritura`, con `baja_a_aparatos`.

**Las pruebas**, contra Postgres 18 real: `disparador.prueba.ts` (una tabla de prueba hecha con los ayudantes y el SQL de `drizzle-kit/api`: el código manda otros valores y el disparador los pisa; la versión sale de una sola secuencia; aunque la app pudiera crear una secuencia temporal con el mismo nombre, el disparador usa la de la base); `roles.prueba.ts` (la app no borra ni vacía, no cambia una tabla que solo crece, ni crea tablas ni corre las funciones de las migraciones); `migraciones.prueba.ts` (todo aplica dos veces sobre una base vacía, que queda sin permiso de objetos temporales para la app; la siembra no cambia un valor cambiado a mano); `apps/api/src/nucleo/entorno.prueba.ts` (dice el nombre de la variable y nunca su valor); el tiempo límite de una transacción abierta, en `roles.prueba.ts`; `scripts/migraciones.prueba.ts` (en un repositorio temporal con `main`); y `transacciones.prueba.ts`, con dos conexiones a la vez: dos transacciones en orden fijo terminan sin reintentos; dos en orden cruzado chocan (`40P01`), la que pierde se repite sola y terminan las dos; una que siempre choca (`40001`) se intenta cuatro veces; un error que no es choque no se repite.
