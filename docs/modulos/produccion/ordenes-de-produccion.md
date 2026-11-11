# Órdenes de producción

> **Qué cubre:** la orden OP- que manda fabricar: de un pedido de Ventas, de temporada, para una tienda o desde una sugerencia de Bodega; cómo nacen sus lotes con sus fechas de corte y de entrega, y qué le pasa cuando el pedido crece, cambia de fecha o se cancela.
> **Estado:** Decidido.
> **Se construye en:** [fase 12](../../fases/12-produccion.md).
> **Se conecta con:** [lotes](lotes.md) · [corte y bultos](corte-y-bultos.md) · [entregas a corte](../inventario/entregas-a-corte.md) · [mínimos y reabasto](../inventario/minimos-y-reabasto.md) · [mandar a producción](../ventas/mandar-a-produccion.md) · [cambios a pedido](cambios-a-pedido.md) · [pedidos](../ventas/pedidos.md) · [folios](../admin/folios.md) · [pantallas de Producción](../../interfaz/fabrica/produccion.md) · [pantallas de Bodega](../../interfaz/fabrica/bodega.md)

## Para qué sirve

La orden de producción manda fabricar y agrupa los lotes que nacen con ella. No pide autorización, y siempre queda quién la mandó. Ejemplo de la muestra: Ventas manda a producción el PE-0149 de Distribuidora Escolar Zamora y nace la OP-2026-064 con el lote L-2026-122, por cortar en dos días. Otro ejemplo: la OP-2026-062 es de temporada, «Plan de regreso a clases 2027, primera tanda», con tres lotes para Bodega; y la OP-2026-060 la levantó Producción desde una sugerencia de Bodega: «Bodega sugirió: Tienda 2 con 4 tallas en cero».

## Reglas

1. **Cada orden tiene un motivo,** y con él nacen sus lotes por cortar:

   | Motivo | Nace con | Sus lotes | Fecha de corte | Entrega |
   |---|---|---|---|---|
   | `cliente_externo` | Ventas manda a producción un pedido | Uno por prenda, destino el pedido | Hoy + `produccion.dias_corte_lote_nuevo` (2) | La del pedido |
   | `temporada` | «Nueva orden de producción» para Bodega, o una sugerencia de Bodega para Bodega | Uno, destino temporada | La menor entre hoy + `produccion.orden_corte_dias` (4) y la entrega | La que se escribe («Para cuándo» propone hoy + `produccion.orden_entrega_temporada_dias`, 21); de una sugerencia, hoy + 21 |
   | `reabasto` | «Nueva orden de producción» para una tienda, o una sugerencia de Bodega para una tienda | Uno, destino la tienda | Como en temporada | La que se escribe; de una sugerencia, hoy + `produccion.orden_entrega_tienda_dias` (14) |
   | `pedido_especial` | Un pedido especial de una tienda (con el POS) | Uno por prenda del pedido, destino la tienda | Hoy + `produccion.dias_corte_lote_nuevo` | La del pedido especial |

2. **Las piezas que Ventas agrega** a un pedido ya mandado se suman al lote por cortar de esa prenda y ese pedido que no tiene tela entregada; si no hay, nace otra orden con su lote.
3. **Desde una sugerencia de Bodega** se juntan las sugerencias por decidir de una prenda y una ubicación, y cada talla se redondea hacia arriba al múltiplo de `produccion.orden_multiplo_piezas` (5): 13 piezas son 15.
4. **Una prenda que no se fabrica** (dada de baja, un servicio o sin flujo) no entra a una orden. Una sin receta sí entra, con el aviso «Falta la receta: no se corta hasta que Patronaje la capture».
5. **Una talla descontinuada no se fabrica,** y una talla tiene que ser de esa prenda.
6. **Cancelada:** la orden pasa sola a cancelada cuando todos sus lotes quedan cancelados por cambios de pedido. Si Ventas cancela el pedido, la orden conserva su motivo y su pedido, para el historial, y sus lotes pasan a temporada. Lo mismo si una tienda cancela su pedido especial antes de recibirlo (con el POS).
7. **Cambiar la entrega de un pedido** cambia la fecha de entrega de sus órdenes y de sus lotes que no están en aduana ni cancelados; la fecha de corte no cambia.
8. **Al nacer o crecer un lote** se recalculan los rollos sugeridos de su tela (ver [entregas a corte](../inventario/entregas-a-corte.md)).

