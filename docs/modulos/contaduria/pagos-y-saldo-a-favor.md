# Pagos y saldo a favor

> **Qué cubre:** el pago PG- que Contaduría recibe de un cliente, a una nota o como anticipo de un pedido; sus aplicaciones, de donde salen los saldos; cancelarlo; el depósito que un cliente hace a la cuenta de un tercero; y el saldo a favor de un cliente: cómo entra, cómo se aplica y cómo se devuelve.
> **Estado:** Decidido.
> **Se construye en:** [fase 15 ●](../../fases/15-contaduria-terceros-credito-y-cobranza.md).
> **Se conecta con:** [cuentas por cobrar](cuentas-por-cobrar.md) · [anticipos](anticipos.md) · [crédito de clientes](credito-de-clientes.md) · [terceros y deudas](terceros-y-deudas.md) · [cuentas por pagar](cuentas-por-pagar.md) · [contador y cuadres](contador-y-cuadres.md) · [notas de entrega](../ventas/notas-de-entrega.md) · [notas de crédito](../ventas/notas-de-credito.md) · [pedidos](../ventas/pedidos.md) · [órdenes de compra](../compras/ordenes-de-compra.md) · [configuración](../admin/configuracion.md) · [folios](../admin/folios.md) · [pantallas de Contaduría](../../interfaz/fabrica/contaduria.md) · [clientes externos](../ventas/clientes.md) · [gastos](gastos.md)

## Para qué sirve

Cada peso que entra o sale queda con su folio, de dónde vino y qué bajó. Ejemplo: Distribuidora Escolar Zamora deposita $8,000 por SPEI a la cuenta de la fábrica para la NV-0151. Contaduría registra el PG-0312 y la cuenta por cobrar baja de $13,400 a $5,400. Si se registró mal, «Cancelar pago», con su motivo y «Confirmar con Google», regresa el saldo a $13,400. Si Dirección autoriza una nota de crédito de $1,000 cuando la nota ya está pagada, los $1,000 quedan a favor de Zamora, y Contaduría los aplica a su siguiente nota o se los devuelve.

## Reglas

