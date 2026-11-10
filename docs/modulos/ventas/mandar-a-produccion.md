# Mandar a producción

> **Qué cubre:** la revisión antes de mandar un pedido a producción: primero se surte de bodega lo que hay libre, y lo que falta va a los lotes del pedido, con los avisos de receta y de material que no detienen nada.
> **Estado:** Decidido.
> **Se construye en:** [fase 16](../../fases/16-ventas-a-externos.md).
> **Se conecta con:** [pedidos](pedidos.md) · [órdenes de producción](../produccion/ordenes-de-produccion.md) · [lotes](../produccion/lotes.md) · [reservas](../inventario/reservas.md) · [existencias y cuadre](../inventario/existencias-y-cuadre.md) · [surtido y despachos](../inventario/surtido-y-despachos.md) · [recetas](../patronaje/recetas.md) · [proyección de material](../compras/proyeccion-de-material.md) · [pantallas de Ventas](../../interfaz/fabrica/ventas.md) · [cuenta de material](../patronaje/cuenta-de-material.md)

## Para qué sirve

Antes de fabricar, se usa lo que ya hay. Ejemplo: el PE-0145 lleva 40 playeras polo talla 10 y Bodega tiene 12 libres. En la revisión, «Surtir de bodega · 12» las aparta para el pedido: Bodega las surte a aduana y llegan listas para la nota. Las 28 que faltan van a producción: se suman al L-2026-122, que todavía no se corta, o nace la orden OP-2026-064 con su lote. Si la prenda no tiene receta o falta tela, la revisión lo avisa, pero el pedido sigue.

## Reglas

1. **Primero lo libre en bodega:** se aparta para el pedido hasta lo libre en Bodega y hasta lo que falta por mandar (ver [reservas](../inventario/reservas.md)). Bodega lo ve como «Pedido externo» en sus pendientes, lo surte a aduana y Aduana lo recibe para el pedido.
2. **Lo que falta va a producción:** por prenda, se suma al lote del pedido que todavía no se corta, no tiene tela entregada ni llegó a aduana; si no hay, nace una orden por envío, con un lote por prenda (ver [órdenes de producción](../produccion/ordenes-de-produccion.md)).
3. **Nunca más de lo que falta por mandar** (ver [pedidos](pedidos.md#el-avance-la-etapa-y-la-alerta)), y nunca una talla descontinuada.
4. **Los avisos no detienen nada:** una prenda sin receta («no se corta hasta que Patronaje la capture»), el material que falta o que llega después de la fecha de corte. El material se revisa con la misma cuenta que usa Compras (ver [proyección de material](../compras/proyeccion-de-material.md)).
5. **Un cliente detenido por crédito no frena esto:** lo confirmado sigue su camino.
6. **Nada se guarda aquí:** lo mandado se lee de los lotes del pedido, y lo de bodega, de sus reservas.

## Acciones

Las dos son de la web, con el departamento Ventas.

### `ventas.mandar_a_produccion`

| | |
|---|---|
| **Pantalla** | Cajón «Mandar a producción» (la revisión) · «Mandar a producción» |
| **Recibe** | `pedido_id` · `version` · `renglones`, opcional: `variante_id` y `piezas`; si no vienen, va todo lo que falta por mandar |
| **Reglas y errores** | `422 nada_por_mandar`: «Todo el pedido ya está en producción.»<br>`422 pedido_no_confirmado`: «{PE} está {estado}: solo un pedido confirmado se manda a producción.»<br>`422 piezas_de_mas_por_mandar`: «{prenda} talla {t}: solo faltan {n} por mandar.»<br>`422 talla_descontinuada`: «{prenda} talla {t} está descontinuada: ya no se fabrica.»<br>Avisos que no detienen: «{prenda} no tiene receta: no se corta hasta que Patronaje la capture» (o «{n} prendas no tienen receta…») · «Falta material: el corte no puede empezar hasta que Compras lo consiga» · «Parte del material llega después de la fecha de corte» |
| **Escribe** | Nada en las tablas de Ventas |
| **Llama** | `ventas.avance_pedido` · `produccion.mandar_a_produccion`, con el pedido, su versión, su entrega y los renglones · `patronaje.receta_cubre_tallas` y `compras.cuenta_material`, para los avisos |
| **Regresa** | Las piezas, los lotes sumados y la orden nueva. «{PE}: {n} piezas a producción: {detalle}» («se suman a {L}, que todavía no se corta», «{OP} con el lote {L}», o las dos unidas con « y ») |
| **Eventos** | `pedido.mandado_a_produccion` |
| **Bitácora** | «{persona} mandó a producción {n} piezas a {lote}», un renglón por lote sumado; con orden nueva, otro renglón con la misma clave: «Producción abrió {OP}: {lotes}» |

### `ventas.surtir_de_bodega`

| | |
|---|---|
| **Pantalla** | Cajón «Mandar a producción» · por prenda · «Surtir de bodega · {n}» |
| **Recibe** | `pedido_id` · `version` · `producto_id` · `renglones`, opcional: `variante_id` y `piezas`; si no vienen, por talla lo menor entre lo libre en Bodega y lo que falta por mandar |
| **Reglas y errores** | `422 bodega_sin_libres`: «Bodega ya no tiene libres de {prenda} talla {t}: quedan {n}.»<br>`422 piezas_de_mas_por_mandar` y `pedido_no_confirmado`, como arriba |
| **Escribe** | Nada en las tablas de Ventas |
| **Llama** | `ventas.avance_pedido` · `inventario.libres` · `inventario.reservar`, motivo `pedido_externo`, en Bodega, por talla |
| **Regresa** | Las piezas y lo que queda por mandar (en 0, la pantalla regresa al pedido). «{n} piezas se apartan en bodega para {PE}. A producción va solo lo que falta» |
| **Eventos** | `pedido.surtido_de_bodega`: en vivo a Bodega |
| **Bitácora** | «{persona} apartó en bodega {n} piezas de {prenda} para {PE}» |

## Parámetros

Ninguno propio: la fecha de corte de un lote nuevo es `produccion.dias_corte_lote_nuevo` (ver [órdenes de producción](../produccion/ordenes-de-produccion.md)).

## Permisos

- Mandar y surtir: Ventas. La revisión no muestra costos.

## Eventos

`pedido.mandado_a_produccion` · `pedido.surtido_de_bodega`.

## Lo que llega después

- **Fase 19:** el cajón «Mandar a producción» con la revisión por prenda, su material y sus avisos.

## Cómo está hecho

*Lo escribe Claude Code al terminar la fase 16.*
