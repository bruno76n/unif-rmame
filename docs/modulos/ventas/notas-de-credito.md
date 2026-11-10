# Notas de crédito

> **Qué cubre:** la nota de crédito NC-, la corrección de una nota de entrega ya entregada: Ventas la pide con qué pasó, de cuánto y qué piezas regresan; Dirección la autoriza; y entonces baja el saldo por cobrar y Aduana espera las piezas que regresan.
> **Estado:** Decidido.
> **Se construye en:** [fase 16](../../fases/16-ventas-a-externos.md).
> **Se conecta con:** [notas de entrega](notas-de-entrega.md) · [pedidos](pedidos.md) · [autorizaciones](../direccion/autorizaciones.md) · [cuentas por cobrar](../contaduria/cuentas-por-cobrar.md) · [pagos y saldo a favor](../contaduria/pagos-y-saldo-a-favor.md) · [entregas y devoluciones de clientes](../inventario/entregas-y-devoluciones-de-clientes.md) · [reclamos y devoluciones](../calidad/reclamos-y-devoluciones.md) · [configuración](../admin/configuracion.md) · [folios](../admin/folios.md) · [pantallas de Ventas](../../interfaz/fabrica/ventas.md)

## Para qué sirve

Una nota entregada no se toca; se corrige con otra. Ejemplo: de la NV-0142 regresan 4 pantalones con la costura abierta. Ventas pide una nota de crédito de $1,200, con «qué pasó» y las 4 piezas que regresan. Nace la AU-0028 para Dirección. Al autorizarla, la nota de crédito toma su folio NC-0012, la cuenta por cobrar de la NV-0142 baja $1,200 y Aduana espera las 4 piezas, que al llegar van a Calidad.

## Reglas

1. **Solo de una nota entregada,** y una a la vez: una nota no puede tener dos esperando autorización.
2. **Qué pasó** lleva al menos `ventas.largo_minimo_que_paso` (10) letras.
3. **De cuánto:** hasta lo que queda de la nota, su subtotal menos sus notas de crédito autorizadas o por autorizar; los pagos no cuentan. Si la nota ya estaba pagada, lo que pase de su saldo queda a favor del cliente (ver [pagos y saldo a favor](../contaduria/pagos-y-saldo-a-favor.md)).
4. **Las piezas que regresan,** si regresan: por renglón de la nota, hasta lo entregado menos lo que ya regresa en otras notas de crédito no rechazadas. El monto es el de la nota de crédito; el precio de cada pieza es solo de referencia.
5. **El folio NC- nace al autorizarse.** Autorizada o rechazada, ya no cambia.

## Estados

| De | A | Qué pasa | Quién |
|---|---|---|---|
| — | `por_autorizar` | «Mandar a Dirección»: nace su AU- | Ventas |
| `por_autorizar` | `autorizada` | Dirección autoriza: toma su folio, baja el saldo y, si regresan piezas, Aduana las espera | Dirección |
| `por_autorizar` | `rechazada` | Dirección rechaza con motivo | Dirección |

## La tabla `notas_credito`

| Columna | Tipo | Nulo | Qué es |
|---|---|---|---|
| `id` | uuid | no | Llave |
| `folio` | text | sí | NC-0012 (contador `nota_credito`), al autorizarse. Único donde no es nulo |
| `nota_entrega_id` | uuid | no | → `notas_entrega.id` |
| `pedido_id` · `cliente_id` | uuid | no | Los de la nota |
| `estado` | text | no | CHECK (`por_autorizar`, `autorizada`, `rechazada`) |
| `que_paso` | text | no | Regla 2 |
| `monto_centavos` | bigint | no | CHECK > 0 (regla 3) |
| `autorizacion_id` | uuid | sí | → `autorizaciones.id`: su AU-. Único. Se llena en la misma transacción en que nace |
| `autorizada_en` · `rechazada_en` | timestamptz | sí | El motivo del rechazo vive en la autorización |

