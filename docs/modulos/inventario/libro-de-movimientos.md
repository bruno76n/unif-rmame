# Libro de movimientos

> **Qué cubre:** el inventario como suma de movimientos: las siete ubicaciones con su responsable, los 31 tipos de movimiento con su origen y su destino, los renglones con su lote y su traspaso, y cómo se escribe y se revierte un movimiento.
> **Estado:** Decidido.
> **Se construye en:** [fase 9 ●](../../fases/09-inventario-libro-existencias-reservas-y-traspasos.md).
> **Se conecta con:** [existencias y cuadre](existencias-y-cuadre.md) · [traspasos](traspasos.md) · [reservas](reservas.md) · [base de datos](../../cimientos/BASE-DE-DATOS.md) · [idempotencia y concurrencia](../../cimientos/IDEMPOTENCIA-Y-CONCURRENCIA.md) · [recepciones en aduana](recepciones-en-aduana.md) · [surtido y despachos](surtido-y-despachos.md) · [material en bodega](material-en-bodega.md) · [entregas a corte](entregas-a-corte.md) · [recepción del taller](recepcion-del-taller.md) · [conteos](conteos.md) · [diferencias, ajustes y mermas](diferencias-ajustes-y-mermas.md) · [mínimos y reabasto](minimos-y-reabasto.md) · [entregas y devoluciones de clientes](entregas-y-devoluciones-de-clientes.md) · [notas de entrega](../ventas/notas-de-entrega.md) · [pantallas comunes](../../interfaz/comunes.md) · [pantallas de Aduana](../../interfaz/fabrica/aduana.md) · [pantallas de Bodega](../../interfaz/fabrica/bodega.md) · [pantallas de Dirección](../../interfaz/fabrica/direccion.md) · [pantallas de Contaduría](../../interfaz/fabrica/contaduria.md) · [pantallas de Personal](../../interfaz/fabrica/personal.md) · [pantallas de Administración](../../interfaz/fabrica/administracion.md) · [migración](../../MIGRACION.md)

## Para qué sirve

El inventario no es un número que alguien escribe: es la suma de todo lo que se ha movido. Cada hecho que mueve piezas o material es un movimiento en el libro, con sus renglones: qué, cuánto, de dónde y a dónde. Las existencias son esa suma, guardada para leer rápido (ver [existencias y cuadre](existencias-y-cuadre.md)).

Ejemplo: Bodega surte la solicitud S-T1-088 de la Tienda 1. Nace el movimiento `surtido_bodega`: 12 playeras polo talla 10 salen de Bodega hacia En camino a aduana, ligadas al traspaso A-04. Nadie escribe «Bodega: 88»: la existencia de Bodega baja porque el renglón salió de ahí, y la de En camino a aduana sube porque llegó ahí.

## Reglas

