# Reclamos y devoluciones

> **Qué cubre:** lo que regresa del cliente: el reclamo RC-, que va del código de la prenda al lote, la operación, la persona y la partida de tela; y la revisión de una devolución con defecto, que decide si sirve y pasa a Bodega o es merma.
> **Estado:** Decidido.
> **Se construye en:** [fase 13](../../fases/13-calidad-y-mantenimiento.md).
> **Se conecta con:** [revisión de lotes](revision-de-lotes.md) · [lotes](../produccion/lotes.md) · [registros de operación](../produccion/registros-de-operacion.md) · [corte y bultos](../produccion/corte-y-bultos.md) · [variantes, códigos y etiquetas](../catalogo/variantes-codigos-y-etiquetas.md) · [entregas y devoluciones de clientes](../inventario/entregas-y-devoluciones-de-clientes.md) · [recepciones en aduana](../inventario/recepciones-en-aduana.md) · [traspasos](../inventario/traspasos.md) · [clientes](../ventas/clientes.md) · [notas de entrega](../ventas/notas-de-entrega.md) · [pantallas de Calidad](../../interfaz/fabrica/calidad.md) · [notas de crédito](../ventas/notas-de-credito.md)

## Para qué sirve

Cuando una prenda regresa mal, Calidad sabe de dónde salió y quién la hizo. Ejemplo: Distribuidora Escolar Zamora reclama 4 pantalones con la costura abierta. Con el código de la prenda, el reclamo RC-031 llega al lote L-2026-122, a la operación «Costados», a la persona que la hizo y a la partida de tela de sus rollos. Cuando se resuelve, «Marcar resuelto»: «Se repusieron las 4 piezas». Y cuando una devolución con defecto llega a aduana, Calidad decide qué sirve y pasa a Bodega y qué es merma.

## Reglas

1. **Un reclamo viene de un cliente externo o de una tienda.** El de un cliente dice qué cliente; el de una tienda, qué tienda y, si se sabe, la salida con que llegó. Los dos pueden decir la nota de entrega en que salió la prenda.
2. **Del código de la prenda al lote:** el código de 6 dígitos dice la variante; el reclamo se liga a uno de los lotes de esa variante que Calidad ya revisó (revisados o en aduana).
3. **La operación que lo causó** es una del flujo de ese lote que suele causar ese defecto. **La persona** se congela al registrar: la que se escoja o, si no, la que hizo más piezas buenas vigentes de esa operación en los bultos de esa talla del lote; si no hay registros, la de base.
4. **«Qué dice el cliente»** lleva al menos `calidad.reclamo_min_letras` (10) letras.
5. **El rastreo** se calcula, no se guarda: el lote, quién lo revisó y cuándo, la operación y su persona, los rollos del corte con su partida, su tela y su proveedor (si el lote mezcló partidas, salen todas), y en cuántos lotes se hizo esa prenda.
6. **«Marcar resuelto» no pide motivo;** la resolución es opcional y queda «Resuelto el {fecha}».
7. **Una devolución con defecto** (de una tienda, de un cliente externo con su nota de crédito o de un pedido en línea) se revisa cuando ya está en aduana: por renglón, cuántas sirven y pasan a Bodega en un traspaso hijo, y cuántas son merma, con qué tienen. No se decide más de lo que queda por decidir en cada renglón.

## Estados del reclamo

| De | A | Qué pasa | Quién |
|---|---|---|---|
| — | `por_resolver` | «Registrar reclamo» | Calidad |
| `por_resolver` | `resuelto` | «Marcar resuelto» | Calidad |

## La tabla `reclamos`

