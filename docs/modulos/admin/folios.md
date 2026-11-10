# Folios

> **Qué cubre:** los folios de cada documento: sus prefijos, el contador de cada tipo, los folios que nacen en un aparato sin internet y el código de barras de 6 dígitos como folio.
> **Estado:** Decidido.
> **Se construye en:** [fase 4](../../fases/04-servicios-comunes.md).
> **Se conecta con:** [glosario](../../GLOSARIO.md) · [módulos](../../cimientos/MODULOS.md) · [dispositivos](dispositivos.md) · [variantes, códigos y etiquetas](../catalogo/variantes-codigos-y-etiquetas.md) · [pantallas de Administración](../../interfaz/fabrica/administracion.md) · [productos](../catalogo/productos.md) · [tallas y tipos de prenda](../catalogo/tallas-y-tipos-de-prenda.md) · [autorizaciones](../direccion/autorizaciones.md) · [personas](../personal/personas.md) · [traspasos](../inventario/traspasos.md) · [órdenes de compra](../compras/ordenes-de-compra.md) · [desarrollos](../patronaje/desarrollos.md) · [órdenes de producción](../produccion/ordenes-de-produccion.md) · [máquinas, fallas y servicios](../mantenimiento/maquinas-fallas-y-servicios.md) · [conteos y carga inicial](../inventario/conteos.md) · [diferencias, ajustes y mermas](../inventario/diferencias-ajustes-y-mermas.md) · [mínimos y reabasto](../inventario/minimos-y-reabasto.md) · [pagos y saldo a favor](../contaduria/pagos-y-saldo-a-favor.md) · [terceros y deudas](../contaduria/terceros-y-deudas.md) · [notas de crédito](../ventas/notas-de-credito.md) · [notas de entrega](../ventas/notas-de-entrega.md) · [pedidos y sus versiones](../ventas/pedidos.md) · [facturas de proveedor](../contaduria/facturas-de-proveedor.md) · [gastos](../contaduria/gastos.md) · [pedidos en línea](../linea/pedidos-en-linea.md) · [migración](../../MIGRACION.md)

## Para qué sirve

Cada documento tiene un folio que la gente dice en voz alta y escribe en papel: «el PE-0145», «el lote L-2026-122». El folio lo da el servidor, en orden y sin huecos, dentro de la misma transacción que crea el documento. Lo que nace en un aparato sin internet (una venta en la caja de la Tienda 1) lleva el prefijo de su aparato y su propio contador, así que nunca choca con otro.

## Reglas

