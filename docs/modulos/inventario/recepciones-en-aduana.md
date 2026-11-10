# Recepciones en aduana

> **Qué cubre:** recibir en Aduana lo que llega de un proveedor, lo que viene en camino de Bodega o de una tienda y lo que regresa un cliente; «Llegó completo» o «con diferencias»; la recepción de más y lo que regresa al proveedor; y el papel que deja cada recepción.
> **Estado:** Decidido.
> **Se construye en:** [fase 11](../../fases/11-aduana-y-bodega.md).
> **Se conecta con:** [libro de movimientos](libro-de-movimientos.md) · [traspasos](traspasos.md) · [surtido y despachos](surtido-y-despachos.md) · [material en bodega](material-en-bodega.md) · [entregas a corte](entregas-a-corte.md) · [recepción del taller](recepcion-del-taller.md) · [entregas y devoluciones de clientes](entregas-y-devoluciones-de-clientes.md) · [órdenes de compra](../compras/ordenes-de-compra.md) · [autorizaciones](../direccion/autorizaciones.md) · [facturas de proveedor](../contaduria/facturas-de-proveedor.md) · [pedidos en línea](../linea/pedidos-en-linea.md) · [pantallas comunes](../../interfaz/comunes.md) · [pantallas de Aduana](../../interfaz/fabrica/aduana.md) · [pantallas de Bodega](../../interfaz/fabrica/bodega.md) · [proveedores y precios de compra](../compras/proveedores-y-precios.md) · [reclamos y devoluciones](../calidad/reclamos-y-devoluciones.md) · [diferencias, ajustes y mermas](diferencias-ajustes-y-mermas.md) · [mínimos y reabasto](minimos-y-reabasto.md)

## Para qué sirve

Todo lo que entra a la fábrica pasa por Aduana y deja un papel: qué se esperaba, qué se contó, cómo llegó y quién lo recibió. Ejemplo de la muestra: llega Textiles Aurora con OC-0224, cinco días atrasada: popelina blanca y gabardina gris oxford. Aduana cuenta los rollos uno por uno y escribe los metros y la partida de cada uno. Nacen sus rollos R-, cada uno con el costo de su línea, y el traspaso A- del material, ya en aduana y con destino Bodega. La orden pasa a Recibida o a Recibida en parte, y el material se queda en Aduana hasta que Aduana lo despacha y Bodega lo confirma.

## Reglas

