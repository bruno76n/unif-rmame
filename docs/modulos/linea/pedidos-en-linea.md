# Pedidos en línea

> **Qué cubre:** el pedido W- de la tienda en línea, lo mínimo que la fábrica necesita desde la primera versión: recibirlo pagado o con pago pendiente, confirmar el pago, apartar sus prendas, seguirlas hasta aduana, cancelarlo y vencerlo; y la credencial de uniformame.mx que lo manda.
> **Estado:** Decidido.
> **Se construye en:** [fase 18](../../fases/18-tienda-en-linea-direccion-y-contador.md).
> **Se conecta con:** [reservas](../inventario/reservas.md) · [surtido y despachos](../inventario/surtido-y-despachos.md) · [recepciones en aduana](../inventario/recepciones-en-aduana.md) · [excepciones](../inventario/excepciones.md) · [entregas y devoluciones de clientes](../inventario/entregas-y-devoluciones-de-clientes.md) · [existencias y cuadre](../inventario/existencias-y-cuadre.md) · [productos](../catalogo/productos.md) · [variantes, códigos y etiquetas](../catalogo/variantes-codigos-y-etiquetas.md) · [tallas y tipos de prenda](../catalogo/tallas-y-tipos-de-prenda.md) · [dispositivos](../admin/dispositivos.md) · [folios](../admin/folios.md) · [acceso y permisos](../../cimientos/ACCESO-Y-PERMISOS.md) · [pantallas de Tienda en línea](../../interfaz/fabrica/tienda-en-linea.md) · [pantallas de Aduana](../../interfaz/fabrica/aduana.md) · [flujo del pedido en línea](../../flujos/fabrica/06-pedido-en-linea.md)

## Para qué sirve

Lo que se vende en uniformame.mx sale de la misma existencia que todo lo demás, y nunca se rechaza un pedido ya cobrado. Ejemplo: Laura Méndez paga en el sitio dos playeras polo talla 10 y un pantalón talla 12. Llega el W-1045 pagado: sus prendas se apartan en Bodega y queda «Por surtir», con la promesa «Sale hoy». Bodega lo surte a aduana y queda «Esperando prendas»; cuando Aduana recibe lo último, queda «Listo para empacar». Si el pantalón no estuviera en ningún lado, se apartaría igual en Bodega, en negativo, y Bodega vería la excepción «Sin pieza».

## Reglas

1. **Lo manda el sitio, ya cobrado o con pago pendiente,** con la credencial de servidor de uniformame.mx (ver [dispositivos](../admin/dispositivos.md)). El sitio solo crea, cobra y cancela; las etapas las mueve la fábrica. Con `linea.acepta_pago_pendiente` en «No» (al inicio) solo entra lo ya pagado.
2. **Lo que ya pasó se acepta:** un pedido pagado nunca se rechaza por existencia, por precio ni porque la prenda no se venda en línea. Se guarda como llegó y lo que no cuadra abre su [excepción](../inventario/excepciones.md): `totales_no_cuadran` (Contaduría) o `variante_sin_canal_linea` (Bodega).
3. **Todo se congela al llegar:** el cliente, la dirección de envío, el envío que pagó, cada prenda con su nombre, su talla, su precio y sus descuentos, y los totales. El total es subtotal − descuentos + envío − descuento del envío, y el subtotal sale de sus renglones.
4. **Sus prendas se apartan al llegar** con reservas `pedido_linea`, en el orden de `inventario.orden_surtido_linea`; si no hay pieza en ningún lado, en Bodega con la excepción `pedido_linea_sin_pieza` (ver [reservas](../inventario/reservas.md)). La reserva dice la promesa: «Sale hoy» si todo está en Bodega o en Aduana, «Sale mañana» si algo está en una tienda. Se congela al quedar pagado.
5. **Con pago pendiente,** sus reservas vencen en la hora que dice el sitio (o en `inventario.horas_reserva_pago_pendiente`). Si vencen sin pago, el W- queda vencido y sus prendas se liberan. Si el pago llega después, se vuelve a apartar; si ya no hay pieza, nace `pago_despues_de_vencer`.
6. **Un pago, un pedido:** la misma referencia de la pasarela no entra a dos W-.
7. **Se cancela** con motivo, desde la fábrica, mientras no se empaque (también «Listo para empacar»). Lo que ya estaba en aduana regresa a su origen y lo que viene en camino se reparte al llegar. El reembolso lo hace el sitio con su pasarela.
8. **Aduana y Bodega** ven del W- su folio, su estado, su promesa, sus prendas y el destinatario: nunca precios, importes ni datos del pago.

