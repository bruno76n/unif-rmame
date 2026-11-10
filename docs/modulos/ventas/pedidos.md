# Pedidos y sus versiones

> **Qué cubre:** el pedido PE- de un cliente externo, talla por talla: el borrador, la confirmación con el precio congelado, las versiones cuando cambia después, la cancelación, su avance (entregado, en nota, listo, de bodega, en producción, por mandar), su etapa y su alerta, y lo que otros módulos leen de él.
> **Estado:** Decidido.
> **Se construye en:** [fase 16](../../fases/16-ventas-a-externos.md).
> **Se conecta con:** [clientes](clientes.md) · [mandar a producción](mandar-a-produccion.md) · [notas de entrega](notas-de-entrega.md) · [notas de crédito](notas-de-credito.md) · [precios](../catalogo/precios.md) · [productos](../catalogo/productos.md) · [tallas y tipos de prenda](../catalogo/tallas-y-tipos-de-prenda.md) · [crédito de clientes](../contaduria/credito-de-clientes.md) · [anticipos](../contaduria/anticipos.md) · [pagos y saldo a favor](../contaduria/pagos-y-saldo-a-favor.md) · [cuentas por cobrar](../contaduria/cuentas-por-cobrar.md) · [órdenes de producción](../produccion/ordenes-de-produccion.md) · [lotes](../produccion/lotes.md) · [cambios a pedido](../produccion/cambios-a-pedido.md) · [reservas](../inventario/reservas.md) · [recepción del taller](../inventario/recepcion-del-taller.md) · [revisión de lotes](../calidad/revision-de-lotes.md) · [configuración](../admin/configuracion.md) · [folios](../admin/folios.md) · [pantallas de Ventas](../../interfaz/fabrica/ventas.md) · [entregas y devoluciones de clientes](../inventario/entregas-y-devoluciones-de-clientes.md) · [hojas](../../impresos/hojas.md) · [flujo 01 · Pedido externo](../../flujos/fabrica/01-pedido-externo.md)

## Para qué sirve

Lo que pide un cliente queda escrito, con su precio, y cada cambio deja su versión. Ejemplo: Ventas levanta el PE-0145 de Distribuidora Escolar Zamora: 120 playeras polo de las tallas 8 a 14, para el 20 de noviembre, con anticipo. Lo guarda como borrador y luego lo confirma: el precio queda congelado y nace la versión 1. Una semana después Zamora pide 10 más de talla 10: «Guardar versión 2» guarda el antes y el después, y las 10 quedan por mandar a producción. Si hubiera pedido 10 menos y ya estuvieran en producción, Producción recibiría el cambio para ajustar sus lotes.

## Reglas

