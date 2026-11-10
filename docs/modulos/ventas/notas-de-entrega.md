# Notas de entrega

> **Qué cubre:** la nota de entrega NV- con que sale de aduana lo listo de un pedido: armarla con el precio del pedido y su anticipo, cancelarla antes de que salga, su paso a en camino cuando Aduana la despacha, confirmar la entrega con quién firmó, y pasar a bodega lo listo que el cliente ya no quiere.
> **Estado:** Decidido.
> **Se construye en:** [fase 16](../../fases/16-ventas-a-externos.md).
> **Se conecta con:** [pedidos](pedidos.md) · [notas de crédito](notas-de-credito.md) · [clientes](clientes.md) · [reservas](../inventario/reservas.md) · [surtido y despachos](../inventario/surtido-y-despachos.md) · [entregas y devoluciones de clientes](../inventario/entregas-y-devoluciones-de-clientes.md) · [anticipos](../contaduria/anticipos.md) · [cuentas por cobrar](../contaduria/cuentas-por-cobrar.md) · [configuración](../admin/configuracion.md) · [folios](../admin/folios.md) · [pantallas de Ventas](../../interfaz/fabrica/ventas.md) · [pantallas de Aduana](../../interfaz/fabrica/aduana.md) · [reclamos y devoluciones](../calidad/reclamos-y-devoluciones.md) · [pagos y saldo a favor](../contaduria/pagos-y-saldo-a-favor.md) · [libro de movimientos](../inventario/libro-de-movimientos.md) · [hojas](../../impresos/hojas.md)

## Para qué sirve

Nada sale a un cliente externo sin su nota. Ejemplo: del PE-0145 hay 60 playeras listas en aduana. Ventas arma la NV-0151 con esas 60 al precio del pedido: $18,400, menos $5,000 del anticipo. Aduana la despacha con el D-0412 y la nota pasa a en camino. Cuando el cliente firma, Ventas (o Aduana) confirma la entrega con quién recibió: las piezas salen del inventario, Contaduría ya la cobra y el pedido sigue con lo que falta.

## Reglas

1. **Solo lo listo en aduana sin nota,** del pedido y por talla, sin pasar de lo que hay. La nota copia el precio del renglón vigente del pedido y no cambia de precio.
2. **El anticipo** se descuenta al armarla: lo menor entre el disponible del pedido y el subtotal (ver [anticipos](../contaduria/anticipos.md)).
3. **Nota i de n:** cada nota del pedido lleva su número, que no se reusa aunque se cancele.
4. **Se cancela solo antes de salir de aduana,** con motivo: sus piezas regresan a lo listo del pedido y su anticipo regresa al pedido.
5. **Aduana la despacha** como cualquier otro traspaso y la nota pasa a en camino (ver [surtido y despachos](../inventario/surtido-y-despachos.md)). Sin nota no sale nada a un cliente externo.
6. **Confirmar la entrega** pide quién recibió, de `ventas.largo_minimo_quien_recibio` (3) letras o más: las piezas salen de Tránsito, nace su cuenta por cobrar (ver [cuentas por cobrar](../contaduria/cuentas-por-cobrar.md)) y el pedido queda entregado si ya cubre lo pedido. Una nota entregada no cambia: se corrige con una nota de crédito.
7. **Pasar a bodega** lo listo que el cliente ya no quiere baja esas piezas del pedido en una versión nueva, `pasar_a_bodega`, y las manda a Bodega.
8. **Solo quien ve precios** recibe los importes: a Aduana nunca le viajan.

## Estados

| De | A | Qué pasa | Quién |
|---|---|---|---|
| — | `por_despachar` | «Crear nota {NV}» | Ventas |
| `por_despachar` | `cancelada` | «Cancelar nota», con motivo | Ventas |
| `por_despachar` | `en_camino` | Aduana la despacha | Aduana |
| `en_camino` | `entregada` | «Confirmar entrega», con quién recibió | Ventas o Aduana |

`entregada` y `cancelada` son finales.

## La tabla `notas_entrega`