| Columna | Tipo | Nulo | Qué es |
|---|---|---|---|
| `id` | uuid | no | Llave (v7) |
| `folio` | text | no | RC-031. Único |
| `fecha` | date | no | El día del reclamo |
| `origen` | text | no | CHECK (`cliente_externo`, `tienda`). default `cliente_externo` |
| `cliente_id` | uuid | sí | → `clientes.id`. CHECK: lleno con `cliente_externo` |
| `ubicacion_id` | uuid | sí | → `ubicaciones.id`: la tienda. CHECK: lleno con `tienda` |
| `salida_tienda_id` | uuid | sí | → `salidas_tienda.id`: la salida con que llegó, si vino de una tienda |
| `nota_entrega_id` | uuid | sí | → `notas_entrega.id`, si se sabe |
| `variante_id` | uuid | no | → `variantes.id`: la del código de la prenda |
| `lote_id` | uuid | no | → `lotes.id` |
| `defecto_id` | uuid | no | → `defectos.id` |
| `flujo_operacion_id` | uuid | no | → `flujo_operaciones.id` |
| `persona_id` | uuid | sí | → `personas.id`. Congelada al registrar |
| `piezas` | integer | no | CHECK > 0 |
| `que_dice_cliente` | text | no | |
| `estado` | text | no | CHECK (`por_resolver`, `resuelto`). default `por_resolver` |
| `resuelto_en` · `resuelto_por` | timestamptz · uuid | sí | CHECK: llenos en `resuelto` |
| `resolucion` | text | sí | Hasta 200. Opcional |

