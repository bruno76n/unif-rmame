# Anticipos

> **Qué cubre:** el dinero que un cliente adelanta a un pedido: el libro de anticipos y su disponible, cómo se descuenta de una nota, cómo regresa si la nota se cancela, y cómo pasa a favor del cliente cuando el pedido se cancela o termina sin usarlo.
> **Estado:** Decidido.
> **Se construye en:** [fase 15 ●](../../fases/15-contaduria-terceros-credito-y-cobranza.md).
> **Se conecta con:** [pagos y saldo a favor](pagos-y-saldo-a-favor.md) · [cuentas por cobrar](cuentas-por-cobrar.md) · [crédito de clientes](credito-de-clientes.md) · [pedidos](../ventas/pedidos.md) · [notas de entrega](../ventas/notas-de-entrega.md) · [pantallas de Contaduría](../../interfaz/fabrica/contaduria.md) · [pantallas de Ventas](../../interfaz/fabrica/ventas.md) · [clientes externos](../ventas/clientes.md) · [contador y cuadres](contador-y-cuadres.md)

## Para qué sirve

El anticipo es dinero del cliente hasta que se descuenta de una nota. Ejemplo: Distribuidora Escolar Zamora deja $10,000 de anticipo al PE-0145. Ventas arma la NV-0151 por $18,400 y le descuenta $5,000 del anticipo: quedan $5,000 disponibles y la nota llega a cobranza por $13,400. Si la nota se cancelara antes de despacharse, los $5,000 regresarían al pedido. Si el pedido termina con $5,000 sin usar, pasan a favor de Zamora.

## Reglas