| Columna | Tipo | Nulo | Qué es |
|---|---|---|---|
| `id` | uuid | no | Llave |
| `folio` | text | no | NV-0151 (contador `nota_entrega`). Único |
| `pedido_id` | uuid | no | → `pedidos.id` |
| `cliente_id` | uuid | no | → `clientes.id`, el del pedido |
| `numero_en_pedido` | integer | no | La «i» de «nota i de n». Único con `pedido_id` |
| `estado` | text | no | CHECK (`por_despachar`, `en_camino`, `entregada`, `cancelada`) |
| `subtotal_centavos` | bigint | no | Lo de sus renglones, fijo desde que nace |
| `anticipo_aplicado_centavos` | bigint | no | default 0. CHECK de 0 al subtotal (regla 2). Deja de contar si se cancela |
| `despacho_id` · `despachado_en` | uuid · timestamptz | sí | El D- y cuándo salió. CHECK: llenos en `en_camino` y `entregada` |
| `fecha_entrega` · `entregada_en` · `recibio_nombre` · `entregada_por` | | sí | El día en que firmó el cliente, cuándo se confirmó, quién recibió y quién confirmó. CHECK: llenos en `entregada` |
| `cancelado_en` · `cancelado_por` · `motivo_cancelacion` | | sí | CHECK: llenos en `cancelada` |

