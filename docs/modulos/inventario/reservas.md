# Reservas

> **Qué cubre:** las piezas apartadas para un documento: quién tiene derecho a ellas, cómo nacen, cómo viajan con la pieza, cómo se liberan, se transfieren y vencen, y cómo cambian las piezas libres.
> **Estado:** Decidido.
> **Se construye en:** [fase 9 ●](../../fases/09-inventario-libro-existencias-reservas-y-traspasos.md).
> **Se conecta con:** [libro de movimientos](libro-de-movimientos.md) · [existencias y cuadre](existencias-y-cuadre.md) · [traspasos](traspasos.md) · [excepciones](excepciones.md) · [módulos](../../cimientos/MODULOS.md) · [idempotencia y concurrencia](../../cimientos/IDEMPOTENCIA-Y-CONCURRENCIA.md) · [eventos y trabajos](../../cimientos/EVENTOS-Y-TRABAJOS.md) · [configuración](../admin/configuracion.md) · [tallas y tipos de prenda](../catalogo/tallas-y-tipos-de-prenda.md) · [mandar a producción](../ventas/mandar-a-produccion.md) · [pedidos](../ventas/pedidos.md) · [notas de entrega](../ventas/notas-de-entrega.md) · [pedidos en línea](../linea/pedidos-en-linea.md) · [pantallas de Bodega](../../interfaz/fabrica/bodega.md) · [pantallas de Tienda en línea](../../interfaz/fabrica/tienda-en-linea.md) · [surtido y despachos](surtido-y-despachos.md) · [diferencias, ajustes y mermas](diferencias-ajustes-y-mermas.md) · [recepción del taller](recepcion-del-taller.md) · [entregas y devoluciones de clientes](entregas-y-devoluciones-de-clientes.md)

## Para qué sirve

Una reserva dice que ciertas piezas ya tienen dueño, aunque sigan en el mismo lugar. No mueve existencia: es una capa aparte, encima del libro.

Ejemplo: Ventas manda a producción el pedido PE-0145 y, en la revisión, surte de bodega 20 playeras polo talla 10. Nace una reserva `pedido_externo` de 20 piezas en Bodega. Bodega sigue teniendo las mismas piezas, pero ya no están libres: su pantalla las cuenta en «Comprometido». Cuando esas piezas viajan a Aduana, la reserva viaja con ellas; cuando salen con su nota de entrega, la reserva se cumple.

## Reglas

