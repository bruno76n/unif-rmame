# Cuentas por cobrar

> **Qué cubre:** lo que nos debe un cliente por cada nota entregada: cómo nace al confirmar la entrega, su saldo y su estado con cada aplicación, la nota de crédito que la corrige, su vencimiento y su antigüedad, y lo que Ventas ve de sus notas.
> **Estado:** Decidido.
> **Se construye en:** [fase 15 ●](../../fases/15-contaduria-terceros-credito-y-cobranza.md).
> **Se conecta con:** [crédito de clientes](credito-de-clientes.md) · [pagos y saldo a favor](pagos-y-saldo-a-favor.md) · [anticipos](anticipos.md) · [terceros y deudas](terceros-y-deudas.md) · [contador y cuadres](contador-y-cuadres.md) · [notas de entrega](../ventas/notas-de-entrega.md) · [notas de crédito](../ventas/notas-de-credito.md) · [pedidos](../ventas/pedidos.md) · [configuración](../admin/configuracion.md) · [pantallas de Contaduría](../../interfaz/fabrica/contaduria.md) · [clientes externos](../ventas/clientes.md) · [cuentas por pagar](cuentas-por-pagar.md)

## Para qué sirve

Cada nota entregada es una deuda del cliente con fecha. Ejemplo: Ventas confirma la entrega de la NV-0151 de Distribuidora Escolar Zamora el 9 de noviembre: $18,400, con $5,000 de anticipo ya descontado, a crédito de 15 días. Nace su cuenta por cobrar de $13,400, que vence el 24 de noviembre. Zamora paga $8,000 y la cuenta queda «Pagada en parte» con $5,400. En Ventas, la nota solo dice «Pagada en parte».

## Reglas

1. **Una cuenta por nota entregada.** Nace cuando Ventas confirma la entrega, con lo que Ventas manda de la nota y de su pedido. Vence = la fecha de entrega + los días de crédito que congeló el pedido (0 en contado y anticipo).
2. **El importe** es el total de la nota menos el anticipo que ya traía descontado (ver [anticipos](anticipos.md)). Con importe 0, nace pagada.
3. **El saldo** es el importe menos sus aplicaciones vigentes: pagos, saldo a favor, notas de crédito y compensaciones (ver [pagos y saldo a favor](pagos-y-saldo-a-favor.md)). Se guarda y cambia en la misma transacción que cada aplicación; nunca baja de 0 ni pasa del importe. Quien aplica toma antes la cuenta con su candado.
4. **No se cancela:** la nota entregada no cambia. Se corrige con una nota de crédito NC- de Ventas, que Dirección autoriza y entra como aplicación. Lo que la NC pase del saldo de su nota queda a favor del cliente.
5. **La antigüedad:** por cuenta con saldo, los días desde que venció, en tramos: por vencer, 1 a 15, 16 a 30 y más de 30 (`contaduria.antiguedad_tramos_dias`: 15 y 30).
6. **Ventas solo ve el estado de pago** de sus notas: «Sin pagar», «Pagada en parte» o «Pagada». El saldo, solo quien tiene Contaduría.

## Estados

| De | A | Qué pasa | Quién |
|---|---|---|---|
| — | `sin_pagar` | Ventas confirma la entrega (con importe 0, nace `pagada`) | Ventas |
| `sin_pagar` · `pagada_en_parte` | `pagada_en_parte` · `pagada` | Cada aplicación baja el saldo | Contaduría; Ventas con su NC autorizada |
| `pagada` · `pagada_en_parte` | `pagada_en_parte` · `sin_pagar` | Se cancela un pago o una compensación: el saldo regresa | Contaduría |

## La tabla `cuentas_por_cobrar`