## Estados

| De | A | Qué pasa | Quién |
|---|---|---|---|
| — | `por_surtir` · `esperando_pago` · `listo_para_empacar` | Llega pagado, o con pago pendiente; pagado y con todo apartado ya en aduana, listo para empacar | El sitio |
| `esperando_pago` · `vencido` | `por_surtir` · `listo_para_empacar` | Se confirma el pago (listo para empacar si todo está apartado en aduana) | El sitio |
| `esperando_pago` | `vencido` | Sus reservas vencen sin pago | El trabajo «Vencer reservas» |
| `por_surtir` | `esperando_prendas` | Bodega lo surte a aduana | Bodega |
| `por_surtir` · `esperando_prendas` | `listo_para_empacar` | Aduana recibe lo último, o «No la encuentro» aparta en aduana lo que faltaba | Aduana · Bodega |
| `esperando_pago` · `por_surtir` · `esperando_prendas` · `listo_para_empacar` | `cancelado` | «Cancelar pedido», con motivo | Tienda en línea |

Empacar, pedir la guía, «La recogió la paquetería» y la entrega llegan con uniformame.mx.

## La tabla `pedidos_linea`

| Columna | Tipo | Nulo | Qué es |
|---|---|---|---|
| `id` | uuid | no | Llave: la que manda el sitio |
| `folio` | text | no | W-1045 (contador `pedido_linea`). Único |
| `cliente_nombre` · `cliente_correo` · `cliente_telefono` | text | no · no · sí | Copia congelada |
| `envio_destinatario` · `envio_telefono` · `envio_calle` · `envio_numero_exterior` · `envio_numero_interior` · `envio_colonia` · `envio_municipio` · `envio_entidad_federativa` · `envio_codigo_postal` · `envio_referencias` | text | sí en el teléfono, el interior y las referencias | La dirección, copia congelada. El municipio es la «ciudad» de las pantallas |
| `envio_metodo` · `envio_paqueteria` · `envio_costo_centavos` | text · text · bigint | no | El envío que pagó. CHECK: costo ≥ 0 |
| `cupon_codigo` | text | sí | El código que usó, tal cual |
| `subtotal_centavos` · `descuento_centavos` · `descuento_envio_centavos` · `total_centavos` | bigint | no | Como llegaron (regla 3) |
| `estado` · `estado_en` | text · timestamptz | no | CHECK (`esperando_pago`, `por_surtir`, `esperando_prendas`, `listo_para_empacar`, `cancelado`, `vencido`); y desde cuándo |
| `promesa` | text | sí | CHECK (`sale_hoy`, `sale_manana`). Se congela al quedar pagado |
| `pago_estado` | text | no | CHECK (`pagado`, `pendiente`, `vencido`) |
| `pago_pasarela` · `pago_referencia` · `pago_metodo` | text | no | La pasarela, su referencia y el método |
| `pago_monto_centavos` · `pago_comision_centavos` | bigint | no · sí | |
| `pagado_en` · `pago_vence_en` | timestamptz | sí | CHECK: `pagado_en` lleno con `pagado`; `pago_vence_en`, con `pendiente` |
| `pago_respuesta` | jsonb | sí | Lo que mandó la pasarela, tal cual. Nunca sale en una pantalla |
| `dispositivo_id` | uuid | no | → `dispositivos.id`: la credencial que lo mandó |
| `cancelado_en` · `cancelado_por` · `motivo_cancelacion` | | sí | CHECK: llenos en `cancelado` |

