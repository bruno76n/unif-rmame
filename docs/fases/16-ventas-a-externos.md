# Fase 16: Ventas a externos

> **Etapa:** Módulos.
> **Estado:** Terminada.
> **Antes de empezar:** lee la [forma de trabajo](../trabajo/FORMA-DE-TRABAJO.md) y la [revisión de fase](../trabajo/REVISION-DE-FASE.md).
> **Se conecta con:** [fases](FASES.md) · [fase 15](15-contaduria-terceros-credito-y-cobranza.md) · [fase 17](17-contaduria-por-pagar-facturas-gastos-y-nomina.md)

## Objetivo

Un pedido de un cliente externo va de principio a fin: se levanta con su precio, se confirma, cambia en versiones sin perder la historia, se surte de bodega o se manda a producción, sale de aduana con su nota, se entrega con quién firmó y se cobra; y si algo regresa, se corrige con una nota de crédito. Aquí se juntan Catálogo, Inventario, Producción, Calidad y Contaduría, que ya esperaban a Ventas.

## Depende de

- [Fase 15](15-contaduria-terceros-credito-y-cobranza.md), terminada y en verde.

## Qué se construye

### Parte 1 · Clientes

**Construye:** la tabla `clientes` (con ella dejan su `@llavePendiente` las columnas que apuntan a los clientes); `ventas.crear_cliente`, `ventas.editar_cliente`, `ventas.dar_baja_cliente` y `ventas.reactivar_cliente`, con sus llamadas a Contaduría y a Catálogo; las lecturas `ventas.estado_cliente` y `ventas.cliente_activo_de_escuela`, y con ellas `cliente_dado_de_baja` en el crédito y `escuela_de_cliente` al dar de baja una escuela.