1. **Un folio es único en su tabla** (`folio text`, único) y nunca se recicla, aunque el documento se cancele.
2. **El servidor lo toma dentro de la transacción del documento,** con `UPDATE contadores_folio SET siguiente = siguiente + 1 … RETURNING`. Si la transacción falla, el número no se gasta: no quedan huecos.
3. **El número se rellena con ceros** hasta sus dígitos (PE-0145 lleva 4) y puede crecer más allá sin romperse (PE-12345).
4. **El año de OP- y L- es el del día de negocio** en hora de México: un lote que se crea el 31 de diciembre a las 11 de la noche es del año que termina.
5. **Un alcance nuevo crea su contador solo:** al empezar un año nuevo, el primer OP- del año nace con su contador en 1; un aparato nuevo con su prefijo, igual.
6. **Lo que nace en un aparato** (`asigna = aparato`) lleva el folio que puso el aparato. El servidor no lo cambia: guarda el más alto que ha recibido, para que una caja que se repone siga la numeración (se lo manda en su foto; ver [dispositivos](dispositivos.md)).
7. **El código de barras de una variante** es un folio de 6 dígitos sin prefijo: la fábrica usa del 100001 al 499999; el rango 5xxxxx es solo de los códigos que nacieron en tienda. Al llegar a 499999 la API no da otro (ver [variantes, códigos y etiquetas](../catalogo/variantes-codigos-y-etiquetas.md), que avisa antes de que se acaben).
8. **El bulto no usa esta tabla:** Producción lo numera dentro de su lote al cerrar el corte (B-2026-121-03).
9. **Al arrancar,** la migración sube los contadores de PE-, NV- y OC- para que sigan la numeración de hoy, con `admin.cargar_arranque`; un contador nunca baja (ver [migración](../../MIGRACION.md#las-cargas-de-arranque)).

## La tabla `contadores_folio`

Un contador por tipo de folio y alcance.

| Columna | Tipo | Nulo | Qué es |
|---|---|---|---|
| `id` | uuid | no | Llave |
| `tipo` | text | no | Clave del documento: `pedido`, `nota_entrega`, `persona`… |
| `alcance` | text | no | default `''`. El año en OP- y L-; el prefijo del aparato en lo que nace en tienda; el tipo de máquina en sus folios |
| `prefijo` | text | no | Ya armado: `PE-`, `OP-2026-`, `CT1-` |
| `siguiente` | bigint | no | El próximo número |
| `digitos` | smallint | no | Relleno con ceros |
| `minimo` | bigint | no | default 1 |
| `maximo` | bigint | sí | Solo el código de barras: 499999 |
| `asigna` | text | no | CHECK (`servidor`, `aparato`) |
| `modulo` | text | no | El módulo que lo usa |

- **Único:** (`tipo`, `alcance`).
- Lleva las columnas comunes de toda tabla de negocio (ver [base de datos](../../cimientos/BASE-DE-DATOS.md#columnas-comunes)).
- Es del módulo `admin`, pero el folio lo pide cada módulo con `admin.tomar_folio`.

### La siembra

Los tipos y su formato. Es parte de la siembra del sistema: existe en toda base.

| Tipo | Prefijo | Dígitos | Alcance | Asigna | Módulo | Ejemplo |
|---|---|---|---|---|---|---|
| `pedido` | PE- | 4 | — | servidor | ventas | PE-0145 |
| `nota_entrega` | NV- | 4 | — | servidor | ventas | NV-0151 |
| `nota_credito` | NC- | 4 | — | servidor | ventas | NC-0012 |
| `orden_produccion` | OP-{año}- | 3 | año | servidor | produccion | OP-2026-064 |
| `lote` | L-{año}- | 3 | año | servidor | produccion | L-2026-122 |
| `rollo` | R- | 4 | — | servidor | inventario | R-0452 |
| `partida` | P- | 4 | — | servidor | inventario | P-2236 |
| `retazo` | RZ- | 3 | — | servidor | inventario | RZ-013 |
| `orden_compra` | OC- | 4 | — | servidor | compras | OC-0222 |
| `factura_proveedor` | FP- | 4 | — | servidor | contaduria | FP-8841 |
| `pago` | PG- | 4 | — | servidor | contaduria | PG-0312 |
| `gasto` | G- | 4 | — | servidor | contaduria | G-0412 |
| `deuda` | PR- | 2 | — | servidor | contaduria | PR-08 |
| `deposito_pasarela` | MP- | 4 | — | servidor | contaduria | MP-1007 |
| `autorizacion` | AU- | 4 | — | servidor | direccion | AU-0028 |
| `ajuste` | AJ- | 4 | — | servidor | inventario | AJ-0046 |
| `conteo` | CN- | 3 | — | servidor | inventario | CN-024 |
| `diferencia` | DF- | 3 | — | servidor | inventario | DF-031 |
| `partida_aduana` | A- | 2 | — | servidor | inventario | A-01 |
| `despacho` | D- | 4 | — | servidor | inventario | D-0412 |
| `reabasto` | RB- | 3 | — | servidor | inventario | RB-061 |
| `envio_tienda` | SE- | 4 | — | servidor | inventario | SE-0012 |
| `pedido_linea` | W- | 4 | — | servidor | linea | W-1045 |
| `devolucion_linea` | DL- | 4 | — | servidor | linea | — |
| `solicitud_distribuidor` | SD- | 4 | — | servidor | linea | — |
| `desarrollo` | DS- | 3 | — | servidor | patronaje | DS-015 |
| `reclamo` | RC- | 3 | — | servidor | calidad | RC-031 |
| `falla` | FM- | 4 | — | servidor | mantenimiento | FM-0043 |
| `servicio` | SM- | 4 | — | servidor | mantenimiento | SM-0018 |
| `maquina` | {tipo}- | 2 | tipo de máquina | servidor | mantenimiento | O-01 |
| `persona` | E- | 3 | — | servidor | personal | E-001 |
| `dispositivo` | DV- | 2 | — | servidor | admin | DV-01 |
| `codigo_barras` | (sin prefijo) | 6 | — | servidor | catalogo | 100256 (mínimo 100001, máximo 499999) |
| `solicitud_tienda` | S-{T}- | 3 | prefijo del aparato | aparato | inventario | S-T2-052 |
| `salida_tienda` | E-{T}- | 4 | prefijo del aparato | aparato | inventario | E-T2-0187 |
| `conteo_tienda` | CN-{T}- | 3 | prefijo del aparato | aparato | inventario | CN-T1-007 |
| `corte_caja` | C{T}- | 4 | prefijo del aparato | aparato | tiendas | CT1-1026 |
| `venta_tienda` | {T}- | 6 | prefijo del aparato | aparato | tiendas | T1-012345 |
| `apartado_tienda` | AP-{T}- | 4 | prefijo del aparato | aparato | tiendas | AP-T1-0032 |
| `pedido_especial_tienda` | PE-{T}- | 4 | prefijo del aparato | aparato | tiendas | PE-T1-0041 |
| `merma_tienda` | MR-{T}- | 3 | prefijo del aparato | aparato | tiendas | MR-T1-012 |
| `movimiento_caja` | MC-{T}- | 4 | prefijo del aparato | aparato | tiendas | — |

`{T}` es el prefijo de la caja: la primera caja de la Tienda 1 es `T1`, y la que la reponga si se revoca, `T1B`. Hay una caja por tienda, y un prefijo nunca se vuelve a usar (ver [dispositivos](dispositivos.md#admincanjear_codigo)). Todos los folios que nacen en una caja llevan su prefijo: la que repone a la de la Tienda 1 hace CT1B-, E-T1B-, S-T1B-, MC-T1B-… Los tipos de tienda los usa el POS cuando llegue.

## `admin.tomar_folio` · interna

| | |
|---|---|
| **La llaman** | Toda acción que crea un documento con folio, dentro de su transacción |
| **Recibe** | `tipo` (la clave de `contadores_folio`) · `alcance` (el año, el prefijo del aparato o el tipo de máquina; vacío si no lleva) · `n` (opcional: cuántos folios seguidos, en un solo `UPDATE`) · `numero_recibido` (solo en los folios que pone el aparato) |
| **Reglas** | Con `asigna = servidor`: toma el siguiente y lo sube; si el alcance es nuevo, crea su contador con el prefijo de la siembra. Con `asigna = aparato` y `numero_recibido`: no da folio; sube `siguiente` a `numero_recibido` + 1 si es mayor. `folio_agotado`: el contador llegó a su máximo o no le alcanzan los `n` que se piden (no da una parte), «Se acabaron los códigos de fábrica (hasta 499999).» Quien lo llama puede contestar con su propio mensaje |
| **Regresa** | El folio armado (`OP-2026-014`, `PE-0150`) y su número, o la lista si pidió `n` |
| **Eventos** | Ninguno |

## `admin.siguiente_folio` · lectura

| | |
|---|---|
| **La usan** | Configuración («Siguiente pedido», «Siguiente nota de entrega»), Catálogo («Siguiente código» y el trabajo que avisa cuando quedan pocos códigos de barras) |
| **Recibe** | `tipo` · `alcance` (vacío si no lleva) |
| **Regresa** | El siguiente folio armado, sin tomarlo; y, si el contador tiene máximo, cuántos quedan (`maximo` − `siguiente` + 1) |

Las pantallas lo muestran como dato (ver [pantallas de Administración](../../interfaz/fabrica/administracion.md)); quien de verdad toma un folio es `admin.tomar_folio`.

## Cómo se prueba

- Dos acciones que piden folio al mismo tiempo reciben números distintos y seguidos; si una falla, su número no se pierde.
- El primer OP- de un año nuevo (en hora de México) nace en 1 con el año en el prefijo.
- Un número recibido de un aparato sube el contador solo si es mayor.
- Con `n`, los folios salen seguidos.
- El código de barras no pasa de 499999.

## Cómo está hecho

*Lo escribe Claude Code al terminar la fase 4.*