Lleva las columnas comunes (ver [base de datos](../../cimientos/BASE-DE-DATOS.md#columnas-comunes)); `creado_por` va vacío: lo mandó el sitio. **Índices:** único (`folio`) · único (`pago_pasarela`, `pago_referencia`) · (`estado`) · (`cliente_correo`). Con esta tabla deja su `@llavePendiente` `reservas.pedido_linea_id` y `traspasos.pedido_linea_id`.

## La tabla `pedido_linea_renglones`

| Columna | Tipo | Nulo | Qué es |
|---|---|---|---|
| `id` | uuid | no | Llave |
| `pedido_linea_id` | uuid | no | → `pedidos_linea.id` |
| `renglon` | smallint | no | Único con el pedido |
| `variante_id` | uuid | no | → `variantes.id` |
| `producto_nombre` · `talla` | text | no | Copia congelada |
| `cantidad` | integer | no | CHECK > 0 |
| `precio_unitario_centavos` | bigint | no | El precio en línea de esa talla al comprar |
| `paquete_numero` | smallint | sí | Qué paquete del pedido, si vino en uno |
| `descuento_paquete_centavos` · `descuento_centavos` | bigint | no | default 0. Su parte de la rebaja del paquete y del cupón |
| `importe_centavos` | bigint | no | cantidad × precio − sus dos descuentos |

Lleva las columnas comunes. **Índices:** único (`pedido_linea_id`, `renglon`) · (`variante_id`). Con esta tabla deja su `@llavePendiente` `reservas.pedido_linea_renglon_id`.

## Acciones

`linea.recibir_pedido` y `linea.confirmar_pago` llegan del sitio, con la llave de su credencial y sin usuario del panel; `linea.cancelar_pedido` es de la web, con el departamento Tienda en línea. Un comando repetido contesta lo mismo que la primera vez (ver [idempotencia y concurrencia](../../cimientos/IDEMPOTENCIA-Y-CONCURRENCIA.md)).

### `linea.recibir_pedido`

| | |
|---|---|
| **Pantalla** | Ninguna en la fábrica: llega del sitio al cobrar, o al escoger un pago pendiente |
| **Quién** | La credencial de uniformame.mx |
| **Recibe** | `id` (lo hace el sitio) · `cliente`: nombre, correo y teléfono · `envio`: la dirección de la tabla, método, paquetería y costo · `renglones`: al menos uno, con `renglon`, `variante_id`, `cantidad`, `precio_unitario_centavos`, `paquete_numero` y sus dos descuentos · `cupon_codigo`, opcional · los cuatro totales · `pago`: estado (`pagado` o `pendiente`), pasarela, referencia, método, monto, comisión, `pagado_en` o `vence_en`, y la respuesta de la pasarela |
| **Reglas y errores** | `400`: falta un dato obligatorio o una variante no existe<br>`422 pedido_repetido`: «Ese pedido ya está en {W}.» (el mismo `id` con otra clave)<br>`422 pago_repetido`: «Ese pago ya está en {W}.»<br>`422 pago_pendiente_apagado`: «La tienda en línea no acepta pago pendiente.»<br>Nada más lo rechaza (regla 2) |
| **Escribe** | El W-, con todo congelado, `por_surtir` si llegó pagado (`listo_para_empacar` si todo lo apartado ya está en aduana) o `esperando_pago` si no, y la promesa si está pagado; sus renglones |
| **Llama** | `admin.tomar_folio` (`pedido_linea`) · `catalogo.datos_variantes` (nombre, talla y si se vende en línea) · `inventario.reservar`, motivo `pedido_linea`, un renglón por renglón del W-, con el vencimiento si el pago está pendiente · `inventario.registrar_excepcion`, con `totales_no_cuadran` o `variante_sin_canal_linea` |
| **Regresa** | El folio, el estado y la promesa |
| **Eventos** | `pedido_linea.recibido`: Pendientes de Tienda en línea y de Bodega · `pedido_linea.listo_para_empacar` si llega listo |
| **Bitácora** | «Llegó {W} de {cliente}: {n} prendas, {estado}», con la credencial; los renglones, el estado y la promesa en `despues`, sin la respuesta de la pasarela |

### `linea.confirmar_pago`

| | |
|---|---|
| **Pantalla** | Ninguna: la pasarela avisa al sitio y el sitio llama aquí |
| **Quién** | La credencial de uniformame.mx |
| **Recibe** | `pedido_linea_id` · pasarela y referencia · monto · comisión, opcional · `pagado_en` · la respuesta, opcional |
| **Reglas y errores** | `404 no_existe`: el W- todavía no llega; el sitio reintenta<br>`422 pago_repetido`: «Ese pago ya está en {W}.»<br>Un W- ya pagado contesta lo mismo que la primera vez. A un W- cancelado se le guarda el pago y se abre `pago_de_pedido_cancelado`. Un monto distinto del total se acepta y abre `totales_no_cuadran` |
| **Escribe** | El pago, `pagado`, con su hora, su comisión y su respuesta. Un W- `esperando_pago` o `vencido` pasa a `por_surtir` (o a `listo_para_empacar`, si todas sus reservas están en aduana), con la promesa que dan sus reservas |
| **Llama** | `inventario.confirmar_pago_reserva` · `inventario.registrar_excepcion`, si aplica |
| **Regresa** | El estado y la promesa |
| **Eventos** | `pedido_linea.pagado` · `pedido_linea.listo_para_empacar` si queda listo |
| **Bitácora** | «Se pagó {W}: {monto}», con la credencial |

### `linea.cancelar_pedido`

| | |
|---|---|
| **Pantalla** | Tienda en línea · cajón del pedido · «Cancelar pedido» |
| **Quién** | Tienda en línea |
| **Recibe** | `pedido_linea_id` · `motivo` · `version` |
| **Reglas y errores** | `400` en `motivo`: «Escribe el motivo»<br>`422 no_cancelable`: «{W} está {estado}: ya no se puede cancelar.» |
| **Escribe** | El W-, `cancelado`, con quién, cuándo y su motivo; un pago pendiente pasa a `vencido` |
| **Llama** | `inventario.liberar_reservas`, con el W- cancelado (regla 7) |
| **Regresa** | «{W} cancelado. Lo que ya estaba en aduana regresa a su origen» |
| **Eventos** | `pedido_linea.cancelado` |
| **Bitácora** | «Canceló {W}: {motivo}», con el estado en `antes` y dónde estaba cada prenda en `despues` |

## Acciones internas

Su bitácora es el renglón de la acción o del trabajo que las llama.

### `linea.prendas_en_camino`

| | |
|---|---|
| **La llama** | `inventario.surtir_a_aduana`, cuando Bodega surte un W- (ver [surtido y despachos](../inventario/surtido-y-despachos.md)) |
| **Recibe** | `pedido_linea_id` |
| **Reglas y errores** | `422 esperando_pago`: «{W} espera su pago: se surte cuando se pague.» (sus reservas todavía pueden vencer) |
| **Escribe** | Un W- `por_surtir` pasa a `esperando_prendas`; en otro estado, nada |
| **Eventos** | `pedido_linea.esperando_prendas` |

### `linea.prendas_en_aduana`

| | |
|---|---|
| **La llama** | `inventario.recibir_en_aduana`, al recibir un traspaso `pedido_linea` (ver [recepciones en aduana](../inventario/recepciones-en-aduana.md)), e `inventario.no_la_encuentro`, cuando lo que volvió a apartar dejó todo en Aduana (ver [entregas y devoluciones de clientes](../inventario/entregas-y-devoluciones-de-clientes.md)) |
| **Recibe** | `pedido_linea_id` · `completo`: si todas sus reservas ya están en Aduana (lo calcula Inventario) |
| **Escribe** | Con `completo`, el W- pasa a `listo_para_empacar`; si no, se queda esperando prendas. Un W- cancelado no cambia |
| **Eventos** | `pedido_linea.listo_para_empacar`: Aduana lo ve para empacar |

### `linea.vencer_pedido`

| | |
|---|---|
| **La llama** | El trabajo «Vencer reservas», en la misma transacción que libera sus reservas (ver [reservas](../inventario/reservas.md)) |
| **Recibe** | `pedido_linea_id` |
| **Reglas** | Solo un W- `esperando_pago`; en otro estado no hace nada |
| **Escribe** | El W- y su pago, `vencido` |
| **Eventos** | `pedido_linea.vencido` |

### `linea.pausar_publicaciones_producto`

| | |
|---|---|
| **La llaman** | `catalogo.aplicar_cambios_producto`, al apagar «Tienda en línea», y `catalogo.descontinuar_productos` (ver [productos](../catalogo/productos.md)) |
| **Recibe** | `producto_id` · `motivo` (`canal_apagado` o `descontinuado`) |
| **Escribe** | Nada en la primera versión: no hay publicaciones. Con uniformame.mx, sus publicaciones pasan a pausadas |

## Lecturas

### `linea.pedidos_abiertos_de_variante(variante)`

| | |
|---|---|
| **La usa** | Catálogo, al dar de baja una talla: `talla_con_pedidos` (ver [tallas y tipos de prenda](../catalogo/tallas-y-tipos-de-prenda.md)) |
| **Regresa** | Los folios de los W- no cancelados ni vencidos con esa variante |

### `linea.folios_de_pedidos(pedidos)`

| | |
|---|---|
| **La usa** | Inventario, en «No la encuentro», para nombrar el W- de la reserva (ver [entregas y devoluciones de clientes](../inventario/entregas-y-devoluciones-de-clientes.md)) |
| **Regresa** | El folio de cada W- |

### `linea.pedidos_abiertos(pedidos)`

| | |
|---|---|
| **La usa** | Inventario, en el paso 6 del cuadre: una reserva de un W- cerrado es `reserva_sin_documento` (ver [existencias y cuadre](../inventario/existencias-y-cuadre.md)) |
| **Regresa** | Cuáles de esos W- siguen abiertos: no cancelados ni vencidos |

## Parámetros

Los cambia solo la dueña, en Configuración (ver [configuración](../admin/configuracion.md)).

| Parámetro | Valor inicial | Sección | Para qué |
|---|---|---|---|
| `linea.acepta_pago_pendiente` | No | Decisiones de operación | Si entra un W- con pago pendiente (OXXO, transferencia). El sitio no lo ofrece mientras diga que no |
| `linea.dias_pedido_rojo` | 2 días | Parámetros | Desde cuántos días de pagado un W- abierto se pone en rojo en Pendientes de Tienda en línea y en su pastilla (ver [pantallas de Tienda en línea](../../interfaz/fabrica/tienda-en-linea.md)) |

El plazo de un pago pendiente, cada cuánto se vencen las reservas y el orden de surtido son de [reservas](../inventario/reservas.md#parámetros). Usa también `general.largo_minimo_motivo`.

## Permisos

- Recibir el W- y confirmar su pago: solo la credencial de uniformame.mx, y esa credencial no alcanza nada más (ver [sincronización](../../cimientos/SINCRONIZACION.md#lo-que-puede-cada-aparato)).
- Cancelar: Tienda en línea.
- Bodega y Aduana ven el W- con el recorte de la regla 8.

## Eventos

`pedido_linea.recibido` · `pedido_linea.pagado` · `pedido_linea.esperando_prendas` · `pedido_linea.listo_para_empacar` · `pedido_linea.cancelado` · `pedido_linea.vencido`.

## Lo que llega después

- **Fase 19:** Tienda en línea (Pendientes, Pedidos y el cajón del pedido con dónde está cada prenda), «Pedido en línea» en los Pendientes de Bodega y lo listo para empacar en Aduana.
- **Fase 21:** el [flujo del pedido en línea](../../flujos/fabrica/06-pedido-en-linea.md), hasta «Listo para empacar».
- **Con el POS:** las tiendas entran al orden de surtido; una tienda manda su prenda con su salida, que puede llevar varios W- (`linea.prendas_en_camino` desde `inventario.egresar_ropa`), y la regresa si la cancela (`linea.prenda_regresa_a_tienda`); los W- pagados con reserva en una tienda bajan a su caja, sin precios ni datos del cliente (uno con pago pendiente no baja).
- **Con uniformame.mx:** empacar, pedir la guía, «La recogió la paquetería» (`inventario.salida_linea`) y la entrega; la paquetería que no pudo entregar y las devoluciones y cambios en línea (`inventario.esperar_devolucion`, `linea.devolucion_recibida`, el W- de cambio); los clientes con su sesión, los cupones, los paquetes, las publicaciones y el panel con sus usuarios (`X-Usuario-Panel`); corregir la dirección; el precio en línea desde el panel; y los depósitos de la pasarela en Contaduría.

## Cómo está hecho

**Fase 18, parte 1.**

- **Las tablas** `pedidos_linea` y `pedido_linea_renglones` están en `apps/api/src/modulos/linea/tablas.ts` (migración `0062`), con sus CHECK (los estados, la promesa, el pago pagado con su hora y el pendiente con su vencimiento, el cancelado con su motivo, montos que no son negativos y el importe de cada renglón). Los renglones solo crecen. La misma migración pone las llaves de `reservas.pedido_linea_id`, `reservas.pedido_linea_renglon_id` y `traspaso_lineas.pedido_linea_id`.
- **La credencial de uniformame.mx** entra con su llave como el aparato `sitio` (`nucleo/acceso/llave.ts`): no manda `X-App-Version`, no sincroniza (`403 fuera_de_alcance` en subir y bajar) y su bitácora sale con origen `servidor_linea` (decisión 718). Sus contratos (`packages/compartido/src/contratos/linea/pedidos.ts`) piden `aparatos: ["sitio"]`, así que nadie más los llama.
- **Lo común** (`dominio/pedidos.ts`): los estados en palabras, `bloquearPedidoLinea`, el candado del W- y el de la referencia de pago, `folioConElPago`, `totalesQueNoCuadran` (una función pura: el subtotal es la suma de cantidad × precio, el descuento la de los descuentos de sus renglones, y el total subtotal − descuento + envío − descuento del envío), `promesaDePedido` y los eventos.
- **Las acciones** (`acciones/`):
  - `recibir_pedido` toma el candado del W- y el del pago, revisa `pago_repetido` y `pedido_repetido` (decisión 719), lee `catalogo.datos_variantes`, toma su folio W-, guarda todo congelado, aparta con `inventario.reservar` y congela la promesa si llegó pagado. Abre `totales_no_cuadran` (también si lo cobrado no es el total) y `variante_sin_canal_linea` por prenda.
  - `confirmar_pago` bloquea el W-; ya pagado contesta lo mismo, sin renglón de bitácora. Si no, toma el candado del pago, revisa la referencia y llama `inventario.confirmar_pago_reserva`, que regresa la promesa de sus reservas (decisión 720). A un W- cancelado le guarda el pago y abre `pago_de_pedido_cancelado`; un monto distinto del total abre `totales_no_cuadran`.
  - `cancelar_pedido` toma la versión, revisa el estado y llama `inventario.liberar_reservas` con el W- cancelado; la bitácora lleva dónde estaba cada prenda.
- **Las internas** (`internas/pedidos.ts`): `prendas_en_camino` (desde `inventario.surtir_a_aduana`), `prendas_en_aduana` (desde `inventario.recibir_en_aduana`, que calcula `completo` con sus reservas activas en Aduana), `vencer_pedido` (desde el trabajo «Vencer reservas») y `pausar_publicaciones_producto` (desde Catálogo; no escribe nada).
- **Las lecturas** (`lecturas/pedidos.ts`): `pedidos_abiertos_de_variante`, `pedidos_abiertos` y `folios_de_pedidos`, para «No la encuentro» (decisión 721).
- **Los parámetros** `linea.acepta_pago_pendiente` y `linea.dias_pedido_rojo` están en `linea/parametros.ts`. Leen `pedidos_linea` y sus renglones Tienda en línea, Aduana y Bodega: el aviso solo lleva la tabla y el id.
- **Pruebas:** `acciones/recibir-pedido.prueba.ts`, `acciones/confirmar-pago.prueba.ts`, `acciones/cancelar-pedido.prueba.ts`, `internas/prendas-en-camino.prueba.ts`, `internas/prendas-en-aduana.prueba.ts`, `lecturas/pedidos.prueba.ts` y `alcance.prueba.ts` (la revisión de permisos de cada contrato con la credencial, su llave sin versión, y que Bodega y Aduana no reciben precios ni el pago); en Inventario, `trabajos/vencer-reservas.prueba.ts` y el caso del W- de `acciones/no-la-encuentro.prueba.ts`. Las ayudas están en `nucleo/pruebas/linea-de-prueba.ts`; las pruebas llaman como el sitio, con la credencial de prueba `sitio`, y cancelan con la cuenta de prueba `linea`.

**Fase 18, cierre.**

- `recibir_pedido` busca primero el `id`: el mismo W- con otra clave responde `pedido_repetido` («Ese pedido ya está en {W}.») antes que `pago_repetido` (decisión 719).
- Con todas sus reservas activas en Aduana no hay nada que surtir: `recibir_pedido` pagado y `confirmar_pago` lo dejan `listo_para_empacar`, y «No la encuentro» llama `prendas_en_aduana` con `completo`. Lo sabe Inventario: `inventario.reservar` y `confirmar_pago_reserva` regresan `todo_en_aduana`, con la función `todoEnAduana` de `inventario/dominio/reservas.ts` que usa también la recepción en aduana (decisión 734).
- `inventario.surtir_a_aduana` llama `prendas_en_camino` antes de surtir, y esta responde `422 esperando_pago` a un W- que espera su pago; así el W- se bloquea antes que sus variantes, como al pagar o vencer (decisión 735).
- **Pruebas:** los casos nuevos de `recibir-pedido.prueba.ts` (llega listo para empacar; `pedido_repetido`), `confirmar-pago.prueba.ts` (el pago lo deja listo para empacar), `internas/prendas-en-camino.prueba.ts` (no se surte esperando el pago), `inventario/acciones/no-la-encuentro.prueba.ts` (el mensaje del archivo y listo para empacar) y `alcance.prueba.ts` (la credencial no sube comandos ni archivos, y no abre archivos ajenos).