1. **El libro manda.** `movimientos` y `movimiento_lineas` son el inventario. Las existencias son su proyección: se suman en la misma transacción que el movimiento y cada noche se comprueban contra el libro.
2. **Siete ubicaciones de inventario:** Aduana, Bodega, Tienda 1, Tienda 2, Taller, Tránsito y En camino a aduana. «En línea» no es ubicación: es una reserva. Proveedores, clientes, consumo y merma son **Fuera**: un renglón con origen o destino vacío.
3. **Una pieza está en un solo lugar,** y nada pasa de un lugar a otro sin que lo confirmen los dos lados. Lo que va de camino está en Tránsito o En camino a aduana, ligado a su traspaso, hasta que el otro lado lo recibe (ver [traspasos](traspasos.md)).
4. **Un movimiento no se modifica ni se borra.** Se deshace con otro, de tipo `reversion`, con los renglones al revés; un movimiento se revierte una sola vez. Las dos tablas solo crecen: el rol de la app no puede cambiarlas.
5. **Nada negativo se tapa.** Nunca se rechaza un movimiento por falta de existencia. Si la existencia queda en negativo, se guarda así, y la diferencia la explica después una DF- (ver [diferencias, ajustes y mermas](diferencias-ajustes-y-mermas.md)).
6. **El lote viaja en cada renglón** cuando se conoce (del traspaso, del lote o del corte). La tienda al vender y Bodega al surtir no lo saben: va vacío.
7. **Todo renglón que entra o sale de Tránsito o de En camino a aduana lleva su traspaso.**
8. **El día del movimiento es el día de negocio de cuando pasó** (`ocurrido_en`, la hora del aparato si vino de uno), en hora de México. `ocurrido_en` también ordena el libro: con él se calcula lo que decía el sistema cuando alguien contó (ver [conteos](conteos.md)).
9. **Cada movimiento tiene su clave de idempotencia.** Si una acción crea varios, cada uno lleva una clave derivada de la de la acción: uuid v5 de (clave de la acción, tipo, número). Así un reintento nunca duplica un movimiento, aunque se repita la acción completa.
10. **Sin dinero.** El libro no guarda precios ni costos; el costo de un rollo vive en el rollo y solo lo leen Compras y Contaduría.

## La tabla `ubicaciones`

Se construye en la [fase 4](../../fases/04-servicios-comunes.md), con su siembra, porque antes de que exista el inventario ya la usan los parámetros, las impresoras, las cuentas, los aparatos y las personas.