1. **Un libro que solo crece,** por pedido: `recibido` (un pago al pedido, o saldo a favor aplicado a él), `aplicado` (Ventas lo descontó de una nota), `regresado` (se canceló una nota por despachar) y `a_favor` (el pedido se canceló o se entregó con anticipo sin usar).
2. **El disponible** es lo recibido + lo regresado − lo aplicado − lo que pasó a favor, de los renglones vigentes. Nunca queda negativo: quien lo cambia toma antes el candado del anticipo de ese pedido.
3. **Descontarlo de una nota:** Ventas decide cuánto, hasta el total de la nota y el disponible. La nota llega a cobranza con ese anticipo ya descontado (ver [cuentas por cobrar](cuentas-por-cobrar.md#reglas)).
4. **Cancelar una nota por despachar** regresa al pedido lo que se le descontó.
5. **Un pedido cancelado o entregado** con disponible: el disponible pasa a favor del cliente (ver [pagos y saldo a favor](pagos-y-saldo-a-favor.md)). Sin disponible, nada.
6. **Un renglón solo se cancela** si se cancela el pago o el saldo a favor que lo originó.

## Estados

| De | A | Qué pasa | Quién |
|---|---|---|---|
| — | `vigente` | Cada renglón nace vigente | Contaduría; Ventas al armar o cancelar una nota, o al cancelar o terminar un pedido |
| `vigente` | `cancelado` | Se cancela el pago o el saldo a favor que lo originó | Contaduría |

## La tabla `anticipos`

| Columna | Tipo | Nulo | Qué es |
|---|---|---|---|
| `id` | uuid | no | Llave |
| `pedido_id` | uuid | no | → `pedidos.id` |
| `cliente_id` | uuid | no | → `clientes.id` |
| `tipo` | text | no | CHECK (`recibido`, `aplicado`, `regresado`, `a_favor`). `recibido` y `regresado` suman; `aplicado` y `a_favor` restan |
| `monto_centavos` | bigint | no | CHECK > 0 |
| `fecha` | date | no | |
| `pago_id` · `saldo_favor_movimiento_id` | uuid | sí | De dónde vino un `recibido`. CHECK: exactamente uno en `recibido`, ninguno en los demás |
| `nota_entrega_id` | uuid | sí | → `notas_entrega.id`. CHECK: lleno en `aplicado` y `regresado` |
| `anticipo_aplicado_id` | uuid | sí | → `anticipos.id`: en `regresado`, el `aplicado` que deshace. Único |
| `estado` | text | no | CHECK (`vigente`, `cancelado`). default `vigente` |
| `cancelado_en` · `cancelado_por` · `motivo_cancelacion` | | sí | |

Lleva las columnas comunes (ver [base de datos](../../cimientos/BASE-DE-DATOS.md#columnas-comunes)). **Índices:** (`pedido_id`, `estado`) · (`nota_entrega_id`) · (`pago_id`). `pedido_id`, `cliente_id` y `nota_entrega_id` llevan su `@llavePendiente` hasta la fase 16.

## Acciones internas

Las llama Ventas, en su misma transacción; su bitácora es el renglón de la acción de Ventas.

### `contaduria.aplicar_anticipo_a_nota`

| | |
|---|---|
| **La llama** | Ventas, en «Crear nota» (ver [notas de entrega](../ventas/notas-de-entrega.md)) |
| **Recibe** | `pedido_id` · `cliente_id` · `nota_entrega_id` · `monto_centavos` (> 0): Ventas lo calcula con `contaduria.anticipo_del_pedido` |
| **Reglas** | `422 anticipo_insuficiente`: «El pedido {PE} solo tiene {disponible} de anticipo.» |
| **Escribe** | El renglón `aplicado`, con la nota |
| **Regresa** | `anticipo_id` |
| **Eventos** | `anticipo.aplicado` |

### `contaduria.regresar_anticipo_a_pedido`

| | |
|---|---|
| **La llama** | Ventas, en «Cancelar nota», solo con la nota por despachar |
| **Recibe** | `nota_entrega_id` |
| **Reglas** | Si la nota no tenía anticipo aplicado, no hace nada |
| **Escribe** | El renglón `regresado`, con el `aplicado` que deshace |
| **Regresa** | Lo que regresó |
| **Eventos** | `anticipo.regresado` |

### `contaduria.pasar_anticipo_a_favor`

| | |
|---|---|
| **La llama** | Ventas, al cancelar un pedido y cuando un pedido queda entregado |
| **Recibe** | `pedido_id` · `causa` (`pedido_cancelado` o `pedido_entregado`) |
| **Reglas** | Sin disponible, no hace nada |
| **Escribe** | El renglón `a_favor` por todo el disponible, y su movimiento `entra` del saldo a favor del cliente, con origen `anticipo_pedido` |
| **Regresa** | Lo que quedó a favor |
| **Eventos** | `saldo_favor.creado`: sale en Pendientes de Contaduría |

## Lecturas

### `contaduria.anticipo_del_pedido(pedido)`

| | |
|---|---|
| **La usa** | Ventas: «Crear nota» y el cajón del pedido |
| **Regresa** | Lo recibido, lo aplicado, lo que pasó a favor y el disponible |

## Parámetros

Ninguno propio.

## Permisos

- Los renglones los escriben las internas de arriba y los pagos (ver [pagos y saldo a favor](pagos-y-saldo-a-favor.md)).
- Ventas solo lee el anticipo de su pedido; el detalle de los pagos, solo quien tiene Contaduría.

## Eventos

`anticipo.recibido` · `anticipo.aplicado` · `anticipo.regresado`.

## Lo que llega después

- **Fase 16:** Ventas llama las tres internas y lee el anticipo de sus pedidos; y el pago a un pedido, o el saldo a favor que se le aplica, deja su renglón `recibido` (ver [pagos y saldo a favor](pagos-y-saldo-a-favor.md#lo-que-se-agrega-después-a-estas-acciones)).
- **Fase 18:** los anticipos recibidos y aplicados del mes, en el paquete del contador.
- **Fase 19:** «Anticipos de pedidos» en Cuentas por cobrar.

## Cómo está hecho

**Fase 15, parte 3.** En `modulos/contaduria/`:

- **La tabla** `anticipos` (migración `0050`), con sus CHECK: el monto mayor que 0, exactamente un origen en `recibido` y ninguno en los demás, la nota en `aplicado` y `regresado`, y el `aplicado` que deshace cada `regresado` (único).
- **El libro** vive en `dominio/anticipos.ts`: `candadoDeAnticipo` (un candado por pedido, en el orden de la decisión 670), `anticipoDelPedido` (por tipo y el disponible), `pasarDisponibleAFavor` y `cancelarAnticipoDelPago`, que usa `contaduria.cancelar_pago`.
- **Las internas** `aplicar_anticipo_a_nota`, `regresar_anticipo_a_pedido` y `pasar_anticipo_a_favor` (`internas/anticipos.ts`) toman el candado y leen el disponible con él. `crear_cuenta_por_cobrar` descuenta de la nota sus `aplicado` vigentes que ningún `regresado` deshizo.
- **La lectura** `anticipo_del_pedido` (`lecturas/anticipos.ts`) da lo aplicado sin lo regresado (decisión 673). `anticipos` avisa en vivo a Contaduría y a Ventas (decisión 675).
- **Pruebas:** `internas/aplicar-anticipo-a-nota.prueba.ts` (también dos notas a la vez, y la cuenta que nace con el anticipo descontado), `internas/regresar-anticipo-a-pedido.prueba.ts`, `internas/pasar-anticipo-a-favor.prueba.ts` y `acciones/cancelar-pago.prueba.ts`. El anticipo recibido lo escribe la prueba (`anticipoRecibidoDePrueba`): el pago a un pedido llega en la fase 16.