Lleva las columnas comunes (ver [base de datos](../../cimientos/BASE-DE-DATOS.md#columnas-comunes)). **Índices:** único (`folio`) · (`estado`) · (`lote_id`) · (`variante_id`). `cliente_id` y `nota_entrega_id` llevan su `@llavePendiente` hasta la fase 16, y `salida_tienda_id`, hasta el POS.

## La tabla `revisiones_devolucion`

Se construye en la [fase 16](../../fases/16-ventas-a-externos.md), con las devoluciones de los clientes.

| Columna | Tipo | Nulo | Qué es |
|---|---|---|---|
| `id` | uuid | no | Llave |
| `traspaso_id` | uuid | no | → `traspasos.id`: la devolución en aduana |
| `traspaso_linea_id` | uuid | no | → `traspaso_lineas.id` |
| `origen` | text | no | CHECK (`salida_tienda`, `nota_credito`, `devolucion_linea`): sale del tipo del traspaso |
| `salida_tienda_id` · `nota_credito_id` | uuid | sí | De referencia |
| `variante_id` | uuid | no | → `variantes.id` |
| `lote_id` | uuid | sí | → `lotes.id`, si viene en el renglón |
| `piezas` | integer | no | CHECK > 0 |
| `decision` | text | no | CHECK (`sirve`, `merma`) |
| `defecto_id` | uuid | sí | → `defectos.id` |
| `motivo` | text | sí | Con qué tiene. CHECK: lleno con `merma` |
| `revisado_por` · `revisado_en` | uuid · timestamptz | no | |

Lleva las columnas comunes. **Índices:** (`traspaso_id`) · (`traspaso_linea_id`).

## Acciones

Todas son de la web, con el departamento Calidad.

### `calidad.registrar_reclamo`

| | |
|---|---|
| **Pantalla** | Calidad · Reclamos · «Nuevo reclamo» → ventana Reclamo nuevo · «Registrar reclamo» |
| **Recibe** | `origen` (`cliente_externo` o `tienda`) · `cliente_id` o `ubicacion_id`, según el origen · `salida_tienda_id` y `nota_entrega_id`, opcionales · `codigo` (6 dígitos) · `lote_id` · `defecto_id` · `flujo_operacion_id` · `persona_id`, opcional · `piezas` (≥ 1) · `que_dice_cliente` |
| **Reglas y errores** | `400`: «Escoge el cliente.» · «Escribe el código de la prenda.» · «Escoge el defecto.» · «¿Cuántas piezas?» · «Escribe lo que dice el cliente.» (menos de 10 letras)<br>`422 codigo_desconocido`: «Ese código no es de ninguna prenda.»<br>`422 sin_lotes_revisados`: «Esa prenda no tiene lotes revisados por Calidad.»<br>`422 lote_no_corresponde`: «Ese lote no tiene esa prenda revisada.»<br>`422 operacion_no_ligada`: «Esa operación no suele causar ese defecto en {prenda}.» |
| **Escribe** | El reclamo, `por_resolver`, con la fecha de hoy, la variante del código y la persona congelada (regla 3) |
| **Llama** | `catalogo.variante_por_codigo` · `produccion.persona_que_la_hizo`, si no viene la persona |
| **Regresa** | El reclamo con su rastreo. «{RC} registrado. Del código se llega al lote {L}» |
| **Eventos** | `reclamo.registrado` |
| **Bitácora** | «Registró el reclamo {RC} de {cliente o tienda}: {defecto}, {n} piezas, lote {L}» |

### `calidad.resolver_reclamo`

| | |
|---|---|
| **Pantalla** | Calidad · Reclamos · rastreo · «Marcar resuelto» |
| **Recibe** | `reclamo_id` · `version` · `resolucion`, opcional, hasta 200 |
| **Reglas y errores** | `422 reclamo_ya_resuelto`: «Ese reclamo ya está resuelto.» |
| **Escribe** | `resuelto`, con quién, cuándo y la resolución |
| **Regresa** | «{reclamo} queda resuelto» |
| **Eventos** | `reclamo.resuelto` |
| **Bitácora** | «Marcó resuelto {RC}», con la resolución |

### `calidad.revisar_devolucion`

Se construye en la [fase 16](../../fases/16-ventas-a-externos.md), con las devoluciones de los clientes.

| | |
|---|---|
| **Pantalla** | Calidad · Pendientes · «Devolución de tienda» o de cliente · «Revisar» → ventana: «Sirve: pasa a bodega» o «Es merma» |
| **Recibe** | `traspaso_id` (una devolución en aduana: `devolucion_defecto`, `devolucion_cliente_externo` o `devolucion_linea`) · `version` del traspaso · `renglones`: `traspaso_linea_id`, `piezas` (≥ 1), `decision` (`sirve` o `merma`), `defecto_id` opcional y `motivo` (obligatorio en merma) |
| **Reglas y errores** | `400`: un renglón de otro traspaso · «Escribe con qué tiene.» (merma sin motivo)<br>`422 devolucion_no_en_aduana`: «Esa devolución todavía no está en aduana.»<br>`422 piezas_mas_que_pendientes`: «En ese renglón quedan {n} piezas por revisar.» |
| **Escribe** | Una revisión por renglón y decisión |
| **Llama** | `inventario.aplicar_revision_devolucion`: lo que sirve se reparte a un hijo con destino Bodega; la merma sale con `merma_calidad`, con su motivo y su defecto (ver [entregas y devoluciones de clientes](../inventario/entregas-y-devoluciones-de-clientes.md)) |
| **Regresa** | Lo que pasó a Bodega y lo que salió como merma. «{folio}: {n} a bodega, {m} como merma» |
| **Eventos** | `devolucion.revisada` |
| **Bitácora** | «Revisó la devolución {folio}: {n} sirven, {m} merma ({motivo})», con los renglones y sus decisiones |

## Parámetros

Los cambia solo la dueña, en Configuración (ver [configuración](../admin/configuracion.md)). Todos van en «Parámetros».

| Parámetro | Valor inicial | Para qué |
|---|---|---|
| `calidad.reclamo_min_letras` | 10 letras | Lo menos que lleva «Qué dice el cliente» |

## Permisos

- Registrar y resolver reclamos y revisar devoluciones: Calidad.
- El rastreo no muestra costos ni tarifas.

## Eventos

`reclamo.registrado` · `reclamo.resuelto` · `devolucion.revisada`.

## Lo que llega después

- **Fase 16:** los clientes y las notas de entrega del reclamo; la revisión de las devoluciones de los clientes externos.
- **Con el POS:** los reclamos y las devoluciones con defecto que llegan de las tiendas. Una prenda con defecto que manda una tienda no abre un reclamo sola: al revisarla, Calidad puede abrir el RC- ya lleno con la prenda y la salida.
- **Con uniformame.mx:** las devoluciones con defecto de los pedidos en línea.

## Cómo está hecho

*Lo escribe Claude Code al terminar la fase 13.*
