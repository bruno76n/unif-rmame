# Fase 11: Aduana y Bodega

> **Etapa:** Módulos.
> **Estado:** Terminada.
> **Antes de empezar:** lee la [forma de trabajo](../trabajo/FORMA-DE-TRABAJO.md) y la [revisión de fase](../trabajo/REVISION-DE-FASE.md).
> **Se conecta con:** [fases](FASES.md) · [fase 10](10-patronaje-y-compras.md) · [fase 12](12-produccion.md)

## Objetivo

Aduana y Bodega mueven de verdad: el material de un proveedor se recibe rollo por rollo con su partida y su costo, lo de más se autoriza o regresa, Bodega surte a aduana, Aduana despacha en un D- y quien recibe confirma con lo que contó. La orden de compra ya sabe qué se recibió y el proveedor, cuánto tarda de verdad.

## Depende de

- [Fase 10](10-patronaje-y-compras.md), terminada y en verde.

## Qué se construye

### Parte 1 · Rollos y recepción de proveedor

**Construye:** las tablas `rollos` y `partidas_tela` (con ellas, `existencias_material.rollo_id` deja su `@llavePendiente`); las tablas `recepciones` y `recepcion_lineas`; `inventario.recibir_de_proveedor`, con sus rollos, sus partidas, el A- del material y la recepción de más; el efecto `inventario.aplicar_decision_recepcion_de_mas`, registrado para el tipo `recepcion_de_mas` (su liga deja su `@llavePendiente`); la lectura `inventario.recibido_de_ordenes` y, con ella, lo recibido en `compras.recalcular_estado_orden`, en `compras.cuenta_material` y en el plazo real de cada proveedor; `inventario.actualizar_costo_rollos`, con su llamada desde `compras.registrar_precios_nota`; `inventario.tomar_consumible`; y el paso 2 del cuadre.

