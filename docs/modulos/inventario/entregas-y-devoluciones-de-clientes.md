# Entregas y devoluciones de clientes

> **Qué cubre:** lo que Inventario hace por un pedido externo: pasar a bodega lo listo que el cliente ya no quiere, sacar del inventario lo que el cliente firmó de recibido, esperar las piezas que regresan con una nota de crédito y aplicar lo que Calidad decide de ellas.
> **Estado:** Decidido.
> **Se construye en:** [fase 16](../../fases/16-ventas-a-externos.md).
> **Se conecta con:** [traspasos](traspasos.md) · [reservas](reservas.md) · [libro de movimientos](libro-de-movimientos.md) · [recepciones en aduana](recepciones-en-aduana.md) · [surtido y despachos](surtido-y-despachos.md) · [notas de entrega](../ventas/notas-de-entrega.md) · [notas de crédito](../ventas/notas-de-credito.md) · [pedidos](../ventas/pedidos.md) · [reclamos y devoluciones](../calidad/reclamos-y-devoluciones.md) · [pedidos en línea](../linea/pedidos-en-linea.md) · [pantallas de Aduana](../../interfaz/fabrica/aduana.md) · [pantallas de Bodega](../../interfaz/fabrica/bodega.md) · [pantallas de Calidad](../../interfaz/fabrica/calidad.md)

## Para qué sirve

Lo de un cliente externo entra y sale del inventario con su papel. Ejemplo: la NV-0151 va en tránsito con el D-0412; el cliente firma y, al confirmar la entrega, sus 60 piezas salen de Tránsito. Días después Dirección autoriza la NC-0012 con 4 pantalones que regresan: nace un A- `esperado` que todavía no es inventario. Cuando llegan, Aduana dice cuáles traen defecto; Calidad revisa esos 4: 3 sirven y pasan a Bodega en un hijo, y 1 es merma y sale.

## Reglas