| Columna | Tipo | Nulo | Qué es |
|---|---|---|---|
| `id` | uuid | no | Llave |
| `nota_entrega_id` | uuid | no | → `notas_entrega.id`. Único: una cuenta por nota |
| `pedido_id` | uuid | no | → `pedidos.id`: el de la nota |
| `cliente_id` | uuid | no | → `clientes.id` |
| `tercero_id` | uuid | no | → `terceros.id`: el del cliente |
| `fecha_entrega` | date | no | El día en que se confirmó la entrega |
| `dias_credito` | integer | no | CHECK ≥ 0. Los que congeló el pedido; 0 en contado y anticipo |
| `vence` | date | no | `fecha_entrega` + `dias_credito` |
| `total_nota_centavos` | bigint | no | El total de la nota, tal como quedó |
| `anticipo_aplicado_centavos` | bigint | no | default 0. El anticipo que la nota ya traía descontado |
| `importe_centavos` | bigint | no | CHECK ≥ 0. Total − anticipo aplicado |
| `saldo_centavos` | bigint | no | CHECK 0 ≤ saldo ≤ importe (regla 3) |
| `estado` | text | no | CHECK (`sin_pagar`, `pagada_en_parte`, `pagada`) |
| `pagada_en` | timestamptz | sí | Cuando el saldo llegó a 0. CHECK: lleno solo en `pagada` |

