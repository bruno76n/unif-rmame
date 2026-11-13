# Pantallas de Aduana

> **Qué cubre:** las pantallas de Aduana (Andén, Recepción, En camino a aduana, Despacho, Inventario en aduana, En tránsito, Empaque en línea e Historial), los cajones Recibir del taller, Recibir material, Recibir lo que viene en camino y Despachar, y la ventana Devolver al proveedor, cada una con su consulta, sus textos, sus estados y sus botones.
> **Estado:** Decidido.
> **Se construye en:** [fase 19](../../fases/19-web-principal.md).
> **Se conecta con:** [traspasos](../../modulos/inventario/traspasos.md) · [recepciones en aduana](../../modulos/inventario/recepciones-en-aduana.md) · [recepción del taller](../../modulos/inventario/recepcion-del-taller.md) · [surtido y despachos](../../modulos/inventario/surtido-y-despachos.md) · [existencias y cuadre](../../modulos/inventario/existencias-y-cuadre.md) · [libro de movimientos](../../modulos/inventario/libro-de-movimientos.md) · [entregas y devoluciones de clientes](../../modulos/inventario/entregas-y-devoluciones-de-clientes.md) · [diferencias, ajustes y mermas](../../modulos/inventario/diferencias-ajustes-y-mermas.md) · [material en bodega](../../modulos/inventario/material-en-bodega.md) · [notas de entrega](../../modulos/ventas/notas-de-entrega.md) · [pedidos en línea](../../modulos/linea/pedidos-en-linea.md) · [impresión](../../modulos/admin/impresion.md) · [pantallas de Ventas](ventas.md) · [pantallas de Tienda en línea](tienda-en-linea.md) · [lo común de las pantallas](../comunes.md) · [pantallas de Bodega](bodega.md) · [etiquetas](../../impresos/etiquetas.md) · [hojas](../../impresos/hojas.md)

## Para qué sirve

Es la puerta de la fábrica: todo entra y sale por aquí, y nada pasa sin que lo confirmen los dos lados. Ejemplo: Javier abre el andén; en «Entra» está el L-2026-124 que Calidad aprobó. Lo cuenta talla por talla sin ver lo aprobado: 58 piezas para la Tienda 1. Imprime sus etiquetas, lo despacha con el D-0414 junto con la solicitud surtida de la misma tienda, y queda en tránsito hasta que la tienda confirme que lo recibió.

## Quién entra