1. **Una reserva nunca mueve existencia.** La existencia solo la cambian los movimientos del [libro](libro-de-movimientos.md). Crear, transferir, liberar o cumplir una reserva no es un movimiento.
2. **Viaja con la pieza.** Cuando un movimiento lleva piezas reservadas de un lugar a otro, la reserva cambia su `ubicacion_id` en la misma transacción. Mientras van de camino o están en aduana, la reserva apunta además al traspaso que las lleva (`traspaso_id`).
3. **Libres = existencia − reservas activas en esa ubicación.** Puede quedar negativo cuando hay más apartado que lo que hay en ese lugar. Las demás cuentas que salen de aquí (disponible en bodega, comprometido, libre total) y su fórmula completa están en [existencias y cuadre](existencias-y-cuadre.md).
4. **Nada se aparta de más en Bodega para un pedido externo.** Si dos acciones quieren las últimas piezas al mismo tiempo, una gana y la otra recibe `sin_libres`. Se logra con el candado de la variante antes de escoger o mover reservas, y el bloqueo de sus existencias en el orden fijo (ver [base de datos](../../cimientos/BASE-DE-DATOS.md#candados)); si Postgres corta por bloqueo, la acción se reintenta sola (ver [idempotencia y concurrencia](../../cimientos/IDEMPOTENCIA-Y-CONCURRENCIA.md)).
5. **Un pedido en línea nunca se queda sin reserva.** Si no hay pieza en ningún lado, se reserva igual en Bodega (sus libres quedan en negativo) y nace la [excepción](excepciones.md) `pedido_linea_sin_pieza` para que alguien la resuelva.
6. **Una reserva nunca bloquea una venta en tienda.** La caja avisa que la pieza ya está pedida, pero cobra si la cajera lo decide. Lo que pasa después con la reserva llega con el proyecto del POS (ver «Lo que llega después»).
7. **Nada se borra.** Una reserva que deja de servir no se elimina: cambia de estado, con `terminada_en` y `motivo_fin`.
8. **Las acciones de este archivo son internas.** Ninguna pantalla las llama directo: las llaman otros módulos dentro de su propia transacción, como dice [módulos](../../cimientos/MODULOS.md). No llevan clave de idempotencia propia: la clave de la acción que las llama evita que se repitan.

### Motivos

| Motivo | Para qué | Documento | Quién la crea |
|---|---|---|---|
| `pedido_externo` | Lo que Ventas surte de bodega para un pedido, y lo listo en aduana para él | PE- (`pedido_id`) | Ventas, fase 16 |
| `nota_entrega` | Lo que ya va en una nota de entrega | NV- (`nota_entrega_id`) | Ventas, fase 16 |
| `pedido_linea` | Lo de un pedido en línea pagado o con pago pendiente | W- (`pedido_linea_id`) | Tienda en línea, fase 18 |
| `apartado_tienda` | Un apartado del mostrador | AP-T1- (`apartado_tienda_id`) | Caja de tienda, proyecto del POS |
| `pedido_especial_tienda` | Un pedido especial de tienda, al recibir su lote | PE-T1- (`pedido_especial_tienda_id`) | Caja de tienda, proyecto del POS |

La tabla acepta los cinco motivos desde la fase 9, aunque los dos de tienda se usen hasta que exista el POS.

### Estados

| Estado | Qué significa | Cómo llega |
|---|---|---|
| `activa` | Las piezas tienen dueño | Al nacer |
| `consumida` | Se cumplió: la pieza salió con su documento | El movimiento que la cumple la marca (`consumida_por_movimiento_id`) |
| `liberada` | Ya no hace falta: se canceló el documento, venció el pago o se quitó del pedido | `liberar_reservas` |
| `transferida` | Pasó a otra reserva que la reemplaza | De pedido a nota, de nota a pedido, a otra ubicación, o el resto de una entrega por partes (`transferida_a_reserva_id`) |

## La tabla `reservas`

Dueño: módulo `inventario`.

| Columna | Tipo | Nulo | Qué es |
|---|---|---|---|
| `id` | uuid | no | Llave. Si la crea la caja de tienda, el id que hizo el aparato |
| `ubicacion_id` | uuid | no | → `ubicaciones.id`. Dónde están hoy las piezas |
| `variante_id` | uuid | no | → `variantes.id` |
| `piezas` | integer | no | Mayor que 0 |
| `motivo` | text | no | Uno de los cinco motivos de arriba |
| `pedido_id` | uuid | sí | → `pedidos.id` (PE-) |
| `nota_entrega_id` | uuid | sí | → `notas_entrega.id` (NV-) |
| `pedido_linea_id` | uuid | sí | → `pedidos_linea.id` (W-) |
| `pedido_linea_renglon_id` | uuid | sí | → `pedido_linea_renglones.id` |
| `apartado_tienda_id` | uuid | sí | → `apartados_tienda.id` (AP-T1-) |
| `pedido_especial_tienda_id` | uuid | sí | → `pedidos_especiales_tienda.id` (PE-T1-) |
| `traspaso_id` | uuid | sí | → `traspasos.id`. El traspaso que lleva las piezas mientras van de camino o están en aduana |
| `estado` | text | no | `activa`, `consumida`, `liberada` o `transferida` |
| `vence_en` | timestamptz | sí | Solo con pago pendiente. Si pasa sin pago, se libera |
| `separada_en` | timestamptz | sí | Cuando la tienda confirma que separó la pieza de un pedido en línea |
| `transferida_a_reserva_id` | uuid | sí | → `reservas.id`. La que la reemplazó |
| `consumida_por_movimiento_id` | uuid | sí | → `movimientos.id`. El que la cumplió |
| `terminada_en` | timestamptz | sí | Cuando dejó de estar activa |
| `motivo_fin` | text | sí | `cumplida`, `documento_cancelado`, `vencio_pago`, `quitada_del_pedido`, `nota_cancelada`, `pasa_a_nota`, `reasignada` o `no_la_encontro`. Vacío mientras está activa |
| `nota_fin` | text | sí | Lo que explica el fin cuando hace falta (por ejemplo, lo que dijo la tienda en «No la encuentro») |

Además lleva las columnas comunes de toda tabla de negocio (quién y cuándo la creó y la cambió, y `version`) y, con el POS, `xid_escritura`, porque baja a la caja de tienda (ver [base de datos](../../cimientos/BASE-DE-DATOS.md#columnas-comunes)).

**Reglas de la tabla (CHECK):**
- La llave del documento que corresponde al motivo va llena: `pedido_externo` → `pedido_id`; `nota_entrega` → `nota_entrega_id`; `pedido_linea` → `pedido_linea_id`; `apartado_tienda` → `apartado_tienda_id`; `pedido_especial_tienda` → `pedido_especial_tienda_id`.
- `estado` distinto de `activa` si y solo si `terminada_en` va lleno.

**Índices:** (`ubicacion_id`, `variante_id`) de las activas · (`vence_en`) de las activas que tienen vencimiento · `pedido_linea_id` · `nota_entrega_id` · `pedido_id` · `traspaso_id` · `version`.

Las llaves a tablas que nacen después (`pedidos`, `notas_entrega`, `pedidos_linea`, `pedido_linea_renglones` y las de tienda) llevan su `@llavePendiente` hasta la fase que crea cada tabla.

## Acciones internas

Si una regla no se cumple, la acción que llamó termina con **422** y el código y el mensaje de abajo (formato en [API](../../cimientos/API.md)).

### `inventario.reservar`

- **La llama:** Ventas, en «Surtir de bodega» (fase 16) · Tienda en línea, con un W- pagado o con pago pendiente (fase 18), y un W- de cambio (con uniformame.mx) · la caja de tienda, al levantar un apartado (proyecto del POS).
- **Recibe:**
  - `motivo`: `pedido_externo`, `apartado_tienda` o `pedido_linea`, con su documento (`pedido_id`, `apartado_tienda_id` o `pedido_linea_id`).
  - `renglones[]`: `variante_id`, `piezas`; `ubicacion_id`, obligatoria en un apartado (es la tienda); `pedido_linea_renglon_id`, o el `id` que hizo el aparato en un apartado.
  - `vence_en`, opcional: solo para un W- con pago pendiente. Si no viene, se usa ahora más `inventario.horas_reserva_pago_pendiente`.
- **Reglas:**
  - `pedido_externo`: se aparta en Bodega y nunca por encima de lo disponible. Si no alcanza: `sin_libres` «{prenda} talla {t}: solo hay {n} libres en bodega».
  - `apartado_tienda`: nunca rechaza, porque la pieza está en la mano de la tienda.
  - `pedido_linea`: escoge la ubicación de cada renglón en el orden de `inventario.orden_surtido_linea`, y puede partir un renglón en varias ubicaciones. Si no hay pieza en ningún lado, aplica la regla 5.
  - Las reservas de una nota nacen con `apartar_para_nota`, y las de un pedido especial de tienda, al recibir su lote (proyecto del POS).
- **Escribe:** una reserva `activa` por renglón y ubicación. Si toma piezas que están en aduana con destino a Bodega, ese traspaso se reparte en un hijo `pedido_linea` (ver [traspasos](traspasos.md)) y la reserva apunta al hijo.
- **Regresa,** por renglón: `reserva_id`, `ubicacion_id` y, en un W-, la promesa: `sale_hoy` si todo está en Bodega o en Aduana, `sale_manana` si algo está en una tienda. Tienda en línea la congela en su pedido.
- **Eventos:** `reserva.creada` · `excepcion.creada` si no hubo pieza.

### `inventario.liberar_reservas`

- **La llama:** Ventas, al cancelar un pedido o al guardar una versión que baja una talla apartada en bodega (fase 16) · Tienda en línea, al cancelar un W- (fase 18) · la caja de tienda, al cancelar un apartado o un pedido especial ya recibido (proyecto del POS) · el trabajo «Vencer reservas».
- **Recibe:** el documento (motivo y su id) o `reserva_ids[]`; `motivo_fin`: `documento_cancelado`, `vencio_pago` o `quitada_del_pedido`; si el documento se canceló (sí o no); y, opcional, `piezas` por variante para liberar solo una parte.
- **Reglas:** solo se liberan las activas; las demás se ignoran sin error.
- **Escribe:**
  - Las reservas pasan a `liberada`, con `terminada_en` y `motivo_fin`. Si se libera solo una parte, la reserva queda `transferida` a una nueva con lo que sigue apartado.
  - **Documento cancelado (W- o PE-):** lo que está en aduana se reparte en un hijo `regresa` con destino a su origen (Bodega o la tienda; si vino del Taller, Bodega) y Aduana lo despacha como cualquier otro. Lo que viene en camino se reparte cuando Aduana lo recibe. Lo que ya salió de aduana no se toca.
  - **Pedido especial de tienda cancelado, ya recibido:** solo se libera; la pieza se queda en la tienda.
- **Eventos:** `reserva.liberada` · `traspaso.repartido` si hubo.

### `inventario.confirmar_pago_reserva`

- **La llama:** Tienda en línea, cuando la pasarela confirma el pago de un W- con pago pendiente (fase 18).
- **Recibe:** `pedido_linea_id`.
- **Reglas:** si sus reservas siguen activas, se les quita el vencimiento. Si ya vencieron (el pago llegó tarde), se vuelve a reservar como en `reservar`; si no hay pieza en ningún lado, nace la excepción `pago_despues_de_vencer`.
- **Escribe:** `vence_en` vacío, o reservas nuevas.
- **Eventos:** `reserva.creada` si se volvió a reservar · `excepcion.creada` si no hubo pieza.

### `inventario.apartar_para_nota`

- **La llama:** Ventas, en «Crear nota {NV}» (fase 16).
- **Recibe:** `nota_entrega_id`, `pedido_id` y `renglones[]` (`variante_id`, `piezas`).
- **Reglas:**
  - `nada_listo`: el pedido tiene que tener algo listo en aduana, es decir, reservas `pedido_externo` activas en Aduana. Si no: «Nada listo en aduana para este pedido».
  - `sin_listo`: por talla, nada por encima de lo listo: «Solo hay {n} listas de {prenda} talla {t}».
- **Escribe:**
  - Reparte los traspasos del pedido que están en aduana (`lote_cliente`, `surtido_pedido_externo`, `reproceso`) en hijos tipo `nota_entrega`, uno por padre, con folio `{padre}-{n}`, destino al cliente externo y su nota. No es un movimiento.
  - Las reservas `pedido_externo` quedan `transferidas` (`pasa_a_nota`) a reservas nuevas `nota_entrega` en Aduana, ligadas a cada hijo.
- **Regresa:** los `traspaso_id` de la nota.
- **Eventos:** `traspaso.repartido` · `reserva.transferida`.

### `inventario.devolver_de_nota`

- **La llama:** Ventas, en «Cancelar nota» de una nota que no ha salido (fase 16).
- **Recibe:** `nota_entrega_id`.
- **Reglas:** `nota_ya_salio`: sus traspasos tienen que seguir en aduana. Si no: «{NV} ya salió con {D}».
- **Escribe:** cada traspaso de la nota se reparte en un hijo `lote_cliente` del mismo pedido, y las reservas `nota_entrega` quedan `transferidas` (`nota_cancelada`) a reservas nuevas `pedido_externo` en Aduana. No es un movimiento.
- **Eventos:** `traspaso.repartido` · `reserva.transferida`.

## Lecturas

### `inventario.listo_en_aduana(pedido)`

- **La usa:** Ventas, para el avance del pedido, «Crear nota» y «Pasar a bodega» (fase 16).
- **Regresa,** por variante del pedido externo:
  - las piezas listas en Aduana sin nota (sus reservas `pedido_externo` activas en Aduana);
  - las apartadas en Bodega («de bodega»);
  - las que vienen en camino a aduana.

## Parámetros

Los cambia solo la dueña, en Configuración, y cada cambio queda con su historial (ver [configuración](../admin/configuracion.md)). Este módulo los siembra con su valor inicial en la fase 9.

| Parámetro | Valor inicial | Para qué |
|---|---|---|
| `inventario.horas_reserva_pago_pendiente` | 24 horas | Plazo de una reserva con pago pendiente |
| `inventario.minutos_vencer_reservas` | 5 minutos | Cada cuánto busca el trabajo las reservas vencidas |
| `inventario.orden_surtido_linea` | Bodega; luego Aduana, lo que va a Bodega; luego la tienda sincronizada con más libres sobre su mínimo | Dónde se aparta un pedido en línea y a dónde se reasigna |

## Permisos

Ninguno propio. Cada acción que llama a estas revisa el suyo: por ejemplo, «Surtir de bodega» pide el de Ventas.

## Eventos

`reserva.creada` · `reserva.liberada` · `reserva.transferida` · `reserva.vencida`. Cómo se guardan y se reparten está en [eventos y trabajos](../../cimientos/EVENTOS-Y-TRABAJOS.md).

## Lo que llega después

- **Con la tienda en línea (fase 18):**
  - El trabajo «Vencer reservas»: cada `inventario.minutos_vencer_reservas` busca las reservas activas con `vence_en` vencido. Por pedido, llama `liberar_reservas` (`vencio_pago`) y, en la misma transacción, `linea.vencer_pedido`, que pasa el W- a vencido. Emite `reserva.vencida` y no avisa a nadie.
  - Se construye en esa fase porque el único que aparta con pago pendiente es el W-.
- **Con el proyecto del POS:**
  - Los apartados y los pedidos especiales de tienda usan los dos motivos que la tabla ya acepta.
  - La venta de una pieza reservada: la venta se registra igual, y la reserva del W- se reasigna a otra ubicación con libres o, si no hay, se queda con su excepción.
  - «No la encuentro» desde la caja, cuando la tienda no halla la pieza que debía separar (Bodega lo tiene desde la fase 16, ver [entregas y devoluciones de clientes](entregas-y-devoluciones-de-clientes.md#inventariono_la_encuentro)).
  - Las reservas de cada tienda bajan a su caja.

## Cómo está hecho

**Fase 9, parte 3.**

- **La tabla** `reservas` está en `modulos/inventario/tablas.ts` (migración `0028`), con los CHECK de este archivo:
  - el documento de su motivo;
  - activa si y solo si no tiene `terminada_en` ni `motivo_fin`;
  - `transferida` con su reemplazo y `consumida` con su movimiento.
- **Sus llaves** a tablas de fases posteriores llevan su `@llavePendiente`.
- **Por dentro** (`dominio/reservas.ts`):
  - **Crear, terminar y partir:** una reserva que cambia solo en parte se parte en dos nuevas, y la original queda `transferida` a la que sigue igual (decisión 477). `tomarDeReservas` toma de las más viejas primero.
  - **Las libres:** las cuenta `libresEn`.
  - **El paso 5 de `escribirMovimiento`:** las reservas activas ligadas al traspaso del renglón pasan a su destino. Al llegar al destino del traspaso se les quita el traspaso. Si salen a Fuera con una entrega (`tiposQueEntregan`: `entrega_cliente_externo`, `entrega_tienda_sin_caja`, `salida_linea` y `venta_tienda`) se cumplen con el movimiento (decisión 478); con otra salida (una pérdida, una merma) no se tocan: se quedan enteras donde estaban, y sus libres en negativo lo explican (decisión 503).
- **Las internas** (`internas/reservas.ts`) toman primero el candado de cada variante y, después del candado, vuelven a leer lo que deciden y solo cambian reservas que siguen `activa`. `reservar` y las que escriben un movimiento bloquean además sus existencias en el orden fijo; `liberar_reservas`, `confirmar_pago_reserva`, `apartar_para_nota` y `devolver_de_nota` solo necesitan el de la variante, porque no tocan existencias fuera de un movimiento.
  - **`reservar`** aparta en Bodega un PE-, nunca de más (`sin_libres`). Un apartado de tienda nunca se rechaza.
  - **Un W-** sigue `inventario.orden_surtido_linea`, un texto con los pasos `bodega`, `aduana_a_bodega` y `tiendas` (decisión 480). Lo de aduana se reparte en un hijo `pedido_linea`, y lo que falta queda en Bodega, en negativo, con `sin_pieza`. Con `pago_pendiente`, vence a las `inventario.horas_reserva_pago_pendiente` (decisión 481). La excepción de un W- sin pieza se abre en la parte 4 (decisión 482).
  - **`liberar_reservas`** libera todo o, con `piezas`, solo una parte. Con el documento cancelado, lo de aduana se reparte en un `regresa` a su origen: Bodega si vino del Taller o de fuera.
  - **`confirmar_pago_reserva`** toma el candado de sus variantes y quita el vencimiento a las que siguen activas o, si el pago llegó tarde (o «Vencer reservas» las liberó mientras esperaba), vuelve a apartar lo vencido (decisión 506).
  - **`vence_en`** se valida como fecha con zona (`z.iso.datetime({ offset: true })`): un texto que no lo es, es un error de forma y no de Postgres.
  - **`apartar_para_nota` y `devolver_de_nota`** reparten, uno por padre en orden por id, y transfieren las reservas a las del hijo; antes revisan que lo que hay en aduana sea lo apartado, y si no, es un error del programa (decisión 507). Las de una nota llevan también su pedido (decisión 486). `nota_ya_salio` nombra el folio que pasa Ventas y el del traspaso, hasta que existan los D- (decisión 485).
- **Las lecturas** `libres` y `listo_en_aduana` están en `lecturas/reservas.ts`.
- **El reparto** se lleva las reservas que le pasa quien reparte (`reservaIds`, decisión 479). Las lee después de tomar el candado de sus variantes y del traspaso, y solo cambia las que siguen `activa`.
- **Pruebas:**
  - `internas/reservar.prueba.ts`: dos conexiones a la vez, en diez rondas. Se vio en rojo quitando el candado.
  - `internas/reservas.azar.prueba.ts`: cuatro conexiones a la vez, cada paso en su transacción sin el reintento del núcleo, meten piezas, apartan y liberan todo o una parte, al azar; nunca se aparta en Bodega más de lo que hay, y lo apartado es lo pedido menos lo liberado.
  - `internas/liberar-reservas.prueba.ts` (también el pago confirmado mientras se libera por vencer), `internas/apartar-para-nota.prueba.ts` y `internas/devolver-de-nota.prueba.ts`.
  - `dominio/escribir-movimiento.prueba.ts` (la reserva que viaja) y `dominio/repartir-traspaso.prueba.ts` (la que pasa al hijo).

**Fase 18, parte 1** (con los pedidos en línea):

- **El trabajo «Vencer reservas»** (`trabajos/vencer-reservas.ts`) corre cada `inventario.minutos_vencer_reservas`. Por W- con reservas activas ya vencidas, en una transacción, llama primero `linea.vencer_pedido`, que bloquea el W-, y solo si quedó vencido libera sus reservas con `vencio_pago`: así se pone en fila con un pago que llega a la vez, que también bloquea el W- primero. Guarda `reserva.vencida` y un renglón «{W} venció sin pago» (decisión 722).
- **`confirmar_pago_reserva`** regresa también la promesa que dan las reservas activas (decisión 720).
- **`liberar_reservas`** regresa también dónde estaba cada prenda liberada (`liberadas`), para la bitácora de quien cancela.
- **`reservar`** de un W- recibe `no_encontradas_en_bodega`: las piezas que Bodega no encontró siguen en su existencia hasta contarlas y no cuentan como libres (decisión 721).
- Las pruebas de reservas usan W- de verdad (`pedidoLineaDePrueba`), porque `reservas.pedido_linea_id` ya tiene su llave.
