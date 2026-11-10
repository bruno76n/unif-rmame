# Flujo 04 · Compra de material

> **Qué cubre:** la compra de material de punta a punta, de la orden al pago: levantar y enviar la orden con su PDF, recibir en Aduana rollo por rollo, las etiquetas de los rollos, el despacho a Bodega, la factura con sus tres puntas, el pago y el cierre de la orden; con la recepción de más, la factura que no cuadra y la nota que cobra otro precio.
> **Estado:** Decidido.
> **Se construye en:** [fase 21](../../fases/21-pruebas-de-punta-a-punta.md).
> **Se conecta con:** [pruebas](../../cimientos/PRUEBAS.md) · [órdenes de compra](../../modulos/compras/ordenes-de-compra.md)

## Qué prueba

Que no se paga lo que no llegó: lo que pide Compras, lo que cuenta Aduana y lo que cobra el proveedor tienen que coincidir, y cuando no coinciden el pago se detiene hasta que alguien decide. En el camino, cada rollo nace con su folio, su partida y su costo.

## Datos de arranque

- Los datos de la muestra.
- **Por pedir:** la gabardina azul marino de Textiles Aurora (de 50 en 50 m) y el cierre de 18 cm de Avíos del Bajío, bajo lo que se necesita.
- **Las impresoras:** la Zebra de Aduana, de mentira, con su puente.
- **Las cuentas:** la dueña (Dirección), la oficina (Compras y Contaduría), Aduana y Bodega.

## Pasos

| # | Quién · dónde | Qué hace | Qué tiene que pasar |
|---|---|---|---|
| 1 | Compras · Levantar orden | Los dos materiales sugeridos, con sus precios → `compras.levantar_orden` | «2 órdenes quedaron en borrador: {OC} y {OC}», una por proveedor |
| 2 | Compras · cajón de la orden | La de Textiles Aurora: 200 m a $95 el metro, «Marcar enviada» → `compras.marcar_orden_enviada` | «{OC} enviada a Textiles Aurora. Promete llegar el {fecha}»: cantidades y precio congelados, la condición copiada del proveedor y su PDF guardado; cuenta como en camino y Aduana la ve en Recepción |
| 3 | Aduana · Recibir material | Llegan 3 rollos de la partida 7731-B (68, 66 y 70 m) → `inventario.recibir_de_proveedor` | Nacen 3 rollos R- con su partida P-, sus metros y su costo; la orden queda recibida (204 m de 200; lo de más no pasa del 3 %); el material queda en aduana con destino Bodega |
| 4 | Aduana · Despachar | «Imprimir etiquetas» → `inventario.marcar_etiquetas_impresas`, y «Despachar a Bodega» → `inventario.despachar` | La Zebra de mentira recibe 3 etiquetas de rollo; el material sale en su D- a Tránsito |
| 5 | Bodega · Llegada de aduana | «Llegó completo a bodega» → `inventario.recibir_despacho` | «{D}: el material ya está en bodega»: los 3 rollos disponibles para el corte, y los rollos sugeridos se recalculan |
| 6 | Contaduría · Capturar nota o factura | La factura A-1182 por 204 m a $95 más IVA → `contaduria.capturar_factura_proveedor` | «{FP} conciliada con la orden y la recepción»: nace la cuenta por pagar con su vencimiento por la condición de la orden |
| 7 | Contaduría · Pagar | «Confirmar con Google y pagar» → `contaduria.pagar_cuenta_por_pagar` | «{monto} pagados a Textiles Aurora»: la cuenta pagada y la orden cerrada (`compras.cerrar_orden_pagada`) |
| 8 | Compras, Aduana y Contaduría | La orden de cierres sigue igual: enviada, recibida, despachada, facturada y pagada | La segunda orden también cerrada |

## Lo que tiene que cuadrar al final

- **Las tres puntas:** por cada línea, lo pedido, lo recibido en aduana (menos lo devuelto) y lo facturado coinciden; lo pagado es lo facturado.
- **Los rollos:** sus metros suman lo recibido; cada uno con su partida y su costo, el de la línea de su orden.
- **El inventario:** la tela y los cierres están en Bodega; la existencia es la suma del libro y el cuadre de la noche no deja residuo.
- **Las órdenes:** cerradas, sin nada en camino; Compras ya no las sugiere en Por pedir.
- **Lo que vio cada cuenta:** Aduana y Bodega nunca recibieron un precio ni un costo.

## Lo que sale mal

- **Llega de más:** 30 m más de lo que permite el 3 %. Aduana recibe con «Llegó de más: 30 m de gabardina azul marino, espera autorización de Dirección». Si Dirección rechaza, los 30 m salen con «Devolver al proveedor» (`inventario.devolver_a_proveedor`), el despacho a Bodega espera hasta que salgan (`devolucion_pendiente`) y lo recibido de la línea baja.
- **La factura cobra más de lo que llegó:** queda «registrada con diferencias: pago detenido»; «Pagar» responde `cuenta_detenida`; «Pagar lo recibido» (`contaduria.pedir_pago_lo_recibido`) pide a Dirección pagar lo recibido más su IVA proporcional, y autorizada, se paga eso.
- **La nota del proveedor cobra otro precio:** el costo de los 3 rollos cambia al de la nota, estén donde estén, y el precio nuevo queda en el historial del proveedor.
- **Facturaron y no ha llegado nada:** la cuenta queda detenida a cargo de Aduana y no se puede pagar lo recibido (`responsable_aduana`).
- **Llega una parte y lo demás ya no:** la orden queda recibida en parte; «Cerrar con faltante» con motivo deja de contar lo que faltó como en camino y Por pedir lo vuelve a sugerir.
- **Bodega cuenta un rollo de menos:** «Llegó con diferencias»: el rollo que no llegó se queda en Tránsito a cargo de Aduana, por aclarar.
- **Dos personas pagan la misma cuenta:** una paga y la otra recibe `cuenta_pagada`.

## Cómo está hecho

*Lo escribe Claude Code al terminar la fase 21.*