Lleva las columnas comunes (ver [base de datos](../../cimientos/BASE-DE-DATOS.md#columnas-comunes)); `creado_por` es quien la armó. **Índices:** único (`folio`) · único (`pedido_id`, `numero_en_pedido`) · (`estado`) donde no es final · (`despacho_id`). Con esta tabla dejan su `@llavePendiente` las columnas que apuntan a las notas (en traspasos, reservas, anticipos, pagos, cuentas por cobrar y reclamos).

## La tabla `nota_entrega_lineas`

| Columna | Tipo | Nulo | Qué es |
|---|---|---|---|
| `id` | uuid | no | Llave |
| `nota_entrega_id` | uuid | no | → `notas_entrega.id` |
| `pedido_renglon_id` | uuid | no | → `pedido_renglones.id`: el vigente al armarla, de donde sale el precio |
| `variante_id` | uuid | no | → `variantes.id`. Único con `nota_entrega_id` |
| `cantidad` | integer | no | CHECK > 0 |
| `precio_unitario_centavos` | bigint | no | Copia del renglón del pedido |

Lleva las columnas comunes. **Índice:** (`variante_id`).

## Acciones

Todas son de la web, con el departamento Ventas; «Confirmar entrega», también con Aduana.

### `ventas.armar_nota_entrega`

| | |
|---|---|
| **Pantalla** | Cajón «Armar nota de entrega» · «Crear nota {NV}» |
| **Recibe** | `pedido_id` · `version` · `renglones`: `variante_id` y `cantidad` |
| **Reglas y errores** | `400`: «Escoge al menos una pieza.» · «Número entero»<br>`422 pedido_no_confirmado`, como en el pedido<br>`422 nada_listo` y `sin_listo`, de Inventario: «Nada listo en aduana para este pedido» · «Solo hay {n} listas de {prenda} talla {t}» |
| **Escribe** | La nota, `por_despachar`, con su número en el pedido, su subtotal y su anticipo (regla 2); sus renglones con el precio del pedido |
| **Llama** | `admin.tomar_folio` (`nota_entrega`) · `inventario.apartar_para_nota` · `contaduria.anticipo_del_pedido` y, si hay anticipo, `contaduria.aplicar_anticipo_a_nota` |
| **Regresa** | La nota y lo que queda por cobrar. «{NV} lista: {n} piezas por despachar en aduana» |
| **Eventos** | `nota_entrega.creada`: en vivo a Aduana |
| **Bitácora** | «{persona} armó la nota {NV} con {n} piezas» |

### `ventas.cancelar_nota_entrega`

| | |
|---|---|
| **Pantalla** | Cajón Nota de entrega (por despachar) · «Cancelar nota» → ventana con «Motivo» |
| **Recibe** | `nota_id` · `motivo` · `version` |
| **Reglas y errores** | `400`: «Escribe al menos {n} letras.»<br>`422 nota_ya_salio`: «{NV} ya salió de aduana: no se puede cancelar.» |
| **Escribe** | La nota, `cancelada`, con quién, cuándo y su motivo |
| **Llama** | `inventario.devolver_de_nota` · `contaduria.regresar_anticipo_a_pedido` |
| **Regresa** | «{NV} cancelada: sus piezas regresan a lo listo del pedido {PE}» |
| **Eventos** | `nota_entrega.cancelada`: en vivo a Aduana |
| **Bitácora** | «{persona} canceló la nota {NV}: {motivo}» |

### `ventas.confirmar_entrega`

| | |
|---|---|
| **Pantalla** | Ventas · Pendientes o cajón Nota de entrega · «Confirmar entrega»; Aduana · En tránsito · «Confirmar entrega» → ventana «Confirmar entrega de {NV}» |
| **Quién** | Ventas o Aduana |
| **Recibe** | `nota_id` · `recibio_nombre` (de 3 a 60) · `version` |
| **Reglas y errores** | `400`: «Escribe quién recibió»<br>`422 nota_no_en_camino`: «{NV} no ha salido de aduana: primero se despacha.»<br>`422 nota_ya_entregada`: «{NV} ya está entregada.» |
| **Escribe** | La nota, `entregada`, con la fecha de hoy, quién recibió y quién confirmó. El pedido, `entregado`, si ya cubre lo pedido |
| **Llama** | `inventario.entregar_a_cliente_externo` · `contaduria.crear_cuenta_por_cobrar`, con la nota, el pedido, el cliente, la fecha, los días de crédito del pedido y el subtotal · si el pedido quedó entregado, `contaduria.pasar_anticipo_a_favor` |
| **Regresa** | Si el pedido quedó entregado y, solo a quien ve precios, el importe por cobrar. «{NV} entregada a {cliente}. Contaduría ya la cobra» |
| **Eventos** | `nota_entrega.entregada` · `pedido.entregado`, si aplica |
| **Bitácora** | «Entregada a {cliente}: {n} piezas, recibió {nombre}», del departamento desde donde se confirmó, con el importe y el vencimiento de la cuenta por cobrar en `despues` |

### `ventas.pasar_a_bodega`

| | |
|---|---|
| **Pantalla** | Cajón Pedido · «Pasar a bodega» (pantalla nueva): lo listo en aduana que el cliente ya no quiere |
| **Recibe** | `pedido_id` · `version` · `renglones`: `variante_id` y `piezas` · `motivo` |
| **Reglas y errores** | `400`: «Escribe al menos {n} letras.»<br>`422 piezas_de_mas`: «{prenda} talla {t}: hay {n} listas en aduana sin nota.»<br>`422 pedido_no_confirmado`, como en el pedido |
| **Escribe** | Una versión nueva del pedido, `pasar_a_bodega`, en la que esas tallas bajan esas piezas, como al guardar una versión (ver [pedidos](pedidos.md)); el pedido, `entregado`, si ya cubre lo pedido |
| **Llama** | `inventario.pasar_a_bodega`, solo esas piezas |
| **Regresa** | El número de versión. «{n} piezas de {PE} regresan a bodega. El pedido pasa a la versión {v}» |
| **Eventos** | `pedido.version_guardada` |
| **Bitácora** | «{persona} pasó a bodega {n} piezas de {PE}: {motivo}» |

## Acciones internas

### `ventas.marcar_nota_en_camino`

| | |
|---|---|
| **La llama** | `inventario.despachar`, al despachar a un cliente externo (ver [surtido y despachos](../inventario/surtido-y-despachos.md)) |
| **Recibe** | `nota_entrega_id` · `despacho_id` · `despachado_en` |
| **Reglas** | `422 nota_no_por_despachar`: «{NV} no está por despachar.» |
| **Escribe** | La nota, `en_camino`, con su D- y la hora |
| **Eventos** | `nota_entrega.despachada` |

La bitácora es el renglón del despacho.

## Parámetros

Los cambia solo la dueña, en Configuración (ver [configuración](../admin/configuracion.md)). Va en «Parámetros».

| Parámetro | Valor inicial | Para qué |
|---|---|---|
| `ventas.largo_minimo_quien_recibio` | 3 letras | Lo menos que lleva «quién recibió» al confirmar una entrega |

## Permisos

- Armar, cancelar y pasar a bodega: Ventas. Confirmar la entrega: Ventas o Aduana.
- Aduana ve la nota sin precios ni importes.

## Eventos

`nota_entrega.creada` · `nota_entrega.cancelada` · `nota_entrega.despachada` · `nota_entrega.entregada`.

## Lo que llega después

- **Fase 19:** el cajón «Armar nota de entrega», el cajón de la nota, «Confirmar entrega» en Ventas y en Aduana, y «Pasar a bodega».
- **Fase 20:** la hoja de la nota de entrega que viaja con el despacho.

## Cómo está hecho

*Lo escribe Claude Code al terminar la fase 16.*