Lleva las columnas comunes (ver [base de datos](../../cimientos/BASE-DE-DATOS.md#columnas-comunes)); `creado_por` es quien la pidió. **Índices:** único (`folio`) donde no es nulo · único (`nota_entrega_id`) donde está `por_autorizar` · (`cliente_id`). Con esta tabla dejan su `@llavePendiente` `autorizaciones.nota_credito_id`, `aplicaciones_pago.nota_credito_id`, `saldo_favor_movimientos.nota_credito_id` y `traspasos.nota_credito_id`.

## La tabla `nota_credito_lineas`

| Columna | Tipo | Nulo | Qué es |
|---|---|---|---|
| `id` | uuid | no | Llave |
| `nota_credito_id` | uuid | no | → `notas_credito.id` |
| `nota_entrega_linea_id` | uuid | no | → `nota_entrega_lineas.id`. Único con `nota_credito_id` |
| `variante_id` | uuid | no | La de su renglón |
| `cantidad` | integer | no | CHECK > 0 (regla 4) |
| `precio_unitario_centavos` | bigint | no | Copia del renglón de la nota, solo de referencia |

Lleva las columnas comunes. **Índice:** (`nota_entrega_linea_id`).

## Acciones

### `ventas.pedir_nota_credito`

| | |
|---|---|
| **Pantalla** | Cajón Nota de entrega (entregada) · «Nota de crédito» → ventana «Nota de crédito para {NV}» · «Mandar a Dirección» |
| **Quién** | Ventas |
| **Recibe** | `nota_id` · `que_paso` · `monto_centavos` · `piezas`, opcional: `nota_entrega_linea_id` y `cantidad` |
| **Reglas y errores** | `400`: «Escribe qué pasó.» · «Escribe de cuánto es la nota de crédito.»<br>`422 nota_no_entregada`: «Solo una nota entregada lleva nota de crédito.»<br>`422 nota_credito_esperando`: «{NV} ya tiene una nota de crédito esperando autorización.»<br>`422 monto_de_mas`: «La nota de crédito no puede pasar de ${tope}: es lo que queda de {NV}.»<br>`422 piezas_de_mas`: «{prenda} talla {t}: solo pueden regresar {n}.» |
| **Escribe** | La nota de crédito, `por_autorizar`, sin folio, con sus piezas |
| **Llama** | `direccion.pedir_autorizacion`, tipo `nota_credito`, con la nota, la nota de crédito y el importe: «Nota de crédito para {NV} · {cliente} · ${monto}», con «qué pasó» de detalle |
| **Regresa** | «Nota de crédito para {NV} enviada a Dirección» |
| **Eventos** | `nota_credito.pedida` |
| **Bitácora** | «{persona} pidió nota de crédito para {NV} por ${monto}: {qué pasó}» |

## Acciones internas

### `ventas.aplicar_decision_nota_credito`

El efecto que este módulo registra para el tipo `nota_credito` (ver [autorizaciones](../direccion/autorizaciones.md)).

| | |
|---|---|
| **La llama** | `direccion.decidir_autorizacion`, en su misma transacción |
| **Recibe** | `autorizacion_id` · `decision` · `nota_credito_id` · quién y cuándo |
| **Escribe** | Autorizada: su folio NC- y `autorizada_en`. Rechazada: `rechazada_en` |
| **Llama** | Al autorizar: `admin.tomar_folio` (`nota_credito`) · `contaduria.aplicar_nota_credito`, con la nota de crédito, su nota y su monto · si regresan piezas, `inventario.esperar_devolucion`, tipo `devolucion_cliente_externo`, con la nota de crédito, el pedido y las piezas |
| **Regresa** | El folio NC-, para el mensaje de Dirección |
| **Eventos** | `nota_credito.decidida`: el aviso a quien la pidió lo da Dirección |

La bitácora es el renglón de Dirección.

## Parámetros

Los cambia solo la dueña, en Configuración (ver [configuración](../admin/configuracion.md)). Va en «Parámetros».

| Parámetro | Valor inicial | Para qué |
|---|---|---|
| `ventas.largo_minimo_que_paso` | 10 letras | Lo menos que lleva «qué pasó» |

## Permisos

- Pedirla: Ventas. Decidirla: Dirección.

## Eventos

`nota_credito.pedida` · `nota_credito.decidida`.

## Lo que llega después

- **Fase 19:** la ventana «Nota de crédito para {NV}» y las notas de crédito en el cajón de la nota.

## Cómo está hecho

*Lo escribe Claude Code al terminar la fase 16.*
