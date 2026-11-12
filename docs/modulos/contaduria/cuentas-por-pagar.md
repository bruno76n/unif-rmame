# Cuentas por pagar

> **Qué cubre:** lo que la fábrica le debe a un proveedor por cada factura y a un acreedor por cada mensualidad: su vencimiento, su saldo, cuándo está detenida, cómo se paga con «Confirmar con Google», y «Pagar lo recibido» cuando la factura no cuadra y decide Dirección.
> **Estado:** Decidido.
> **Se construye en:** [fase 17 ●](../../fases/17-contaduria-por-pagar-facturas-gastos-y-nomina.md).
> **Se conecta con:** [facturas de proveedor](facturas-de-proveedor.md) · [terceros y deudas](terceros-y-deudas.md) · [pagos y saldo a favor](pagos-y-saldo-a-favor.md) · [cuentas por cobrar](cuentas-por-cobrar.md) · [contador y cuadres](contador-y-cuadres.md) · [autorizaciones](../direccion/autorizaciones.md) · [órdenes de compra](../compras/ordenes-de-compra.md) · [configuración](../admin/configuracion.md) · [pantallas de Contaduría](../../interfaz/fabrica/contaduria.md)

## Para qué sirve

Contaduría sabe a quién le debe, cuánto y para cuándo, y no paga lo que no llegó. Ejemplo: la factura FP-8841 de Textiles Aurora por $46,400, con 30 días de crédito, cuadra con lo recibido: nace su cuenta por pagar, que vence el 9 de diciembre. Si la factura cobrara más de lo que llegó a aduana, la cuenta nacería detenida; «Pagar lo recibido» le pediría a Dirección pagar solo lo recibido, y al autorizarlo la cuenta quedaría por pagar por ese monto. Pagarla pide «Confirmar con Google».

## Reglas

1. **Una cuenta por factura o por mensualidad:** de un proveedor, por su factura (ver [facturas de proveedor](facturas-de-proveedor.md)); de un acreedor, por cada mensualidad de su deuda (ver [terceros y deudas](terceros-y-deudas.md)).
2. **Vence:** una factura, en la fecha de la factura (o, sin ella, el día en que se capturó) más los días de crédito de su orden; con varias órdenes, los menores; de contado, ese mismo día. Una mensualidad, en su fecha.
3. **El importe** es el total de la factura o el monto que Dirección autorizó pagar; el de una mensualidad, su importe. **El saldo** es el importe menos sus aplicaciones vigentes: pagos emitidos, depósitos de clientes a ese tercero y compensaciones (ver [pagos y saldo a favor](pagos-y-saldo-a-favor.md)). Quien aplica toma antes la cuenta con su candado.
4. **Una cuenta detenida no se paga** ni entra al calendario ni a las deudas a las que se aplica un depósito. Sigue a su factura: detenida o esperando autorización, detenida; conciliada o autorizada, por pagar.
5. **Pagar** se puede por partes, hasta el saldo, desde efectivo o una cuenta de la fábrica, con su referencia y «Confirmar con Google». Cuando quedan pagadas las cuentas de todas las facturas no canceladas de una orden, Compras la cierra (`compras.cerrar_orden_pagada`); si se cancela un pago o una compensación y una deja de estar pagada, la reabre (`compras.reabrir_orden_pagada`).
6. **Pagar lo recibido:** con una factura detenida a cargo de Contaduría (cobra más de lo que llegó), se pide a Dirección pagar lo recibido más su IVA proporcional. Autorizado, la cuenta queda por pagar por ese monto y la diferencia queda por aclarar con el proveedor; rechazado, sigue detenida. Si la detención es porque nada ha llegado, se espera a Aduana.
7. **Se cancela** solo con su factura o su deuda, y solo sin pagos.
8. **El saldo por pagar** suma las cuentas no pagadas ni canceladas, también las detenidas; lo vencido y el calendario no llevan las detenidas.

## Estados

| De | A | Qué pasa | Quién |
|---|---|---|---|
| — | `por_pagar` o `detenida` | Nace con su factura (según sus tres puntas) o con su mensualidad (`por_pagar`) | Contaduría |
| `detenida` | `por_pagar` | Su factura queda conciliada o autorizada | La API; Dirección |
| `por_pagar` | `detenida` | Su factura vuelve a no cuadrar, sin pagos | La API |
| `por_pagar` · `pagada_en_parte` | `pagada_en_parte` · `pagada` | Cada pago, depósito o compensación | Contaduría |
| `pagada` · `pagada_en_parte` | `pagada_en_parte` · `por_pagar` | Se cancela un pago o una compensación | Contaduría |
| `detenida` · `por_pagar` | `cancelada` | Se cancela su factura o su deuda, sin pagos | Contaduría |

## La tabla `cuentas_por_pagar`