- Las cuentas con Aduana. Nunca ven costos ni precios: la recepción de material no lleva precios, la nota de entrega sale «sin precios» y la ventana «Confirmar entrega» no lleva el total.
- «Ver pedido {PE}» solo sale con Ventas a externos.
- **Pastilla del menú:** lo que lleva más de `inventario.horas_aduana_parado` (72 h) en aduana más los despachos con más de `inventario.dias_sin_confirmar_pastilla` (1) día sin confirmar; roja si algo en aduana sale hoy o mañana (ver [lo común](../comunes.md#sus-consultas)).
- **Acción principal:** «Recibir», en todas las pestañas: abre Recepción.
- **Pestañas,** con su pastilla: Andén · Recepción (lo que falta por recibir) · En camino a aduana (lo que viene) · Despacho · Inventario en aduana (lo parado, en rojo) · En tránsito (sin confirmar) · Empaque en línea (listos para empacar) · Historial.
- La barra superior lleva «¿Dónde está?» (ver [lo común](../comunes.md#dónde-está)).

**La antigüedad** de lo que está en aduana se cuenta desde que llegó: «Llegó hoy», «1 día en aduana», «{n} días en aduana»; verde con menos de `inventario.dias_aduana_ambar` (2) días, ámbar desde ahí y rojo desde `inventario.horas_aduana_parado` (72 h). **Lo que va en camino o en tránsito:** «Salió hoy» (verde), «1 día» (ámbar), y rojo desde `inventario.dias_sin_confirmar_rojo` (2) días. **«Sale hoy»** o **«Sale mañana»** (rojo) cuando su fecha de salida es hoy, mañana o ya pasó.

## Andén

**Consulta:** `inventario.anden`. Aduana abre aquí, en lugar de Pendientes.

| Cifra | Qué dice | Su línea | Lleva a |
|---|---|---|---|
| «Por recibir» | Todo lo que espera entrar: lotes revisados, reprocesos aprobados, órdenes de la ventana de Recepción, lo que viene en camino y las devoluciones esperadas | «{n} atrasadas» (rojo) si hay órdenes atrasadas | Recepción |
| «Salidas hoy o mañana» | Lo que está en aduana con salida hoy, mañana o ya pasada; en ámbar si hay | «Despachos programados» | Despacho |
| «Más de {d} días en aduana» | Lo que pasó de `inventario.horas_aduana_parado`; en rojo si hay | «Inventario detenido» | Inventario en aduana |
| «En tránsito sin confirmar» | Los despachos que su destino no ha confirmado; en ámbar si hay | «Por confirmar en destino» | En tránsito |

**Los carriles:** «Entra», «Tienda 1», «Tienda 2», «En línea», «Clientes externos», «Bodega» y «Calidad», cada uno con su ícono y su conteo; vacío, «Nada por ahora». En los de destino, las tarjetas van por fecha de salida y las que no tienen fecha al final. Cada tarjeta lleva el título, el detalle, la cantidad y, abajo a la derecha, de dónde viene o su antigüedad.

| Tarjeta | Título · detalle · cantidad | Su marca | Al tocarla |
|---|---|---|---|
| Entra · lote o reproceso | La prenda · «{L} · revisado por calidad» o «{L}-R{n} · reproceso aprobado» · «{n} piezas» | «Del taller» | Recibir del taller, o Recibir lo que viene en camino si es reproceso |
| Entra · orden de compra | El proveedor · «{OC} · {materiales}» · «{n} m», «{n} {unidad}» o «{n} materiales» | «mañana», «en {n} días»; atrasada, «Atrasada {n} días» (rojo) y «Debía llegar el {fecha}» | Recibir material |
| Entra · lo que viene en camino | Lo que es · «{folio} · {tipo}» · cuánto | «De bodega» o «Del cliente» | Recibir lo que viene en camino |
| Un carril de destino | Lo que está en aduana para ese destino (la tabla de abajo) | Su antigüedad; «Sale hoy» o «Sale mañana» si toca | Despachar |
| En línea | «Pedido en línea {W}» · «Llegó {n} de {m}», «Completo: listo para empacar» · las piezas que ya están | Su antigüedad | Empaque en línea |
| Calidad | «Devolución de {cliente}» · «{prenda} · {defecto}» | Su antigüedad | Despachar, que dice que espera a Calidad |

**Lo que puede estar en aduana** (en los carriles, en Despacho y en Inventario en aduana):

| Qué es | Título · detalle | Va a |
|---|---|---|
| Lote de un pedido | «{prenda}» · «{cliente} · {PE} · sin nota» | Clientes externos |
| Lo que se quitó de un pedido o le sobró al lote | «{prenda}» · «Se quitó de {PE} · a bodega» o «Sobró de {L} · a bodega» | Bodega |
| Lote de reabasto | «{prenda}» · «Reabasto de {tienda}» | Su tienda |
| Lote de temporada | «{prenda}» · «Temporada» | Bodega |
| Reproceso | «{prenda}» · «{L}-R{n} · {destino del lote}» | El destino de su lote |
| Nota de entrega | «Nota {NV} · {prendas}» · «{cliente} · {PE}» | Clientes externos |
| Solicitud de tienda | «Solicitud de {tienda}» · «{n} prendas, surtido de bodega» | Su tienda |
| Traspaso de reabasto | «Reabasto de bodega para {tienda}» · «{n} prendas, de bodega» | Su tienda |
| Surtido para un pedido | «Pedido {PE} · {cliente}» · «Surtido de bodega» | Clientes externos |
| Material de proveedor | «{materiales}» · «{proveedor} · {n} rollos» | Bodega |
| Devolución de un cliente, con defecto | «Devolución de {cliente}» · «{prenda} · {defecto}» | Calidad decide |
| Regresa a su origen | «Regresa a {Bodega o tienda} · {prenda}» · «{PE} o {W} cancelado» | Su origen |
| Regresa al proveedor | «Regresa a {proveedor}» · «{OC} · lo de más que rechazó Dirección» | El proveedor |
| Pedido en línea | «Pedido en línea {W}» | En línea: no se despacha |

## Recepción

**Consulta:** `inventario.aduana_recepcion` (`todas_las_ordenes`, apagado al abrir). Cuatro grupos que siempre salen, cada uno con «{n} por recibir · {descripción}» o «Nada por recibir»:

- **«Del taller»** («lotes y reprocesos revisados por calidad · conteo ciego»): los lotes revisados sin recibir y los reprocesos aprobados sin recibir («{L}-R{n}»). Va a: el destino del lote; si trae piezas para Bodega, «{destino} y Bodega».
- **«De bodega»** («lo que surtió bodega»): solicitudes surtidas, reabastos, surtidos para pedidos externos, pedidos en línea y lo de más que regresa al proveedor. Folio A- desde que Bodega lo surte.
- **«De proveedores»** («rollo por rollo, con metros y partida»): las órdenes enviadas o recibidas en parte que llegan en `inventario.dias_ventana_ordenes` (7) días o menos, de la que llega antes a la que llega después; una atrasada se ordena como si llegara en `compras.dias_espera_orden_atrasada` (3) días y dice «Atrasada {n} días». Va a: Bodega. Una orden que llega antes también se recibe: «Ver todas las órdenes por recibir», en el encabezado del grupo, agrega las enviadas o recibidas en parte que no entran en la ventana.
- **«De las tiendas y de clientes»:** las devoluciones de clientes externos que se esperan (con su NC-).

Tabla: Qué llega (título y detalle) · Cuánto · Va a (el punto del color del destino y su nombre) · «Recibir», que abre su cajón. Lo del taller no dice lo aprobado más que aquí, en la lista: el cajón cuenta a ciegas.

## En camino a aduana

**Consulta:** `inventario.en_camino_aduana` (`cursor`). Lo que ya salió de Bodega o de un cliente y Aduana no ha recibido. Es una ubicación: entra al cuadre y responde quien lo mandó.

- **Columnas:** Folio (y fecha) · Qué viene (y su tipo · «va a {destino}») · Cuánto · Responde (Bodega o el cliente) · Salió (su color) · «Recibir» → Recibir lo que viene en camino.
- **Vacío:** «Nada en camino a aduana».

## Despacho

**Consulta:** `inventario.aduana_despacho`. Un grupo por destino, en este orden: «Tienda 1», «Tienda 2», «Clientes externos» y «Bodega»; solo los que tienen algo, con «{n} por despachar · {m} piezas» (el material no suma piezas). No salen los pedidos en línea ni lo que espera a Calidad. **Vacío:** «Nada por despachar.»

- **Columnas:** Qué sale (el título, con «Sale hoy» o «Sale mañana» si toca, y «{folio} · {detalle}») · Cuánto (piezas, o metros) · Aquí desde (su antigüedad) · el botón: «Sin nota» si va a un cliente y no tiene nota de entrega, «Despachar» en lo demás. Los dos abren el cajón Despachar; con «Sin nota», bloqueado.

## Inventario en aduana

**Consulta:** `inventario.inventario_en_aduana` (`cursor`).

- **El cuadre, arriba:** «Aduana + Bodega + Tienda 1 + Tienda 2 + Taller + Tránsito + En camino a aduana = Total», en piezas de prenda, con Aduana resaltada. El material en metros no cuenta; lo que está con un cliente o en línea tampoco: ya no es inventario de la fábrica, o es un apartado de Bodega.
- **La tabla,** de lo más viejo a lo más nuevo: Lleva aquí (la antigüedad en su cuadro de color) · Qué es (título y «{folio} · {detalle}») · Cuánto · Va a · el botón: «Despachar»; «Ver pedido» en un pedido en línea (→ Empaque en línea); «Ver» si lo revisa Calidad; «Devolver al proveedor» en lo que regresa a un proveedor (→ su ventana).
- Lo recibido del taller y los rollos de un proveedor llevan «Etiquetas por imprimir» (ámbar) hasta que se imprimen en el cajón Despachar.

## En tránsito

**Consulta:** `inventario.en_transito` (`cursor`). Los despachos que su destino no ha confirmado, el más nuevo primero.

- **Columnas:** Despacho (folio y salida; el recién despachado, resaltado) · Qué salió (y «A {destino o cliente}») · Cuánto · Debe confirmar («Bodega», «Encargada de {tienda}» o el cliente, y «· {n} recordatorios» si hay) · Sin confirmar (su color) · el botón: «Confirmar entrega» en una nota de entrega o en un despacho a una tienda sin caja, «Recordar» en lo demás.
- **«Recordar»** → `inventario.recordar_despacho` («Recordatorio enviado a {responsable}. Solo quien recibe puede confirmar»).
- **«Hoja»,** en cada despacho: el PDF del D- con lo que lleva, sin precios, para que viaje con la mercancía (ver [hojas](../../impresos/hojas.md)).
- **«Confirmar entrega»** de una nota → la ventana de [Ventas](ventas.md#ventanas), sin total en pesos. De una tienda sin caja → la ventana «Confirmar entrega en {tienda}» (abajo).
- Solo quien recibe confirma: Bodega en su pantalla, el cliente con su firma, cada tienda con su caja (con el POS) y, mientras una tienda no tiene caja, su encargada con su firma en la hoja del despacho (ver [migración](../../MIGRACION.md#las-tiendas-sin-caja)). Lo que falte al confirmar queda en Diferencias, a cargo de Aduana. **Vacío:** «Nada en tránsito».

## Empaque en línea

Con `linea.pedidos` (`estado`), con el recorte de Aduana: sin precios, totales ni datos del pago. Dos columnas, con su conteo:

- **«Esperando prendas»** (ámbar): cada W- con su folio y fecha, el destinatario y su municipio, y cada prenda «{prenda} · {talla}», con palomita y «En aduana» o con reloj y «En camino desde Bodega»; abajo, «Falta {n} de {m}».
- **«Listos para empacar»** (verde azulado): todo ya está aquí.

Abajo, la nota «Empacar, pedir la guía y entregar a la paquetería llegan con uniformame.mx». Sin botones. **Vacío:** «Ningún pedido en línea en aduana».

## Historial

**Consulta:** `inventario.aduana_historial` (`cursor`). Todo lo que entró y salió de aduana, lo más reciente primero, sin filtros ni botones: Fecha · Movimiento («Entró» verde, «Salió» ámbar) · Referencia (el folio) · Qué.

| Movimiento | Cuándo | Qué dice |
|---|---|---|
| Entró | Se recibió un lote o un reproceso | «Del taller: {n} piezas, revisadas por calidad» |
| Entró | Se recibió lo que venía en camino | «De {quién}: {n} piezas» y, si hubo, «· {n} de diferencia» |
| Entró | Se recibió una orden de compra | «{proveedor}: {cantidad} m en {n} rollos», o «{proveedor}: {cantidad} {unidad}» |
| Entró | Se recibió la devolución de un cliente | «Devolución de {cliente}: {n} piezas, {m} con defecto» |
| Salió | Un despacho | «A {destino o cliente}: {cantidad}» |
| Salió | Se confirmó la entrega de una nota | «Entregada a {cliente}: {n} piezas, recibió {nombre}» |
| Salió | Bodega confirmó un despacho | «Bodega confirmó {n} piezas», «Bodega recibió {n} de {total} piezas» o «Bodega confirmó el material» |
| Salió | Se devolvió al proveedor | «Regresó a {proveedor}: {cantidad} {unidad} de {material}» |
| Salió | Calidad dio por merma una devolución | «Merma: {n} piezas · {motivo}» |

## Cajones

Los cuatro son anchos. Con algo capturado sin recibir, cerrarlos pregunta antes (ver [lo común](../comunes.md#el-cajón)).

### Recibir del taller

**Consulta:** `inventario.detalle_recibir_taller` (`lote_id`). Lo que aprobó Calidad nunca viaja a esta pantalla: el conteo es a ciegas.

- **Encabezado:** «Del taller · {L}» y la prenda. **Cifras:** «{n} contadas aquí» y «{n} de {m} tallas contadas».
- **«Por talla · Va a {destino}»** («Va a {destino} y Bodega» si parte va a Bodega): una casilla por talla, vacía, hasta 4 cifras, y «Parte va a bodega» en las tallas que la llevan.
- **«Recibir en aduana»** → `inventario.recibir_del_taller`. Una talla sin contar se marca «Cuenta esta talla, aunque sea 0». Bien: «{L} en aduana: {n} piezas para {destino}» y, si no cuadró, «. Faltaron {n} contra lo que aprobó calidad: queda por aclarar a cargo del taller» (o «Sobraron»).
- Al recibir, cada destino nace con su A- en aduana, con sus etiquetas por imprimir; el reparto por talla está en [recepción del taller](../../modulos/inventario/recepcion-del-taller.md), regla 4.

### Recibir material

**Consulta:** `inventario.detalle_recibir_material` (`orden_compra_id`). Sin precios ni costos.

- **Encabezado:** «{OC} · {proveedor}» y «Recibir material».
- **Un bloque por material de la orden al que le falta algo:**
  - **Tela:** «Faltaban {n} m · llegan {suma} m en {n} rollos»; la tabla Rollo (1, 2, 3…) · Metros marcados (con un decimal; acepta coma) · Partida (de 1 a 20 letras) · × («Quitar rollo»; no quita el último); «Otro rollo» agrega uno con la misma partida. Más de una partida: «Llegan {n} partidas distintas» (no detiene). Los folios R- nacen al recibir.
  - **Otro material:** «Faltaban {n} {unidad}» y una casilla en su unidad, con lo que faltaba; entera si su unidad se cuenta entera.
- **«Recibir en aduana»** → `inventario.recibir_de_proveedor`. Errores: «Metros», «Partida», «Número entero», cada uno en su campo y el primero en el aviso ámbar. Bien: «{OC} recibida: queda en aduana hasta que bodega la confirme» y, si llegó de más, «. Llegó de más: {cantidad} {unidad} de {material}, espera autorización de Dirección». En tela, lo de más cuenta desde `inventario.porcentaje_de_mas_tela` (3 %) sobre lo pedido.

### Recibir lo que viene en camino

**Consulta:** `inventario.detalle_recibir_en_camino` (`traspaso_id` o `reproceso_id`).

- **Encabezado:** «{folio} · De {Bodega, Calidad o el cliente}» y lo que es. **Cifras:** cuánto mandaron, cuándo salió y a dónde va.
- **Lo de Bodega:** la tabla Prenda y talla · Mandaron. «Llegó completo» → `inventario.recibir_en_aduana` con todo lo que mandaron. «Llegó con diferencias» agrega la columna «Llegaron», una casilla por renglón con «Cuadra», «Faltan {n}» o «Sobran {n}» al escribir, y cambia el botón a «Recibir lo contado» («Escribe cuántas llegaron de cada prenda, aunque sea 0»).
- **Un reproceso** se cuenta a ciegas: «{L}-R{n} · {prenda} talla {t}», una casilla «Llegaron» vacía y «Recibir lo contado» → `inventario.recibir_reproceso`.
- **La devolución de un cliente:** por renglón, Prenda y talla · Esperadas · «Llegaron bien» · «Con defecto» (cuántas, con el defecto del catálogo). «Recibir devolución» → `inventario.recibir_en_aduana`: lo bueno pasa a Bodega y lo de defecto espera a Calidad. Lo que no llegó no deja diferencia: nunca fue inventario.
- **Avisos al recibir:** «{A} recibido en aduana: {n} piezas para {tienda}» · «{W} completo: listo para empacar» · «{folio} recibida: pasa a Calidad» · «{folio} recibido en aduana: {n} piezas»; si no cuadró, «. Faltaron {n}: queda por aclarar a cargo de {quien lo mandó}».

### Despachar

**Consulta:** `inventario.detalle_despachar` (`traspaso_id`). Se abre desde un carril de destino, Despacho o Inventario en aduana. Un pedido en línea no lo abre: lleva a Empaque en línea.

- **Encabezado:** «{folio} · A {destino}» y el título.
- **Cifras:** «{cantidad} salen» (o «esperan nota») · «{antigüedad} desde el {fecha}» · «{fecha} la esperan» (o «sin fecha»).
- **Datos:** Destino (y el cliente) · Qué es.
- **Según lo que es:**
  - **A un cliente, sin nota:** el candado «Sin nota de entrega no sale. La arma Ventas con lo que recibe el cliente.», la tabla «Por talla · Del pedido {PE}» y «Ver pedido {PE}» (con Ventas a externos).
  - **Una nota de entrega:** «Nota de entrega {NV} · Del pedido {PE} · sin precios», el nombre y la dirección del cliente y la tabla Prenda · Tallas · Piezas, con su total.
  - **Un lote:** «Por talla», con la tabla.
  - **Espera a Calidad:** «{folio} espera la revisión de Calidad», sin botón de despachar.
  - **Material con una devolución pendiente de su orden:** «Primero regresa al proveedor lo de más de {OC}.», sin botón de despachar.
  - **Lo demás:** sin tabla.
- **«Juntar en el mismo despacho»:** lo que también está en aduana para ese destino y puede salir ahora, con una casilla cada uno, ya marcadas. Un D- puede llevar varios: un viaje, una hoja.
- **Las etiquetas,** si las lleva (un lote, un reproceso o los rollos de un proveedor): «Etiquetas por imprimir» o «Impresas el {fecha}», con «Imprimir etiquetas» → `inventario.marcar_etiquetas_impresas` a la Zebra de Aduana («Etiquetas de {folio} mandadas a la impresora de aduana») y «PDF» → la misma acción en PDF, que abre las etiquetas. Sin impresora conectada, la acción no anota nada y responde «La impresora de Aduana no está conectada. Usa el PDF.» (ver [etiquetas](../../impresos/etiquetas.md)).
- **Cuando sí puede salir:** «Queda en camino hasta que {destino} confirme que lo recibió.» o «Queda en camino hasta que {cliente} firme de recibido.»
- **«Despachar a {destino o cliente}»** → `inventario.despachar`, con lo marcado: «{D} sale a {destino}. Queda en tránsito hasta que lo confirmen», o «{NV} sale con {D} a {cliente}. Queda en camino hasta que firme de recibido». Abre En tránsito con el despacho resaltado.

## Ventanas

- **«Devolver a {proveedor}»,** desde el renglón «Regresa a {proveedor}» de Inventario en aduana: «{cantidad} {unidad} de {material} de {OC}». Si es tela, los rollos de esa orden que están en aduana, con una casilla cada uno, y la suma de lo escogido; si no, la cantidad, que tiene que ser lo que regresa. «Devolver al proveedor» → `inventario.devolver_a_proveedor` («{cantidad} {unidad} de {material} regresan a {proveedor}»). Si los rollos no suman lo de más: «Los rollos suman {m} m y lo de más es {n} m: la diferencia se ve en la conciliación de Compras» (no detiene).
- **«Confirmar entrega de {NV}»:** la de [Ventas](ventas.md#ventanas), con «{cliente} · {n} piezas» sin el total.
- **«Confirmar entrega en {tienda}»,** de un despacho a una tienda sin caja, con la hoja firmada en la mano: «Recibió» (el nombre de la encargada que firmó, 3 letras o más) y «Llegó completo», o «Llegó con diferencias» con cuántas llegaron de cada renglón, aunque sea 0. «Confirmar entrega» → `inventario.entregar_a_tienda_sin_caja` («{D} entregado en {tienda}: {n} piezas», y si faltó algo, «. Faltaron {n}: queda por aclarar a cargo de Aduana»).

Los mensajes de error de cada acción están en su archivo del módulo.

## Lo que no se copia de la muestra

- Aduana nunca ve pesos: la ventana «Confirmar entrega» sale sin el total.
- Cerrar un cajón con un conteo empezado pregunta antes; la muestra lo perdía sin aviso.
- La partida se escribe libre, de 1 a 20 letras, y el folio de cada rollo nace al recibir: no se escribe.
- Los colores de antigüedad y el «más de 3 días» salen de los parámetros de [traspasos](../../modulos/inventario/traspasos.md), no de números fijos.
- Un despacho puede juntar varias cosas para el mismo destino.
- «Devolver al proveedor», la devolución de un cliente con lo que llegó con defecto, y lo que espera a Calidad o a una devolución de su orden, son pantallas nuevas.
- Empaque en línea solo muestra lo que espera y lo listo: empacar, la guía, «La recogió la paquetería» y su historial llegan con uniformame.mx.
- Las salidas de las tiendas, los sobrantes y el destino «por decidir» llegan con el POS.
- Las listas largas se paginan.
- Mientras una tienda no tiene caja, Aduana confirma su entrega con la firma de su encargada en la hoja del despacho: la muestra la confirmaba desde el sistema de tienda.

## Cómo está hecho

**Fase 19, parte 11.**

- **Las consultas** están en `apps/api/src/modulos/inventario/consultas/`, con sus contratos en `packages/compartido/src/contratos/inventario/aduana.ts` (las pestañas) y `aduana-cajones.ts` (los cajones): `anden.ts`, `aduana-recepcion.ts`, `en-camino-aduana.ts`, `aduana-despacho.ts`, `inventario-en-aduana.ts`, `en-transito.ts`, `aduana-historial.ts`, `detalle-recibir-taller.ts`, `detalle-recibir-material.ts`, `detalle-recibir-en-camino.ts` y `detalle-despachar.ts`. Todas piden el departamento Aduana y ninguna salida lleva precios, costos ni centavos. Los textos, las antigüedades y sus colores los escribe la consulta; la pantalla solo los pinta. Empaque en línea lee `linea.pedidos`, con el recorte de Aduana.
- **Lo que comparten** está en `consultas/aduana-comun.ts`: `leerEnAduana` lee lo que está en aduana (los traspasos `en_aduana` y lo de más que espera regresar al proveedor desde aduana) con lo que queda de cada renglón; el color de la antigüedad y el «Sale hoy» salen de la vista `partidas_aduana`, y lo que espera regresar toma los del A- de su orden. `partidaDe` lo escribe con la tabla «Lo que puede estar en aduana» (título, detalle, destino y botón). `leerPorRecibir` junta lo que espera entrar: los lotes revisados y los reprocesos aprobados sin recibir (`produccion.lote_para_aduana` y `calidad.aprobadas_del_lote`), lo que viene en camino y las devoluciones esperadas, y las órdenes de `compras.ordenes_por_recibir` dentro de `inventario.dias_ventana_ordenes` (o todas), de la que llega antes a la que llega después. Lo que va en camino o en tránsito se colorea con `inventario.dias_sin_confirmar_rojo`.
- **A ciegas:** `inventario.detalle_recibir_taller` manda las tallas que revisó Calidad sin lo aprobado, y el reproceso de `inventario.detalle_recibir_en_camino` no manda ni lo aprobado ni renglones. Solo la lista de Recepción dice lo aprobado.
- **La web** está en `apps/web/src/rutas/aduana/` (el Andén en `index.tsx`; `recepcion`, `en-camino`, `despacho`, `inventario`, `transito`, `empaque` —la que enlaza Tienda en línea— e `historial`) y `apps/web/src/departamentos/aduana/`: `pagina.tsx` (las pestañas con su pastilla, de `inventario.anden`, y «Recibir», que abre Recepción), `direccion.ts` (el cajón —`taller`, `material`, `camino`, `reproceso` y `despachar`—, «todas» las órdenes de Recepción y el despacho recién hecho que En tránsito resalta van en la dirección), `comun.tsx` (las consultas que vuelve a leer cada acción, el color de cada destino y lo que abre cada tarjeta), `pestanas/`, `cajones/` y `ventanas/` (Devolver al proveedor, Confirmar entrega de una nota y Confirmar entrega en una tienda sin caja). Recibir material revisa lo capturado con el mismo esquema del contrato antes de mandarlo; cada error va en su campo y el primero en el aviso ámbar.
- **Pruebas:** una por consulta en `consultas/*.prueba.ts` (el departamento, sin precios ni costos, y lo que trae con la muestra y con lo que pone cada caso con las ayudas de `nucleo/pruebas/`; `aduana-de-prueba.ts` pide como Aduana y recibe un lote), y `apps/web/src/departamentos/aduana/aduana.prueba.ts`: cada pestaña en escritorio y en teléfono con su captura en `.revision/capturas/aduana/`, los cajones por su dirección y cada botón con su acción y su aviso de abajo.
- **Al juntar:** las listas que se arman completas (En camino, Inventario en aduana) se cortan con `paginarLista` del núcleo, y las que se leen por página leen su cursor con `desdeDelCursor` (decisión 792).