**Leer:**
- [clientes](../modulos/ventas/clientes.md) — todo.
- [terceros y deudas](../modulos/contaduria/terceros-y-deudas.md#acciones-internas) — crear y renombrar el tercero, y su lectura.
- [crédito de clientes](../modulos/contaduria/credito-de-clientes.md#acciones-internas) — abrir el crédito.
- [listas de precios](../modulos/catalogo/listas-de-precios.md) y [escuelas y secciones](../modulos/catalogo/escuelas-y-secciones.md) — las internas del cliente y el candado `escuela_de_cliente`.

### Parte 2 · Pedidos

**Construye:** las tablas `pedidos`, `pedido_renglones` y `pedido_versiones`; `ventas.guardar_borrador_pedido`, `ventas.confirmar_pedido`, `ventas.guardar_version_pedido` y `ventas.cancelar_pedido`; el avance, la etapa y la alerta en `modulos/ventas/dominio/`; las lecturas `ventas.avance_pedido`, `ventas.pedido_para_cobro` y `ventas.pedidos_abiertos_de_variante`, y con ellas `talla_con_pedidos` en Catálogo, el pago y el saldo a favor aplicados a un pedido en Contaduría, y el paso del anticipo a favor al cancelar o terminar un pedido.

**Leer:**
- [pedidos](../modulos/ventas/pedidos.md) — todo.
- [precios](../modulos/catalogo/precios.md#lecturas) — el precio sugerido.
- [pagos y saldo a favor](../modulos/contaduria/pagos-y-saldo-a-favor.md#lo-que-se-agrega-después-a-estas-acciones) y [anticipos](../modulos/contaduria/anticipos.md) — lo que llega con los pedidos.
- [reservas](../modulos/inventario/reservas.md#inventarioliberar_reservas) y [órdenes de producción](../modulos/produccion/ordenes-de-produccion.md#acciones-internas) — lo que se llama al cambiar o cancelar.
- [tallas y tipos de prenda](../modulos/catalogo/tallas-y-tipos-de-prenda.md) — el candado `talla_con_pedidos`.

### Parte 3 · Mandar a producción y cambios

**Construye:** `ventas.mandar_a_produccion` y `ventas.surtir_de_bodega`; surtir a aduana lo apartado para un pedido y recibirlo en aduana con su reserva; las tablas `cambios_pedido` y `cambio_pedido_lineas`, `produccion.crear_cambio_pedido` y `produccion.aplicar_cambio_pedido`; y, en la recepción del taller, el reparto de un lote de pedido (y de su reproceso) con su reserva `pedido_externo`.

**Leer:**
- [mandar a producción](../modulos/ventas/mandar-a-produccion.md) — todo.
- [cambios a pedido](../modulos/produccion/cambios-a-pedido.md) — todo.
- [órdenes de producción](../modulos/produccion/ordenes-de-produccion.md) y [lotes](../modulos/produccion/lotes.md#reglas) — mandar a producción, lo que el pedido tiene en producción y lo que va a Bodega.
- [surtido y despachos](../modulos/inventario/surtido-y-despachos.md) y [recepciones en aduana](../modulos/inventario/recepciones-en-aduana.md#inventariorecibir_en_aduana) — el pedido externo.
- [recepción del taller](../modulos/inventario/recepcion-del-taller.md#reglas) — el reparto de un lote de pedido.

### Parte 4 · Notas de entrega, notas de crédito y devoluciones

**Construye:** las tablas `notas_entrega`, `nota_entrega_lineas`, `notas_credito` y `nota_credito_lineas`; `ventas.armar_nota_entrega`, `ventas.cancelar_nota_entrega`, `ventas.confirmar_entrega`, `ventas.pasar_a_bodega` y la interna `ventas.marcar_nota_en_camino`, con el despacho a un cliente externo; `ventas.pedir_nota_credito` y `ventas.aplicar_decision_nota_credito`, registrada como el efecto de `nota_credito`; las internas de [entregas y devoluciones de clientes](../modulos/inventario/entregas-y-devoluciones-de-clientes.md) e `inventario.no_la_encuentro`; la lectura `ventas.documentos_abiertos` y, con ella, el paso 6 del cuadre con los PE- y las NV-; la recepción en aduana de una devolución con nota de crédito; y `calidad.revisar_devolucion` con su tabla `revisiones_devolucion`.

**Leer:**
- [notas de entrega](../modulos/ventas/notas-de-entrega.md) y [notas de crédito](../modulos/ventas/notas-de-credito.md) — todo.
- [entregas y devoluciones de clientes](../modulos/inventario/entregas-y-devoluciones-de-clientes.md) — todo.
- [reclamos y devoluciones](../modulos/calidad/reclamos-y-devoluciones.md#calidadrevisar_devolucion) — la revisión de la devolución.
- [reservas](../modulos/inventario/reservas.md#inventarioapartar_para_nota) — apartar para la nota y devolver de ella.
- [cuentas por cobrar](../modulos/contaduria/cuentas-por-cobrar.md#acciones-internas) y [anticipos](../modulos/contaduria/anticipos.md#acciones-internas) — lo que Contaduría recibe de una nota.
- [autorizaciones](../modulos/direccion/autorizaciones.md) — el tipo `nota_credito`.
- [existencias y cuadre](../modulos/inventario/existencias-y-cuadre.md#el-cuadre-de-la-noche) — el paso 6, con los documentos de Ventas.

## Cómo se construye

- Un solo agente, una parte a la vez.
- Ahora que existen, las pruebas de las fases anteriores que usaban clientes, pedidos o notas de prueba siguen en verde con los de verdad.
- El flujo del pedido externo se prueba completo al cerrar la fase: alta, pedido, versión, surtir de bodega, mandar a producción, recibir del taller, nota, despacho, entrega, pago y nota de crédito con devolución.
- Al cerrar la fase, los datos de la muestra de Ventas y de cobranza (clientes, pedidos, notas de entrega y de crédito, anticipos y pagos) se cargan con estas mismas acciones (ver [base de datos](../cimientos/BASE-DE-DATOS.md#siembra-del-sistema-y-datos-de-la-muestra)).
- No va en esta fase: las pantallas y las consultas de Ventas (fase 19) ni la hoja de la nota (fase 20).

## Excepciones permitidas

- `calidad.revisar_devolucion` y su tabla viven en [reclamos y devoluciones](../modulos/calidad/reclamos-y-devoluciones.md) (fase 13), pero se construyen aquí, con las devoluciones de los clientes.
- Las internas de Producción, Inventario, Contaduría y Catálogo que Ventas llama ya se construyeron en sus fases; aquí solo se conectan.
- «No la encuentro» de un pedido en línea llega en la fase 18 y la devolución en línea, con uniformame.mx; lo de las tiendas, con el POS.

## Criterios de terminado

| Criterio | Prueba que lo demuestra |
|---|---|
| Un cliente nace con su tercero (o ligado al que ya había), su crédito sin límite, su lista vacía y, si es escuela, su escuela; uno repetido se rechaza | `modulos/ventas/acciones/crear-cliente.prueba.ts` |
| Un cliente con pedidos abiertos o con saldo no se da de baja, y el monto solo se ve con Contaduría | `dar-baja-cliente.prueba.ts` |
| Confirmar congela el precio (dado, o el sugerido de hoy, más el recargo) y nace la versión 1; un cliente detenido no confirma | `modulos/ventas/acciones/confirmar-pedido.prueba.ts` |
| Una versión guarda el antes y el después sin cambiar un renglón confirmado, respeta el mínimo de cada talla y avisa a Producción de las piezas de más | `guardar-version-pedido.prueba.ts` |
| El avance, la etapa y la alerta salen como dicen sus reglas | `modulos/ventas/dominio/avance-pedido.prueba.ts`, con fast-check |
| Cancelar un pedido pasa sus lotes a temporada, regresa a Bodega lo de aduana y lo que viene en camino, libera sus reservas y deja a favor su anticipo | `cancelar-pedido.prueba.ts` |
| Surtir de bodega nunca aparta más de lo libre; mandar a producción nunca más de lo que falta, y suma a un lote sin cortar o abre su orden | `surtir-de-bodega.prueba.ts` y `mandar-a-produccion.prueba.ts` |
| Aplicar un cambio resta de los lotes sin cortar, manda a Bodega lo ya cortado, cancela lo que queda en cero y reemplaza los cambios viejos | `modulos/produccion/acciones/aplicar-cambio-pedido.prueba.ts` |
| Un lote de pedido se reparte al recibirlo: lo que le falta al pedido, al cliente con su reserva; lo demás a Bodega | `modulos/inventario/acciones/recibir-del-taller.prueba.ts` |
| La nota solo lleva lo listo, al precio del pedido y con su anticipo; cancelarla regresa piezas y anticipo; confirmar la entrega saca las piezas, crea la cuenta por cobrar y puede dejar entregado el pedido | `armar-nota-entrega.prueba.ts`, `cancelar-nota-entrega.prueba.ts` y `confirmar-entrega.prueba.ts` |
| Nada sale a un cliente externo sin su nota, y a Aduana nunca le viajan importes | `modulos/inventario/acciones/despachar.prueba.ts` y `confirmar-entrega.prueba.ts` |
| Una nota de crédito autorizada toma su folio, baja el saldo (lo de más queda a favor) y deja esperando sus piezas; Calidad decide qué sirve y qué es merma | `pedir-nota-credito.prueba.ts`, `aplicar-decision-nota-credito.prueba.ts` y `modulos/calidad/acciones/revisar-devolucion.prueba.ts` |
| «No la encuentro» abre su DF- y regresa la pieza a lo que falta mandar del pedido | `modulos/inventario/acciones/no-la-encuentro.prueba.ts` |

## Revisión de fase

Normal: un [auditor](../../.claude/agents/auditor.md) con contexto limpio revisa los seis puntos de la [revisión de fase](../trabajo/REVISION-DE-FASE.md).
