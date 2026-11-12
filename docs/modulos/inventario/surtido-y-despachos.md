# Surtido y despachos

> **Qué cubre:** Bodega surte a aduana lo que le piden; Aduana junta lo que va al mismo destino en un despacho D- y lo saca; recordar al destino; anotar las etiquetas impresas; y recibir el despacho del otro lado.
> **Estado:** Decidido.
> **Se construye en:** [fase 11](../../fases/11-aduana-y-bodega.md).
> **Se conecta con:** [traspasos](traspasos.md) · [libro de movimientos](libro-de-movimientos.md) · [reservas](reservas.md) · [recepciones en aduana](recepciones-en-aduana.md) · [entregas y devoluciones de clientes](entregas-y-devoluciones-de-clientes.md) · [notas de entrega](../ventas/notas-de-entrega.md) · [pedidos en línea](../linea/pedidos-en-linea.md) · [impresión](../admin/impresion.md) · [migración](../../MIGRACION.md) · [pantallas comunes](../../interfaz/comunes.md) · [pantallas de Aduana](../../interfaz/fabrica/aduana.md) · [pantallas de Bodega](../../interfaz/fabrica/bodega.md) · [diferencias, ajustes y mermas](diferencias-ajustes-y-mermas.md) · [mínimos y reabasto](minimos-y-reabasto.md) · [recepción del taller](recepcion-del-taller.md) · [mandar a producción](../ventas/mandar-a-produccion.md) · [etiquetas](../../impresos/etiquetas.md) · [hojas](../../impresos/hojas.md)

## Para qué sirve

Nada sale de la fábrica ni llega a Bodega o a una tienda sin pasar por Aduana, y nada se da por recibido hasta que lo confirma quien recibe. Ejemplo de la muestra: la Tienda 1 pidió ropa con la S-T1-088; Bodega surtió y nació el A-04, que Aduana recibió. Aduana lo junta con lo demás que va a la Tienda 1 en el despacho D-0412 y lo saca: queda en tránsito, a cargo de Aduana, hasta que la tienda confirma con lo que contó. Si pasa un día sin confirmar, Aduana aprieta «Recordar»: solo quien recibe confirma. Lo mismo el material: el A- de los rollos de una orden sale a Bodega en su despacho y Bodega lo recibe.

## Reglas

