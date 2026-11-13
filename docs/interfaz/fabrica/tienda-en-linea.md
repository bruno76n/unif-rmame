# Pantallas de Tienda en línea

> **Qué cubre:** las pantallas de Tienda en línea en la primera versión (Pendientes, Pedidos y Disponibilidad), el cajón del pedido en línea con dónde está cada prenda y la ventana para cancelarlo, cada una con su consulta, sus textos, sus estados y sus botones.
> **Estado:** Decidido.
> **Se construye en:** [fase 19](../../fases/19-web-principal.md).
> **Se conecta con:** [pedidos en línea](../../modulos/linea/pedidos-en-linea.md) · [reservas](../../modulos/inventario/reservas.md) · [traspasos](../../modulos/inventario/traspasos.md) · [existencias y cuadre](../../modulos/inventario/existencias-y-cuadre.md) · [excepciones](../../modulos/inventario/excepciones.md) · [productos](../../modulos/catalogo/productos.md) · [dispositivos](../../modulos/admin/dispositivos.md) · [pantallas de Bodega](bodega.md) · [pantallas de Aduana](aduana.md) · [lo común de las pantallas](../comunes.md)

## Para qué sirve

Ver desde la fábrica los pedidos que llegan pagados de uniformame.mx (folio W-), dónde está cada prenda hasta que todo se reúne en aduana, y qué se le puede prometer al cliente por talla. Ejemplo: Laura Méndez paga dos playeras polo talla 10 y un pantalón talla 12. En Pendientes aparece «W-1045 · Laura Méndez», «Por surtir», con «Pantalón gris talla 12 · Bodega la surte». Al día siguiente sigue ahí, ahora en rojo; la oficina abre el pedido, ve que el pantalón está «En camino a aduana · A-0311» y espera. Cuando Aduana lo recibe, el W-1045 queda «Listo para empacar».

## Quién entra

- Las cuentas con Tienda en línea. Ven precios, totales, el pago y el contacto del cliente.
- Los botones con cifra que llevan a Aduana o a Bodega solo llevan si la cuenta tiene ese departamento.
- **Pastilla del menú:** los W- por surtir; roja si algún W- abierto se pagó hace `linea.dias_pedido_rojo` (2) días o más.
- **Acción principal:** no tiene.
- **Pestañas:** Pendientes · Pedidos · Disponibilidad.

## Pendientes

**Consulta:** `linea.pendientes`, sin parámetros. Regresa los tres indicadores, los renglones y la pastilla del menú (`n` y si va roja). Solo con el departamento Tienda en línea.

| Cifra | Qué dice | Su línea | Lleva a |
|---|---|---|---|
| «Pedidos» | «{n} abiertos»: por surtir, esperando prendas y listos para empacar; en rojo si hay alguno por surtir, en ámbar si hay abiertos | «{n} esperando pago» si hay alguno, si no «{n} listos para empacar», con la barra Por surtir · Esperando prendas · Listo para empacar | Pedidos |
| «Ventas en línea» | «{monto} esta semana»: el total con envío de los W- pagados en los últimos 7 días, sin los cancelados; la gráfica chica de 14 días | «▲ {n}% contra la anterior» (▼ si bajó) | Pedidos |
| «Disponibilidad» | «{n} tallas salen hoy», de los productos que se venden en línea | «{m} agotadas» o «Ninguna agotada» | Disponibilidad |

| Tipo | Referencia | Fecha · Importe | Estado | Botón |
|---|---|---|---|---|
| «Pedido en línea» | «{W} · {cliente}»; abajo lo que falta, «{prenda} {talla}, …», y dónde está lo primero («Bodega la surte», «En camino a aduana», «Sin pieza: Bodega la busca»); completo, «Completo en aduana · listo para empacar» | «Pagado {fecha}» · el total con envío | La etapa: «Por surtir», «Esperando prendas» o «Listo para empacar»; roja si se pagó hace `linea.dias_pedido_rojo` (2) días o más, ámbar si no | «Ver pedido» → el cajón |

