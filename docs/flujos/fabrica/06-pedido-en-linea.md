# Flujo 06 · Pedido en línea

> **Qué cubre:** el pedido W- que manda el sitio, de que llega pagado a «Listo para empacar»: sus reservas y su promesa, el surtido de Bodega, la recepción en Aduana, el pago pendiente que vence, la prenda que no está, y la cancelación; lo que tiene que cuadrar al final y lo que sale mal.
> **Estado:** Decidido.
> **Se construye en:** [fase 21](../../fases/21-pruebas-de-punta-a-punta.md).
> **Se conecta con:** [pruebas](../../cimientos/PRUEBAS.md) · [pedidos en línea](../../modulos/linea/pedidos-en-linea.md)

## Qué prueba

Que lo que se cobra en línea queda apartado en ese momento y nadie más se lo lleva, que nunca se rechaza un pedido ya cobrado, y que la fábrica lo lleva hasta dejarlo listo para empacar sin que Aduana ni Bodega vean un precio.

## Datos de arranque

- Los datos de la muestra.
- **El sitio, simulado:** la prueba llama a la API con la credencial de servidor de uniformame.mx, registrada por la dueña en Dispositivos.
- **En Bodega, libres:** 2 playeras polo blancas talla 10 y 1 pantalón azul marino talla 12; ninguna camisa blanca talla 8 en ningún lado.
- **`linea.acepta_pago_pendiente`** en «Sí», cambiado por la dueña para el paso 6.
- **Las cuentas:** Tienda en línea (la oficina), Bodega y Aduana.

## Pasos

| # | Quién · dónde | Qué hace | Qué tiene que pasar |
|---|---|---|---|
| 1 | El sitio | Manda el W- de Laura Méndez, pagado: 2 playeras talla 10 y el pantalón talla 12 → `linea.recibir_pedido` | El W- queda por surtir, con todo congelado y la promesa «Sale hoy»; las 3 piezas apartadas en Bodega con reservas `pedido_linea` |
| 2 | Tienda en línea · Pendientes | Mira | El W- en «Por surtir»; la disponibilidad en línea de esas tallas baja en 3 |
| 3 | Bodega · Pendientes | «Pedido en línea» · «Surtir a aduana» → `inventario.surtir_a_aduana` | «{W} va a aduana: queda en camino hasta que aduana lo reciba»: un A- `pedido_linea`, con sus reservas viajando con las piezas; el W- espera prendas |
| 4 | Aduana · Recibir lo que viene en camino | «Llegó completo» → `inventario.recibir_en_aduana` | «{W} completo: listo para empacar»: el W- en «Listo para empacar» y en Empaque en línea de Aduana, sin precios |
| 5 | Ventas · Pedido nuevo | Intenta apartar una de esas playeras para un pedido externo | No la toma: están apartadas para el W- |
| 6 | El sitio | Manda otro W- con pago pendiente: el pantalón talla 12 que ya no está libre y 1 playera que sí | Queda esperando pago, con reservas que vencen a la hora que dijo el sitio; el pantalón queda en Bodega con la excepción `pedido_linea_sin_pieza` |
| 7 | El trabajo «Vencer reservas» | Pasa la hora sin pago | El W- vencido y sus reservas liberadas, en la misma transacción (`linea.vencer_pedido`) |
| 8 | El sitio | Manda un tercer W- pagado con una camisa blanca talla 8 que no hay | Se acepta igual: queda por surtir, la reserva en Bodega con `pedido_linea_sin_pieza`, y Bodega la ve en Excepciones |
| 9 | Tienda en línea · cajón del pedido | Cancela el primer W-, ya listo para empacar, con motivo → `linea.cancelar_pedido` | «{W} cancelado. Lo que ya estaba en aduana regresa a su origen»: sus reservas se liberan y nace el traspaso `regresa` de Aduana a Bodega; Aduana lo despacha y Bodega lo recibe |

## Lo que tiene que cuadrar al final

- **Las reservas:** cada pieza apartada tiene una sola reserva activa; las de los W- vencidos o cancelados están liberadas, con su motivo.
- **El inventario:** las 3 piezas del W- cancelado están otra vez en Bodega; la existencia es la suma del libro y el cuadre de la noche no deja residuo ni reservas de pago vencido.
- **La disponibilidad en línea:** lo libre de cada talla es lo que hay menos lo apartado, en Bodega y en Aduana.
- **El dinero:** el pago de cada W- está guardado con su referencia, una sola vez; el W- cancelado espera su reembolso del sitio.
- **Lo que vio cada cuenta:** Bodega y Aduana recibieron el folio, las prendas y el destinatario, nunca precios ni datos del pago.

## Lo que sale mal

- **El mismo pago para dos W-:** el segundo responde `pago_repetido`.
- **La confirmación del pago llega antes que el pedido:** `404`, y el sitio reintenta hasta que entra.
- **El pago llega después de vencer:** el W- se vuelve a apartar; si ya no hay pieza, nace `pago_despues_de_vencer`.
- **Un pago a un W- cancelado:** se guarda y se abre `pago_de_pedido_cancelado`.
- **El monto no es el total:** se acepta y Contaduría ve `totales_no_cuadran`.
- **Una prenda que no se vende en línea:** se acepta y Bodega ve `variante_sin_canal_linea`.
- **Bodega no encuentra la pieza:** «No la encuentro» abre la DF- y la reserva pasa a donde haya libres; si no hay, el W- queda sin pieza, con su excepción.
- **La tienda en línea no acepta pago pendiente** (`linea.acepta_pago_pendiente` en «No»): `pago_pendiente_apagado`.

## Cómo está hecho

*Lo escribe Claude Code al terminar la fase 21.*
