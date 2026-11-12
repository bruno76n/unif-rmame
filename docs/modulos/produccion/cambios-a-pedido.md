# Cambios a un pedido en producción

> **Qué cubre:** lo que pasa en Producción cuando una versión del pedido quita piezas que ya están en producción: el cambio que nace para Producción, cómo «Aplicar a lotes» resta de los lotes sin cortar o manda a Bodega lo ya cortado, y los lotes y las órdenes que quedan cancelados.
> **Estado:** Decidido.
> **Se construye en:** [fase 16](../../fases/16-ventas-a-externos.md).
> **Se conecta con:** [lotes](lotes.md) · [órdenes de producción](ordenes-de-produccion.md) · [pedidos](../ventas/pedidos.md) · [entregas a corte](../inventario/entregas-a-corte.md) · [recepción del taller](../inventario/recepcion-del-taller.md) · [pantallas de Producción](../../interfaz/fabrica/produccion.md) · [flujo 02 · Cambios en producción](../../flujos/fabrica/02-cambios-en-produccion.md)

## Para qué sirve

Si el cliente pide menos, Producción no corta de más. Ejemplo: Ventas guarda la versión 3 del PE-0145, que baja 20 playeras de talla 12 que ya estaban en producción. Nace el cambio para Producción. Al «Aplicar a lotes», se restan 15 del L-2026-130, que todavía no se corta, y las otras 5, que ya se cortaron en el L-2026-122, quedan marcadas para Bodega: cuando Aduana reciba ese lote, esas 5 irán a Bodega y no al pedido.

## Reglas