## Estados

| De | A | Qué pasa | Quién |
|---|---|---|---|
| — | `abierta` | Nace | Producción; Ventas |
| `abierta` | `cancelada` | Todos sus lotes quedaron cancelados | El sistema |

El estado de su tarjeta (atrasado, en riesgo, por cortar, en aduana, listo para entregar) se calcula con sus lotes.

## La tabla `ordenes_produccion`

| Columna | Tipo | Nulo | Qué es |
|---|---|---|---|
| `id` | uuid | no | Llave (v7) |
| `folio` | text | no | OP-2026-064. Único |
| `motivo` | text | no | CHECK (`cliente_externo`, `temporada`, `reabasto`, `pedido_especial`) |
| `pedido_id` · `pedido_version_id` | uuid | sí | → `pedidos.id` · `pedido_versiones.id`: el pedido y la versión con que Ventas lo mandó. CHECK: el pedido, lleno con `cliente_externo` |
| `ubicacion_destino_id` | uuid | sí | → `ubicaciones.id`: la tienda o Bodega. CHECK: lleno con `temporada`, `reabasto` y `pedido_especial` |
| `pedido_especial_tienda_id` | uuid | sí | → `pedidos_especiales_tienda.id`. Único. CHECK: lleno solo con `pedido_especial` |
| `referencia` | text | sí | «Bodega sugirió: {ubicación} sin {prenda} {tallas}», o el motivo que se escribió (hasta 120) |
| `fecha` | date | no | El día en que se levantó |
| `fecha_entrega` | date | no | «Para cuándo». CHECK: no antes de `fecha` |
| `estado` | text | no | CHECK (`abierta`, `cancelada`). default `abierta` |
| `cancelado_en` · `cancelado_por` · `motivo_cancelacion` | | sí | `cancelado_por` vacío: la canceló el sistema |