1. **Un renglón por talla** (variante), con su precio. El pedido es de un cliente, que no cambia.
2. **El borrador** se edita en su lugar, con el precio de hoy. Levantarlo deja su renglón en la bitácora; guardarlo después, no.
3. **Confirmar congela el precio** de cada renglón: el dado, o si no, el sugerido de hoy (ver [precios](../catalogo/precios.md#el-precio-sugerido-a-un-cliente-externo)), más el recargo de una talla especial. Nace la versión 1.
4. **Lo que impide guardar o confirmar:**
   - un cliente detenido por crédito no levanta pedidos nuevos ni confirma (el borrador que ya existía sí se guarda), y una versión suya no puede sumar piezas; lo ya confirmado sigue su camino;
   - «Crédito» sin límite de crédito (ver [crédito de clientes](../contaduria/credito-de-clientes.md));
   - un cliente dado de baja;
   - una prenda sin precio sugerido ni dado, que no se vende a clientes externos o descontinuada, y una talla dada de baja;
   - un pedido sin piezas, o una talla fuera de 0 a `ventas.piezas_max_talla` (9,999);
   - una entrega antes de hoy (al modificar, si no cambió, se deja).

   Una talla descontinuada solo avisa: ya no se fabrica y sale de lo que hay en bodega.
5. **Los días de crédito** se toman del crédito del cliente al guardar con «Crédito», y el pedido los congela; con contado o anticipo son 0.
6. **Después de confirmar, cada cambio es una versión,** solo si cambió algo (prendas, tallas, fecha o forma de pago). Los renglones que cambian se cierran en esa versión y nacen los nuevos con su precio congelado: un renglón confirmado nunca cambia. Ninguna talla baja de su mínimo (entregado + en nota + listo en aduana), y no se quita una prenda con piezas entregadas, en nota o en aduana.
7. **Al guardar una versión:** si cambió la fecha, Producción la pasa a sus órdenes y sus lotes; si una talla baja y deja de más lo apartado en Bodega, lo que sobra se libera; si quedan piezas de más en producción, nace el cambio de pedido para Producción (ver [cambios a pedido](../produccion/cambios-a-pedido.md)).
8. **Queda entregado** solo cuando lo entregado cubre lo pedido en cada talla, al confirmar una entrega o al guardar una versión. Su anticipo sin usar pasa a favor del cliente (ver [anticipos](../contaduria/anticipos.md)).
9. **Se cancela** con motivo y solo sin notas de entrega no canceladas. Sus lotes que no han llegado a aduana pasan a temporada; lo que está en aduana o viene en camino para él regresa a Bodega; sus reservas se liberan; y su anticipo disponible pasa a favor del cliente.
10. **El pedido es un agregado con sus renglones:** cualquier cambio en ellos sube su versión (ver [idempotencia y concurrencia](../../cimientos/IDEMPOTENCIA-Y-CONCURRENCIA.md#que-nadie-pise-a-nadie)).

## El avance, la etapa y la alerta

**El avance,** por prenda y talla:

| Cuenta | Cómo sale |
|---|---|
| Pedido | La cantidad vigente |
| Entregado | Lo de sus notas entregadas |
| En nota | Lo de sus notas por despachar y en camino |
| Listo en aduana · de bodega | Lo listo en aduana sin nota, y lo apartado en Bodega o en camino a aduana para él (ver [reservas](../inventario/reservas.md#inventariolisto_en_aduanapedido)) |
| En producción | Lo de sus lotes y sus reprocesos (ver [lotes](../produccion/lotes.md#reglas), regla 9); en reproceso, aparte |
| Lo que le falta | Pedido − entregado − en nota − listo − de bodega. Con esto reparte Aduana un lote del pedido (ver [recepción del taller](../inventario/recepcion-del-taller.md#reglas)) |
| Por mandar | Lo que le falta − en producción, si es más de 0 |
| Piezas de más | En producción − lo que le falta, si es más de 0 |

**La etapa** de un pedido confirmado: «Confirmado» si no se ha mandado ni surtido nada; «Entrega parcial» si hay algo entregado o en nota; «Listo en aduana» si todo lo que falta está listo y no hay notas; si no, «En producción» (lo surtido de bodega cuenta aquí).

**La alerta,** la primera que aplique: «Atrasado» (la entrega ya pasó) · «Listo para entregar» (hay algo listo) · «Por mandar a producción», o «{n} piezas por mandar» si ya tiene orden · «En riesgo de atraso» (entrega en `ventas.dias_en_riesgo` (3) días o menos y lo listo y en nota no cubre lo que falta entregar) · «Cambio por aplicar» (Producción no ha aplicado un cambio suyo).

Son funciones puras en `modulos/ventas/dominio/`: reciben lo que dan las lecturas de Inventario y Producción y lo de sus notas. Las usan las lecturas de abajo y las consultas de Ventas (fase 19).

## Estados

| De | A | Qué pasa | Quién |
|---|---|---|---|
| — | `borrador` | «Guardar borrador» | Ventas |
| — · `borrador` | `confirmado` | «Guardar y confirmar», «Confirmar y mandar a producción» o «Confirmar pedido»: nace la versión 1 | Ventas |
| `confirmado` | `confirmado` | «Guardar versión {v}» o «Guardar y mandar a producción»: nace la versión siguiente | Ventas |
| `borrador` · `confirmado` | `cancelado` | «Cancelar pedido», con motivo (regla 9) | Ventas |
| `confirmado` | `entregado` | Lo entregado cubre lo pedido (regla 8) | La API |

`entregado` y `cancelado` son finales.

## La tabla `pedidos`

| Columna | Tipo | Nulo | Qué es |
|---|---|---|---|
| `id` | uuid | no | Llave |
| `folio` | text | no | PE-0145 (contador `pedido` de [folios](../admin/folios.md)). Único |
| `cliente_id` | uuid | no | → `clientes.id` |
| `estado` | text | no | CHECK (`borrador`, `confirmado`, `entregado`, `cancelado`) |
| `fecha_entrega` | date | no | La de la versión vigente |
| `forma_pago` | text | no | CHECK (`contado`, `anticipo`, `credito`). En pantalla, «Crédito {n} días» |
| `dias_credito` | integer | no | CHECK: 0 con contado o anticipo; > 0 con crédito (regla 5) |
| `version_vigente` | integer | no | default 1. El número de su versión vigente; no es la columna común `version` |
| `confirmado_en` · `confirmado_por` | timestamptz · uuid | sí | CHECK: llenos desde `confirmado` |
| `entregado_en` | timestamptz | sí | |
| `cancelado_en` · `cancelado_por` · `motivo_cancelacion` | | sí | CHECK: llenos en `cancelado` |

Lleva las columnas comunes (ver [base de datos](../../cimientos/BASE-DE-DATOS.md#columnas-comunes)); `creado_por` es quien lo levantó. **Índices:** único (`folio`) · (`cliente_id`, `estado`) · (`estado`, `fecha_entrega`) donde no es final. Con esta tabla dejan su `@llavePendiente` las columnas que apuntan a `pedidos` (en lotes, órdenes de producción, traspasos, reservas, anticipos, pagos, cuentas por cobrar y saldo a favor).

## La tabla `pedido_renglones`

| Columna | Tipo | Nulo | Qué es |
|---|---|---|---|
| `id` | uuid | no | Llave |
| `pedido_id` | uuid | no | → `pedidos.id` |
| `variante_id` | uuid | no | → `variantes.id`: la prenda y la talla |
| `cantidad` | integer | no | CHECK ≥ 0. Una prenda que ya estaba puede quedar en 0 |
| `desde_version` · `hasta_version` | integer · integer | no · sí | Vale para las versiones de `desde_version` hasta antes de `hasta_version`; vacía, sigue vigente. CHECK hasta ≥ desde. En borrador, una prenda que se quita queda con `hasta_version` = 1 |
| `precio_sugerido_centavos` · `origen_sugerido` · `porcentaje_aplicado` | bigint · text · numeric(6,3) | sí | El sugerido, de dónde salió (`lista_cliente`, `porcentaje_cliente`, `mayoreo` o `mostrador`) y el porcentaje que usó |
| `precio_dado_centavos` | bigint | sí | El que escribió Ventas. Se guardan los dos |
| `recargo_especial_centavos` | bigint | no | default 0. El de una talla especial |
| `precio_unitario_centavos` | bigint | no | El dado, o el sugerido, más el recargo. CHECK > 0 |
| `congelado_en` | timestamptz | sí | Cuando se congeló; vacío en borrador |

Lleva las columnas comunes. **CHECK:** dado o sugerido, al menos uno. **Índices:** (`pedido_id`) donde `hasta_version` es nulo · (`variante_id`) donde `hasta_version` es nulo.

## La tabla `pedido_versiones`

La foto de cada versión de un pedido confirmado. Solo crece.

| Columna | Tipo | Nulo | Qué es |
|---|---|---|---|
| `id` | uuid | no | Llave |
| `pedido_id` | uuid | no | → `pedidos.id` |
| `numero` | integer | no | Único con `pedido_id`. 1 es la confirmación |
| `origen` | text | no | CHECK (`confirmacion`, `modificacion`, `pasar_a_bodega`) |
| `fecha_entrega` · `forma_pago` · `dias_credito` | date · text · integer | no | Los de esa versión |

Lleva las columnas comunes; `creado_por` y `creado_en` dicen quién la guardó y cuándo. El antes y el después de cada renglón salen de `pedido_renglones`, no se copian.

## Acciones

Todas son de la web, con el departamento Ventas. Las tres primeras reciben el pedido así: `pedido_id` y `version` (si ya existe) · `cliente_id` · `fecha_entrega` · `forma_pago` (la pantalla abre en `ventas.forma_pago_inicial`) · `renglones`: uno por talla, con `variante_id`, `cantidad` y `precio_dado_centavos` (opcional).

### `ventas.guardar_borrador_pedido`

| | |
|---|---|
| **Pantalla** | Cajón Pedido nuevo · «Guardar borrador»; cajón Modificar pedido (borrador) · «Guardar cambios» |
| **Recibe** | El pedido |
| **Reglas y errores** | `400`: «Escoge el cliente.» · «Pon la fecha de entrega.» · «Agrega al menos una prenda con piezas.» · «Escribe el precio en pesos» · «Pon las piezas por talla» · «Número entero»<br>`422 entrega_pasada`: «La entrega no puede ser antes de hoy.»<br>`422 cliente_detenido`: «{cliente} está detenido por crédito: no se le pueden levantar pedidos nuevos.» (solo uno nuevo)<br>`422 cliente_dado_de_baja`: «{cliente} está dado de baja.»<br>`422 cliente_no_cambia`: «El cliente no cambia en un pedido que ya existe.»<br>`422 sin_credito`: «Sin crédito: de contado o con anticipo hasta que Contaduría le ponga límite.»<br>`422 sin_precio`: «{prenda}: sin precio para este cliente en Catálogo.»<br>`422 no_se_vende_a_externos`: «{prenda} no se vende a clientes externos. Catálogo lo prende en su ficha.»<br>`422 producto_descontinuado`: «{prenda} está descontinuado: Catálogo lo puede reactivar.»<br>`422 talla_dada_de_baja`: «{prenda} talla {t} está dada de baja.»<br>Avisos que no detienen: «Cerca de su límite de crédito» · «{prenda} talla {t} está descontinuada: ya no se fabrica; solo sale lo que hay en bodega.» |
| **Escribe** | El pedido, `borrador` (nuevo con su folio, o con su fecha, su forma de pago y sus días), y sus renglones con el precio de hoy, sin congelar (regla 2) |
| **Llama** | `contaduria.credito_de_cliente` · `catalogo.precio_sugerido` · `admin.tomar_folio` (`pedido`), si es nuevo |
| **Regresa** | `pedido_id`, el folio y el total. «{PE} guardado como borrador para {cliente}» o «{PE} actualizado» |
| **Eventos** | `pedido.guardado` |
| **Bitácora** | Solo el pedido nuevo: «{persona} levantó el pedido {PE} para {cliente}» |

### `ventas.confirmar_pedido`

| | |
|---|---|
| **Pantalla** | Cajón Pedido nuevo · «Guardar y confirmar» o «Confirmar y mandar a producción»; cajón Pedido (borrador) · «Confirmar pedido» |
| **Recibe** | `pedido_id` y `version` (confirma el borrador como está), o el pedido sin `pedido_id` (lo crea y lo confirma) |
| **Reglas y errores** | Las del borrador<br>`422 cliente_detenido`: «{cliente} está detenido por crédito: el pedido no se confirma hasta que Contaduría lo libere.»<br>`422 pedido_no_es_borrador`: «{PE} ya está {estado}.»<br>Aviso que no detiene: «{prenda}: el precio de Catálogo cambió desde el borrador; quedó en ${precio}.» |
| **Escribe** | El pedido, `confirmado`, con quién y cuándo. Sus renglones con el precio congelado (regla 3). La versión 1, `confirmacion` |
| **Llama** | Las del borrador |
| **Regresa** | `pedido_id`, el folio y las piezas por mandar. «{PE} confirmado para {cliente}. El precio quedó congelado.» Con «Confirmar y mandar a producción», la pantalla abre después la revisión (ver [mandar a producción](mandar-a-produccion.md)) |
| **Eventos** | `pedido.confirmado` |
| **Bitácora** | «{persona} lo confirmó; el precio quedó congelado», con los renglones y su precio en `despues` |

### `ventas.guardar_version_pedido`

| | |
|---|---|
| **Pantalla** | Cajón Modificar pedido (confirmado) · «Guardar versión {v}» o «Guardar y mandar a producción» |
| **Recibe** | El pedido, con `pedido_id` y `version`. Los renglones son lo que debe quedar: uno vigente que no viene se quita; uno en 0 se queda en 0 |
| **Reglas y errores** | Las del borrador de forma, crédito, precio, canal y talla<br>`422 sin_cambios`: «Sin cambios»<br>`422 talla_bajo_minimo`: «{prenda} talla {t}: mínimo {n}.»<br>`422 prenda_no_se_quita`: «{prenda} ya tiene piezas entregadas o en aduana: no se puede quitar.»<br>`422 pedido_no_confirmado`: «{PE} está {estado}: solo un pedido confirmado guarda versiones.»<br>`422 cliente_detenido`: «{cliente} está detenido por crédito: la versión no puede sumar piezas.» (solo si sube el total de piezas)<br>Aviso que no detiene: «Sobran {n} piezas en producción: Producción ajusta sus lotes» |
| **Escribe** | La versión siguiente, `modificacion`. Los renglones que cambian, cerrados, y los nuevos con su precio congelado. El pedido con su versión vigente, su fecha, su forma de pago y sus días; `entregado` si ya se cubrió (regla 8) |
| **Llama** | `ventas.avance_pedido` (el mínimo y las piezas de más) · `produccion.cambiar_fecha_entrega_pedido`, si cambió la fecha · `inventario.liberar_reservas` (`quitada_del_pedido`), por lo apartado de más en Bodega · `produccion.crear_cambio_pedido`, si quedan piezas de más · `contaduria.pasar_anticipo_a_favor`, si quedó entregado |
| **Regresa** | El número de versión, las piezas por mandar y las de más. «{PE} versión {v} guardada», «{PE} versión {v}: faltan {n} piezas por mandar a producción», «{PE} versión {v}: Producción ajusta sus lotes», o las dos partes juntas |
| **Eventos** | `pedido.version_guardada` · `pedido.entregado`, si aplica |
| **Bitácora** | «{persona} guardó la versión {v}: {cambios}» («Playera polo: talla 14 de 40 a 50, agregó talla 16 (5), quitó talla 18 (3)»), con los renglones que cambiaron, la fecha y la forma de pago en `antes` y `despues` |

### `ventas.cancelar_pedido`

| | |
|---|---|
| **Pantalla** | Cajón Pedido · «Cancelar con motivo» → ventana «Cancelar {PE}» · «Cancelar pedido». La ventana dice antes «Sus {n} lotes pasan a temporada: lo que se produzca va a bodega» |
| **Recibe** | `pedido_id` · `motivo` · `version` |
| **Reglas y errores** | `400`: «Escribe al menos {n} letras.»<br>`422 pedido_con_notas`: «{PE} ya tiene notas de entrega: no se puede cancelar.»<br>`422 pedido_terminado`: «{PE} ya está {estado}.» |
| **Escribe** | El pedido, `cancelado`, con quién, cuándo y su motivo |
| **Llama** | Si estaba confirmado: `produccion.pasar_pedido_a_temporada` · `inventario.liberar_reservas`, con el documento cancelado (lo de aduana y lo que viene en camino regresa a Bodega). Siempre: `contaduria.pasar_anticipo_a_favor` |
| **Regresa** | «{PE} cancelado. Queda en el historial con su motivo» |
| **Eventos** | `pedido.cancelado` |
| **Bitácora** | «{persona} lo canceló: {motivo}» |

## Lecturas

### `ventas.avance_pedido(pedido)`

| | |
|---|---|
| **La usan** | Inventario, para repartir un lote del pedido en aduana (lo que le falta, por talla); y este módulo, al guardar una versión y al mandar a producción |
| **Regresa** | Por prenda y talla, las cuentas del avance; y la etapa y la alerta del pedido |

### `ventas.pedido_para_cobro(pedido)`

| | |
|---|---|
| **La usa** | Contaduría, al registrar un pago o aplicar saldo a favor a un pedido (ver [pagos y saldo a favor](../contaduria/pagos-y-saldo-a-favor.md#lo-que-se-agrega-después-a-estas-acciones)) |
| **Regresa** | Su cliente, si está confirmado y abierto, su total y lo de sus notas no canceladas |

### `ventas.pedidos_abiertos_de_variante(variante)`

| | |
|---|---|
| **La usa** | Catálogo, al dar de baja una talla: `talla_con_pedidos` (ver [tallas y tipos de prenda](../catalogo/tallas-y-tipos-de-prenda.md)) |
| **Regresa** | Los folios de los pedidos en borrador o confirmados con piezas de esa talla |

### `ventas.documentos_abiertos(pedidos, notas)`

| | |
|---|---|
| **La usa** | Inventario, en el paso 6 del cuadre: una reserva de un documento cerrado es `reserva_sin_documento` (ver [existencias y cuadre](../inventario/existencias-y-cuadre.md)) |
| **Regresa** | Cuáles siguen abiertos: un pedido confirmado (ni entregado ni cancelado) y una nota por despachar o en camino |

## Parámetros

Los cambia solo la dueña, en Configuración (ver [configuración](../admin/configuracion.md)). Todos van en «Parámetros».

| Parámetro | Valor inicial | Para qué |
|---|---|---|
| `ventas.forma_pago_inicial` | Anticipo | La forma de pago con que abre un pedido nuevo |
| `ventas.piezas_max_talla` | 9,999 piezas | Lo más que lleva una talla de un pedido |
| `ventas.dias_en_riesgo` | 3 días | La alerta «En riesgo de atraso» y la fecha de entrega en ámbar |
| `ventas.dias_entregas_proximas` | 7 días | El indicador «Entregas en 7 días» |

## Permisos

- Todo lo de este archivo: Ventas. Ventas ve el precio de sus pedidos; Aduana y Bodega nunca.
- Producción ve el pedido en «Ver pedido», sin precios.

## Eventos

`pedido.guardado` · `pedido.confirmado` · `pedido.version_guardada` · `pedido.cancelado` · `pedido.entregado`.

## Lo que llega después

- **Fase 19:** el pedido nuevo y su cajón, Modificar pedido, la lista de pedidos con su etapa y su alerta, y los indicadores de Ventas.

## Cómo está hecho

*Lo escribe Claude Code al terminar la fase 16.*