1. **Nace con la versión** que deja piezas de más en producción, una por versión. Sale en Pendientes de Producción como «Cambio de pedido».
2. **Se aplica la más nueva:** si hay varias por aplicar del mismo pedido, «Aplicar a lotes» aplica la última y las anteriores quedan reemplazadas.
3. **Las piezas de más,** por prenda y talla, son lo que el pedido tiene en producción menos lo que le falta en la versión vigente, sin pasar de lo que sigue en producción (ver [pedidos](../ventas/pedidos.md#el-avance-la-etapa-y-la-alerta)).
4. **Cómo se quitan:** primero de las planeadas de sus lotes por cortar, el de fecha de corte más lejana primero; lo que falte, a lo que va a Bodega de sus lotes ya cortados que no han llegado a aduana, el más reciente primero, sin pasar de las cortadas − merma − lo ya marcado (ver [lotes](lotes.md#reglas)).
5. **Un lote por cortar que queda en 0** se cancela («Cambio de pedido {PE} versión {v}»); si ya tenía tela entregada, su entrega queda devuelta (ver [entregas a corte](../inventario/entregas-a-corte.md)). Una orden con todos sus lotes cancelados se cancela.
6. **Sin nada que ajustar,** queda aplicado sin renglones: «Sin ajustes».

## Estados

| De | A | Qué pasa | Quién |
|---|---|---|---|
| — | `por_aplicar` | Ventas guarda una versión con piezas de más en producción | Ventas |
| `por_aplicar` | `aplicado` | «Aplicar a lotes» | Producción |
| `por_aplicar` | `reemplazado` | Se aplicó una versión más nueva del mismo pedido | Producción |

## La tabla `cambios_pedido`

| Columna | Tipo | Nulo | Qué es |
|---|---|---|---|
| `id` | uuid | no | Llave |
| `pedido_id` | uuid | no | → `pedidos.id` |
| `pedido_version_id` | uuid | no | → `pedido_versiones.id`. Único |
| `estado` | text | no | CHECK (`por_aplicar`, `aplicado`, `reemplazado`). default `por_aplicar` |
| `aplicado_en` · `aplicado_por` | timestamptz · uuid | sí | CHECK: llenos en `aplicado` |

Lleva las columnas comunes (ver [base de datos](../../cimientos/BASE-DE-DATOS.md#columnas-comunes)). **Índices:** único (`pedido_version_id`) · (`pedido_id`, `estado`).

## La tabla `cambio_pedido_lineas`

Lo que hizo cada aplicación en cada lote y talla.

| Columna | Tipo | Nulo | Qué es |
|---|---|---|---|
| `id` | uuid | no | Llave |
| `cambio_pedido_id` | uuid | no | → `cambios_pedido.id` |
| `lote_id` | uuid | no | → `lotes.id` |
| `variante_id` | uuid | no | → `variantes.id`. Único con `cambio_pedido_id` y `lote_id` |
| `piezas_restadas` | integer | no | default 0. CHECK ≥ 0. Quitadas de las planeadas de un lote por cortar |
| `piezas_a_bodega` | integer | no | default 0. CHECK ≥ 0. Sumadas a lo que va a Bodega de un lote ya cortado |

Lleva las columnas comunes. **CHECK:** restadas + a bodega > 0. **Índice:** (`lote_id`).

## Acciones

### `produccion.aplicar_cambio_pedido`

| | |
|---|---|
| **Pantalla** | Producción · Pendientes · «Cambio de pedido» · «Aplicar a lotes» |
| **Quién** | Producción |
| **Recibe** | `cambio_pedido_id` · `version` |
| **Reglas y errores** | `422 cambio_ya_aplicado`: «Ese cambio ya se aplicó.» (aplicado o reemplazado)<br>Si hay uno más nuevo por aplicar del mismo pedido, se aplica ese (regla 2) |
| **Escribe** | Por prenda y talla, lo de las reglas 3 a 6 en `lote_tallas` (cada lote sube su versión), los lotes y las órdenes cancelados, y los renglones del cambio. El cambio, `aplicado`, con quién y cuándo; los anteriores, `reemplazado` |
| **Llama** | `ventas.avance_pedido` · `inventario.devolver_entrega_corte`, si un lote cancelado tenía tela entregada · `inventario.recalcular_rollos_sugeridos` |
| **Regresa** | La versión que se aplicó. «{PE} versión {v} aplicada en producción», o «Sin ajustes» |
| **Eventos** | `cambio_pedido.aplicado` · `lote.cancelado` y `orden_produccion.cancelada`, si aplican |
| **Bitácora** | «Aplicó la versión {v} del pedido {PE}: {detalle}», con las planeadas y lo que va a Bodega de cada lote y talla tocados y los estados de lotes y órdenes en `antes` y `despues` |

## Acciones internas

### `produccion.crear_cambio_pedido`

| | |
|---|---|
| **La llama** | `ventas.guardar_version_pedido`, cuando la versión deja piezas de más en producción |
| **Recibe** | `pedido_id` · `pedido_version_id` |
| **Escribe** | El cambio, `por_aplicar` |
| **Eventos** | `cambio_pedido.creado`: sale en Pendientes de Producción |

La bitácora es el renglón de la versión del pedido.

## Parámetros

Ninguno propio.

## Permisos

- Aplicar: Producción. El cambio no muestra precios.

## Eventos

`cambio_pedido.creado` · `cambio_pedido.aplicado` · `lote.cancelado` · `orden_produccion.cancelada`.

## Lo que llega después

- **Fase 19:** «Cambio de pedido» en Pendientes de Producción, con lo que se va a restar y a mandar a Bodega antes de aplicarlo.

## Cómo está hecho

**Fase 16, parte 3.** En `modulos/produccion/`:

- **Las tablas** `cambios_pedido` y `cambio_pedido_lineas` (`tablas.ts`, migración `0056`), con sus CHECK; `cambio_pedido_lineas` solo crece. Las leen Producción, Ventas y Dirección.
- **`produccion.crear_cambio_pedido`** (interna, `acciones/cambios.ts`): la llama `ventas.guardar_version_pedido` cuando la versión deja piezas de más en producción; un cambio por versión (regla 1).
- **`produccion.aplicar_cambio_pedido`** (`acciones/cambios.ts`, contrato en `packages/compartido/src/contratos/produccion/cambios.ts`): toma la versión del cambio, aplica el más nuevo del pedido y deja `reemplazado` a los demás (regla 2; `cambio_ya_aplicado` si ya no está por aplicar). Lo de más sale de `ventas.avance_pedido` (`de_mas`). Bloquea los lotes del pedido en orden de id y quita primero de las planeadas de sus lotes por cortar, el de corte más lejano primero, y lo que falte lo marca para Bodega en sus lotes ya cortados, el más reciente primero, sin pasar de cortadas − merma − lo ya marcado (regla 4). El lote por cortar que queda en 0 se cancela, con su entrega devuelta (`inventario.devolver_entrega_corte`) si tenía tela, y su orden si ya no tiene lotes vivos (regla 5). Al final recalcula los rollos sugeridos. Cada lote tocado sube su versión.
- **Pruebas:** `acciones/aplicar-cambio-pedido.prueba.ts` (aplicar la vieja aplica la nueva y resta del lote por cortar; el lote en 0 se cancela con su orden; de un lote cortado, lo de más va a Bodega sin pasar de lo cortado − merma) y, en `modulos/ventas/acciones/guardar-version-pedido.prueba.ts`, el cambio que nace con la versión. Cómo se reparte en Aduana lo marcado para Bodega está en [recepción del taller](../inventario/recepcion-del-taller.md#cómo-está-hecho).