1. **Bodega surte a aduana, nunca directo a otro lado.** Surtir pasa las piezas de Bodega a En camino a aduana con su traspaso A-, y sus reservas viajan con ellas (ver [reservas](reservas.md)). Aquí se surte lo de un pedido externo, lo de un pedido en línea y lo de más que regresa al proveedor; las solicitudes de las tiendas y el reabasto tienen sus propias acciones.
2. **Si Bodega no tiene la pieza que tiene reservada,** no surte: para eso está «No la encuentro» (ver [reservas](reservas.md)).
3. **Un despacho es un viaje:** junta uno o varios traspasos que van al mismo destino en una sola hoja D-, y de cada uno sale todo lo que queda en aduana (lo recibido menos lo repartido).
4. **Lo que no sale por despacho:** un pedido en línea (sale al empacarlo); lo de más que regresa al proveedor (sale con «Devolver al proveedor»); una devolución con defecto que Calidad no ha revisado; el A- del material de una orden mientras su devolución al proveedor espera en aduana; y, a un cliente externo, nada sin su nota de entrega.
5. **El destino** es el del traspaso. Si está por decidir (un sobrante o un «Otro» de tienda), Aduana lo escoge al despachar: Bodega, Tienda 1 o Tienda 2.
6. **En tránsito, a cargo de Aduana,** hasta que el destino confirma. Aduana nunca confirma por el destino: solo puede «Recordar», que avisa a quien recibe (Bodega o la encargada de la tienda). A un cliente externo no se le recuerda: firma de recibido con «Confirmar entrega» (ver [entregas y devoluciones de clientes](entregas-y-devoluciones-de-clientes.md)). Una tienda sin caja tampoco: su encargada firma la hoja del despacho (regla 9).
7. **Recibir del otro lado:** «Llegó completo» toma lo despachado; «Llegó con diferencias» pide cada renglón, aunque sea 0, y lo que no venía. Lo que faltó se queda en Tránsito a cargo de Aduana; lo que sobró o no venía sale del tramo del primer traspaso del despacho (ver [traspasos](traspasos.md#lo-que-queda-en-cada-tramo-y-quién-responde)). El material queda en Bodega, listo para entregar al corte.
8. **Etiquetas:** los lotes, los reprocesos y los rollos de un proveedor salen con sus etiquetas. Aduana las imprime en su impresora o en PDF (ver [impresión](../admin/impresion.md)) y quedan anotadas como impresas; reimprimir se puede y cambia la fecha.
9. **Una tienda sin caja** (su `existencia_desde` va vacía, ver [migración](../../MIGRACION.md#las-tiendas-sin-caja)) firma de recibido en la hoja del despacho, y Aduana confirma con esa firma: lo que llegó sale de la fábrica (`entrega_tienda_sin_caja`, de Tránsito a Fuera), porque la existencia de esa tienda la lleva su punto de venta de hoy, y lo que faltó se queda en Tránsito a cargo de Aduana, como en la regla 7 (ver [migración](../../MIGRACION.md#las-tiendas-sin-caja)).

## Estados del despacho

| De | A | Qué pasa | Quién |
|---|---|---|---|
| — | `en_transito` | «Despachar a {destino}» | Aduana |
| `en_transito` | `en_transito` | «Recordar»: suma un recordatorio | Aduana |
| `en_transito` | `recibido` | El destino confirma completo, o el cliente firma | El destino |
| `en_transito` | `con_diferencia` | El destino recibe con diferencias en algún traspaso | El destino |

## La tabla `despachos`

| Columna | Tipo | Nulo | Qué es |
|---|---|---|---|
| `id` | uuid | no | Llave (v7) |
| `folio` | text | no | D-0412. Único |
| `destino_ubicacion_id` | uuid | sí | → `ubicaciones.id`: Bodega o una tienda |
| `destino_externo` | text | sí | CHECK (`cliente_externo`). Exactamente uno de los dos destinos |
| `cliente_id` · `nota_entrega_id` | uuid | sí | → `clientes.id` · `notas_entrega.id`, con un cliente externo. Llevan su `@llavePendiente` hasta la fase 16 |
| `estado` | text | no | CHECK (`en_transito`, `recibido`, `con_diferencia`) |
| `despachado_en` · `despachado_por` | timestamptz · uuid | no | `despachado_por` → `usuarios.id` |
| `recordatorios` | integer | no | default 0 |
| `ultimo_recordatorio_en` | timestamptz | sí | |
| `recibido_en` · `recepcion_id` | timestamptz · uuid | sí | Cuando el destino confirmó, y su recepción |
| `recibio_nombre` | text | sí | Quién firmó, si es un cliente externo o una tienda sin caja. 3 letras o más |

Lleva las columnas comunes (ver [base de datos](../../cimientos/BASE-DE-DATOS.md#columnas-comunes)) y, con el POS, `xid_escritura`, porque baja a la caja de su tienda. **Índices:** único (`folio`) · (`destino_ubicacion_id`, `estado`) · (`estado`) donde está `en_transito`. Con ella dejan su `@llavePendiente` `traspasos.despacho_id` y `recepciones.despacho_id`.

## Acciones

Todas son de la web: surtir, con el departamento Bodega; despachar, recordar y las etiquetas, con Aduana; recibir un despacho, con Bodega (y con la caja de la tienda destino, con el POS).

### `inventario.surtir_a_aduana`

| | |
|---|---|
| **Pantalla** | Bodega · Pendientes · «Surtir a aduana» en «Pedido externo», «Pedido en línea» y «Devolución a proveedor» (este último, pantalla nueva) |
| **Recibe** | `documento_tipo` (`pedido_externo`, `pedido_linea` o `devolucion_proveedor`) · `documento_id` (el PE-, el W- o la devolución) · `rollo_ids`, en una devolución de tela: los rollos que regresan |
| **Reglas y errores** | `422 nada_en_bodega`: «Nada que surtir de bodega para {folio}» (sin reservas activas en Bodega, o la devolución no espera en Bodega)<br>`422 no_hay_en_bodega`: «No hay {prenda} {talla} en bodega: hay que pedirla a una tienda» (la existencia de Bodega no cubre lo reservado ahí)<br>`422 rollo_ajeno`: «{rollo} no es de {material} de {OC}, o no está en bodega.» |
| **Escribe** | El PE-: un A- `surtido_pedido_externo`, con destino el cliente externo y la fecha de entrega del pedido como salida esperada. El W-: un A- `pedido_linea`, con destino el cliente en línea y salida esperada hoy. La devolución: pasa de `esperado` a `en_camino_aduana`, con sus rollos o su cantidad. Todos con `enviado_en`. El movimiento `surtido_bodega`, de Bodega a En camino a aduana; las reservas viajan con el traspaso |
| **Regresa** | «{PE}: {n} piezas van a aduana. Quedan en camino hasta que aduana las reciba» · «{W} va a aduana: queda en camino hasta que aduana lo reciba» · «{cantidad} {unidad} de {material} van a aduana para regresar a {proveedor}» |
| **Llama** | Con un W-: `linea.prendas_en_camino` (fase 18) |
| **Eventos** | `traspaso.en_camino_aduana` |
| **Bitácora** | «Surtió a aduana {folio}», con las piezas o el material |

### `inventario.despachar`

| | |
|---|---|
| **Pantalla** | Aduana · cajón Despachar · «Despachar a {destino o cliente}». Se abre desde la tarjeta de un carril de destino, Despacho o Inventario en aduana |
| **Recibe** | `traspasos`: al menos uno, todos al mismo destino, cada uno con `traspaso_id` y `version` · `destino_ubicacion_id`, solo si el destino está por decidir |
| **Reglas y errores** | `422 no_esta_en_aduana`: «{folio} no está en aduana.»<br>`400 falta_destino`: «Escoge a dónde va»<br>`422 destinos_distintos`: «Un despacho va a un solo destino»<br>`422 sin_nota`: «Sin nota de entrega no sale» (a un cliente externo solo sale un traspaso `nota_entrega` con su nota por despachar)<br>`422 se_empaca`: «Los pedidos en línea no se despachan: salen al empacarlos»<br>`422 espera_calidad`: «{folio} espera la revisión de Calidad»<br>`422 es_devolucion_proveedor`: «Lo de más que regresa al proveedor sale con «Devolver al proveedor».»<br>`422 devolucion_pendiente`: «Primero regresa al proveedor lo de más de {OC}.» |
| **Escribe** | El despacho: folio D-, `en_transito`, su destino, cuándo y quién. Cada traspaso: `en_transito`, su despacho y su destino, si estaba por decidir. El movimiento `despacho`, de Aduana a Tránsito, con el lote de cada renglón y los rollos del material. Las reservas viajan con su pieza; la de una nota de entrega se cumple al entregarla (ver [reservas](reservas.md)) |
| **Llama** | `admin.tomar_folio`, tipo `despacho` |
| **Regresa** | «{D} sale a {destino}. Queda en tránsito hasta que lo confirmen»; con una nota: «{NV} sale con {D} a {cliente}. Queda en camino hasta que firme de recibido» |
| **Eventos** | `despacho.creado`: avisa al destino que tiene algo por confirmar |
| **Bitácora** | «Despachó {D} a {destino}», con los traspasos y las piezas |

### `inventario.recordar_despacho`

| | |
|---|---|
| **Pantalla** | Aduana · En tránsito · «Recordar» |
| **Recibe** | `despacho_id` · `version` |
| **Reglas y errores** | `422 ya_confirmado`: «{D} ya lo confirmó {destino}»<br>`422 es_cliente`: «A un cliente no se le recuerda: confirma la entrega con su firma.» |
| **Escribe** | Un recordatorio más y su hora |
| **Regresa** | «Recordatorio enviado a {responsable}. Solo quien recibe puede confirmar», con «Bodega» o «Encargada de {tienda}» |
| **Eventos** | `despacho.recordado`: el aviso a las cuentas con Bodega, si el destino es Bodega |
| **Bitácora** | «Recordó {D}», con el número de recordatorio |

### `inventario.marcar_etiquetas_impresas`

| | |
|---|---|
| **Pantalla** | Aduana · cajón Despachar · «Imprimir etiquetas» y «PDF» (un lote o un reproceso recibido, los rollos de un proveedor) |
| **Recibe** | `traspaso_id` · `version` · `destino`: `impresora` (la Zebra de Aduana) o `pdf` |
| **Reglas y errores** | `422 sin_etiquetas`: «{folio} no lleva etiquetas.» (solo traspasos de un lote, un reproceso o el material de un proveedor)<br>Con `impresora`: `422 impresora_sin_puente`, de `admin.mandar_a_imprimir`: «La impresora de Aduana no está conectada. Usa el PDF.» |
| **Escribe** | `etiquetas_impresas_en` del traspaso y, en el material, `etiqueta_impresa_en` de sus rollos. Se anotan al mandarlas: si la Zebra falla, el aviso lo dice y se usa el PDF. Reimprimir cambia la fecha |
| **Llama** | Con `impresora`: `admin.mandar_a_imprimir`, ubicación Aduana, tipo `traspaso` (ver [etiquetas](../../impresos/etiquetas.md#lo-que-lleva-un-a--al-salir-de-aduana)) |
| **Regresa** | Con `impresora`: «Etiquetas de {folio} mandadas a la impresora de aduana». Con `pdf`: la ruta del PDF (`GET /v1/etiquetas/traspaso/{id}?formato=pdf`), que la pantalla abre, y «Etiquetas de {folio} en PDF» |
| **Bitácora** | «Imprimió etiquetas de {folio}» |

### `inventario.recibir_despacho`

| | |
|---|---|
| **Pantalla** | Bodega · cajón Llegada de aduana · «Llegó completo a bodega», o «Llegó con diferencias» → «Recibir lo contado». Con el POS, «Ingresar ropa» en la caja |
| **Recibe** | `despacho_id` · `version` · `modo` (`completo` o `con_diferencias`) · `renglones`, obligatorios con diferencias: por renglón, `traspaso_linea_id` y `piezas` (o `cantidad` por rollo, si es material) · `no_venia`, opcional: `variante_id` y `piezas` |
| **Reglas y errores** | `422 ya_recibido`: «{D} ya se recibió»<br>`422 otro_destino`: «{D} no va a bodega.»<br>`422 es_cliente`: «Lo de un cliente se cierra con «Confirmar entrega».»<br>`400 falta_renglon`: «Escribe cuántas llegaron de cada prenda, aunque sea 0» |
| **Escribe** | La recepción (`destino_despacho`, en el destino), con lo que no venía sin renglón del traspaso. El movimiento `recepcion_despacho`, de Tránsito al destino. Lo que faltó se queda en Tránsito y lo que sobró o no venía sale del tramo del primer traspaso (regla 7). Cada traspaso: `recibido` o `con_diferencia`, con su recepción, lo que confirmó el destino y `terminado_en`. El despacho: `recibido` o `con_diferencia`, con su hora y su recepción. Las reservas viajan con su pieza |
| **Regresa** | «{D}: {n} piezas recibidas en bodega» · con diferencias «{D}: {n} piezas en bodega. Faltaron {n}: queda por aclarar a cargo de Aduana» · el material «{D}: el material ya está en bodega» |
| **Eventos** | `despacho.recibido` |
| **Bitácora** | «Recibió {D}», con lo que llegó, lo que faltó y lo que no venía |

### `inventario.entregar_a_tienda_sin_caja`

| | |
|---|---|
| **Pantalla** | Aduana · En tránsito · «Confirmar entrega» en un despacho a una tienda sin caja → ventana «Confirmar entrega en {tienda}» |
| **Recibe** | `despacho_id` · `version` · `recibio_nombre` (3 letras o más: quien firmó la hoja) · `modo` (`completo` o `con_diferencias`) · `renglones`, obligatorios con diferencias: por renglón, `traspaso_linea_id` y `piezas` |
| **Reglas y errores** | `400`: «Escribe quién recibió» · «Escribe cuántas llegaron de cada prenda, aunque sea 0»<br>`422 ya_recibido`: «{D} ya se recibió»<br>`422 no_es_tienda_sin_caja`: «{tienda} ya lleva su existencia en Unifórmame: confirma desde su caja.» (o el destino no es una tienda) |
| **Escribe** | La recepción (`destino_despacho`), con quién firmó. El movimiento `entrega_tienda_sin_caja`, de Tránsito a Fuera, por lo que llegó; lo que faltó se queda en Tránsito, por aclarar (regla 7). Cada traspaso y el despacho: `recibido` o `con_diferencia`, con su recepción, `recibio_nombre` y su hora |
| **Regresa** | «{D} entregado en {tienda}: {n} piezas» y, si faltó algo, «. Faltaron {n}: queda por aclarar a cargo de Aduana» |
| **Eventos** | `despacho.recibido` |
| **Bitácora** | «Confirmó la entrega de {D} en {tienda}: firmó {nombre}», con lo que llegó y lo que faltó |

## Permisos

- Surtir y recibir en Bodega: Bodega. Despachar, recordar e imprimir etiquetas: Aduana. Confirmar la entrega en una tienda sin caja: Aduana, con la firma.
- Solo quien recibe confirma: Bodega lo que va a Bodega y la caja de cada tienda lo suyo.
- Ninguna de estas acciones regresa precios ni costos.

## Eventos

`traspaso.en_camino_aduana` · `despacho.creado` · `despacho.recordado` · `despacho.recibido`.

## Lo que llega después

- **Fase 12:** los rollos recibidos en Bodega se pueden entregar al corte, y cada recepción de material recalcula los rollos sugeridos (ver [entregas a corte](entregas-a-corte.md)).
- **Fase 14:** la DF- de lo que faltó, sobró o no venía (ver [diferencias, ajustes y mermas](diferencias-ajustes-y-mermas.md)); los lotes y los reprocesos que salen con sus etiquetas (ver [recepción del taller](recepcion-del-taller.md)); y el reabasto (ver [mínimos y reabasto](minimos-y-reabasto.md)).
- **Fase 16:** despachar a un cliente externo con su nota (`ventas.marcar_nota_en_camino`) y surtir un pedido externo (ver [notas de entrega](../ventas/notas-de-entrega.md)).
- **Fase 18:** surtir un pedido en línea, con `linea.prendas_en_camino` (ver [pedidos en línea](../linea/pedidos-en-linea.md)).
- **Fase 20:** la hoja del despacho y el tipo `traspaso`, con las etiquetas de prenda de un lote o un reproceso y las de rollo (ver [hojas](../../impresos/hojas.md) y [etiquetas](../../impresos/etiquetas.md)); hasta entonces se prueba con el tipo de prueba de la fase 4.
- **Con el POS:** Bodega surte las solicitudes de las tiendas («Surtir {n} y pasar a aduana»); la tienda recibe con «Ingresar ropa», también sin internet (si el despacho ya estaba recibido, la excepción `recepcion_duplicada` y nada se mueve); los despachos y sus recordatorios bajan a su caja; la solicitud S-T1- pasa a en tránsito al despachar y a recibida al recibir; y un pedido especial de tienda avanza a «en tienda» con `tiendas.mover_etapa_pedido_especial`. Mientras las tiendas no tengan la caja nueva, ver [migración](../../MIGRACION.md).

## Cómo está hecho

**Fase 11, parte 2.**

- **La tabla** `despachos` está en `apps/api/src/modulos/inventario/tablas.ts` (migración `0037`), con sus CHECK: el estado, un solo destino, recibido si y solo si ya no está en tránsito, y quien firmó con 3 letras o más. Con ella, `traspasos.despacho_id` y `recepciones.despacho_id` ya son llaves; `cliente_id` y `nota_entrega_id` llevan su `@llavePendiente` hasta la fase 16.
- **Las acciones** están en `acciones/despachos.ts`, con sus contratos en `packages/compartido/src/contratos/inventario/despachos.ts`. Antes de tocar nada toman los candados del inventario en el orden fijo (las variantes de sus renglones y luego los traspasos):
  - `despachar` revisa la versión de cada traspaso y lo que no sale por despacho (regla 4; la devolución con defecto siempre espera a Calidad hasta la fase 13, decisión 572), pone su despacho y su destino antes de pasarlo a tránsito, y saca de Aduana a Tránsito, por renglón, lo recibido en aduana menos lo repartido;
  - `recordar_despacho` suma el recordatorio y guarda `despacho.recordado`;
  - `marcar_etiquetas_impresas` solo con un lote, un reproceso o el material de un proveedor; con la impresora llama `admin.mandar_a_imprimir` (tipo `traspaso`, el de prueba hasta la fase 20) y anota el traspaso y sus rollos;
  - `recibir_despacho` (Bodega) y `entregar_a_tienda_sin_caja` (Aduana, con la firma) comparten `confirmarLlegada`: la recepción `destino_despacho` y sus renglones, el movimiento desde Tránsito (al destino o a Fuera), lo que confirmó el destino en cada renglón, cada traspaso y el despacho. De cada renglón sale con su traspaso lo que llegó hasta lo esperado; lo de más y lo que no venía, del tramo del primer traspaso del despacho (por folio, decisión 571). Las reservas viajan con su pieza con `escribirMovimiento`.
- **Al despachar** el A- de una orden, `despachar` toma antes el candado de lo recibido de esa orden: Dirección no rechaza lo de más mientras sale (decisión 584). `falta_destino` es un `400` con su código y el campo `destino_ubicacion_id`.
- **El primer traspaso** queda `con_diferencia` también si cuadra pero de su tramo salió lo de más de otro traspaso o lo que no venía (decisión 583).
- **Lo que falta o sobra se queda en su tramo,** con su DF- (fase 14, abajo).
- **Pruebas:** `acciones/despachar.prueba.ts`, `recibir-despacho.prueba.ts` (también las reservas, la tienda sin caja y las etiquetas) y `recordar-despacho.prueba.ts`; las ayudas están en `nucleo/pruebas/aduana-de-prueba.ts`.

**Fase 11, parte 3.** `inventario.surtir_a_aduana` (`acciones/surtir-a-aduana.ts`):

- **Un pedido externo o en línea:** toma el candado de las variantes de sus reservas en Bodega, revisa que la existencia de Bodega las cubra (`no_hay_en_bodega`, con la prenda y la talla), crea el A- en camino con destino su cliente (el W- con salida esperada hoy), ata sus reservas al A- y escribe `surtido_bodega`: las reservas viajan con su pieza. Mientras no existen Ventas ni Tienda en línea, el mensaje nombra el A- y dice «ese pedido» (decisión 573).
- **Una devolución al proveedor** que espera en Bodega: la tela con los rollos escogidos, enteros (ver [recepciones en aduana](recepciones-en-aduana.md#cómo-está-hecho)); sin rollos, `400` «Escoge los rollos que regresan». Lo que no es tela solo se surte si Bodega ya lo tiene (con sus renglones de Bodega y En camino a aduana bloqueados antes de leer): si no, `422 no_hay_en_bodega` «No hay {n} {unidad} de {material} en bodega: espera a que llegue» (decisión 585). Pasa a en camino y la orden se recalcula.
- **Pruebas:** `acciones/surtir-a-aduana.prueba.ts`, los casos de Bodega de `devolver-a-proveedor.prueba.ts`, y en `despachar.prueba.ts` y `recibir-despacho.prueba.ts`, el `409` y el primer traspaso que cuadra y queda con diferencia.

**Fase 16, parte 4.** Despachar a un cliente externo lleva una sola nota (dos notas en un despacho son `destinos_distintos`, decisión 689) y llama `ventas.marcar_nota_en_camino`, que regresa el folio de la nota y el nombre del cliente para el mensaje «{NV} sale con {D} a {cliente}…». Lo prueba `modulos/ventas/acciones/confirmar-entrega.prueba.ts`.

**Fase 14, parte 1.** Al confirmar la llegada (`recibir_despacho` y `entregar_a_tienda_sin_caja`), cada renglón que no cuadró abre su DF- en Tránsito, a cargo de Aduana: lo que faltó con su traspaso; lo que sobró o no venía, con el primero del despacho (decisión 634). Lo prueba `acciones/recibir-despacho.prueba.ts`.

**Fase 18, parte 1.** `surtir_a_aduana` de un W- llama `linea.prendas_en_camino`: el W- por surtir queda esperando prendas.