1. **Pasar a bodega no mueve:** lo listo en aduana del pedido se reparte en hijos `quitado_de_pedido` con destino Bodega, y sus reservas se liberan (`quitada_del_pedido`). Aduana lo despacha a Bodega como cualquier otro.
2. **Entregar saca del inventario** lo que el cliente firmó: las piezas de la nota pasan de Tránsito a Fuera, con la recepción `entrega_cliente` y quién recibió; su despacho y sus traspasos quedan recibidos y sus reservas, cumplidas.
3. **Lo que regresa no es inventario** hasta que Aduana lo recibe: espera en un A- `esperado`, de cliente externo y sin destino, con su nota de crédito. Al recibirlo, Aduana dice qué llegó con defecto: lo bueno pasa a Bodega en un hijo, y lo de defecto se queda en aduana para Calidad (ver [recepciones en aduana](recepciones-en-aduana.md#reglas)).
4. **Lo que decide Calidad** se aplica por renglón: lo que sirve se reparte en un hijo del mismo tipo con destino Bodega; la merma, en un hijo con destino merma, que sale con `merma_calidad`. Nada por encima de lo que queda sin decidir. El padre queda repartido cuando ya no le queda nada.

## Acciones

### `inventario.no_la_encuentro`

| | |
|---|---|
| **Pantalla** | Bodega · Pendientes · en un pedido externo o en línea · «No la encuentro» |
| **Quién** | Bodega, con una reserva en Bodega |
| **Recibe** | `reserva_id` · `nota`, opcional |
| **Reglas y errores** | `422 reserva_no_activa`: «Esa pieza ya no está apartada aquí.» (la reserva tiene que estar activa en Bodega y ser de un pedido externo o, desde la fase 18, de un W-) |
| **Escribe** | Una DF- `no_la_encontro`, `por_contar`, en Bodega, por esas piezas en negativo y con lo que decía el sistema (ver [diferencias, ajustes y mermas](diferencias-ajustes-y-mermas.md)). La reserva, `liberada`, con `no_la_encontro` y la nota: esas piezas vuelven a lo que falta mandar del pedido. Con un W- (fase 18), la reserva pasa a otra ubicación con libres, en el orden de `inventario.orden_surtido_linea`; si no hay, se queda en Bodega con la excepción `pedido_linea_sin_pieza` |
| **Regresa** | «{DF}: {prenda} talla {t} queda en diferencias. Vuelve a lo que falta mandar de {PE}»; con un W-, «… {W} se surte de {ubicación}» o «… {W} queda sin pieza» |
| **Eventos** | `diferencia.creada` · `reserva.liberada` |
| **Bitácora** | «No encontró la pieza de {folio} en {ubicación}», con la reserva en `antes` y `despues` |

## Acciones internas

### `inventario.pasar_a_bodega`

| | |
|---|---|
| **La llama** | `ventas.pasar_a_bodega` (ver [notas de entrega](../ventas/notas-de-entrega.md)) |
| **Recibe** | `pedido_id` · `renglones`: `variante_id` y `piezas` |
| **Reglas** | `422 sin_listo`: «Solo hay {n} listas de {prenda} talla {t}» |
| **Escribe** | Lo de la regla 1, con `repartirTraspaso` (ver [traspasos](traspasos.md#repartir)) |
| **Eventos** | `traspaso.repartido` · `reserva.liberada` |

### `inventario.entregar_a_cliente_externo`

| | |
|---|---|
| **La llama** | `ventas.confirmar_entrega`, desde Ventas o desde Aduana · En tránsito |
| **Recibe** | `nota_entrega_id` · `despacho_id` · `recibio_nombre` · `ocurrido_en` |
| **Reglas** | `422 despacho_no_en_transito`: «{D} no está en tránsito.» |
| **Escribe** | La recepción `entrega_cliente`, en Tránsito, `completo`. El movimiento `entrega_cliente_externo`, de Tránsito a Fuera, que cumple sus reservas `nota_entrega`. El despacho, `recibido`, con quién recibió y su recepción; los traspasos de la nota, `recibido`, con `terminado_en` |
| **Eventos** | `despacho.recibido` |

### `inventario.esperar_devolucion`

| | |
|---|---|
| **La llama** | `ventas.aplicar_decision_nota_credito`, con piezas que regresan (fase 16) · Tienda en línea, al aceptar una devolución o cuando la paquetería no pudo entregar (con uniformame.mx) |
| **Recibe** | `tipo` (`devolucion_cliente_externo` o `devolucion_linea`) · su documento: la nota de crédito y el pedido, la devolución en línea o el pedido en línea · `renglones`: `variante_id`, `piezas` y, si se sabe, `lote_id` |
| **Reglas** | Ninguna: es lo que el documento dice que regresa |
| **Escribe** | Un A- `esperado`, de cliente externo o de cliente en línea, sin destino, con su documento y lo que se espera por renglón. Ningún movimiento |
| **Eventos** | `traspaso.esperado`: sale en Recepción de Aduana |

### `inventario.aplicar_revision_devolucion`

| | |
|---|---|
| **La llama** | `calidad.revisar_devolucion` (ver [reclamos y devoluciones](../calidad/reclamos-y-devoluciones.md)) |
| **Recibe** | `traspaso_id` · `renglones`: `traspaso_linea_id`, `piezas`, `decision` (`sirve` o `merma`) y, en merma, su motivo |
| **Reglas** | `422 no_espera_calidad`: «{folio} no está esperando a Calidad.» (en aduana, con renglones sin destino) · `422 piezas_mas_que_pendientes`, como en Calidad |
| **Escribe** | Lo de la regla 4: los hijos, y el movimiento `merma_calidad`, de Aduana a Fuera, de lo que es merma |
| **Eventos** | `traspaso.repartido` · `traspaso.salio` |

Las internas no escriben bitácora propia: la lleva la acción que las llama.

## Lo que se agrega en esta fase a Aduana y Bodega

- **Surtir un pedido externo** (`inventario.surtir_a_aduana`, ver [surtido y despachos](surtido-y-despachos.md)): lo apartado en Bodega para un PE- sale en un A- `surtido_pedido_externo` hacia el cliente, con la entrega del pedido como fecha esperada.
- **Recibirlo en aduana** (`inventario.recibir_en_aduana`): su reserva queda en Aduana, lista para la nota; si el pedido ya se canceló, se reparte en un `regresa` a Bodega. Una devolución con nota de crédito se recibe con lo que llegó con defecto (regla 3).
- **Despachar a un cliente externo** (`inventario.despachar`): solo con su nota, y llama `ventas.marcar_nota_en_camino` (ver [notas de entrega](../ventas/notas-de-entrega.md#acciones-internas)).
- **Repartir un lote de pedido** al recibirlo del taller, con su reserva (ver [recepción del taller](recepcion-del-taller.md#reglas)).
- **«No la encuentro»** en Bodega, con una pieza apartada para un pedido externo (arriba).

## Parámetros

Ninguno propio.

## Permisos

- «No la encuentro»: Bodega. Las internas no tienen permiso propio: lo revisa la acción que las llama. Nada de esto regresa precios a Aduana.

## Eventos

Los de cada interna, arriba.

## Lo que llega después

- **Fase 18:** «No la encuentro» con una pieza de un pedido en línea (ver [pedidos en línea](../linea/pedidos-en-linea.md)): la DF- nace igual, y su reserva pasa a otra ubicación con libres, en el orden de `inventario.orden_surtido_linea`, o se queda con su excepción `pedido_linea_sin_pieza`.
- **Con el POS:** «No la encuentro» desde la caja de una tienda, también sin internet.
- **Con uniformame.mx:** la devolución en línea y la paquetería que no pudo entregar, con `inventario.esperar_devolucion` (`devolucion_linea`).
- **Fase 19:** Recepción · De las tiendas y de clientes, En tránsito con «Confirmar entrega», y lo que espera a Calidad.

## Cómo está hecho

**Fase 16, parte 4.** En `modulos/inventario/`:

- **`internas/entregas-de-clientes.ts`:** `entregar_a_cliente_externo` bloquea el despacho de la nota y confirma su llegada con la misma función que los despachos (`confirmarLlegada`, `acciones/despachos.ts`): la recepción `entrega_cliente` en Tránsito, el movimiento `entrega_cliente_externo` que cumple las reservas de la nota, y el despacho y sus traspasos recibidos con quién recibió. `pasar_a_bodega` toma lo listo de las reservas del pedido en Aduana, las libera (`quitada_del_pedido`) y reparte sus traspasos en hijos `quitado_de_pedido` hacia Bodega, uno por padre, con `renglonesARepartir` (`internas/reservas.ts`).
- **`internas/devoluciones.ts`:** `esperar_devolucion` crea el A- `esperado` sin destino; al recibirlo, `repartirLoBueno` pasa lo que llegó sin defecto a un hijo del mismo tipo hacia Bodega, y lo de defecto se queda en el padre; `aplicar_revision_devolucion` toma la versión del traspaso (la que trae Calidad), reparte lo que sirve a Bodega y la merma a un hijo hacia merma que sale con `merma_calidad` (decisiones 691 y 692). Para que un A- espere o se reparta sin destino, `traspasos_un_destino` acepta también `esperado` y `repartido` (migración `0057`).
- **`acciones/no-la-encuentro.ts`:** con el candado de la variante relee la reserva (activa, en Bodega, de un pedido externo), abre la DF- `no_la_encontro` por las piezas en negativo con lo que decía la existencia, y libera la reserva con su nota. El folio del pedido sale de `ventas.folios_de_documentos`.
- **Despachar a un cliente externo** lleva una sola nota por despacho (decisión 689); un padre de una devolución de cliente espera a Calidad y no sale (`espera_calidad`).
- **Pruebas:** `acciones/no-la-encuentro.prueba.ts`; las entregas, el paso a bodega y las devoluciones, en `modulos/ventas/acciones/confirmar-entrega.prueba.ts`, `pasar-a-bodega.prueba.ts` y `aplicar-decision-nota-credito.prueba.ts`, y en `modulos/calidad/acciones/revisar-devolucion.prueba.ts`.

**Fase 18, parte 1.** `no_la_encuentro` acepta la reserva de un W- en Bodega: su folio sale de `linea.folios_de_pedidos`, la DF- nace igual y la pieza se vuelve a apartar con `inventario.reservar`, sin contar como libre la que no se encontró (`no_encontradas_en_bodega`): en otra ubicación con libres o, si no hay, en Bodega con `pedido_linea_sin_pieza` (decisión 721).

**Fase 18, cierre.** «No la encuentro» con un W- arma el mensaje del archivo con lo que regresa `inventario.reservar`: «… {W} se surte de {ubicación}» (sus nombres) o «… {W} queda sin pieza»; si todo lo del W- quedó en Aduana, llama `linea.prendas_en_aduana` con `completo` (decisión 734). Lo prueba el caso del W- de `acciones/no-la-encuentro.prueba.ts`.