1. **Un pago, un folio PG-:** un solo contador para lo que entra (`recibido`) y lo que sale (`emitido`).
2. **Un pago recibido es de un cliente** y va a una nota entregada con saldo o a un pedido confirmado y abierto, como anticipo. No pasa del saldo de la nota ni de lo que le falta al pedido: el total del pedido menos su anticipo neto menos lo de sus notas no canceladas que el anticipo no cubrió.
3. **Dónde se recibió:** en efectivo, en una cuenta de la fábrica (la lista «Cuentas de la fábrica»: con una sola, la pone el servidor) o en la cuenta de un tercero a quien la fábrica le debe. Lo que no es efectivo lleva su referencia (SPEI, folio, ficha o recibo), de 3 a 30 caracteres. Los montos van en pesos enteros, salvo el que liquida exacto un saldo con centavos (el que deja una nota de crédito): el saldo de la nota o todo el saldo a favor.
4. **De las aplicaciones salen los saldos.** Un pago a una nota es una aplicación a su cuenta por cobrar por el monto completo, aunque el dinero haya ido a un tercero; un pago a un pedido es un anticipo recibido, sin aplicación. Un depósito a la cuenta de un tercero también se aplica a lo que la fábrica le debe a ese tercero: al registrarlo («Ahora») o después («Aplicar»), sin pasar del monto; lo que sobre queda a favor con ese tercero y se aplica después a otra de sus deudas.
5. **Cancelar un pago** pide motivo y «Confirmar con Google». Cancela sus aplicaciones, su anticipo y el saldo a favor que dejó, y regresa los saldos y los estados. No se cancela si su anticipo ya se aplicó a una nota o si lo que dejó a favor ya se usó.
6. **El saldo a favor de un cliente** es lo que entra (el anticipo de un pedido cancelado o entregado sin usarlo, y lo que una nota de crédito pasa del saldo de su nota) menos lo aplicado y lo devuelto, vigente.
7. **Aplicar saldo a favor:** a una nota, baja su cuenta por cobrar; a un pedido, entra como anticipo. Hasta el saldo a favor y hasta el saldo del documento.
8. **Devolver saldo a favor** es un pago emitido al cliente, con «Confirmar con Google», en efectivo o desde una cuenta de la fábrica y con su referencia. No pasa por cuentas por pagar.
9. **Nada se aplica de más:** quien aplica toma antes el candado de lo que va a bajar (la cuenta por cobrar o por pagar) y, si usa el saldo a favor de un cliente, el de su crédito (ver [crédito de clientes](credito-de-clientes.md#la-tabla-credito_clientes)). Así dos pagos al mismo tiempo no pasan del saldo.
10. **Un pago repetido avisa:** la misma referencia con el mismo monto da «Ya hay un pago con la referencia {referencia}: {PG}», sin detener.

## Estados

| Documento | De | A | Qué pasa | Quién |
|---|---|---|---|---|
| Pago | — | `registrado` | «Registrar pago», o devolver saldo a favor | Contaduría |
| Pago | `registrado` | `cancelado` | «Cancelar pago», con «Confirmar con Google» | Contaduría |
| Aplicación | `vigente` | `cancelada` | Se cancela su pago o su compensación | Contaduría |
| Saldo a favor | `vigente` | `cancelado` | Se cancela el pago que lo originó o lo usó | Contaduría |

## La tabla `pagos`

| Columna | Tipo | Nulo | Qué es |
|---|---|---|---|
| `id` | uuid | no | Llave |
| `folio` | text | no | PG-0312 (contador `pago` de [folios](../admin/folios.md)). Único |
| `direccion` | text | no | CHECK (`recibido`, `emitido`) |
| `concepto` | text | no | CHECK (`nota`, `pedido`, `cuenta_por_pagar`, `devolucion_saldo_favor`) |
| `fecha` | date | no | El día de negocio en que se registró |
| `tercero_id` | uuid | no | → `terceros.id`: quien pagó o a quien se le paga |
| `cliente_id` | uuid | sí | → `clientes.id`. CHECK: lleno en `recibido` y en `devolucion_saldo_favor` |
| `nota_entrega_id` · `pedido_id` | uuid | sí | El documento del pago recibido. CHECK: uno en `nota`, el otro en `pedido` |
| `monto_centavos` | bigint | no | CHECK > 0. En pesos enteros, salvo el que liquida exacto un saldo con centavos (regla 3); lo revisa la acción |
| `medio` | text | no | CHECK (`efectivo`, `cuenta_fabrica`, `cuenta_tercero`). `cuenta_tercero` solo en `recibido` |
| `cuenta_fabrica_id` | uuid | sí | → `lista_valores.id`, de «Cuentas de la fábrica». CHECK: lleno con `cuenta_fabrica` |
| `tercero_deposito_id` | uuid | sí | → `terceros.id`: «Cuenta de quién». CHECK: lleno con `cuenta_tercero` y distinto de `tercero_id` |
| `referencia` | text | sí | De 3 a 30. CHECK: llena si no es efectivo, y siempre en `emitido` |
| `confirmado_con_google_en` | timestamptz | sí | CHECK: lleno en `emitido` |
| `estado` | text | no | CHECK (`registrado`, `cancelado`). default `registrado` |
| `cancelado_en` · `cancelado_por` · `motivo_cancelacion` | | sí | CHECK: llenos en `cancelado` |

Lleva las columnas comunes (ver [base de datos](../../cimientos/BASE-DE-DATOS.md#columnas-comunes)). **Índices:** único (`folio`) · (`cliente_id`, `fecha`) · (`tercero_id`) · (`tercero_deposito_id`) · (`nota_entrega_id`) · (`pedido_id`) · (`referencia`, `monto_centavos`). `cliente_id`, `nota_entrega_id` y `pedido_id` llevan su `@llavePendiente` hasta la fase 16.

## La tabla `aplicaciones_pago`

Qué saldo baja cada pago, compensación, nota de crédito o saldo a favor, y por cuánto.

| Columna | Tipo | Nulo | Qué es |
|---|---|---|---|
| `id` | uuid | no | Llave |
| `pago_id` | uuid | sí | → `pagos.id` |
| `compensacion_id` | uuid | sí | → `compensaciones.id` |
| `nota_credito_id` | uuid | sí | → `notas_credito.id`. Único |
| `saldo_favor_movimiento_id` | uuid | sí | → `saldo_favor_movimientos.id` |
| `cuenta_por_cobrar_id` | uuid | sí | → `cuentas_por_cobrar.id` |
| `cuenta_por_pagar_id` | uuid | sí | → `cuentas_por_pagar.id` |
| `monto_centavos` | bigint | no | CHECK > 0 |
| `fecha` | date | no | El día en que se aplicó: un depósito a un tercero se puede aplicar días después del pago |
| `estado` | text | no | CHECK (`vigente`, `cancelada`). default `vigente` |
| `cancelado_en` · `cancelado_por` · `motivo_cancelacion` | | sí | Solo junto con su pago o su compensación |

Lleva las columnas comunes. **CHECK:** exactamente un origen (pago, compensación, nota de crédito o saldo a favor) y exactamente un destino (cuenta por cobrar o por pagar). **Índices:** (`pago_id`) · (`cuenta_por_cobrar_id`) · (`cuenta_por_pagar_id`) · (`compensacion_id`). `nota_credito_id` lleva su `@llavePendiente` hasta la fase 16; `compensacion_id` y `cuenta_por_pagar_id`, hasta la 17.

## La tabla `saldo_favor_movimientos`

El libro del saldo a favor de cada cliente.

| Columna | Tipo | Nulo | Qué es |
|---|---|---|---|
| `id` | uuid | no | Llave |
| `cliente_id` | uuid | no | → `clientes.id` |
| `tercero_id` | uuid | no | → `terceros.id`: el del cliente |
| `tipo` | text | no | CHECK (`entra`, `aplicado_nota`, `aplicado_pedido`, `devuelto`) |
| `origen` | text | sí | CHECK (`anticipo_pedido`, `nota_credito`). CHECK: lleno solo en `entra` |
| `monto_centavos` | bigint | no | CHECK > 0 |
| `fecha` | date | no | |
| `pedido_id` | uuid | sí | El pedido del anticipo que entró, o al que se aplicó |
| `nota_credito_id` | uuid | sí | La NC que dejó lo de más |
| `cuenta_por_cobrar_id` | uuid | sí | La nota a la que se aplicó |
| `pago_id` | uuid | sí | → `pagos.id`: el pago emitido que lo devolvió |
| `estado` | text | no | CHECK (`vigente`, `cancelado`). default `vigente` |
| `cancelado_en` · `cancelado_por` · `motivo_cancelacion` | | sí | |

Lleva las columnas comunes. **Índices:** (`cliente_id`, `estado`) · (`pago_id`). `cliente_id`, `pedido_id` y `nota_credito_id` llevan su `@llavePendiente` hasta la fase 16.

## La lista «Cuentas de la fábrica»

Este archivo siembra la lista `cuentas_fabrica` de [configuración](../admin/configuracion.md) con un valor: «Cuenta de la fábrica». La dueña agrega las demás.

## Acciones

Todas son de la web, con el departamento Contaduría.

### `contaduria.registrar_pago_recibido`

| | |
|---|---|
| **Pantalla** | Cajón «Registrar pago» · «Registrar pago». Se abre con la acción principal, desde Pagos recibidos y desde los cajones del cliente y del tercero |
| **Recibe** | `cliente_id` · `nota_entrega_id` · `monto_centavos` (en pesos enteros, o el saldo exacto de la nota) · `medio` (`efectivo` o `cuenta_fabrica`) · `cuenta_fabrica_id`, si hay más de una · `referencia`, si no es efectivo |
| **Reglas y errores** | `400`: «Escribe el monto en pesos» (con centavos solo el saldo exacto: «Escribe el monto en pesos, o el saldo exacto: {saldo}») · «Escribe la referencia del depósito»<br>`422 nota_sin_entregar`: «{NV} todavía no se entrega: se cobra al confirmar la entrega.» (no tiene cuenta por cobrar)<br>`422 documento_de_otro_cliente`: «{folio} no es de {cliente}.»<br>`422 monto_mayor_que_saldo`: «El saldo de {folio} es {saldo}.»<br>Aviso que no detiene: el pago repetido (regla 10) |
| **Escribe** | El pago, `recibido`, concepto `nota`, con la fecha de hoy, el tercero del cliente, dónde se recibió y la referencia. Su aplicación a la cuenta de la nota por el monto completo; el saldo, el estado y `pagada_en` de la cuenta |
| **Llama** | `admin.tomar_folio` (`pago`) |
| **Regresa** | El pago y el saldo nuevo. «{PG}: {monto} de {cliente}» |
| **Eventos** | `pago.recibido` · `cuenta_por_cobrar.pagada`, si quedó pagada |
| **Bitácora** | «Registró el pago {PG} de {cliente} por {monto}», con el saldo de la nota en `antes` y `despues` |

### `contaduria.cancelar_pago`

| | |
|---|---|
| **Pantalla** | «Cancelar pago» en Pagos recibidos y en los pagos de los cajones del cliente y del tercero (pantalla nueva) |
| **Quién** | Contaduría · «Confirmar con Google» |
| **Recibe** | `pago_id` · `motivo` · `version` del pago |
| **Reglas y errores** | `400` en `motivo`: «Escribe el motivo»<br>`422 pago_cancelado`: «{PG} ya está cancelado.»<br>`422 anticipo_ya_aplicado`: «El anticipo de {PG} ya se aplicó a una nota: ya no se puede cancelar.» (el disponible del pedido quedaría negativo)<br>`422 saldo_a_favor_ya_usado`: «Lo que dejó {PG} a favor ya se usó: ya no se puede cancelar.» |
| **Escribe** | El pago, `cancelado`, con quién, cuándo y su motivo. Sus aplicaciones vigentes, `cancelada`, y el saldo, el estado y `pagada_en` de sus cuentas de regreso. Su anticipo recibido y, si su anticipo pasó a favor, ese renglón y su saldo a favor, cancelados. En una devolución de saldo a favor, su `devuelto` se cancela y el saldo a favor regresa |
| **Regresa** | «{PG} cancelado» |
| **Eventos** | `pago.cancelado` |
| **Bitácora** | «Canceló el pago {PG}: {motivo}», con la confirmación con Google; el pago y los saldos que movió en `antes` y `despues` |

### `contaduria.aplicar_saldo_a_favor`

| | |
|---|---|
| **Pantalla** | Cajón del cliente · «Saldo a favor» · «Aplicar» (pantalla nueva) |
| **Recibe** | `cliente_id` · `nota_entrega_id` · `monto_centavos` |
| **Reglas y errores** | `422 sin_saldo_a_favor`: «{cliente} no tiene saldo a favor.»<br>`422 monto_mayor_que_saldo_a_favor`: «Hasta {saldo a favor}.»<br>`422 nota_sin_entregar`, `documento_de_otro_cliente` y `monto_mayor_que_saldo`, como al registrar un pago |
| **Escribe** | El movimiento `aplicado_nota` del saldo a favor; su aplicación a la cuenta de la nota, con su saldo y su estado |
| **Regresa** | «{monto} a favor aplicados a {folio}» |
| **Eventos** | `saldo_favor.aplicado` · `cuenta_por_cobrar.pagada`, si quedó pagada |
| **Bitácora** | «Aplicó {monto} a favor de {cliente} a {folio}», con el saldo a favor y el del documento en `antes` y `despues` |

### `contaduria.devolver_saldo_a_favor`

| | |
|---|---|
| **Pantalla** | Cajón del cliente · «Saldo a favor» · «Devolver» → ventana «Pagar a {cliente}» · «Confirmar con Google y pagar» (pantalla nueva) |
| **Quién** | Contaduría · «Confirmar con Google» |
| **Recibe** | `cliente_id` · `monto_centavos` (en pesos enteros, o todo el saldo a favor) · `medio` (`efectivo` o `cuenta_fabrica`) · `cuenta_fabrica_id`, si hay más de una · `referencia` |
| **Reglas y errores** | `400`: «Hasta {saldo a favor}» · «Escribe el monto en pesos, o el saldo exacto: {saldo a favor}» · «Escribe la referencia»<br>`422 sin_saldo_a_favor`: «{cliente} no tiene saldo a favor.» |
| **Escribe** | El pago, `emitido`, concepto `devolucion_saldo_favor`, con el tercero y el cliente, de dónde salió, la referencia y la confirmación. El movimiento `devuelto` del saldo a favor, con su pago |
| **Llama** | `admin.tomar_folio` (`pago`) |
| **Regresa** | «{monto} devueltos a {cliente}» |
| **Eventos** | `pago.emitido` · `saldo_favor.devuelto` |
| **Bitácora** | «Devolvió {monto} a favor a {cliente} ({PG})», con la confirmación con Google |

### `contaduria.aplicar_deposito_a_tercero`

Se construye en la [fase 17](../../fases/17-contaduria-por-pagar-facturas-gastos-y-nomina.md), con las cuentas por pagar.

| | |
|---|---|
| **Pantalla** | Cuentas por cobrar · «Depósitos a terceros por aplicar» · «Deuda» y «Aplicar»; Pendientes · Depósito a tercero · «Aplicar». También aplica después lo que quedó a favor con ese tercero |
| **Recibe** | `pago_id` · `cuenta_por_pagar_id` · `version` del pago |
| **Reglas y errores** | `422 pago_no_es_deposito_a_tercero`: «{PG} no fue a la cuenta de un tercero.»<br>`422 pago_cancelado`: «{PG} está cancelado.»<br>`422 deposito_ya_aplicado`: «{PG} ya está aplicado completo.»<br>`422 deuda_de_otro_tercero`: «{documento} no es de {tercero}.»<br>`422 deuda_detenida`: «{documento} está detenida: no se le puede aplicar un depósito.»<br>`422 deuda_pagada`: «{documento} ya está pagada.» |
| **Escribe** | Una aplicación del pago a la cuenta por pagar, por lo menor entre lo que queda del depósito y el saldo de la deuda; su saldo y su estado; la deuda, `saldada`, si ya no le queda nada (ver [terceros y deudas](terceros-y-deudas.md)). El pago sube su versión |
| **Llama** | `compras.cerrar_orden_pagada`, por cada orden cuyas facturas quedan todas pagadas (ver [cuentas por pagar](cuentas-por-pagar.md#reglas)) |
| **Regresa** | «{PG} aplicado a {deuda} de {tercero}» y, si sobra, «. Quedan {monto} a favor con {tercero}» |
| **Eventos** | `pago.aplicado` · `cuenta_por_pagar.pagada` · `deuda.saldada`, si aplica |
| **Bitácora** | «Aplicó {PG} a {deuda} de {tercero}», con el saldo de la deuda y lo que queda del depósito |

## Lo que se agrega después a estas acciones

**Fase 16, con los pedidos (ver [pedidos](../ventas/pedidos.md)):**
- «Registrar pago» y «Aplicar» saldo a favor reciben `pedido_id` en lugar de la nota: entran como anticipo recibido del pedido (ver [anticipos](anticipos.md)), con el pago o con el movimiento `aplicado_pedido`. Con `ventas.pedido_para_cobro`: `422 pedido_no_abierto`: «{PE} no está confirmado y abierto: no se le puede registrar anticipo.», `documento_de_otro_cliente` y, como tope, lo que le falta al pedido (regla 2). Regresa «{PG}: {monto} de {cliente}» y guarda `anticipo.recibido`.

**Fase 17, con las cuentas por pagar (ver [cuentas por pagar](cuentas-por-pagar.md)):**
- «Registrar pago» recibe `medio = cuenta_tercero`, con `tercero_deposito_id` («Cuenta de quién»; nunca el tercero del mismo cliente), `aplicar` (`ahora` o `despues`) y, con `ahora`, `cuenta_por_pagar_id` («Deuda»). Reglas: «¿A quién le depositó?», «Escoge la deuda.», `422 tercero_sin_deuda`: «A {tercero} no se le debe nada: escoge a quién le depositó.», `deuda_de_otro_tercero` y `deuda_detenida`; aviso «Quedan {monto} a favor con {tercero}». Escribe además la aplicación a la cuenta por pagar, como `aplicar_deposito_a_tercero`, y llama `compras.cerrar_orden_pagada` por cada orden cuyas facturas quedan todas pagadas. Regresa «{PG}: {monto} de {cliente}, aplicado a {deuda}» o «{PG} registrado. Queda sin aplicar a {tercero}».
- «Cancelar pago» cancela también sus aplicaciones a cuentas por pagar: sus saldos regresan, la deuda saldada vuelve a abierta y, si una factura deja de estar pagada, llama `compras.reabrir_orden_pagada` (ver [órdenes de compra](../compras/ordenes-de-compra.md)) y, por cada orden que se reabre, deja otro renglón con la misma clave: «{OC} vuelve a Recibida: se canceló su pago».

**Fase 18, con el paquete del contador (ver [contador y cuadres](contador-y-cuadres.md)):**
- «Cancelar pago»: `422 paquete_ya_enviado`: «El paquete de {mes} ya se mandó al contador: {PG} ya no se puede cancelar.»

## Parámetros

Ninguno propio: el largo del motivo es `general.largo_minimo_motivo` (ver [configuración](../admin/configuracion.md)).

## Permisos

- Todo lo de este archivo: Contaduría. Cancelar un pago y devolver saldo a favor piden además «Confirmar con Google».
- Los pagos, sus aplicaciones y el saldo a favor los ve solo quien tiene Contaduría.

## Eventos

`pago.recibido` · `pago.emitido` · `pago.cancelado` · `pago.aplicado` · `saldo_favor.creado` · `saldo_favor.aplicado` · `saldo_favor.devuelto`.

## Lo que llega después

- **Fases 16, 17 y 18:** lo de [arriba](#lo-que-se-agrega-después-a-estas-acciones).
- **Fase 19:** el cajón «Registrar pago», Pagos recibidos, el bloque «Saldo a favor» del cajón del cliente y «Depósitos a terceros por aplicar».

## Cómo está hecho

**Fase 15, parte 2.** En `modulos/contaduria/`:

- **Las tablas** `pagos`, `aplicaciones_pago` y `saldo_favor_movimientos` (migración `0049`), con los CHECK de cada regla: el concepto según la dirección, el cliente y el documento de cada concepto, el monto mayor que 0 (en pesos enteros fuera de lo que permite la decisión 674, migraciones `0051` y `0052`), la cuenta de la fábrica y el tercero del depósito según el medio, la referencia, la confirmación en lo que sale, exactamente un origen y un destino por aplicación, y lo que pide cada tipo del saldo a favor. Una NC entra a favor una sola vez (decisión 669). La lista «Cuentas de la fábrica» la siembra `siembra.ts`.
- **`registrar_pago_recibido`** (`acciones/pagos.ts`, contratos en `packages/compartido/src/contratos/contaduria/pagos.ts`): revisa el medio (`dominio/pagos.ts`, decisión 668), bloquea la cuenta de la nota, revisa que sea del cliente y que no pase del saldo, y solo después toma el folio PG- (decisión 667). El pago repetido avisa sin detener.
- **`cancelar_pago`** toma la versión del pago, cancela sus aplicaciones vigentes y regresa el saldo, el estado y `pagada_en` de sus cuentas, con la confirmación con Google en su bitácora.
- **Pruebas:** `acciones/registrar-pago-recibido.prueba.ts` (también dos pagos a la vez) y `acciones/cancelar-pago.prueba.ts`.

**Fase 15, parte 3.**

- **El saldo a favor** vive en `dominio/saldo-favor.ts`: `bloquearSaldoAFavor` (el renglón del crédito del cliente), `saldoAFavor` y `entrarAFavor`, que usan la NC, el anticipo que pasa a favor y nada más.
- **`aplicar_saldo_a_favor`** y **`devolver_saldo_a_favor`** (`acciones/saldo-favor.ts`, contratos en `packages/compartido/src/contratos/contaduria/saldo-favor.ts`) toman el saldo a favor con su candado; aplicar toma después la cuenta de la nota y acepta centavos; devolver es un pago `emitido` en pesos enteros (o todo el saldo a favor, decisión 674), con su confirmación con Google, y su `devuelto` (decisión 672).
- **`cancelar_pago`** cancela además su anticipo recibido y, si el pedido ya lo pasó a favor, ese saldo a favor (decisión 671); en una devolución, su `devuelto`.
- **Pruebas:** `acciones/aplicar-saldo-a-favor.prueba.ts` y `acciones/devolver-saldo-a-favor.prueba.ts` (las dos con dos a la vez), `acciones/cancelar-pago.prueba.ts` y `saldos.azar.prueba.ts`, que mezcla también el saldo a favor.

**Fase 15, cierre.** Con la auditoría: un pago o una devolución con centavos entran solo si liquidan exacto lo que queda, y los mensajes dicen los centavos (`revisarPesosEnteros` y `enPesos` en `dominio/pagos.ts`; migración `0051`; decisión 674). Cancelar un pago cuyo pedido pasó a favor revisa el saldo a favor total del cliente contra todo lo que el pedido pasó a favor (decisión 671). Las pruebas cruzan a la vez cancelar contra aplicar saldo a favor, prueban que cancelar espera el candado del anticipo, y la prueba al azar revisa cada respuesta, mezcla anticipos, centavos y el pago que liquida exacto, cuenta lo que entra de cada operación y mide las trabas. El índice de `anticipos_aplicado` es solo de los vigentes (migración `0052`).