**Leer:**
- [material en bodega](../modulos/inventario/material-en-bodega.md) — los rollos, las partidas, el costo, los estados del rollo, las dos internas y el paso 2 del cuadre (la tabla `retazos` es de la fase 12).
- [recepciones en aduana](../modulos/inventario/recepciones-en-aduana.md) — las tablas, recibir de un proveedor, la recepción de más, su efecto y la lectura.
- [órdenes de compra](../modulos/compras/ordenes-de-compra.md#lecturas) — las lecturas que usa la recepción y el estado que se recalcula.
- [proveedores y precios](../modulos/compras/proveedores-y-precios.md#reglas) — el plazo real y las entregas a tiempo, que aquí se completan.
- [autorizaciones](../modulos/direccion/autorizaciones.md) — cómo se pide una autorización y cómo se registra su efecto.

### Parte 2 · Despachos

**Construye:** la tabla `despachos` (con ella, `traspasos.despacho_id` y `recepciones.despacho_id` dejan su `@llavePendiente`); `inventario.despachar`, `inventario.recordar_despacho`, `inventario.marcar_etiquetas_impresas`, `inventario.recibir_despacho`, del lado de Bodega, e `inventario.entregar_a_tienda_sin_caja`, la entrega en una tienda sin caja con la firma de su encargada.

**Leer:**
- [surtido y despachos](../modulos/inventario/surtido-y-despachos.md) — las reglas, la tabla y esas cuatro acciones.
- [traspasos](../modulos/inventario/traspasos.md) — los estados, el reparto y lo que queda en cada tramo.
- [impresión](../modulos/admin/impresion.md) — las etiquetas y el PDF.

### Parte 3 · Surtir, recibir lo que viene en camino y devolver al proveedor

**Construye:** `inventario.surtir_a_aduana`, para un pedido externo, un pedido en línea y lo de más que regresa al proveedor; `inventario.recibir_en_aduana`, con lo común y la devolución al proveedor surtida de Bodega; e `inventario.devolver_a_proveedor`, desde aduana y desde Bodega.

**Leer:**
- [surtido y despachos](../modulos/inventario/surtido-y-despachos.md#inventariosurtir_a_aduana) — surtir a aduana.
- [recepciones en aduana](../modulos/inventario/recepciones-en-aduana.md#inventariorecibir_en_aduana) — recibir lo que viene en camino, lo que pasa según el tipo y devolver al proveedor.
- [reservas](../modulos/inventario/reservas.md) — las reservas que viajan con su pieza.

## Cómo se construye

- Un solo agente, una parte a la vez.
- Todo es de la web. La caja de cada tienda usa `inventario.recibir_despacho` por su cola cuando llegue el POS.
- Todavía no nace ninguna DF-: llegan en la fase 14. Lo que no llega o llega de más se queda en su tramo, y las pruebas lo comprueban ahí.
- Los pedidos externos (16), los pedidos en línea (18) y lo de las tiendas (POS) no existen: `inventario.surtir_a_aduana` e `inventario.recibir_en_aduana` se prueban con documentos y reservas de prueba, como en la fase 9.
- Al cerrar la fase, los datos de la muestra de Aduana y Bodega que ya pueden existir (lo recibido de las órdenes de la muestra, sus rollos y sus despachos a Bodega) se cargan con estas mismas acciones (ver [base de datos](../cimientos/BASE-DE-DATOS.md#siembra-del-sistema-y-datos-de-la-muestra)).
- No va en esta fase: las pantallas y las consultas de Aduana y Bodega (fase 19), las entregas a corte (fase 12) ni las etiquetas reales (fase 20).

## Excepciones permitidas

- Las llaves a tablas de fases posteriores llevan su `@llavePendiente`: los lotes, las revisiones y los reprocesos (12 a 14), los defectos (13), los clientes y las notas de entrega (16).
- Las internas de otros módulos que llaman estas acciones las agrega su fase: `contaduria.revisar_facturas_de_orden` (17), `ventas.marcar_nota_en_camino` (16), `linea.prendas_en_aduana` y `linea.prendas_en_camino` (18), `linea.devolucion_recibida` (uniformame.mx) y `tiendas.mover_etapa_pedido_especial` (POS).
- `inventario.tomar_consumible` se construye aquí y se prueba directo: la tablet la usa desde la fase 12.
- La tabla `retazos` es de [material en bodega](../modulos/inventario/material-en-bodega.md), pero nace con el corte, en la fase 12.
- Las etiquetas `rollo` y la hoja `despacho` las registra la fase 20: aquí se prueban con el tipo de prueba de la fase 4.

## Criterios de terminado

| Criterio | Prueba que lo demuestra |
|---|---|
| Recibir una orden crea sus rollos con sus metros, su partida (reusada si ya existía) y el costo de su línea, el A- en aduana con destino Bodega y el movimiento de Fuera a Aduana, todo en una transacción | `modulos/inventario/acciones/recibir-de-proveedor.prueba.ts` |
| Una orden que no está enviada ni recibida en parte no se recibe; una enviada sí, aunque llegue antes de la ventana | La misma prueba |
| Lo recibido de más pide una autorización por material, por todo lo que pasa de lo pedido y sin repetir lo ya pedido; en la tela, solo arriba del 3 %; y cuenta en la existencia mientras Dirección decide | La misma prueba |
| Rechazar lo de más hace nacer la devolución donde está (Aduana, Bodega o las dos) y baja lo recibido de la línea; autorizarlo no mueve nada | `modulos/inventario/internas/aplicar-decision-recepcion-de-mas.prueba.ts` |
| La orden pasa a recibida o recibida en parte con lo recibido; lo que falta en camino y el plazo real del proveedor salen de las recepciones | `modulos/inventario/lecturas/recibido-de-ordenes.prueba.ts` y `modulos/compras/lecturas/cuenta-material.prueba.ts` |
| La nota que corrige un precio cambia el costo de todos los rollos de esa línea; Aduana nunca recibe un costo | `modulos/inventario/internas/actualizar-costo-rollos.prueba.ts` y `recibir-de-proveedor.prueba.ts` |
| Un consumible tomado se descuenta de la ubicación de consumibles, en la unidad de inventario y aunque quede negativo | `modulos/inventario/internas/tomar-consumible.prueba.ts` |
| Un despacho junta traspasos de un solo destino y saca todo lo que queda en aduana de cada uno; lo que no sale por despacho se rechaza con su motivo | `modulos/inventario/acciones/despachar.prueba.ts` |
| Solo quien recibe confirma: Aduana solo recuerda; lo que falta se queda en Tránsito a cargo de Aduana y lo que sobra sale del tramo del primer traspaso; las reservas viajan con su pieza | `modulos/inventario/acciones/recibir-despacho.prueba.ts` y `recordar-despacho.prueba.ts` |
| Surtir pasa a En camino a aduana con su A- y sus reservas; sin la pieza en Bodega no surte | `modulos/inventario/acciones/surtir-a-aduana.prueba.ts` |
| Recibir lo que viene en camino deja lo que no llegó en su tramo y una devolución de cliente que no llegó no deja nada | `modulos/inventario/acciones/recibir-en-aduana.prueba.ts` |
| Lo de más regresa al proveedor en rollos enteros que se reparten de su A-, desde aduana o surtido de Bodega; mientras espera en aduana, el A- de esa orden no se despacha | `modulos/inventario/acciones/devolver-a-proveedor.prueba.ts` y `despachar.prueba.ts` |
| El cuadre encuentra un rollo con metros en dos ubicaciones | `modulos/inventario/internas/correr-cuadre.prueba.ts` |

## Revisión de fase

Normal: un [auditor](../../.claude/agents/auditor.md) con contexto limpio revisa los seis puntos de la [revisión de fase](../trabajo/REVISION-DE-FASE.md).
