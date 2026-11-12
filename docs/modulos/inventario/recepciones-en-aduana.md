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
| **Llama** | `compras.ordenes_por_recibir` y `compras.precio_vigente_lineas` (la orden, sus líneas y el costo de sus rollos) · `admin.tomar_folio` (`rollo`, `partida` y `partida_aduana`) · `contaduria.bloquear_ordenes_ligadas` (fase 17, antes de tocar la orden) · `compras.recalcular_estado_orden` · `contaduria.revisar_facturas_de_orden` (fase 17) · `direccion.pedir_autorizacion`, tipo `recepcion_de_mas`, con la recepción, la línea, la cantidad y la unidad: «Recibir {cantidad} {unidad} de más en {OC} de {proveedor}» |
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
| **Llama** | Al rechazar, porque la línea baja su recibido: `contaduria.bloquear_ordenes_ligadas` (fase 17, después del candado de lo recibido), `compras.recalcular_estado_orden` y `contaduria.revisar_facturas_de_orden` (fase 17) |
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

**Fase 11, parte 1.**

- **Las tablas** `recepciones` y `recepcion_lineas` (migración `0036`), con sus CHECK: cada tipo con su documento, el modo, la forma del renglón (prenda o material) y nada negativo; las diferencias son columnas generadas. Los renglones solo crecen (`marcar_solo_crece`); la recepción guarda su movimiento después de escribirlo, porque el movimiento necesita sus rollos y los rollos su recepción (decisión 565). Con ellas, `traspasos.recepcion_aduana_id`, `traspasos.recepcion_destino_id`, `rollos.recepcion_id` y `autorizaciones.recepcion_id` ya son llaves.
- **`inventario.recibir_de_proveedor`** (`acciones/recibir-de-proveedor.ts`, contrato en `packages/compartido/src/contratos/inventario/recepciones.ts`):
  - lee la orden con `compras.ordenes_por_recibir` (que ahora trae el id del proveedor y, por línea, su tipo y si se cuenta entera) y el costo con `compras.precio_vigente_lineas`;
  - toma el candado de lo recibido de la orden (decisión 567), revisa cada línea (`linea_ajena` dice «Ese material…», porque la línea ajena no tiene nombre en esta orden, decisión 561) y los datos (`400`: «Metros», «Cantidad», «Número entero»; si todo llega en cero, «Escribe lo que llegó», decisión 569);
  - escribe la recepción, las partidas y los rollos, el A- `material_proveedor` en aduana con destino Bodega, el movimiento `recepcion_proveedor` (cada renglón con su A-) y los renglones del papel: lo esperado (lo que faltaba de la línea) va en el primer renglón de cada línea (decisión 560);
  - recalcula la orden con `compras.recalcular_estado_orden`; si mientras tanto se canceló, no se recibe nada;
  - pide la autorización de lo de más por línea: lo que pasa de lo pedido después de recibir, si pasa del umbral (la tela, con `inventario.porcentaje_de_mas_tela`), menos lo que ya pasaba si ya pasaba del umbral (decisión 559).
- **`inventario.aplicar_decision_recepcion_de_mas`** (`internas/material.ts`), registrado para `recepcion_de_mas`: rechazado, crea las devoluciones `esperado` (en Aduana hasta lo que su A- tiene ahí sin apartar, el resto en Bodega) y recalcula la orden. `direccion.decidir_autorizacion` le pasa la cantidad y la unidad de la autorización (decisión 566).
- **`inventario.recibido_de_ordenes`** (`lecturas/recibido-de-ordenes.ts`) recibe líneas y órdenes y regresa `lineas` (lo contado menos las devoluciones de esa orden y ese material que no se cancelaron) y `recepciones` por orden con su día en hora de México (decisión 562).
- **Los parámetros** `inventario.dias_ventana_ordenes` y `inventario.porcentaje_de_mas_tela`.
- **Pruebas:** `acciones/recibir-de-proveedor.prueba.ts`, `internas/aplicar-decision-recepcion-de-mas.prueba.ts` y `lecturas/recibido-de-ordenes.prueba.ts`; las ayudas están en `nucleo/pruebas/aduana-de-prueba.ts`.

**Fase 11, parte 3.**

- **`inventario.recibir_en_aduana`** (`acciones/recibir-en-aduana.ts`): lo que viene en camino, completo o con lo contado de cada renglón (`falta_renglon`); lo que llegó pasa de En camino a aduana a Aduana con su traspaso y lo que no llegó se queda en su tramo, a cargo de quien lo mandó. La devolución de un cliente llega `esperado` de Fuera, siempre contada: lo que llegó entra a Aduana y lo que no, nunca fue inventario. Lo de cada tipo que sigue (el hijo con lo bueno, Calidad, las tiendas, Tienda en línea) llega con su fase (decisión 574).
  - `con_defecto` y `defecto_id` llegan al contrato en la fase 16, con las devoluciones de los clientes (abajo).
  - Si todo es material, dice «{folio} recibido en aduana», sin piezas; si faltó material, sigue «. Faltó material: queda por aclarar a cargo de {quien lo mandó}» (decisión 587).