Lleva las columnas comunes (ver [base de datos](../../cimientos/BASE-DE-DATOS.md#columnas-comunes)). **Índices:** único (`nota_entrega_id`) · (`cliente_id`, `estado`) · (`tercero_id`) · (`vence`) donde no es `pagada`. `nota_entrega_id`, `pedido_id` y `cliente_id` llevan su `@llavePendiente` hasta la fase 16.

## La antigüedad y el saldo por cobrar

Viven como funciones puras en `modulos/contaduria/dominio/`: la antigüedad de cada cuenta y su tramo (regla 5), y el saldo de un cliente por tramo, con lo vencido y lo vencido de más de 30 días. Las usan el semáforo sugerido (ver [crédito de clientes](credito-de-clientes.md#el-semáforo-sugerido)) y las consultas de Contaduría (fase 19).

## Acciones internas

### `contaduria.crear_cuenta_por_cobrar`

| | |
|---|---|
| **La llama** | `ventas.confirmar_entrega`, desde Ventas o desde Aduana (ver [notas de entrega](../ventas/notas-de-entrega.md)) |
| **Recibe** | `nota_entrega_id` · `pedido_id` · `cliente_id` · `fecha_entrega` · `dias_credito` del pedido · `total_nota_centavos` |
| **Reglas** | `422 cuenta_ya_existe`: «{NV} ya tiene su cuenta por cobrar.» |
| **Escribe** | La cuenta, con el tercero del crédito del cliente, su vencimiento, el anticipo que se aplicó a la nota (sus renglones `aplicado` vigentes), el importe, saldo = importe y su estado (regla 2) |
| **Regresa** | `cuenta_por_cobrar_id` · `vence` · `importe_centavos` |
| **Eventos** | `cuenta_por_cobrar.creada` |

La bitácora es el renglón de «Confirmar entrega», que dice el importe y el vencimiento.

### `contaduria.aplicar_nota_credito`

| | |
|---|---|
| **La llama** | `ventas.aplicar_decision_nota_credito`, el efecto de la AU- `nota_credito`, en la transacción de `direccion.decidir_autorizacion` (ver [notas de crédito](../ventas/notas-de-credito.md)) |
| **Recibe** | `nota_credito_id` · `nota_entrega_id` · `monto_centavos` |
| **Reglas** | `422 nota_credito_ya_aplicada`: «{NC} ya bajó el saldo de su nota.» |
| **Escribe** | Una aplicación de la NC a la cuenta de su nota, por lo menor entre su monto y el saldo; el saldo y el estado. Lo que pase del saldo entra a favor del cliente, con origen `nota_credito` (ver [pagos y saldo a favor](pagos-y-saldo-a-favor.md)) |
| **Regresa** | Lo aplicado y lo que quedó a favor |
| **Eventos** | `cuenta_por_cobrar.pagada`, si quedó pagada · `saldo_favor.creado`, si quedó algo a favor |

La bitácora es el renglón de Dirección.

## Lecturas

### `contaduria.estado_pago_notas(notas)`

| | |
|---|---|
| **La usa** | Ventas: sus notas y el avance del pedido |
| **Regresa** | Por nota, «Sin pagar», «Pagada en parte» o «Pagada», y su saldo. La consulta de Ventas solo pasa el saldo a quien tiene Contaduría |

### `contaduria.saldo_por_cobrar_de_cliente(cliente)`

| | |
|---|---|
| **La usa** | Ventas, al dar de baja un cliente: `cliente_con_saldo` (ver [clientes](../ventas/clientes.md)) |
| **Regresa** | La suma de los saldos de sus cuentas por cobrar. Ventas solo muestra el monto a quien tiene Contaduría |

## Parámetros

Los cambia solo la dueña, en Configuración (ver [configuración](../admin/configuracion.md)). Va en «Parámetros».

| Parámetro | Valor inicial | Para qué |
|---|---|---|
| `contaduria.antiguedad_tramos_dias` | 15, 30 | Los cortes de los tramos de antigüedad: por vencer, 1 a 15, 16 a 30 y más de 30 |

## Permisos

- Las cuentas por cobrar las ve quien tiene Contaduría. Ventas, solo el estado de pago de sus notas.
- Nadie las escribe con una acción propia: nacen de Ventas y cambian con sus aplicaciones.

## Eventos

`cuenta_por_cobrar.creada` · `cuenta_por_cobrar.pagada`.

## Lo que llega después

- **Fase 16:** Ventas crea la cuenta al confirmar la entrega y aplica sus notas de crédito autorizadas.
- **Fase 17:** las compensaciones con un tercero también bajan su saldo (ver [terceros y deudas](terceros-y-deudas.md)).
- **Fase 18:** el cuadre de saldos de cada noche, que revisa el saldo guardado contra sus aplicaciones, y el paquete del contador (ver [contador y cuadres](contador-y-cuadres.md)); y la alerta de concentración de Dirección.
- **Fase 19:** Cuentas por cobrar, Antigüedad de saldos y el cajón del cliente.

## Cómo está hecho

**Fase 15, partes 1 y 2.** En `modulos/contaduria/`:

- **La tabla** `cuentas_por_cobrar` (migración `0048`, con el crédito: decisión 662), con sus CHECK: `vence` = entrega + días, importe = total − anticipo, saldo de 0 al importe, y el estado y `pagada_en` que le tocan a su saldo. Sus llaves a Ventas llevan su `@llavePendiente`.
- **El saldo** lo mueve `dominio/cuentas.ts`: `bloquearCuentaDeNota` y `bloquearCuentas` (en orden de id, decisión 667), `aplicarACuenta` (la aplicación y el saldo nuevo en la misma transacción, con `cuenta_por_cobrar.pagada` al llegar a 0) y `regresarAplicacionesDelPago`. `estadoDeCuenta` da el estado de un saldo.
- **La antigüedad** es `dominio/antiguedad.ts`: `diasVencida`, `tramoDe`, `saldoPorTramo` y `leerTramos` (el parámetro `contaduria.antiguedad_tramos_dias`, «15,30»). El semáforo sugerido usa `diasVencida`.
- **`crear_cuenta_por_cobrar`** (`internas/cuentas.ts`) inserta con `ON CONFLICT DO NOTHING` sobre la nota: la segunda da `cuenta_ya_existe`. **`aplicar_nota_credito`** bloquea la cuenta y, con ella, ve si la NC ya se aplicó (decisión 669); aplica lo menor entre su monto y el saldo y deja lo demás a favor.
- **Las lecturas** (`lecturas/cuentas.ts`) recortan el saldo según quien lee (decisión 666). Los folios de las notas los da `ventas.folios_de_documentos` (decisión 665).
- **Pruebas:** `internas/crear-cuenta-por-cobrar.prueba.ts`, `internas/aplicar-nota-credito.prueba.ts` (también dos a la vez), `lecturas/estado-pago-notas.prueba.ts`, `dominio/antiguedad.prueba.ts` y `saldos.azar.prueba.ts` (fast-check, con tandas a la vez).