| Columna | Tipo | Nulo | Qué es |
|---|---|---|---|
| `id` | uuid | no | Llave |
| `codigo` | text | no | Único: `ADU`, `BOD`, `T1`, `T2`, `TAL`, `TRA`, `ECA`. Lo usa la API; las pantallas reciben la lista y nunca escriben estos códigos |
| `nombre` | text | no | Como sale en pantalla |
| `tipo` | text | no | CHECK (`aduana`, `bodega`, `tienda`, `taller`, `transito`, `en_camino_aduana`). El código busca una ubicación por su tipo, nunca por su nombre |
| `responsable_persona_id` | uuid | sí | → `personas.id`: quien responde por lo que hay ahí. Vacío en Tránsito y En camino a aduana: ahí responde quien lo mandó |
| `prefijo_folio` | text | sí | Único. El de la tienda (`T1`, `T2`): de él salen los prefijos de sus cajas |
| `surte_en_linea` | boolean | no | default false. Si su existencia libre se ofrece en la tienda en línea |
| `existencia_desde` | timestamptz | sí | Solo en tiendas: desde cuándo Unifórmame lleva su existencia. La pone la carga inicial de su caja (con el POS) y no se quita, aunque se revoque la caja. Vacía: tienda sin caja (ver [migración](../../MIGRACION.md#las-tiendas-sin-caja)) |
| `orden` | smallint | no | El orden en las listas y en la matriz de existencias |
| `baja_en` · `baja_por` · `motivo_baja` · `reactivado_en` | | sí | Una ubicación no se da de baja con existencia distinta de cero ni con traspasos abiertos |

- Lleva las columnas comunes (ver [base de datos](../../cimientos/BASE-DE-DATOS.md#columnas-comunes)).
- **Único:** (`tipo`) donde no es `tienda` y `baja_en` es nulo: una sola Aduana, una sola Bodega, un solo Taller.
- La primera versión no tiene pantalla para cambiar una ubicación. Una tienda nueva es su propio proyecto, con el POS.

### La siembra

| Orden | Código | Nombre | Tipo | Prefijo | Surte en línea |
|---|---|---|---|---|---|
| 1 | `ADU` | Aduana | `aduana` | — | No |
| 2 | `BOD` | Bodega | `bodega` | — | Sí |
| 3 | `T1` | Tienda 1 | `tienda` | `T1` | Sí |
| 4 | `T2` | Tienda 2 | `tienda` | `T2` | Sí |
| 5 | `TAL` | Taller | `taller` | — | No |
| 6 | `TRA` | Tránsito | `transito` | — | No |
| 7 | `ECA` | En camino a aduana | `en_camino_aduana` | — | No |

Los responsables nacen vacíos: los pone la [migración](../../MIGRACION.md) y, en local, los datos de la muestra.

## Los tipos de movimiento

El catálogo completo. **Fuera** es un origen o un destino vacío. Cada tipo lo pide la acción del archivo que dice la tabla; el movimiento siempre lo escribe `inventario`. La columna «Fase» es la fase en que nace el primer movimiento de ese tipo.

**Prendas**

| Tipo | Qué es | De → a | Lo pide | Fase |
|---|---|---|---|---|
| `carga_inicial` | La existencia de arranque, o la de una tienda nueva | Fuera → Bodega, Aduana o una tienda; un consumible, al Taller si ahí los toma (`inventario.ubicacion_consumibles`) | [conteos](conteos.md) | 14 |
| `venta_tienda` | Venta de mostrador, entrega de un apartado o de un pedido especial (también las ventas en papel, con su hora real) | Tienda → Fuera | La caja | Con el POS |
| `devolucion_mostrador` | La prenda que regresa en un cambio | Fuera → Tienda | La caja | Con el POS |
| `merma_tienda` | Merma de tienda | Tienda → Fuera | La caja | Con el POS |
| `salida_tienda` | Todo lo que una tienda manda a aduana | Tienda → En camino a aduana | La caja | Con el POS |
| `surtido_bodega` | Bodega surte una solicitud, un reabasto, un pedido en línea o uno externo; también material que regresa al proveedor | Bodega → En camino a aduana | [surtido y despachos](surtido-y-despachos.md) · [mínimos y reabasto](minimos-y-reabasto.md) | 11 |
| `recepcion_aduana` | Aduana recibe lo que venía en camino | En camino a aduana → Aduana | [recepciones en aduana](recepciones-en-aduana.md) | 11 |
| `piezas_cortadas` | Nacen las piezas del lote al cerrar el corte | Fuera → Taller | [corte y bultos](../produccion/corte-y-bultos.md), con [entregas a corte](entregas-a-corte.md) | 12 |
| `merma_produccion` | Piezas dañadas en una operación | Taller → Fuera | La tablet, con [diferencias, ajustes y mermas](diferencias-ajustes-y-mermas.md) | 12 |
| `recepcion_taller` | Producción terminada que entra a aduana, contada a ciegas | Taller → Aduana | [recepción del taller](recepcion-del-taller.md) | 14 |
| `recepcion_reproceso` | Un reproceso aprobado que entra a aduana, contado a ciegas | Taller → Aduana | [recepción del taller](recepcion-del-taller.md) | 14 |
| `despacho` | Sale de aduana | Aduana → Tránsito | [surtido y despachos](surtido-y-despachos.md) | 11 |
| `recepcion_despacho` | El destino recibe, completo o con diferencias | Tránsito → Bodega o una tienda | [surtido y despachos](surtido-y-despachos.md); la tienda, con el POS | 11 |
| `entrega_cliente_externo` | El cliente firma de recibido | Tránsito → Fuera | [entregas y devoluciones de clientes](entregas-y-devoluciones-de-clientes.md) | 16 |
| `entrega_tienda_sin_caja` | Una tienda sin caja recibe, con la firma de su encargada: sale de la fábrica, porque su existencia la lleva su punto de venta de hoy | Tránsito → Fuera | [surtido y despachos](surtido-y-despachos.md) | 11 |
| `salida_linea` | El paquete sale con la paquetería | Aduana → Fuera | Tienda en línea | Con uniformame.mx |
| `devolucion_cliente_externo` | Regresa una prenda de un cliente externo, con su NC- | Fuera → Aduana | [recepciones en aduana](recepciones-en-aduana.md) | 16 |
| `devolucion_linea` | Regresa una prenda de un pedido en línea | Fuera → Aduana | [recepciones en aduana](recepciones-en-aduana.md) | Con uniformame.mx |
| `merma_calidad` | Calidad da por merma una devolución | Aduana → Fuera | [entregas y devoluciones de clientes](entregas-y-devoluciones-de-clientes.md) | 16 |

**Material**

| Tipo | Qué es | De → a | Lo pide | Fase |
|---|---|---|---|---|
| `recepcion_proveedor` | Tela rollo por rollo y avíos por cantidad; nacen los rollos | Fuera → Aduana | [recepciones en aduana](recepciones-en-aduana.md) | 11 |
| `devolucion_proveedor` | Lo de más rechazado regresa al proveedor | Aduana → Fuera | [recepciones en aduana](recepciones-en-aduana.md) | 11 |
| `entrega_corte` | Tela y avíos pasan al taller para un lote | Bodega → Taller | [entregas a corte](entregas-a-corte.md) | 12 |
| `consumo_corte` | Los metros usados de cada rollo | Taller → Fuera | El corte, con [entregas a corte](entregas-a-corte.md) | 12 |
| `merma_corte` | Lo que quedó, menos de la frontera, que «Ya no sirve» | Taller → Fuera | El corte | 12 |
| `regreso_rollo` | Un rollo de la frontera o más, o entregado sin usar, que regresa | Taller → Bodega | [entregas a corte](entregas-a-corte.md) | 12 |
| `regreso_retazo` | Un retazo RZ- que regresa | Taller → Bodega | [entregas a corte](entregas-a-corte.md) | 12 |
| `consumo_avios` | Los avíos entregados para el lote se consumieron | Taller → Fuera | [recepción del taller](recepcion-del-taller.md) | 14 |
| `consumible_tomado` | Agujas, aceite, bandas, con quién los tomó | La ubicación de consumibles → Fuera | [material en bodega](material-en-bodega.md), desde la tablet | 12 |

El material va de Aduana a Bodega con `despacho` y `recepcion_despacho`, con renglones de material. La carga inicial de material usa `carga_inicial`; en tela, con un rollo «Carga inicial».

**De los dos**

| Tipo | Qué es | De → a | Lo pide | Fase |
|---|---|---|---|---|
| `ajuste` | La diferencia que se vio al contar, o lo perdido en camino | Ubicación → Fuera (faltan) o Fuera → ubicación (sobran) | [diferencias, ajustes y mermas](diferencias-ajustes-y-mermas.md), al autorizarlo Dirección | 14 |
| `aclaracion_recepcion` | Lo pendiente de una recepción se pone donde de verdad está | Tránsito, En camino a aduana o el Taller → el lugar que recibió o el origen; al revés si sobró | [diferencias, ajustes y mermas](diferencias-ajustes-y-mermas.md) | 14 |
| `reversion` | Deshace otro movimiento | El inverso del original | Quien cancela: la merma de un registro de la tablet (14); la venta o la salida de una tienda (con el POS) | 14 |

**Lo que no es movimiento:** crear, mover, transferir o liberar una reserva; separar en tienda la pieza de un pedido en línea; repartir un traspaso; cerrar con faltante una orden de compra; cerrar un conteo que cuadró; una devolución aceptada que todavía no llega; un renglón de venta libre o de código no registrado (no tiene variante); las ventas históricas que sube la migración (decisión de integración 29).

## La tabla `movimientos`

El encabezado: un hecho que movió inventario.

| Columna | Tipo | Nulo | Qué es |
|---|---|---|---|
| `id` | uuid | no | Llave (v7, la pone el servidor) |
| `tipo` | text | no | CHECK con los 31 tipos de arriba |
| `fecha` | date | no | El día de negocio de `ocurrido_en`, en hora de México |
| `ocurrido_en` | timestamptz | no | Cuándo pasó de verdad: la hora del aparato si vino de uno; si no, la de la acción |
| `documento_tipo` | text | no | CHECK (`carga_inicial`, `conteo`, `venta_tienda`, `devolucion_mostrador`, `merma_tienda`, `salida_tienda`, `traspaso`, `recepcion`, `despacho`, `nota_entrega`, `pedido_linea`, `corte`, `registro_operacion`, `toma_consumible`, `entrega_corte`, `ajuste`, `diferencia`, `reproceso`) |
| `documento_id` | uuid | no | El documento que lo pidió. En `carga_inicial` de material y en `toma_consumible`, que no tienen tabla, el id del propio movimiento o el que trajo la tablet |
| `documento_folio` | text | sí | Copia del folio, para buscar y mostrar |
| `revierte_movimiento_id` | uuid | sí | → `movimientos.id`. Solo en `reversion`. Único: un movimiento se revierte una vez |
| `clave_idempotencia` | uuid | no | Única. La de la acción, o la derivada (regla 9) |
| `comando_id` | uuid | sí | → `comandos_recibidos.id`: la acción que lo pidió |
| `dispositivo_id` | uuid | sí | → `dispositivos.id`, si vino de un aparato |
| `persona_id` | uuid | sí | → `personas.id`: la cajera, la costurera, el cortador, quien tomó un consumible |
| `nota` | text | sí | |

- Lleva las columnas comunes; `actualizado_en` queda vacío porque el movimiento no cambia.
- **Índices:** único (`clave_idempotencia`) · (`documento_tipo`, `documento_id`) · (`tipo`, `fecha`) · (`ocurrido_en`) · único (`revierte_movimiento_id`) donde no es nulo.

## La tabla `movimiento_lineas`

Cada renglón mueve una cantidad positiva de una variante, o de un material (y su rollo), de una ubicación a otra.

| Columna | Tipo | Nulo | Qué es |
|---|---|---|---|
| `id` | uuid | no | Llave |
| `movimiento_id` | uuid | no | → `movimientos.id` |
| `renglon` | smallint | no | Único con `movimiento_id` |
| `origen_ubicacion_id` | uuid | sí | → `ubicaciones.id`. Vacío: viene de Fuera |
| `destino_ubicacion_id` | uuid | sí | → `ubicaciones.id`. Vacío: sale a Fuera |
| `variante_id` | uuid | sí | → `variantes.id`. Renglón de prenda |
| `material_id` | uuid | sí | → `materiales.id`. Renglón de material |
| `rollo_id` | uuid | sí | → `rollos.id`. Obligatorio si el material es tela |
| `lote_id` | uuid | sí | → `lotes.id` (regla 6) |
| `piezas` | integer | sí | Mayor que 0. Solo en renglón de prenda |
| `cantidad` | numeric(12,3) | sí | Mayor que 0. Solo en renglón de material, en su unidad de inventario |
| `traspaso_id` | uuid | sí | → `traspasos.id` (regla 7) |

- Lleva las columnas comunes.
- **CHECK:** al menos uno de origen y destino · origen distinto de destino · o prenda (`variante_id` y `piezas`, sin material) o material (`material_id` y `cantidad`, sin variante ni piezas).
- **Índices:** (`movimiento_id`) · (`origen_ubicacion_id`, `variante_id`) · (`destino_ubicacion_id`, `variante_id`) · (`material_id`, `rollo_id`) · (`lote_id`) · (`traspaso_id`).
- `material_id`, `rollo_id` y `lote_id` llevan su `@llavePendiente` hasta las fases 10, 11 y 12.

## Cómo se escribe un movimiento

Lo hace una sola función del módulo, `escribirMovimiento`, en `modulos/inventario/dominio/` (ver [estructura](../../cimientos/ESTRUCTURA.md#un-módulo-por-dentro)). No es una acción interna: los demás módulos piden sus movimientos con la interna de cada caso (`inventario.registrar_corte`, `inventario.registrar_venta_tienda`…), y esas internas y las acciones de inventario usan esta función. Dentro de la transacción de quien la llama:

1. **Revisa los renglones:** que el tipo exista y que cada renglón vaya del origen al destino que dice su tipo (un `despacho` solo de Aduana a Tránsito); la forma de prenda o de material; el rollo en la tela; el traspaso en lo que toca Tránsito o En camino a aduana. Si algo no cumple es un error del programa (`500`): quien la llama ya validó lo que llegó.
2. **Toma los candados** en el orden fijo: el de cada variante (`pg_advisory_xact_lock`), los traspasos de sus renglones, y luego las existencias por (`ubicacion_id`, `variante_id`) y las de material por (`ubicacion_id`, `material_id`, `rollo_id`), con `SELECT … FOR UPDATE` (ver [base de datos](../../cimientos/BASE-DE-DATOS.md#candados)).
3. **Escribe el movimiento y sus renglones,** con la fecha del día de negocio y la clave (la de la acción o la derivada).
4. **Suma la proyección:** cada renglón resta en su origen y suma en su destino, en `existencias` o en `existencias_material`, con su `ultimo_movimiento_id`. Si un renglón no existía, nace.
5. **Mueve las reservas con su pieza:** las reservas activas ligadas al traspaso del renglón cambian de ubicación; al llegar a su destino final se les quita el traspaso (ver [reservas](reservas.md)). No es otro movimiento.
6. **Regresa** el `movimiento_id` y las tablas que tocó, para el evento de la acción que la llamó. No guarda eventos ni bitácora propios.

**Revertir** usa la misma función: un movimiento `reversion` con los renglones del original al revés y `revierte_movimiento_id`. Revertir dos veces el mismo es un error del programa.

## Lo que baja a los aparatos

A la tablet no baja nada del libro. Las ubicaciones bajan a la caja de cada tienda con el POS.

## Permisos

El libro no tiene acciones propias: cada acción que mueve inventario revisa el suyo. Lo leen las consultas de Aduana, Bodega, Dirección y «¿Dónde está?», sin precios ni costos.

## Eventos

Ninguno propio: cada acción guarda los suyos, con `existencias` entre sus tablas.

## Lo que llega después

- Cada tipo de movimiento llega con la fase que dice su tabla.
- **Fase 10 y 11:** las llaves de `material_id` y `rollo_id`, y la regla de que la tela lleva su rollo, con los materiales y los rollos.
- **Fase 12:** la llave de `lote_id`.
- **Con el POS:** las ubicaciones bajan a la caja (todas, sin su responsable), y los movimientos de la caja con sus reglas.

## Cómo está hecho

**Fase 4.** La tabla `ubicaciones` está en `apps/api/src/modulos/inventario/tablas.ts` (migración `0004_configuracion.sql`), con su disparador común y el índice único de una sola por tipo fuera de las tiendas. Su siembra, con los siete renglones y los responsables vacíos, está en `modulos/inventario/index.ts`, que por ahora solo registra eso y dice que las ubicaciones las leen todos los departamentos.

**Fase 9, parte 1.**

- **Las tablas** `movimientos` y `movimiento_lineas` están en `modulos/inventario/tablas.ts` (migración `0026`), con sus CHECK:
  - los tipos y los documentos;
  - `reversion` si y solo si dice qué revierte;
  - un lado al menos y dos lados distintos;
  - o prenda o material.
- **Sus índices** son los de este archivo; el de `revierte_movimiento_id` es único.
- **El libro solo crece:** `marcar_solo_crece` le quita el `UPDATE` al rol de la app, y ninguna tabla de negocio tiene `DELETE`. `actualizado_en` lo llena el disparador común al nacer y ya no cambia (decisión 472).
- **La tabla de tipos** tiene los 31 renglones de arriba (decisión 469).
- **Las reglas de cada tipo** (sus caminos y si mueve prendas, material o los dos) están en `dominio/tipos-de-movimiento.ts`. `consumible_tomado` acepta Bodega, Taller o Aduana como origen hasta que llegue `inventario.ubicacion_consumibles` (decisión 470).
- **`escribirMovimiento` y `revertirMovimiento`** (`dominio/escribir-movimiento.ts`) hacen los seis pasos:
  - **Revisan** cada renglón contra su tipo, su forma y el traspaso de lo que toca un tramo de camino; si algo no cumple, es un `Error` (un `500`).
  - **Toman los candados** de `dominio/candados.ts`: primero el de cada variante (`pg_advisory_xact_lock`), después los traspasos de sus renglones (`bloquearTraspasos`, `FOR NO KEY UPDATE`) y al final las existencias en el orden fijo, con el rollo vacío primero. Las existencias que no estaban nacen en cero antes de bloquearse (decisión 466). Una acción que escribe más de un movimiento, o cambia un traspaso y luego lo mueve, toma todo al principio con `tomarCandadosDeInventario` (decisión 500).
  - **Escriben** el movimiento con el día de negocio de `ocurrido_en` y suman la existencia. El material se suma en `numeric` dentro de Postgres; su cantidad viaja como texto decimal (decisión 471).
  - **Mueven las reservas** con `moverReservasConSuPieza` (`dominio/reservas.ts`): cambian de ubicación con su pieza y, al llegar al destino de su traspaso, lo sueltan. Solo una entrega (`entrega_cliente_externo`, `entrega_tienda_sin_caja`, `salida_linea`, `venta_tienda`) las cumple; otra salida a Fuera las deja donde estaban (decisión 503).
- **La clave** es la de la acción, que viaja en el contexto (`claveIdempotencia`): sirve igual por la web que por la cola de un aparato, donde el renglón del comando se guarda al final (decisión 501). `movimientos.comando_id` es una llave diferida (migración `0031`). Si la acción crea varios movimientos, se deriva con `claveDerivada` (uuid v5 de la clave, el tipo y el número). Un trabajo pasa la suya. Si ya hay un movimiento con esa clave, del mismo tipo y el mismo documento, se regresa ese sin escribir nada (decisiones 467 y 468); con otro tipo, otro documento u otra reversión es un error del programa (decisión 502).
- **La reversión** voltea los renglones del original, con su lote y su traspaso, y toma su documento si no viene otro. Revertir dos veces, o revertir una reversión, es un error.
- **Pruebas:**
  - `dominio/escribir-movimiento.prueba.ts`: la misma transacción; los caminos y el traspaso; el negativo; las claves derivadas con un comando real (la acción `prueba.mover_inventario` del módulo de prueba); la reversión única; el material.
  - `dominio/escribir-movimiento.azar.prueba.ts`: cuatro conexiones a la vez, sin reintento, con ajustes y aclaraciones entre Taller y Bodega, de prendas y de material con milésimos y rollos; las existencias de los dos son siempre la suma del libro. Con el orden de los candados quitado a propósito, sale en rojo.
  - `dominio/candados.prueba.ts`: sin reintento, dos movimientos en una acción contra otra que mueve las mismas variantes al revés, y un cambio de estado de un traspaso con su movimiento contra el reparto de sus reservas; ninguna da `40P01`.
  - `tablas.prueba.ts`: `42501` al cambiar o borrar el libro.

**Fase 14, parte 1.** `aclaracion_recepcion` acepta Fuera del lado del lugar que recibió: lo entregado a una tienda sin caja ya salió del inventario (decisión 636).

**Fase 14, parte 3.** `escribirMovimiento` acepta el id del movimiento cuando su documento es él mismo: la carga inicial de material (decisión 646).

**Fase 14, cierre.** `carga_inicial` entra también al Taller, para un consumible (decisión 657).