| Columna | Tipo | Nulo | Qué es |
|---|---|---|---|
| `id` | uuid | no | Llave |
| `tercero_id` | uuid | no | → `terceros.id`: a quién se le paga |
| `tipo` | text | no | CHECK (`proveedor`, `acreedor`) |
| `factura_proveedor_id` | uuid | sí | → `facturas_proveedor.id`. Único. CHECK: lleno con `proveedor` |
| `deuda_mensualidad_id` | uuid | sí | → `deuda_mensualidades.id`. Único. CHECK: lleno con `acreedor` |
| `fecha` | date | no | El día en que nació |
| `vence` | date | no | Regla 2 |
| `importe_centavos` | bigint | no | CHECK > 0 (regla 3) |
| `saldo_centavos` | bigint | no | CHECK 0 ≤ saldo ≤ importe (regla 3) |
| `estado` | text | no | CHECK (`detenida`, `por_pagar`, `pagada_en_parte`, `pagada`, `cancelada`) |
| `pagada_en` | timestamptz | sí | |
| `cancelado_en` · `cancelado_por` · `motivo_cancelacion` | | sí | CHECK: llenos en `cancelada` |

Lleva las columnas comunes (ver [base de datos](../../cimientos/BASE-DE-DATOS.md#columnas-comunes)). **Índices:** único (`factura_proveedor_id`) y único (`deuda_mensualidad_id`) donde no son nulos · (`tercero_id`, `estado`) · (`vence`) donde no está pagada ni cancelada. Con esta tabla deja su `@llavePendiente` `aplicaciones_pago.cuenta_por_pagar_id`. `deuda_mensualidad_id` lleva la suya hasta la parte 2 de la fase, con las deudas (ver [terceros y deudas](terceros-y-deudas.md)).

## Acciones

Las dos son de la web, con el departamento Contaduría.

### `contaduria.pagar_cuenta_por_pagar`

| | |
|---|---|
| **Pantalla** | Pendientes · «Pagar» y Cuentas por pagar · calendario · «Pagar» → ventana «Pagar a {beneficiario}» · «Confirmar con Google y pagar» |
| **Quién** | Contaduría · «Confirmar con Google» |
| **Recibe** | `cuenta_por_pagar_id` · `monto_centavos` (puede ser una parte) · `medio` (`efectivo` o `cuenta_fabrica`) · `cuenta_fabrica_id`, si hay más de una · `referencia` (de 3 a 30: SPEI o recibo) · `version` de la cuenta |
| **Reglas y errores** | `400`: «Hasta {saldo}» · «Escribe la referencia»<br>`422 cuenta_detenida`: «Este pago está detenido: orden, recepción y factura no coinciden.»<br>`422 cuenta_pagada`: «{documento} ya está pagada.»<br>`422 cuenta_cancelada`: «{documento} está cancelada.» |
| **Escribe** | El pago PG-, `emitido`, concepto `cuenta_por_pagar`, con el tercero, el monto, de dónde salió, la referencia y la confirmación. Su aplicación a la cuenta por el monto completo; el saldo, el estado y `pagada_en`. La deuda, `saldada`, si ya no le queda nada |
| **Llama** | `admin.tomar_folio` (`pago`) · `compras.cerrar_orden_pagada`, por cada orden cuyas facturas quedan todas pagadas (regla 5) |
| **Regresa** | «{monto} pagados a {beneficiario}» |
| **Eventos** | `pago.emitido` · `cuenta_por_pagar.pagada` · `deuda.saldada`, si aplica |
| **Bitácora** | «Pagó {monto} a {beneficiario} ({documento})», con la confirmación y el saldo en `antes` y `despues` |

### `contaduria.pedir_pago_lo_recibido`

| | |
|---|---|
| **Pantalla** | Cuentas por pagar · tarjeta de Pagos detenidos · «Pagar lo recibido»; Pendientes · Pago detenido · «Pagar lo recibido» |
| **Recibe** | `factura_proveedor_id` · `version` de la factura |
| **Reglas y errores** | `422 factura_no_detenida`: «{FP} no está detenida.»<br>`422 responsable_aduana`: «{FP} espera a que Aduana reciba la mercancía: no se puede pagar lo recibido.»<br>`422 ya_pedida`: «{FP} ya espera la decisión de Dirección.» |
| **Escribe** | La factura, `esperando_autorizacion`, con su AU-. La cuenta sigue detenida |
| **Llama** | `direccion.pedir_autorizacion`, tipo `pago_fuera_de_lo_normal`, con la factura, lo que se pagaría (lo recibido más su IVA proporcional) y lo facturado: «Pagar a {proveedor} lo recibido: {monto} en lugar de {facturado}», con el motivo de la detención de detalle |
| **Regresa** | «Solicitud enviada a Dirección: pago por lo recibido» |
| **Eventos** | `factura_proveedor.autorizacion_pedida` |
| **Bitácora** | «Pidió pagar lo recibido de {FP}: {monto} en lugar de {facturado}», con la factura en `antes` y `despues` |

## Acciones internas

### `contaduria.aplicar_decision_pago_fuera_de_lo_normal`

El efecto que este módulo registra para el tipo `pago_fuera_de_lo_normal` (ver [autorizaciones](../direccion/autorizaciones.md)).

| | |
|---|---|
| **La llama** | `direccion.decidir_autorizacion`, en su misma transacción |
| **Recibe** | `autorizacion_id` · `decision` |
| **Reglas** | La factura espera con esa AU-; si no, es un error del programa |
| **Escribe** | Autorizada: la factura, `autorizada`, con el monto autorizado y la diferencia por aclarar (su total no cambia); la cuenta, `por_pagar`, con el monto autorizado como importe y saldo. Rechazada: la factura vuelve a `detenida`, a cargo de Contaduría; la cuenta sigue detenida |
| **Eventos** | `factura_proveedor.autorizada` o `factura_proveedor.rechazada` |

La bitácora es el renglón de Dirección.

## La antigüedad y el saldo por pagar

Viven como funciones puras en `modulos/contaduria/dominio/`: lo vencido, lo que vence esta semana (de hoy a `contaduria.ventana_dias` − 1 días) y las cuatro semanas siguientes, sin detenidas; el saldo por pagar (regla 8); y el flujo de los próximos días: lo que vence por cobrar menos lo que vence por pagar, día por día, sin detenidas ni lo ya vencido. Las usan las consultas de Contaduría (fase 19).

## Parámetros

Los cambia solo la dueña, en Configuración (ver [configuración](../admin/configuracion.md)). Todos van en «Parámetros».

| Parámetro | Valor inicial | Para qué |
|---|---|---|
| `contaduria.ventana_dias` | 7 días | El flujo neto, «vencen esta semana» y los pagos en Pendientes |
| `contaduria.pago_atrasado_rojo_dias` | 7 días | Desde cuántos días de vencido un pago pone en rojo el conteo del menú |

## Permisos

- Pagar (con «Confirmar con Google») y pedir pagar lo recibido: Contaduría. Decidirlo: Dirección.
- Las cuentas por pagar las ve quien tiene Contaduría.

## Eventos

`cuenta_por_pagar.pagada` · `pago.emitido` · `factura_proveedor.autorizacion_pedida` · `factura_proveedor.autorizada` · `factura_proveedor.rechazada`.

## Lo que llega después

- **Fase 18:** el cuadre de saldos de cada noche y los pagos a proveedores y acreedores en el paquete del contador (ver [contador y cuadres](contador-y-cuadres.md)).
- **Fase 19:** Cuentas por pagar con su tarjeta de pagos por semana, su calendario y Pagos detenidos; la ventana «Pagar a {beneficiario}»; y el flujo de los próximos días en Pendientes.

## Cómo está hecho

**Fase 17, parte 1.**

- **La tabla** `cuentas_por_pagar` está en `apps/api/src/modulos/contaduria/tablas.ts` (migración `0058`), con sus CHECK (su documento según su tipo, el saldo entre 0 y el importe, `pagada` con saldo 0 y su fecha, y sin aplicaciones el saldo igual al importe en `detenida`, `por_pagar` y `cancelada`). La migración pone la llave de `aplicaciones_pago.cuenta_por_pagar_id`. `deuda_mensualidad_id` conserva su `@llavePendiente` hasta la parte 2.
- **Nace con su factura** (`acciones/facturas.ts`): vence en la fecha de la factura, o la de captura, más los días de crédito menores de sus órdenes (`venceLaFactura`), `detenida` o `por_pagar` según sus tres puntas.
- **Las acciones** (`acciones/por-pagar.ts`):
  - `pagar_cuenta_por_pagar` bloquea las órdenes de su factura y luego la cuenta (decisión 698), revisa el estado y el saldo, y escribe el PG- `emitido` con su confirmación de Google y su aplicación. Si la cuenta queda pagada, llama `compras.cerrar_orden_pagada` por cada orden cuyas facturas quedaron todas pagadas (`ordenesPagadas`). Los montos van en pesos enteros, salvo el saldo exacto (decisión 697).
  - `pedir_pago_lo_recibido` pide la AU- con lo recibido más su IVA proporcional (`montoLoRecibido`, redondeado al centavo). Responde `nada_recibido` si no queda nada recibido por pagar (decisión 703).
- **El efecto** `aplicar_decision_pago_fuera_de_lo_normal` (`internas/facturas.ts`) vuelve a calcular el monto de la factura, que no cambia mientras espera. Autorizada, la cuenta queda por pagar por ese monto; rechazada, la factura vuelve a detenida. Su renglón es el de Dirección, con la factura antes y después.
- **La antigüedad, el saldo por pagar y el flujo** son funciones puras en `dominio/saldo-por-pagar.ts`, sin detenidas salvo en el saldo. Los parámetros `contaduria.ventana_dias` y `contaduria.pago_atrasado_rojo_dias` están en `parametros.ts`.
- **Pruebas:**
  - `acciones/pagar-cuenta-por-pagar.prueba.ts`: el vencimiento, la detenida, Google, por partes, dos pagos a la vez y la orden que se cierra aun con dos pagos a la vez;
  - `acciones/pedir-pago-lo-recibido.prueba.ts` e `internas/aplicar-decision-pago-fuera-de-lo-normal.prueba.ts`, que también prueba la nota de crédito del proveedor;
  - `dominio/saldo-por-pagar.prueba.ts`, también con fast-check.