Lleva las columnas comunes; `creado_por` es quien la mandó y nunca va vacío (ver [base de datos](../../cimientos/BASE-DE-DATOS.md#columnas-comunes)). **Índices:** único (`folio`) · (`pedido_id`) · (`motivo`, `estado`). `pedido_id` y `pedido_version_id` llevan su `@llavePendiente` hasta la fase 16, y `pedido_especial_tienda_id`, hasta el POS.

## Acciones

Todas son de la web, con el departamento Producción.

### `produccion.crear_orden`

| | |
|---|---|
| **Pantalla** | Producción · Órdenes de producción · «Nueva orden de producción» → ventana · «Levantar orden» |
| **Recibe** | `ubicacion_destino_id` («Para»: Bodega es temporada; una tienda, reabasto) · `producto_id` · `tallas`: por talla, `variante_id` y `piezas` (≥ 0) · `fecha_entrega` · `motivo`, opcional, hasta 120 |
| **Reglas y errores** | `400`: «Escoge la prenda.» · «Pon las piezas por talla.» (todas en 0) · «Esa talla no es de {prenda}.» · «¿Para cuándo?»<br>`422 prenda_no_se_fabrica`: «{prenda} no pasa por el taller.»<br>`422 talla_descontinuada`: «La talla {t} ya no se fabrica.»<br>`422 fecha_pasada`: «La fecha no puede ser antes de hoy.»<br>`422 destino_no_valido`: «Escoge para quién es: temporada o una tienda.» |
| **Escribe** | La orden (`temporada` o `reabasto`, con la fecha de hoy y el motivo escrito como referencia) y su lote por cortar, con su fecha de corte y sus tallas con piezas (las tallas en 0 no se guardan). Ningún movimiento ni reserva |
| **Llama** | `admin.tomar_folio`, tipos `orden_produccion` y `lote` · `inventario.recalcular_rollos_sugeridos` |
| **Regresa** | La orden y el lote. «{OP} levantada: {L}, {n} piezas por cortar» y, sin receta, «. Falta la receta: no se corta hasta que Patronaje la capture» |
| **Eventos** | `orden_produccion.creada` · `lote.creado` |
| **Bitácora** | «Levantó {OP} para {destino}: {prenda}, {n} piezas», con la orden, el lote y las tallas en `despues` |

### `produccion.levantar_orden_sugerencia`

Se construye en la [fase 14](../../fases/14-inventario-recepcion-del-taller-conteos-ajustes-y-reabasto.md), con las sugerencias de reabasto de Bodega.

| | |
|---|---|
| **Pantalla** | Producción · Pendientes («Sugerencia de bodega») y Órdenes de producción («Bodega sugiere fabricar») · «Levantar orden» |
| **Recibe** | `sugerencia_ids`: las sugerencias por decidir de una prenda y una ubicación |
| **Reglas y errores** | `422 sugerencia_ya_decidida`: «Esa sugerencia ya se levantó: {OP}.»<br>`400 sugerencias_mezcladas`: «Las sugerencias deben ser de una prenda y una ubicación.»<br>`422 prenda_no_se_fabrica`, como arriba. El aviso sin receta, como arriba |
| **Escribe** | La orden (`reabasto` para una tienda, `temporada` para Bodega) con su referencia y su entrega (regla 1), y su lote por cortar con las tallas redondeadas (regla 3) |
| **Llama** | `inventario.sugerencias_de_fabricar`: la prenda, la ubicación y las piezas por talla de las sugerencias · `admin.tomar_folio` · `inventario.decidir_sugerencia`: las sugerencias quedan levantadas, con su orden y su lote · `inventario.recalcular_rollos_sugeridos` |
| **Regresa** | La orden y el lote. «{OP} levantada: {L}, {n} piezas por cortar» |
| **Eventos** | `orden_produccion.creada` · `lote.creado` |
| **Bitácora** | «Levantó {OP} desde la sugerencia de Bodega: {ubicación}, {prenda}, {n} piezas», con las sugerencias en `despues` |

## Acciones internas

### `produccion.mandar_a_produccion`

| | |
|---|---|
| **La llama** | Ventas: «Confirmar y mandar», «Mandar a producción» y «Guardar y mandar a producción» (ver [mandar a producción](../ventas/mandar-a-produccion.md)) |
| **Recibe** | `pedido_id` · `pedido_version_id` · `fecha_entrega` · `renglones`: `variante_id` y `piezas` · la cuenta de Ventas |
| **Escribe** | Por prenda: suma las piezas al lote por cortar de ese pedido y esa prenda que no tiene tela entregada, y crea la talla si no la tenía; si no hay, una sola orden `cliente_externo` para el pedido, con un lote por prenda (regla 1). `creado_por` es la cuenta de Ventas |
| **Llama** | `admin.tomar_folio` · `inventario.lotes_con_tela_entregada` · `inventario.recalcular_rollos_sugeridos` |
| **Regresa** | La orden y cada lote, nuevo o sumado, con el aviso «Falta la receta…» por cada prenda sin receta |
| **Eventos** | `orden_produccion.creada` · `lote.creado` · `lote.piezas_sumadas` |

### `produccion.pasar_pedido_a_temporada`

| | |
|---|---|
| **La llama** | Ventas, al cancelar un pedido |
| **Recibe** | `pedido_id` |
| **Escribe** | Sus lotes que no han llegado a aduana ni están cancelados: destino `temporada`, Bodega como destino y `paso_a_temporada_en`. Conservan su pedido, y su orden, su motivo |
| **Eventos** | `lote.paso_a_temporada` |

### `produccion.cambiar_fecha_entrega_pedido`

| | |
|---|---|
| **La llama** | Ventas, al guardar una versión del pedido con otra fecha de entrega |
| **Recibe** | `pedido_id` · `fecha_entrega` |
| **Escribe** | La fecha en las órdenes del pedido y en sus lotes que no están en aduana ni cancelados. La fecha de corte no cambia |
| **Eventos** | `lote.fecha_cambiada` |

## Parámetros

Los cambia solo la dueña, en Configuración (ver [configuración](../admin/configuracion.md)). Todos van en «Parámetros».

| Parámetro | Valor inicial | Para qué |
|---|---|---|
| `produccion.dias_corte_lote_nuevo` | 2 días | La fecha de corte de un lote de un pedido, de piezas agregadas o de un pedido especial |
| `produccion.orden_corte_dias` | 4 días | La fecha de corte de una «Nueva orden de producción» o de una sugerencia |
| `produccion.orden_entrega_tienda_dias` | 14 días | La entrega de una sugerencia para una tienda |
| `produccion.orden_entrega_temporada_dias` | 21 días | La entrega de una sugerencia para Bodega, y el «Para cuándo» que propone «Nueva orden de producción» |
| `produccion.orden_multiplo_piezas` | 5 piezas | El múltiplo al que se redondea cada talla de una sugerencia |

## Permisos

- Levantar órdenes: Producción. Mandar un pedido a producción: Ventas, con su propia acción.
- La orden no lleva dinero.

## Eventos

`orden_produccion.creada` · `orden_produccion.cancelada`, y los de sus lotes (ver [lotes](lotes.md#eventos)).

## Lo que llega después

- **Fase 14:** `produccion.levantar_orden_sugerencia`, con las sugerencias de Bodega (ver [mínimos y reabasto](../inventario/minimos-y-reabasto.md)).
- **Fase 16:** Ventas llama las tres internas; los cambios de pedido restan piezas o cancelan un lote, y al cancelar el pedido sus cambios por aplicar quedan reemplazados (ver [cambios a pedido](cambios-a-pedido.md)).
- **Con el POS:** la orden de un pedido especial de tienda.

## Cómo está hecho

**Fase 12, parte 2.**

- **La tabla** `ordenes_produccion` es de `produccion` (`tablas.ts`, migración `0039`), con sus CHECK: el motivo, el pedido lleno solo con `cliente_externo`, el destino con temporada, reabasto y pedido especial, la entrega no antes de la fecha y `creado_por` siempre lleno. `pedido_id`, `pedido_version_id` y `pedido_especial_tienda_id` llevan su `@llavePendiente`.
- **`produccion.crear_orden`** (`acciones/ordenes.ts`, contrato en `packages/compartido/src/contratos/produccion/ordenes.ts`): Bodega es temporada y una tienda, reabasto; la fecha de corte es la menor entre hoy + `produccion.orden_corte_dias` y la entrega. Lo común con las internas está en `dominio/lotes.ts`: la prenda que se fabrica (activa, sin ser servicio, con flujo; leída con `FOR SHARE`), sus tallas (de la prenda, ni descontinuadas ni dadas de baja), y la orden y el lote que nacen con sus folios y sus eventos. Sin receta, el mensaje sigue con «. Falta la receta…».
- **Las internas** (`internas/lotes.ts`): `mandar_a_produccion` suma por prenda al lote por cortar del pedido (la talla nueva nace) o abre una orden `cliente_externo` con un lote por prenda, corte en hoy + `produccion.dias_corte_lote_nuevo`; `pasar_pedido_a_temporada` y `cambiar_fecha_entrega_pedido`, como dicen sus reglas. Saber si un lote ya tiene tela entregada y recalcular los rollos sugeridos llegan con las entregas a corte, en la parte 3 (decisión 596).
- **Los parámetros** de la orden están en `parametros.ts`.
- **Pruebas:** `acciones/crear-orden.prueba.ts`, `internas/mandar-a-produccion.prueba.ts` (también lo que el pedido tiene en producción y los lotes por cortar) e `internas/pasar-pedido-a-temporada.prueba.ts`.