- Salen los W- por surtir, esperando prendas y listos para empacar, del pagado hace más tiempo al más nuevo. Los que esperan pago salen en Pedidos, no aquí.
- **Vacío:** «Sin pendientes».

## Pedidos

**Consulta:** `linea.pedidos` (`estado`, `buscar`: folio o cliente, `cursor`). Regresa, por W-: folio, fecha de pago o vencimiento, cliente, municipio, estado y desde cuándo, promesa, sus prendas con dónde está cada una, total y `version`. Con Bodega o Aduana, y sin Tienda en línea, no viajan totales, pago ni correo y teléfono del cliente (regla 8 de [pedidos en línea](../../modulos/linea/pedidos-en-linea.md)).

- **Arriba:** el buscador «Folio o cliente».
- **El tablero:** «Esperando pago» (gris, solo si hay alguno) · «Por surtir» (azul) · «Esperando prendas» (ámbar) · «Listo para empacar» (verde azulado), cada columna con su conteo. Tarjetas del pagado hace más tiempo al más nuevo, con:
  - el folio y «Pagado {fecha}» (esperando pago: «Vence {día} {hora}»);
  - el cliente;
  - cada prenda, «{prenda} · {talla}» (y «× {n}»), con palomita si ya está en aduana o reloj si falta;
  - el total con envío;
  - en Por surtir y Esperando prendas, la promesa: «Sale hoy» (verde) o «Sale mañana» (ámbar).
- **Columna vacía:** «Ninguno».
- **«Cerrados»,** abajo: cancelados y vencidos, el más reciente arriba, con el folio, «{cliente} · {municipio} · {motivo}» o «Venció sin pago», y el total. Abren el cajón, de solo lectura. «Ver más» trae los siguientes.
- **Sin resultados:** «Ningún pedido con ese folio o cliente».
- Cada tarjeta abre el cajón del pedido.

## Disponibilidad

**Consulta:** `inventario.disponibilidad_linea` (`producto_id` o `variante_ids`, opcionales). Regresa, por talla de los productos activos que se venden en línea (sin las tallas de pedido especial, que no se venden en línea):

| Promesa | Cuándo |
|---|---|
| `sale_hoy` | Tiene libres en Bodega, o en Aduana yendo a Bodega (`inventario.libres`) |
| `sale_manana` | Solo tiene libres en una tienda del orden de surtido cuya caja no está sin sincronizar (`admin.aparatos_sin_sincronizar`). Llega con el POS: antes, ninguna tienda cuenta |
| `agotado` | Ninguna de las dos |