- **`inventario.devolver_a_proveedor`** (`acciones/devolver-a-proveedor.ts`): si espera en aduana, la tela con los rollos escogidos (`rollo_ajeno`; sin rollos, `400` «Escoge los rollos que regresan»; un rollo dos veces, `400` «Un rollo va una sola vez», decisión 582) y lo demás con su cantidad exacta (`cantidad_distinta`).
  - **El reparto** (`repartirDeLosA`) sigue las reglas de [repartir](traspasos.md#repartir) sobre todos los A- de la orden que siguen en aduana, por folio: de cada renglón del mismo material y rollo, como mucho lo que le queda, y lo que falte, del siguiente; el A- que se queda vacío pasa a `repartido` (decisión 580). Antes de leer nada, la acción bloquea la devolución y esos A- en una sola llamada y luego toma el candado de lo recibido de la orden: dos devoluciones de la misma orden, o una devolución y el despacho de su A-, se ponen en fila (decisión 589).
  - **Si Bodega la surtió y Aduana la recibió,** sale lo que Aduana recibió de ella menos lo repartido; lo que no llegó se queda en su tramo, y si no llegó nada, `no_esta_en_aduana` (decisión 581). Solo los rollos que salen quedan `devuelto`, y la orden se recalcula. Lo recibido de la línea ya bajó por todo lo que Bodega surtió, también lo que se quedó en el tramo (en Pendientes, con la 575). El aviso de los rollos que no suman lo rechazado solo sale al escogerlos en aduana.
- **Los rollos que regresan** (`dominio/devoluciones.ts`) pasan a ser los renglones de la devolución, enteros: lo que la línea baja de su recibido es lo que de verdad regresa, y si no suma lo rechazado, avisa la diferencia (decisión 575). Si regresa más que lo rechazado, la línea baja de lo pedido y la orden vuelve a `recibida_en_parte`; queda en Pendientes para Bruno.
- **Pruebas:** `acciones/recibir-en-aduana.prueba.ts` (también el `409`), `devolver-a-proveedor.prueba.ts` (el rollo repetido, lo de más en dos recepciones, dos devoluciones de la misma orden a la vez, la devolución recibida con diferencias, el avío que todavía va en tránsito a Bodega y el `409`) y, en `recibir-de-proveedor.prueba.ts`, dos recepciones de la misma orden a la vez con una partida nueva que nace una sola vez.

**Fase 16, parte 3.** Lo surtido para un pedido externo (`surtido_pedido_externo`) llega con su reserva, que el movimiento pasa a Aduana. Si el pedido ya no está abierto (lo dice `ventas.documentos_abiertos`), sus reservas se liberaron al cancelarlo y lo recibido se reparte en un hijo `regresa` a Bodega con `regresarAlOrigen` (`internas/reservas.ts`), la misma que usa liberar lo de un documento cancelado que ya estaba en aduana; el mensaje sigue «. El pedido se canceló: regresa a Bodega en {A}» (decisión 686). Lo prueba `acciones/recibir-en-aduana.prueba.ts`.

**Fase 16, parte 4.** En una devolución de un cliente, cada renglón dice si llegó con defecto (`con_defecto`, `defecto_id`), que se guarda en su renglón de la recepción y del traspaso: lo bueno pasa a Bodega en un hijo del mismo tipo y lo de defecto se queda en el padre para Calidad, con el mensaje «{folio} recibida: pasa a Calidad» (ver [entregas y devoluciones de clientes](entregas-y-devoluciones-de-clientes.md#cómo-está-hecho)). Lo prueba `revisar-devolucion.prueba.ts`.

**Fase 14, parte 1.** `recibir_en_aduana` abre una DF- `recepcion` por renglón que no cuadró, en En camino a aduana y a cargo del origen del traspaso, con su renglón, su recepción y su movimiento; lo que no llegó de una devolución de un cliente no la abre. Lo prueba `acciones/recibir-en-aduana.prueba.ts`.

**Fase 17, parte 1.** `recibir_de_proveedor` llama `contaduria.revisar_facturas_de_orden` después de recalcular la orden. Escribe con su clave el renglón de cada factura que cambió y suma a su mensaje «. {FP} ya se puede pagar» o «. {FP} no cuadra con lo recibido», sin montos. `aplicar_decision_recepcion_de_mas` también la llama al rechazar y pone esos renglones en el `despues` de la decisión (decisión 701). La forma de lo que regresa (`facturasRevisadas`) está en `dominio/recepciones.ts`.

**Cierre de la fase 17** (decisión 716): las dos toman el candado de lo recibido y luego, con `contaduria.bloquear_ordenes_ligadas`, la orden y las ligadas por sus facturas, en orden de id. Si la orden se cerró porque quedó recibida con sus facturas pagadas, la recepción lo anota en su renglón (`orden_cerrada`) y el rechazo en el `despues` de la decisión. La carrera de rechazar mientras se recibe está en `contaduria/internas/revisar-facturas-de-orden.prueba.ts`.

**Fase 18, parte 1.** `recibir_en_aduana` de un traspaso `pedido_linea` pregunta a `linea.pedidos_abiertos` si el W- sigue abierto: si se canceló, lo que llegó se reparte en un `regresa` a su origen; si sigue, llama `linea.prendas_en_aduana` con `completo` cuando todas sus reservas activas ya están en Aduana. El PE- y el W- usan la misma revisión (`pedidoDelSurtido`).
