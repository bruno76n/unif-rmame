# Flujo 02 · Cambios en producción

> **Qué cubre:** los cambios a un pedido que ya está en producción: una versión que agrega y quita piezas y cambia la entrega, mandar lo nuevo, aplicar el cambio a los lotes, lo ya cortado que va a Bodega, y cancelar un pedido; lo que tiene que cuadrar al final y lo que sale mal.
> **Estado:** Decidido.
> **Se construye en:** [fase 21](../../fases/21-pruebas-de-punta-a-punta.md).
> **Se conecta con:** [pruebas](../../cimientos/PRUEBAS.md) · [cambios a pedido](../../modulos/produccion/cambios-a-pedido.md)

## Qué prueba

Que el cliente puede cambiar de opinión sin que el taller corte de más: lo que se agrega llega a producción, lo que se quita sale primero de lo que no se ha cortado, lo ya cortado de más termina en Bodega, y el pedido nunca promete menos de lo que ya se entregó.

## Datos de arranque

- Los datos de la muestra.
- **Un pedido confirmado y en producción** de Distribuidora Escolar Zamora, con dos prendas:
  - Pantalón azul marino, 60 piezas (20 de las tallas 8, 10 y 12) en un lote ya cortado y en proceso;
  - Playera polo blanca, 60 piezas (20 de las tallas 8, 10 y 12) en un lote por cortar, sin tela entregada.
- **Otro pedido confirmado y en producción,** sin notas, con $3,000 de anticipo, para cancelarlo al final.

## Pasos

| # | Quién · dónde | Qué hace | Qué tiene que pasar |
|---|---|---|---|
| 1 | Ventas · Modificar pedido | Quita 15 playeras de la talla 10 y 5 pantalones de la talla 12, agrega 10 playeras de la talla 14 y mueve la entrega una semana. «Guardar versión 2» → `ventas.guardar_version_pedido` | La versión 2 guarda los precios de lo que ya estaba; la playera talla 14 toma su precio de hoy. Las dos partes del aviso: faltan 10 por mandar y Producción ajusta sus lotes. Nace el cambio por aplicar. Los dos lotes toman la fecha nueva, y su fecha de corte no cambia |
| 2 | Ventas · Mandar a producción | Las 10 de la talla 14 → `ventas.mandar_a_produccion` | «… se suman a {L}, que todavía no se corta»: el lote de la playera crece a 70 planeadas |
| 3 | Producción · Pendientes | «Cambio de pedido» muestra antes qué resta y qué manda a Bodega. «Aplicar a lotes» → `produccion.aplicar_cambio_pedido` | «{PE} versión 2 aplicada en producción»: el lote de la playera baja a 55 planeadas (talla 10 con 5); el del pantalón marca 5 de la talla 12 para Bodega. Compras ve menos tela comprometida |
| 4 | Bodega y Producción | Entregan la tela, cortan la playera (55) y la tablet registra los dos lotes hasta terminarlos | Los dos lotes terminados; el del pantalón sigue con sus 60 cortadas |
| 5 | Calidad · Revisión | Aprueba los dos completos → `calidad.revisar_lote` | Los dos revisados, sin reproceso |
| 6 | Aduana · Recibir del taller | El pantalón, a ciegas: 60 → `inventario.recibir_del_taller` | Dos A-: 55 al cliente (`lote_cliente`) y 5 de la talla 12 a Bodega (`quitado_de_pedido`). La playera: 55 al cliente |
| 7 | Aduana y Bodega | Despacha a Bodega el A- de los 5 y Bodega lo recibe → `inventario.despachar` y `inventario.recibir_despacho` | 5 pantalones talla 12 más en Bodega, libres |
| 8 | Ventas, Aduana y Contaduría | Nota con las 110 piezas, despacho, entrega y pago, como en el [flujo 01](01-pedido-externo.md) | El pedido queda entregado: 55 pantalones y 55 playeras |
| 9 | Ventas · cajón del otro pedido | «Cancelar con motivo» → `ventas.cancelar_pedido` | «{PE} cancelado. Queda en el historial con su motivo»: sus lotes que no llegaron a aduana pasan a temporada, con destino Bodega; los $3,000 de anticipo pasan a favor del cliente; Compras recalcula lo comprometido |

## Lo que tiene que cuadrar al final

- **El pedido:** en cada prenda y talla, lo pedido en la versión vigente es lo entregado: nada queda en producción, en aduana ni en nota para él.
- **Los lotes:** la playera cortó 55 = 20 + 5 + 20 + 10; el pantalón cortó 60 = 55 al cliente + 5 a Bodega.
- **El inventario:** los 5 pantalones están en Bodega, libres; la existencia es la suma del libro y el cuadre de la noche no deja residuo.
- **El dinero:** lo cobrado es lo de la versión 2 con sus precios: los de la versión 1 para lo que ya estaba y el de hoy para lo nuevo. El pedido cancelado deja $3,000 a favor del cliente y ninguna cuenta por cobrar.
- **El cambio:** aplicado, con quién y cuándo, y su renglón por prenda y talla.

## Lo que sale mal

- **Bajar una talla de más:** si la talla ya tiene entregadas, en nota o listas en aduana, la versión no la deja abajo de eso: `talla_bajo_minimo`, «{prenda} talla {t}: mínimo {n}.»
- **Dos versiones antes de aplicar:** se aplica la más nueva y la anterior queda reemplazada, sin restar dos veces.
- **Aplicar dos veces el mismo cambio:** `cambio_ya_aplicado`.
- **El lote por cortar se queda en 0 con tela entregada:** se cancela con «Cambio de pedido {PE} versión {v}» y su entrega queda devuelta: sus rollos, por recibir en Bodega, y sus avíos, en un traspaso de regreso; si era el único lote de su orden, la orden también se cancela.
- **Cancelar un pedido con notas:** `pedido_con_notas`.
- **Un cliente detenido por crédito** guarda una versión que sube piezas: `cliente_detenido`; una que solo quita sí se guarda.
- **Una versión sin cambios:** `sin_cambios`.

## Cómo está hecho

*Lo escribe Claude Code al terminar la fase 21.*
