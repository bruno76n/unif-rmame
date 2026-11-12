# Traspasos

> **Qué cubre:** el traspaso A-, el único documento que lleva una partida de su origen a su destino pasando por aduana: sus tipos, sus estados, lo que dijo cada lado, repartir sin mover, lo que queda en cada tramo y quién responde, y la partida en aduana como vista.
> **Estado:** Decidido.
> **Se construye en:** [fase 9 ●](../../fases/09-inventario-libro-existencias-reservas-y-traspasos.md).
> **Se conecta con:** [libro de movimientos](libro-de-movimientos.md) · [reservas](reservas.md) · [existencias y cuadre](existencias-y-cuadre.md) · [recepciones en aduana](recepciones-en-aduana.md) · [surtido y despachos](surtido-y-despachos.md) · [mínimos y reabasto](minimos-y-reabasto.md) · [entregas y devoluciones de clientes](entregas-y-devoluciones-de-clientes.md) · [folios](../admin/folios.md) · [pantallas comunes](../../interfaz/comunes.md) · [pantallas de Aduana](../../interfaz/fabrica/aduana.md) · [pantallas de Bodega](../../interfaz/fabrica/bodega.md) · [pantallas de Tienda en línea](../../interfaz/fabrica/tienda-en-linea.md) · [reclamos y devoluciones](../calidad/reclamos-y-devoluciones.md) · [diferencias, ajustes y mermas](diferencias-ajustes-y-mermas.md) · [recepción del taller](recepcion-del-taller.md)

## Para qué sirve

Nada pasa de un lugar a otro sin que lo confirmen los dos lados. El traspaso es el papel que viaja con la pieza: lo que dijo quien la mandó, lo que contó Aduana, lo que se repartió a otros traspasos y lo que confirmó el destino. Mientras va de camino, la pieza está en En camino a aduana o en Tránsito, ligada a su traspaso, y responde por ella quien la mandó.

Ejemplo: la Tienda 1 pide ropa con la S-T1-088. Bodega surte y nace el traspaso A-04, en camino a aduana. Aduana lo recibe, lo despacha con el D-0412 y queda en tránsito. La Tienda 1 confirma que llegó completo: el A-04 queda `recibido`. Un solo documento de principio a fin; S-T1-088 y D-0412 son referencias.

## Reglas

1. **Un traspaso de principio a fin.** Los demás folios son referencias:

   | Camino | Cadena |
   |---|---|
   | Solicitud de tienda | S-T1- (lo que pide) → A- (Bodega surte) → D- (Aduana despacha) → recibido |
   | Reabasto | A- con su RB- → D- → recibido. Cada «Mover» es su propio A-, y todos los del día para esa tienda comparten el RB- |
   | Pedido externo | PE- → NV- (el A- del lote se reparte y la nota se lleva su parte) → D- → entregado |
   | Lo que Bodega le pide a una tienda | SE- → la tienda manda su E-T1- (ese es el folio del traspaso) → Aduana recibe → D- → recibido |
   | Material | OC- → A- (nace en aduana al recibir) → D- → Bodega confirma |
   | Pedido especial de tienda | PE-T1- → OP- → lote → A- (con su reserva) → D- → la tienda recibe |

   Un D- puede juntar varios A- que van al mismo destino: un viaje, una hoja.