1. **Una recepción es un papel que no cambia:** qué se recibió, dónde, cómo (completo, con diferencias o a ciegas), quién y cuándo, y renglón por renglón lo esperado contra lo contado.
2. **Quien recibe cuenta.** «Llegó completo» toma lo que dice el documento. «Llegó con diferencias» pide el número de cada renglón, aunque sea 0. Lo del taller y los reprocesos se cuentan a ciegas: lo esperado se guarda pero no se muestra (ver [recepción del taller](recepcion-del-taller.md)).
3. **De un proveedor** se recibe una orden enviada o recibida en parte, aunque llegue antes de lo que muestra la Recepción. La tela, rollo por rollo, con sus metros (un decimal como máximo) y su partida; lo demás, por cantidad, entera si su unidad se cuenta entera. Nacen los rollos R- con el costo de su línea, la partida P- si es nueva (ver [material en bodega](material-en-bodega.md)) y el traspaso A- del material, ya en aduana, con destino Bodega. Para Compras, el material cuenta como lo que hay desde que se recibe.
4. **La recepción de más se acepta.** Por cada línea en la que lo recibido pasa de lo pedido (en la tela, si pasa de lo pedido más `inventario.porcentaje_de_mas_tela`, 3 %), nace una autorización «Recepción de más» para Dirección, por todo lo que pasa de lo pedido y no está ya en otra autorización de esa línea. Lo recibido cuenta en la existencia mientras Dirección decide. Autorizada, lo de más se queda.
5. **Lo de más rechazado regresa al proveedor.** Al rechazarlo Dirección nace la devolución al proveedor (un A- de tipo `devolucion_proveedor`) por lo rechazado, esperando donde está: en Aduana, si lo recibido de esa orden sigue ahí, o en Bodega; si hay en los dos lados, una por lado. Desde ese momento la línea de la orden baja su recibido. La de Aduana la saca Aduana con «Devolver al proveedor», escogiendo los rollos si es tela: se reparten del A- de la orden y salen. La de Bodega la surte Bodega a aduana (escogiendo los rollos), Aduana la recibe y la saca. Los rollos van enteros: si no suman lo rechazado, la diferencia se ve en la conciliación de Compras.
6. **Mientras una devolución espera en aduana,** el A- del material de esa orden no se despacha: primero sale lo de más.
7. **De lo que viene en camino** (de Bodega o de una tienda): lo que llegó pasa de En camino a aduana a Aduana; lo que no llegó se queda en su tramo, a cargo de quien lo mandó; lo que llegó de más sale igual del tramo (ver [traspasos](traspasos.md#lo-que-queda-en-cada-tramo-y-quién-responde)). Lo que sigue al traspaso cambia con él, en la misma transacción.
8. **Lo que regresa un cliente** no es inventario hasta que Aduana lo recibe y dice cómo llegó: lo bueno se reparte a un traspaso hijo con destino Bodega y lo que llegó con defecto se queda en aduana para Calidad. Lo que no llegó nunca fue inventario: no deja diferencia.
9. **Lo recibido de una línea de una orden** es lo contado en sus recepciones menos lo rechazado que regresa al proveedor. Con eso Compras calcula el estado de la orden, lo que falta en camino y el plazo real del proveedor (ver [órdenes de compra](../compras/ordenes-de-compra.md)).
10. **La Recepción de Aduana** muestra las órdenes que se esperan dentro de `inventario.dias_ventana_ordenes` (7) días y las atrasadas; una atrasada se espera en `compras.dias_espera_orden_atrasada` (3) días. La ventana solo decide qué sale en la lista.

## La tabla `recepciones`

| Columna | Tipo | Nulo | Qué es |
|---|---|---|---|
| `id` | uuid | no | Llave. Si la recibió una caja, el id que trajo |
| `tipo` | text | no | CHECK (`aduana_de_proveedor`, `aduana_de_camino`, `aduana_devolucion`, `aduana_del_taller`, `destino_despacho`, `entrega_cliente`, `bodega_regreso_corte`) |
| `ubicacion_id` | uuid | no | → `ubicaciones.id`. Dónde se recibió; en `entrega_cliente`, Tránsito, de donde sale |
| `modo` | text | no | CHECK (`completo`, `con_diferencias`, `ciego`) |
| `orden_compra_id` | uuid | sí | → `ordenes_compra.id`. En `aduana_de_proveedor` |
| `traspaso_id` | uuid | sí | → `traspasos.id`. En `aduana_de_camino` y `aduana_devolucion` |
| `despacho_id` | uuid | sí | → `despachos.id`. En `destino_despacho` y `entrega_cliente` |
| `lote_id` · `revision_id` · `reproceso_id` | uuid | sí | Lo del taller: el lote, la revisión de Calidad que dice lo esperado y el reproceso |
| `recibido_en` | timestamptz | no | La hora real; la del aparato si fue una caja |
| `recibido_por` | uuid | sí | → `usuarios.id`. Vacío si fue una caja |
| `persona_id` · `dispositivo_id` | uuid | sí | Quién y desde qué caja, si fue una caja |
| `hubo_diferencia` | boolean | no | |
| `movimiento_id` | uuid | sí | → `movimientos.id`. El que creó |

Lleva las columnas comunes (ver [base de datos](../../cimientos/BASE-DE-DATOS.md#columnas-comunes)). **CHECK:** cada tipo lleva su documento. **Índices:** (`orden_compra_id`) · (`traspaso_id`) · (`despacho_id`) · (`lote_id`) · (`tipo`, `recibido_en` desc). `lote_id`, `revision_id` y `reproceso_id` llevan su `@llavePendiente` hasta las fases 12 a 14. Con ella dejan la suya `traspasos.recepcion_aduana_id`, `traspasos.recepcion_destino_id` y `rollos.recepcion_id`.

## La tabla `recepcion_lineas`

| Columna | Tipo | Nulo | Qué es |
|---|---|---|---|
| `id` | uuid | no | Llave |
| `recepcion_id` | uuid | no | → `recepciones.id` |
| `renglon` | smallint | no | Único con `recepcion_id` |
| `traspaso_linea_id` | uuid | sí | → `traspaso_lineas.id`. Vacío en lo que no venía |
| `orden_compra_linea_id` | uuid | sí | → `orden_compra_lineas.id` |
| `variante_id` · `material_id` · `rollo_id` · `partida_tela_id` · `lote_id` | uuid | sí | Qué es. De un proveedor, el rollo que nace y su partida; del corte, el rollo que regresa |
| `piezas_esperadas` · `piezas_contadas` | integer | sí | Lo que decía el documento (en conteo ciego se guarda aunque no se muestre) y lo contado, ≥ 0 |
| `diferencia_piezas` | integer | sí | Generada: contadas − esperadas |
| `cantidad_esperada` · `cantidad_contada` | numeric(12,3) | sí | Lo mismo para material: los metros marcados del rollo o la cantidad del avío, sin redondear |
| `diferencia_cantidad` | numeric(12,3) | sí | Generada |
| `con_defecto` | boolean | no | default false. Una devolución que llegó con defecto |
| `defecto_id` | uuid | sí | → `defectos.id`. Lleva su `@llavePendiente` hasta la fase 13 |

Lleva las columnas comunes. **CHECK:** renglón de prenda (variante y piezas) o de material (material y cantidad). **Índices:** (`recepcion_id`) · (`orden_compra_linea_id`).

## Acciones

Todas son de la web, con el departamento Aduana.

### `inventario.recibir_de_proveedor`

| | |
|---|---|
| **Pantalla** | Aduana · cajón Recibir material · «Recibir en aduana». Se abre desde Recepción · De proveedores o desde la tarjeta de la orden en el carril «Entra» |
| **Recibe** | `orden_compra_id`<br>`materiales`: al menos uno, uno por línea que llega, con `orden_compra_linea_id` y, si es tela, `rollos` (al menos uno: `metros` > 0 con un decimal como máximo y `partida`, de 1 a 20 letras), o si no, `cantidad` ≥ 0 |
| **Reglas y errores** | `400`: «Metros» · «Partida» · «Número entero» (una cantidad con decimales en una unidad que se cuenta entera); una tela sin rollos marca «Metros» en su primer renglón<br>`422 orden_no_recibible`: «{OC} no se puede recibir: está {estado}»<br>`422 linea_ajena`: «{material} no es de {OC}.»<br>Se acepta más de lo que faltaba (regla 4). Aviso que no detiene: «Llegan {n} partidas distintas» (una tela con más de una partida) |
| **Escribe** | La recepción (`aduana_de_proveedor`, `completo`, en Aduana), con un renglón por rollo y uno por cada otro material: lo esperado es lo que faltaba de la línea. Las partidas nuevas. Los rollos, `disponible`, con sus metros, su partida, su orden y su línea, su recepción y el costo del metro. El A- de tipo `material_proveedor`, `en_aduana`, del proveedor a Bodega, con la orden, la recepción y un renglón por rollo y por material. El movimiento `recepcion_proveedor`, de Fuera a Aduana, un renglón por rollo y por material. Las autorizaciones de lo de más |
| **Llama** | `compras.ordenes_por_recibir` y `compras.precio_vigente_lineas` (la orden, sus líneas y el costo de sus rollos) · `admin.tomar_folio` (`rollo`, `partida` y `partida_aduana`) · `compras.recalcular_estado_orden` · `contaduria.revisar_facturas_de_orden` (fase 17) · `direccion.pedir_autorizacion`, tipo `recepcion_de_mas`, con la recepción, la línea, la cantidad y la unidad: «Recibir {cantidad} {unidad} de más en {OC} de {proveedor}» |
| **Regresa** | La recepción, el A- y los rollos. «{OC} recibida: queda en aduana hasta que bodega la confirme» y, si llegó de más, «. Llegó de más: {cantidad} {unidad} de {material}, espera autorización de Dirección» |
| **Eventos** | `recepcion.de_proveedor` · `traspaso.en_aduana` · `rollo.recibido`, uno por rollo: sus etiquetas quedan por imprimir |
| **Bitácora** | «Recibió {OC}», con los materiales, los rollos y lo de más en `despues` |

### `inventario.recibir_en_aduana`

| | |
|---|---|
| **Pantalla** | Aduana · cajón Recibir lo que viene en camino · «Llegó completo», o «Llegó con diferencias» → «Recibir lo contado». Se abre desde Recepción, En camino a aduana o la tarjeta en «Entra» |
| **Recibe** | `traspaso_id` · `version` · `modo` (`completo` o `con_diferencias`) · `renglones`, obligatorios con diferencias y en las devoluciones de un cliente: por renglón del traspaso, `traspaso_linea_id` y `piezas` (o `cantidad`, si es material) y, solo en las devoluciones, `con_defecto` y `defecto_id` |
| **Reglas y errores** | `422 no_por_recibir`: «{folio} ya se recibió» (tiene que estar `en_camino_aduana` o, si es la devolución de un cliente, `esperado`)<br>`400 falta_renglon`: «Escribe cuántas llegaron de cada prenda, aunque sea 0» |
| **Escribe** | La recepción (`aduana_de_camino` o `aduana_devolucion`), con lo enviado como esperado. Lo que llegó: `recepcion_aduana`, de En camino a aduana a Aduana; en una devolución, `devolucion_cliente_externo` o `devolucion_linea`, de Fuera a Aduana. El traspaso `en_aduana`, con su hora y lo que contó Aduana. Lo que no llegó se queda en su tramo (regla 7). Y lo que dice la tabla de abajo según el tipo |
| **Regresa** | «{A} recibido en aduana: {n} piezas para {tienda}» (solicitud o reabasto) · «{W} completo: listo para empacar» · «{folio} recibida: pasa a Calidad» (devolución con defecto) · «{folio} recibido en aduana: {n} piezas» (lo demás). Si no cuadró, sigue «. Faltaron {n}: queda por aclarar a cargo de {quien lo mandó}» |
| **Eventos** | `traspaso.en_aduana` |
| **Bitácora** | «Recibió {folio}», con el estado del traspaso en `antes` y lo que llegó en `despues` |

**Lo que pasa según el tipo:**

| Tipo | Además | Desde |
|---|---|---|
| `devolucion_proveedor` surtida de Bodega | Queda lista para «Devolver al proveedor» | Fase 11 |
| `reabasto` | Va a su tienda: Aduana la despacha | Fase 14 |
| `surtido_pedido_externo` | Su reserva queda en Aduana; si el pedido ya se canceló, se reparte en un `regresa` a Bodega | Fase 16 |
| `devolucion_cliente_externo` | Lo bueno, a un hijo con destino Bodega; lo de defecto, para Calidad | Fase 16 |
| `pedido_linea` | Avisa a Tienda en línea con `linea.prendas_en_aduana`: sus prendas quedan «En aduana» y, completo, «Listo para empacar»; si el W- ya se canceló, se reparte en un `regresa` a su origen | Fase 18 |
| `devolucion_linea` | Como la del cliente externo, y avisa a Tienda en línea cómo llegó | Con uniformame.mx |
| `solicitud_tienda` y las salidas de tienda | La solicitud pasa a en aduana; la salida, a confirmada (o con diferencias); `devolucion_defecto` espera a Calidad; en un sobrante o en «Otro», el destino lo escoge Aduana al despachar; `pedido_de_bodega` pone su SE- en recibida en aduana | Con el POS |

### `inventario.devolver_a_proveedor`

| | |
|---|---|
| **Pantalla** | Aduana · Inventario en aduana · renglón «Regresa a {proveedor}» · «Devolver al proveedor» (pantalla nueva) |
| **Recibe** | `traspaso_id` (una devolución al proveedor) · `version` · `rollo_ids`, si es tela y espera en aduana · `cantidad`, si no es tela |
| **Reglas y errores** | `422 no_esta_en_aduana`: «{folio} no está en aduana.»<br>`422 rollo_ajeno`: «{rollo} no es de {material} de {OC}, o no está en aduana.»<br>`422 cantidad_distinta`: «Lo que regresa es {n} {unidad}.»<br>Aviso que no detiene: «Los rollos suman {m} m y lo de más es {n} m: la diferencia se ve en la conciliación de Compras» |
| **Escribe** | Si esperaba en aduana, los rollos escogidos (o la cantidad) se reparten del A- de la orden a la devolución. El movimiento `devolucion_proveedor`, de Aduana a Fuera, un renglón por rollo o por la cantidad. Los rollos, `devuelto`. El traspaso, `salio`, con `terminado_en` |
| **Regresa** | «{cantidad} {unidad} de {material} regresan a {proveedor}» |
| **Eventos** | `traspaso.salio` |
| **Bitácora** | «Devolvió a {proveedor}», con los rollos o la cantidad |

## Acciones internas

### `inventario.aplicar_decision_recepcion_de_mas`

El efecto que este módulo registra para el tipo `recepcion_de_mas` (ver [autorizaciones](../direccion/autorizaciones.md)).

| | |
|---|---|
| **La llama** | `direccion.decidir_autorizacion`, en su misma transacción |
| **Recibe** | `autorizacion_id` · `decision` · la recepción, la línea de la orden y la cantidad de más |
| **Escribe** | Autorizada: nada; lo de más se queda. Rechazada: la devolución al proveedor por esa cantidad, `esperado`, con origen Aduana por lo que de esa orden siga en aduana y con origen Bodega por lo demás (regla 5) |
| **Llama** | Al rechazar, porque la línea baja su recibido: `compras.recalcular_estado_orden` y `contaduria.revisar_facturas_de_orden` (fase 17) |
| **Eventos** | `traspaso.esperado` |

La bitácora es el renglón de Dirección.

## Lecturas

### `inventario.recibido_de_ordenes(ordenes)`

| | |
|---|---|
| **La usa** | Compras: el estado de la orden, lo que falta en camino, «Llegó el» y el plazo real de cada proveedor (ver [proveedores y precios](../compras/proveedores-y-precios.md)) |
| **Regresa** | Por línea, lo recibido (regla 9); y por orden, cada recepción con su día |

## Parámetros

Los cambia solo la dueña, en Configuración (ver [configuración](../admin/configuracion.md)). Todos van en «Parámetros».

| Parámetro | Valor inicial | Para qué |
|---|---|---|
| `inventario.dias_ventana_ordenes` | 7 días | Las órdenes que se esperan dentro de estos días salen en la Recepción de Aduana |
| `inventario.porcentaje_de_mas_tela` | 3 % | La tela que llega de más hasta este porcentaje de lo pedido no pide autorización |

## Permisos

- Recibir y devolver al proveedor: Aduana.
- Aduana nunca recibe precios ni costos: el costo de los rollos lo pone el servidor.
- Las recepciones las leen las pantallas de Aduana, Bodega, Compras («Aduana · recibió {cantidad}» en el historial de la orden) y Dirección.

## Eventos

`recepcion.de_proveedor` · `traspaso.en_aduana` · `traspaso.esperado` · `traspaso.salio` · `rollo.recibido`.

## Lo que llega después

- **Fase 12:** el rollo o el retazo que regresa del corte (`bodega_regreso_corte`, en [entregas a corte](entregas-a-corte.md)).
- **Fase 13:** los defectos, para la devolución que llega con defecto.
- **Fase 14:** la DF- de cada renglón que no llegó o llegó de más; lo del taller, contado a ciegas (ver [recepción del taller](recepcion-del-taller.md)).
- **Fase 16:** lo que se surte de bodega para un pedido externo y las devoluciones de los clientes externos (ver [entregas y devoluciones de clientes](entregas-y-devoluciones-de-clientes.md)).
- **Fase 17:** al recibir una orden y cuando Dirección rechaza lo recibido de más, Contaduría revisa sus facturas (`contaduria.revisar_facturas_de_orden`, en [facturas de proveedor](../contaduria/facturas-de-proveedor.md)); al recibir, el mensaje sigue «. {FP} ya se puede pagar» o «. {FP} no cuadra con lo recibido».
- **Fase 18:** los pedidos en línea, con `linea.prendas_en_aduana` (ver [pedidos en línea](../linea/pedidos-en-linea.md)).
- **Con uniformame.mx:** las devoluciones en línea, con `linea.devolucion_recibida`.
- **Con el POS:** las salidas y las solicitudes de las tiendas.

## Cómo está hecho

*Lo escribe Claude Code al terminar la fase 11.*