Es la misma cuenta del orden de surtido de [reservas](../../modulos/inventario/reservas.md#parámetros), para que lo que se ve aquí sea lo que el W- promete al llegar.

- **Arriba,** la leyenda: «Sale hoy · hay en bodega», «Sale mañana · está en una tienda», «Agotado».
- **Una ficha por producto,** con su nombre y un cuadro por talla: verde si sale hoy, ámbar si sale mañana, gris y tachado si está agotada. Al pasar el puntero: «Sale hoy: hay en bodega», «Sale mañana: está en una tienda» o «Agotado». Un producto sin ninguna: «Sin existencia».
- **Vacío:** «Ningún producto se vende en línea. Catálogo lo prende en la ficha del producto.»
- No tiene botones.

## Cajones

### Pedido en línea (ancho)

**Consulta:** `linea.pedido` (`pedido_linea_id` o `folio`). Regresa el W- con su envío, su pago (estado y vencimiento), sus renglones con dónde está cada pieza (de sus reservas y traspasos: en Bodega, en camino a aduana con su A-, en aduana, sin pieza), sus excepciones abiertas, su bitácora y su `version`. Se abre desde Pendientes y desde el tablero de Pedidos.

- **Encabezado:** «{W} · {etapa}» y el nombre del cliente.
- **Botones con cifra:** «{n} de {m} prendas en aduana» → Aduana · «{n} por surtir de bodega» → Bodega · Pendientes.
- **Cifras:** «{total}» con «pagó, con envío» (esperando pago: «por pagar · vence {día} {hora}») · «{municipio}» con «envío a» · mientras está por surtir o esperando prendas, «Sale hoy» o «Sale mañana» con «lo que se le prometió»; después, la etapa.
- **Datos:** Cliente (nombre, correo y teléfono) · Envío (destinatario, la dirección con sus referencias, y «{método} · {paquetería} {costo}») · Pago («{pasarela} · {método}», su referencia, «Pagado el {fecha} {hora}» y la comisión) · Cupón, si usó uno.
- **Avisos,** en rojo, uno por excepción abierta del W-, con el texto de su tipo y quién la resuelve (ver [excepciones](../../modulos/inventario/excepciones.md#los-tipos)): «Sin pieza: Bodega la busca», «Los totales no cuadran: lo revisa Contaduría».
- **Prendas:** Prenda · Talla · Piezas · Dónde está · Precio · Importe. Dónde está: «Bodega la surte», «En camino a aduana · {A-}», «En aduana» o «Sin pieza: Bodega la busca»; punto verde en aduana, ámbar si falta, rojo sin pieza. Una prenda de paquete lleva «Paquete {n}» y su descuento abajo.
- **Totales:** Subtotal · Descuento · Envío · Descuento del envío · Total.
- **El camino del pedido:** «Pagó» (fecha y hora) · «Surtido a aduana» · «Prendas reunidas en aduana», marcados conforme se cumplen. Cancelado: «Cancelado el {fecha} por {persona}: {motivo}». Vencido: «Venció sin pago el {fecha}».
- **Historial:** su bitácora, lo más nuevo arriba.
- **El pie:** «Cancelar pedido» (esperando pago, por surtir, esperando prendas o listo para empacar) → la ventana · «Ver en aduana» (listo para empacar, si la cuenta tiene Aduana) → Aduana, donde espera para empacar.

## Ventanas

- **«Cancelar {W}»:** «No se borra: queda con quién, cuándo y por qué. Lo que ya está en aduana regresa a su origen y lo que viene en camino se reparte al llegar. El reembolso lo hace uniformame.mx con su pasarela.» Campo «Motivo» («Escribe el motivo», con `general.largo_minimo_motivo`). «Volver» · «Cancelar pedido» → `linea.cancelar_pedido` («{W} cancelado. Lo que ya estaba en aduana regresa a su origen»). Si ya no se puede: «{W} está {estado}: ya no se puede cancelar.»

## Lo que no se copia de la muestra

- Las pestañas Productos, Devoluciones y Clientes, las columnas Empacado, Enviado y Entregado, la guía y los últimos pasos del camino llegan con uniformame.mx. El precio en línea se cambia en Catálogo, en la lista En línea.
- Los indicadores «Productos» y «Devoluciones» tampoco entran: no hay publicaciones ni devoluciones en línea todavía.
- Se cancela también en «Esperando pago» y en «Listo para empacar», mientras no se empaque.
- «Sale mañana» y el aviso de tiendas sin sincronizar llegan con el POS.
- Pedidos lleva buscador, la columna «Esperando pago» y los vencidos en «Cerrados»; un cerrado se abre para consultarlo.
- El cajón dice el pago, la dirección completa y las excepciones del W-.

## Cómo está hecho

**Fase 19, parte 7.**

- **Las consultas** de Tienda en línea están en `apps/api/src/modulos/linea/consultas/`, con sus contratos en `packages/compartido/src/contratos/linea/consultas.ts`:
  - `comun.ts` lee los W- con sus renglones y dónde está cada parte de cada prenda, de sus reservas activas (la ubicación y el A- que la lleva) y de las excepciones `pedido_linea_sin_pieza` y `pago_despues_de_vencer` abiertas; tiene las etapas con su color y las fechas en hora de México.
  - `pendientes.ts`: `linea.pendientes` y la pastilla del menú (`pastillas: { linea }` en el `index.ts` del módulo), con la misma regla de rojo (`linea.dias_pedido_rojo`) (decisión 780). Las ventas son los W- pagados de cada uno de los últimos 14 días, sin los cancelados; la variación contra la semana anterior no sale si la anterior no vendió. La disponibilidad la cuenta la lectura `inventario.disponibilidad_linea`.
  - `pedidos.ts`: `linea.pedidos`. Los abiertos llegan completos en la primera página y el cursor pagina solo los cerrados (por `estado_en` e `id`). El buscador pide cada palabra en el folio o en el cliente, sin acentos. Sin Tienda en línea (Aduana o Bodega) no viaja `total_centavos` y `recortado` lo dice.
  - `pedido.ts`: `linea.pedido`, por `pedido_linea_id` o por `folio`; solo Tienda en línea. El aviso de cada excepción abierta del W- dice quién la resuelve; las de otro tipo, su descripción y su bandeja.
- **La disponibilidad** (`apps/api/src/modulos/inventario/consultas/disponibilidad-linea.ts`, contrato en `contratos/inventario/disponibilidad-linea.ts`) es la consulta y también la lectura `inventario.disponibilidad_linea`. Sigue los pasos de `inventario.orden_surtido_linea` como `inventario.reservar`: libres en Bodega (existencia − reservas activas, la cuenta de `inventario.libres`) y lo de aduana yendo a Bodega que nadie apartó salen hoy; lo libre en una tienda que surte en línea, ya lleva su existencia y no está sin sincronizar (`admin.aparatos_sin_sincronizar`), mañana. La piden Tienda en línea y Bodega (su «en línea sale»).
- **Las pantallas** están en `apps/web/src/rutas/linea/` (`index.tsx`, `pedidos.tsx`, `disponibilidad.tsx`) y `apps/web/src/departamentos/linea/`: `pagina.tsx` (las pestañas y el cajón de la dirección), `direccion.ts` (`?buscar=`, `?cajon=pedido&id=`), `cuenta.ts` (las direcciones de Aduana y Bodega; si la cuenta las tiene lo dice `useTieneDepartamento`, de lo común), `pestanas/`, `cajones/pedido.tsx` con el historial común, y `ventanas/cancelar.tsx` sobre la ventana con motivo común. «Cancelar pedido» llama a `linea.cancelar_pedido` con la versión que se leyó; un choque lo avisa en el cajón con lo nuevo.
- **Pruebas:** `linea/consultas/pendientes.prueba.ts`, `pedidos.prueba.ts` y `pedido.prueba.ts` (el orden y el rojo, lo que falta y dónde está, la pastilla, el tablero, los cerrados con su cursor, el buscador, el recorte a Aduana y Bodega, el cajón con su excepción y ya cancelado, y quién las pide), `inventario/consultas/disponibilidad-linea.prueba.ts` (Bodega, Aduana yendo a Bodega, lo apartado, la tienda antes y con el POS, los filtros y quién la pide) y `apps/web/src/departamentos/linea/linea.prueba.ts` (las tres pestañas y el cajón en escritorio y en teléfono, con sus capturas en `linea/`; «Cancelar pedido» y su aviso, el choque de versión y una cuenta sin el departamento).
- **Con el revisor de diseño:** la pestaña Pendientes cuenta sus renglones (todo lo pendiente, roja si alguno va en rojo) y no la pastilla del menú, que cuenta solo los por surtir: `pagina.tsx` lee `linea.pendientes`. El pie del cajón lleva «Cerrar» junto a «Cancelar pedido», y las columnas del tablero no se estiran a lo alto. Lo prueba `linea.prueba.ts` (el conteo de la pestaña igual al del panel y «Cerrar» en el pie).