2. **El folio:** `A-{n}` si nace en la fábrica (contador `partida_aduana` de [folios](../admin/folios.md)); el de la salida (`E-T1-…`) si nace en una tienda; `{folio del padre}-{n}` si se repartió de otro.
3. **Solo quien recibe confirma.** Aduana solo puede «Recordar».
4. **Lo que no llega se queda en su tramo,** a cargo de quien lo mandó (decisión de integración 2): nace una DF- por renglón y el traspaso termina `con_diferencia`, aunque el otro tramo cuadre. Lo que llega de más sale igual del tramo (ese tramo queda en negativo en ese traspaso; si llega en un despacho con varios traspasos, en el primero del despacho, ver [surtido y despachos](surtido-y-despachos.md#reglas)) y nace una DF- de sobrante (ver [diferencias, ajustes y mermas](diferencias-ajustes-y-mermas.md)).
5. **El lote y el reproceso se quedan en el Taller** hasta que Aduana los cuenta a ciegas: sus traspasos nacen `en_aduana` al recibirlos (decisión de integración 3).
6. **Una devolución aceptada no es inventario** hasta que Aduana la recibe: espera en `esperado`, sin movimiento.
7. **Repartir no mueve.** Cuando parte de lo que hay en aduana cambia de destino, pasa a un traspaso hijo (abajo).
8. **Lo que sigue al traspaso cambia con él,** en la misma transacción: la solicitud S-T1-, la salida E-T1-, el envío SE- y, con una interna de `linea`, el pedido W-. Cada acción lo dice en su archivo.
9. **Un pedido cancelado** (W- o PE-) con piezas en aduana se reparte en un hijo `regresa` (de un W-, solo sus renglones) con destino a su origen (Bodega o la tienda; si vino del Taller, Bodega); lo que venía en camino se reparte al recibirse, y lo que ya salió de aduana no se toca (ver [reservas](reservas.md#inventarioliberar_reservas)). **Una nota de entrega cancelada** antes de salir se reparte de regreso en un `lote_cliente` del mismo pedido (ver [reservas](reservas.md#inventariodevolver_de_nota)).

## Los tipos

| Tipo | Qué lleva | De → a | Lo crea |
|---|---|---|---|
| `solicitud_tienda` | Lo que Bodega surte para una solicitud S-T1- | Bodega → la tienda | [surtido y despachos](surtido-y-despachos.md), con la solicitud de la caja (con el POS) |
| `reabasto` | Un «Mover» de Bodega a una tienda, con su RB- | Bodega → la tienda | [mínimos y reabasto](minimos-y-reabasto.md) |
| `pedido_linea` | Lo de un W- que surte Bodega o una tienda, o el hijo de una pieza que estaba en aduana | Bodega o la tienda → cliente en línea | [surtido y despachos](surtido-y-despachos.md), [reservas](reservas.md) |
| `surtido_pedido_externo` | Lo que Ventas pidió surtir de bodega para un PE- | Bodega → cliente externo | [surtido y despachos](surtido-y-despachos.md) |
| `lote_cliente` | Un lote de un pedido externo, recibido en aduana | Taller → cliente externo | [recepción del taller](recepcion-del-taller.md) |
| `lote_reabasto` | Un lote para una tienda | Taller → la tienda | [recepción del taller](recepcion-del-taller.md) |
| `lote_temporada` | Un lote de temporada, o de un pedido cancelado | Taller → Bodega | [recepción del taller](recepcion-del-taller.md) |
| `lote_pedido_especial` | Un lote de un pedido especial de tienda, con su reserva | Taller → la tienda | [recepción del taller](recepcion-del-taller.md) (con el POS) |
| `quitado_de_pedido` | Lo listo de un pedido que ya no va: «Pasar a bodega», o lo que el lote trae hasta lo mandado a bodega | Aduana o Taller → Bodega | [entregas y devoluciones de clientes](entregas-y-devoluciones-de-clientes.md), [recepción del taller](recepcion-del-taller.md) |
| `excedente_pedido` | Lo que un lote de pedido trae de más | Taller → Bodega | [recepción del taller](recepcion-del-taller.md) |
| `reproceso` | Un reproceso aprobado, con el mismo reparto que su lote | Taller → el destino de su lote | [recepción del taller](recepcion-del-taller.md) |
| `material_proveedor` | Lo que llegó de una OC-: rollos y avíos | Proveedor → Bodega | [recepciones en aduana](recepciones-en-aduana.md) |
| `nota_entrega` | El hijo que se lleva una NV- | Aduana → cliente externo | [reservas](reservas.md#inventarioapartar_para_nota) |
| `devolucion_defecto` | Una salida de tienda con defecto, para Calidad | La tienda → lo decide Calidad | La caja (con el POS) |
| `sobrante_descontinuada` | Lo descontinuado que le sobra a una tienda | La tienda → lo decide Aduana | La caja (con el POS) |
| `traspaso_entre_tiendas` | Una tienda le manda a la otra | Una tienda → la otra | La caja (con el POS) |
| `pedido_de_bodega` | Lo que una tienda manda porque Bodega se lo pidió (SE-) | La tienda → la que lo necesita | La caja (con el POS) |
| `otro_de_tienda` | Una salida «Otro», con su nota | La tienda → lo decide Aduana | La caja (con el POS) |
| `regresa` | El hijo que regresa a su origen: un pedido cancelado, «Regresa a {origen}», los avíos de una entrega a corte devuelta | Aduana o Taller → su origen | [reservas](reservas.md), [surtido y despachos](surtido-y-despachos.md), [entregas a corte](entregas-a-corte.md) |
| `devolucion_cliente_externo` | Lo que regresa un cliente externo con su NC- | Cliente externo → lo decide Calidad, o Bodega | [entregas y devoluciones de clientes](entregas-y-devoluciones-de-clientes.md) |
| `devolucion_linea` | Lo que regresa un cliente en línea | Cliente en línea → lo decide Calidad, o Bodega | Tienda en línea (con uniformame.mx) |
| `devolucion_proveedor` | Lo de más que se rechazó y regresa al proveedor | Aduana o Bodega → proveedor | [recepciones en aduana](recepciones-en-aduana.md) |

«Lo decide Calidad» o «lo decide Aduana» es un destino vacío mientras está en camino o en aduana; se escoge al revisarlo o al despacharlo.

## Estados

| De | A | Qué pasa | Quién | Movimiento |
|---|---|---|---|---|
| — | `en_camino_aduana` | Bodega surte («Surtir {n} y pasar a aduana», «Mover», «Surtir a aduana»), o llega una salida de tienda | Bodega; la caja | `surtido_bodega` o `salida_tienda` |
| — | `en_aduana` | Aduana recibe un lote, un reproceso o una OC-; nace al repartir otro; o entra a Aduana lo que se aclaró de una DF- (ver [diferencias, ajustes y mermas](diferencias-ajustes-y-mermas.md#cómo-se-aclara-una-de-recepción)) | Aduana; Bodega al aclarar; la API | `recepcion_taller`, `recepcion_reproceso`, `recepcion_proveedor` o `aclaracion_recepcion`; repartir no mueve |
| — | `esperado` | Se acepta una devolución (en línea o con NC-), o Dirección rechaza una recepción de más: lo de más espera en Aduana o en Bodega | Tienda en línea; Ventas con Dirección; Dirección | Ninguno |
| `esperado` | `en_aduana` | Aduana recibe la devolución y dice cómo llegó | Aduana | `devolucion_linea` o `devolucion_cliente_externo` |
| `esperado` | `en_camino_aduana` | Bodega surte lo de más rechazado que esperaba en Bodega | Bodega | `surtido_bodega` |
| `esperado` | `salio` | «Devolver al proveedor» lo de más rechazado que esperaba en aduana: se reparte del A- de su orden y sale | Aduana | `devolucion_proveedor` |
| `en_camino_aduana` | `en_aduana` | «Llegó completo» o «Recibir lo contado». Lo que no llegó se queda en En camino a aduana, a cargo del origen | Aduana | `recepcion_aduana` |
| `en_camino_aduana` | `cancelado` | La tienda cancela su salida antes de que Aduana la reciba | La caja | `reversion` |
| `en_aduana` | `en_transito` | «Despachar a {destino}»: nace o se suma a un D- | Aduana | `despacho` |
| `en_aduana` | `salio` | «La recogió la paquetería» (en línea), «Es merma» (Calidad) o sale al proveedor | Aduana; Calidad | `salida_linea`, `merma_calidad` o `devolucion_proveedor` |
| `en_aduana` | `repartido` | Todo lo que quedaba pasó a hijos | Ventas, Tienda en línea, Aduana, Calidad | Ninguno |
| `en_transito` | `recibido` | El destino confirma, o el cliente firma | Bodega, la tienda, Ventas, o Aduana con la firma | `recepcion_despacho` o `entrega_cliente_externo` |
| `en_transito` | `con_diferencia` | «Llegó con diferencias»: lo que no llegó se queda en Tránsito, a cargo de Aduana | Bodega o la tienda | `recepcion_despacho` |

- **Finales:** `recibido`, `con_diferencia`, `salio`, `repartido` y `cancelado`, con `terminado_en`.
- **Si el primer tramo tuvo diferencia,** el traspaso sigue y al final queda `con_diferencia` aunque el segundo cuadre.
- **Cada transición la construye la fase de la acción que la provoca** (la columna «Lo crea» de los tipos y el archivo de cada acción). Esta fase construye la tabla de transiciones: una que no está aquí es un error del programa.

## La tabla `traspasos`

| Columna | Tipo | Nulo | Qué es |
|---|---|---|---|
| `id` | uuid | no | Llave. Si nace de una salida de tienda, el id que trajo la caja |
| `folio` | text | no | Único (regla 2) |
| `tipo` | text | no | CHECK con los 22 tipos de arriba |
| `origen_ubicacion_id` | uuid | sí | → `ubicaciones.id`. Vacío si vino de fuera |
| `origen_externo` | text | sí | CHECK (`proveedor`, `cliente_externo`, `cliente_linea`). Lleno solo si `origen_ubicacion_id` está vacío |
| `destino_ubicacion_id` | uuid | sí | → `ubicaciones.id` |
| `destino_externo` | text | sí | CHECK (`cliente_externo`, `cliente_linea`, `proveedor`, `merma`) |
| `estado` | text | no | CHECK (`esperado`, `en_camino_aduana`, `en_aduana`, `en_transito`, `recibido`, `con_diferencia`, `salio`, `repartido`, `cancelado`) |
| `solicitud_tienda_id` · `salida_tienda_id` · `solicitud_envio_id` | uuid | sí | → la solicitud S-T1-, la salida E-T1- (única) y el envío SE- |
| `folio_rb` | text | sí | `RB-{n}`: la referencia del reabasto de un día para una tienda. Varios traspasos la comparten |
| `pedido_id` · `nota_entrega_id` · `pedido_especial_tienda_id` | uuid | sí | → el PE-, la NV- y el PE-T1-. El W- va en cada renglón (`traspaso_lineas.pedido_linea_id`) |
| `lote_id` · `reproceso_id` · `orden_compra_id` · `devolucion_linea_id` · `nota_credito_id` | uuid | sí | → el lote, el reproceso, la OC-, la devolución en línea y la NC- |
| `traspaso_padre_id` | uuid | sí | → `traspasos.id`: de cuál se repartió |
| `recepcion_aduana_id` · `despacho_id` · `recepcion_destino_id` | uuid | sí | → la recepción que lo metió a aduana, el D- y la recepción del destino |
| `fecha_salida_esperada` | date | sí | «{fecha} la esperan»: la entrega del lote o del pedido, o la que pone Aduana. Da «Sale hoy» y «Sale mañana» |
| `enviado_en` | timestamptz | sí | Cuando salió del origen. Vacío en lo que nace en aduana |
| `llego_aduana_en` | timestamptz | sí | Cuando Aduana lo recibió. Desde aquí corre la antigüedad |
| `terminado_en` | timestamptz | sí | Cuando llegó a un estado final |
| `etiquetas_impresas_en` | timestamptz | sí | Lotes y rollos: «Etiquetas por imprimir» hasta que se imprimen en aduana |
| `nota` | text | sí | |
| `dispositivo_id` · `persona_id` · `clave_idempotencia` | uuid | sí | Llenos si nació de una salida de tienda. La clave, única donde no es vacía |
| `cancelado_en` · `cancelado_por` · `motivo_cancelacion` | | sí | Solo en `cancelado` |

- Lleva las columnas comunes (ver [base de datos](../../cimientos/BASE-DE-DATOS.md#columnas-comunes)).
- **CHECK:** exactamente uno de `origen_ubicacion_id` y `origen_externo`, salvo en `regresa`, que hereda el origen de su padre · a lo más uno de `destino_ubicacion_id` y `destino_externo`; los dos vacíos solo mientras está `en_camino_aduana` o `en_aduana` y es `sobrante_descontinuada`, `otro_de_tienda`, `devolucion_defecto`, `devolucion_cliente_externo` o `devolucion_linea` (destino por decidir) · `esperado` solo en las devoluciones de cliente y en `devolucion_proveedor` (con origen Aduana o Bodega).
- **Índices:** único (`folio`) · (`estado`) donde no es final · (`destino_ubicacion_id`, `estado`) · (`origen_ubicacion_id`, `estado`) · (`despacho_id`) · (`pedido_id`) · (`nota_entrega_id`) · (`solicitud_tienda_id`) · (`folio_rb`) · (`traspaso_padre_id`) · (`version`).
- Las llaves a tablas de fases posteriores (las recepciones, los despachos, los lotes, los pedidos y lo de tienda) llevan su `@llavePendiente` hasta la fase que crea cada tabla.

## La tabla `traspaso_lineas`

Lo que lleva un traspaso, con lo que dijo cada lado.

| Columna | Tipo | Nulo | Qué es |
|---|---|---|---|
| `id` | uuid | no | Llave |
| `traspaso_id` | uuid | no | → `traspasos.id` |
| `renglon` | smallint | no | Único con `traspaso_id` |
| `variante_id` · `material_id` · `rollo_id` · `lote_id` | uuid | sí | Qué es, como en [movimiento_lineas](libro-de-movimientos.md#la-tabla-movimiento_lineas) |
| `piezas_enviadas` | integer | sí | Lo que dijo quien mandó. Nunca cambia. En lo que nace en aduana, lo que se contó al recibir |
| `piezas_recibidas_aduana` | integer | sí | Lo que contó Aduana. Vacío hasta que recibe; igual a las enviadas en lo que nace en aduana |
| `piezas_repartidas` | integer | no | default 0. Lo que pasó a hijos sin moverse |
| `piezas_recibidas_destino` | integer | sí | Lo que confirmó el destino. Vacío hasta que confirma |
| `cantidad_enviada` · `cantidad_recibida_aduana` · `cantidad_repartida` · `cantidad_recibida_destino` | numeric(12,3) | sí · sí · no · sí | Lo mismo, para material. `cantidad_repartida` con default 0 |
| `defecto_id` | uuid | sí | → `defectos.id`: una devolución con defecto |
| `pedido_linea_id` | uuid | sí | → `pedidos_linea.id`: el W- de ese renglón. Lleno en los renglones de un traspaso `pedido_linea`; así una salida E-T1- lleva todos los pedidos en línea del día |
| `nota` | text | sí | |

- Lleva las columnas comunes.
- **CHECK:** renglón de prenda (variante y columnas `piezas_*`) o de material (material y columnas `cantidad_*`); cantidades ≥ 0.
- **Índices:** (`traspaso_id`) · (`variante_id`) · (`pedido_linea_id`).

## La partida en aduana: la vista `partidas_aduana`

Una partida en aduana (A-) es un traspaso en `en_aduana`. Es una **vista**, no una tabla, para que nadie la escriba dos veces: los traspasos en `en_aduana` con sus renglones (lo que queda en aduana: recibido − repartido), su antigüedad en horas desde `llego_aduana_en`, su color y su «Sale hoy» o «Sale mañana» (abajo). Toda llave de otro módulo que quiera apuntar a «una partida A-» apunta a `traspasos.id` (decisión de integración 1).

## Repartir

Lo hace una función del módulo, `repartirTraspaso`, en `modulos/inventario/dominio/`, dentro de la transacción de quien la llama:

1. Recibe el traspaso padre (en `en_aduana`), por renglón lo que se reparte, y el tipo, el destino y los documentos del hijo.
2. Nada se reparte por encima de lo que queda en aduana de cada renglón (recibido − repartido): si no, es un error del programa.
3. El padre suma sus `piezas_repartidas` (o `cantidad_repartida`); si ya no le queda nada en aduana, pasa a `repartido`, con `terminado_en`.
4. Nace el hijo en `en_aduana`, con folio `{padre}-{n}` (el siguiente hijo de ese padre), `traspaso_padre_id`, el mismo `llego_aduana_en` del padre (su antigüedad sigue contando) y renglones con enviadas y recibidas en aduana iguales a lo repartido.
5. Las reservas activas de esas piezas pasan al hijo (`traspaso_id`).
6. No es un movimiento: las piezas no cambian de lugar.

Lo usan la nota de entrega, «Regresa a {origen}», el destino que decide Aduana (lo que sobra) o Calidad («Sirve: pasa a bodega»), un pedido cancelado y un pedido en línea que aparta una pieza que estaba en aduana hacia Bodega. Evento: `traspaso.repartido`.

## Lo que queda en cada tramo y quién responde

Por renglón:

| Tramo | Lo que queda | Responde |
|---|---|---|
| En camino a aduana | Enviadas − recibidas en aduana (todo lo enviado mientras Aduana no recibe) | El origen |
| En aduana | Recibidas en aduana − repartidas, mientras está `en_aduana` | Aduana |
| En tránsito | Recibidas en aduana − repartidas − recibidas en el destino | Aduana, que despachó |

Así sale de lo que dijo cada lado, que nunca cambia. Cuando una DF- se aclara o se ajusta, su movimiento lleva el traspaso y saca lo pendiente del tramo: en el libro, ese tramo queda en cero (ver [diferencias, ajustes y mermas](diferencias-ajustes-y-mermas.md#cómo-se-aclara-una-de-recepción)). Por eso el cuadre cuenta los tramos en el libro: un traspaso `recibido` o `salio` tiene cero en Tránsito y en En camino a aduana; uno `con_diferencia`, justo lo de sus DF- abiertas (ver [existencias y cuadre](existencias-y-cuadre.md#el-cuadre-de-la-noche)).

## La antigüedad en aduana y lo que no se confirma

- **Horas en aduana** = ahora − `llego_aduana_en`. Verde antes de `inventario.dias_aduana_ambar`; ámbar desde ahí; rojo pasando `inventario.horas_aduana_parado`.
- **«Sale hoy» y «Sale mañana»** (rojos): `fecha_salida_esperada` es hoy, mañana o ya pasó.
- **Sin confirmar** = días desde `enviado_en` (en camino) o desde que se despachó (en tránsito). Rojo desde `inventario.dias_sin_confirmar_rojo`; cuenta en la pastilla de Aduana desde `inventario.dias_sin_confirmar_pastilla`.

Son cuentas al leer: ningún trabajo las escribe.

## Parámetros

Los cambia solo la dueña, en Configuración (ver [configuración](../admin/configuracion.md)). Todos van en «Parámetros».

| Parámetro | Valor inicial | Para qué |
|---|---|---|
| `inventario.horas_aduana_parado` | 72 h | Desde aquí, lo que está en aduana sale en rojo («parado») |
| `inventario.dias_aduana_ambar` | 2 días | Desde aquí, lo que está en aduana sale en ámbar |
| `inventario.dias_sin_confirmar_rojo` | 2 días | Lo que va en camino o en tránsito sale en rojo |
| `inventario.dias_sin_confirmar_pastilla` | 1 día | Los despachos sin confirmar que cuentan en la pastilla de Aduana |

## Permisos

Los traspasos no tienen acciones propias: cada acción que los crea o los cambia revisa el suyo. Los leen las pantallas de Aduana, Bodega y Tienda en línea, y «¿Dónde está?», sin precios ni costos.

## Eventos

`traspaso.repartido`. Los demás (`traspaso.recibido`, `traspaso.despachado`…) los guarda la acción que cambia el traspaso, en su archivo.

## Lo que llega después

- **Fases 11, 14, 16 y 18:** las acciones que crean y mueven traspasos, cada una con su transición, y lo que sigue a cada traspaso (regla 8).
- **Fase 14:** las DF- de los tramos con diferencia, su aclaración y el A- de lo que entra a Aduana al aclarar.
- **Con el POS:** las salidas de tienda (sus traspasos llevan el id y el folio de la caja) y lo que baja a la caja: los traspasos y sus renglones que van o vienen de esa tienda, abiertos y los cerrados de los últimos `inventario.dias_historial_pos` días.
- **Con uniformame.mx:** la salida y la devolución en línea.

## Cómo está hecho

**Fase 9, parte 2.**

- **Las tablas** `traspasos` y `traspaso_lineas` están en `modulos/inventario/tablas.ts` (migración `0027`), con los CHECK de este archivo. Además, `terminado_en` va lleno si y solo si el estado es final, y `cancelado` pide su motivo. Las llaves a tablas de fases posteriores llevan su `@llavePendiente`; `recepcion_aduana_id` y `recepcion_destino_id` apuntan a `recepciones` (decisión 476). `movimiento_lineas.traspaso_id` ya es llave foránea.
- **La vista `partidas_aduana`** (migración `0027`) da, por renglón de un traspaso `en_aduana` con algo que quede, lo que queda, sus horas, su color y «hoy» o «mañana». El color y el «sale» los calcula la vista con los parámetros de la base (decisión 474). En el esquema está como `pgView(...).existing()`.
- **La tabla de transiciones** es `transicionesDeTraspaso` (`dominio/traspasos.ts`). `cambiarEstadoTraspaso` bloquea el traspaso con `bloquearTraspaso`: primero el candado de las variantes de sus renglones y luego el traspaso con `FOR NO KEY UPDATE`, el mismo orden que un movimiento (decisión 500); rechaza con un `Error` lo que no está en la tabla y pone las horas de cada paso. `crearTraspaso` nace en `en_camino_aduana`, `en_aduana` o `esperado`, con su folio `A-{n}` del contador `partida_aduana` o el que traiga.
- **`repartirTraspaso`** bloquea al padre de la misma forma, pero pide solo las variantes de los renglones que reparte y de las reservas que se lleva: quien reparte (una reserva, una nota) ya las tiene, y pedir otra del lote después de sus existencias invertiría el orden (decisión 511); rechaza lo que pase de lo que queda (en material, por milésimos) y suma lo repartido. Si ya no le queda nada, el padre pasa a `repartido`. El hijo nace con folio `{padre}-{n}`, el origen del padre (decisión 473), su hora de llegada y su fecha de salida, y se guarda `traspaso.repartido`. Las reservas que le pasan (`reservaIds`) las lee después del candado y solo cambia las que siguen `activa`.
- **Los parámetros** de este archivo están en `modulos/inventario/parametros.ts`.
- **Pruebas:** `dominio/candados.prueba.ts` (cambiar el estado y mover contra repartir con reservas, y apartar un W- de la aduana contra un movimiento de otra variante del lote, sin `40P01`), `dominio/traspasos.prueba.ts` (las transiciones, los CHECK y la vista) y `dominio/repartir-traspaso.prueba.ts` (el reparto, el hijo, el evento y el padre `repartido`).

**Fase 14, parte 1.** Al recibir un despacho, un traspaso termina `con_diferencia` si un renglón suyo no cuadró o si tiene alguna DF-, también de En camino a aduana; uno que termina `repartido` o `salio` no cambia de estado y el cuadre lo compara igual con sus DF- abiertas (decisión 635).
