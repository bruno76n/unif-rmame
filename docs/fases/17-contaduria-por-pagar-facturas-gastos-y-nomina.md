# Fase 17: Contaduría: por pagar, facturas, gastos y nómina ●

> **Etapa:** Módulos.
> **Estado:** Pendiente.
> **Antes de empezar:** lee la [forma de trabajo](../trabajo/FORMA-DE-TRABAJO.md) y la [revisión de fase](../trabajo/REVISION-DE-FASE.md).
> **Se conecta con:** [fases](FASES.md) · [fase 16](16-ventas-a-externos.md) · [fase 18](18-tienda-en-linea-direccion-y-contador.md)

## Objetivo

Contaduría sabe a quién le debe, cuánto y para cuándo, y no paga lo que no llegó: cada factura se compara con lo pedido y lo recibido antes de pagarse. Lleva las deudas con terceros y lo que se compensa, registra cada gasto con su comprobante y paga la nómina de cada semana una sola vez, con «Confirmar con Google», congelada para siempre.

## Depende de

- [Fase 16](16-ventas-a-externos.md), terminada y en verde.

## Qué se construye

### Parte 1 · Cuentas por pagar y facturas de proveedor

**Construye:** las tablas `facturas_proveedor`, `factura_proveedor_ordenes` y `cuentas_por_pagar`, con las que dejan su `@llavePendiente` `autorizaciones.factura_proveedor_id` y `aplicaciones_pago.cuenta_por_pagar_id`; `contaduria.capturar_factura_proveedor`, con las tres puntas y los precios de la nota; `contaduria.cancelar_factura_proveedor` y `contaduria.registrar_nota_credito_proveedor`; la interna `contaduria.revisar_facturas_de_orden` y sus llamadas desde `inventario.recibir_de_proveedor` y desde `inventario.aplicar_decision_recepcion_de_mas`; `contaduria.pagar_cuenta_por_pagar`, que cierra la orden cuando sus facturas quedan pagadas; `contaduria.pedir_pago_lo_recibido` y el efecto `contaduria.aplicar_decision_pago_fuera_de_lo_normal`; las lecturas `contaduria.facturacion_de_orden` y `compras.ordenes_para_factura`; y la antigüedad, el saldo por pagar y el flujo de los próximos días en `modulos/contaduria/dominio/`.

**Leer:**
- [facturas de proveedor](../modulos/contaduria/facturas-de-proveedor.md) — todo.
- [cuentas por pagar](../modulos/contaduria/cuentas-por-pagar.md) — todo.
- [órdenes de compra](../modulos/compras/ordenes-de-compra.md) — las internas que cierran y reabren la orden pagada y las lecturas `compras.precio_vigente_lineas` y `compras.ordenes_para_factura`.
- [proveedores y precios](../modulos/compras/proveedores-y-precios.md) — `compras.registrar_precios_nota` y el umbral del cambio de precio.
- [recepciones en aduana](../modulos/inventario/recepciones-en-aduana.md) — lo recibido de una orden (regla 9 y `inventario.recibido_de_ordenes`) y dónde se revisan sus facturas.
- [autorizaciones](../modulos/direccion/autorizaciones.md) — el tipo `pago_fuera_de_lo_normal` y cómo corre un efecto dentro de la decisión.

### Parte 2 · Deudas, compensaciones y depósitos a terceros

**Construye:** las tablas `deudas`, `deuda_mensualidades` y `compensaciones`, con las que dejan su `@llavePendiente` `cuentas_por_pagar.deuda_mensualidad_id` y `aplicaciones_pago.compensacion_id`; `contaduria.registrar_deuda`, con una cuenta por pagar por mensualidad, y `contaduria.cancelar_deuda`; `contaduria.compensar` y `contaduria.cancelar_compensacion`; `contaduria.aplicar_deposito_a_tercero`; y lo que se agrega a `contaduria.registrar_pago_recibido` (`medio = cuenta_tercero`) y a `contaduria.cancelar_pago` (sus aplicaciones a cuentas por pagar y la orden que se reabre).

**Leer:**
- [terceros y deudas](../modulos/contaduria/terceros-y-deudas.md) — todo menos la tabla `terceros` y sus internas, que ya existen.
- [pagos y saldo a favor](../modulos/contaduria/pagos-y-saldo-a-favor.md) — `contaduria.aplicar_deposito_a_tercero` y «Lo que se agrega después a estas acciones», fase 17.
- [cuentas por pagar](../modulos/contaduria/cuentas-por-pagar.md) — las reglas 3, 5 y 7.

### Parte 3 · Gastos

**Construye:** la tabla `gastos`, con la que deja su `@llavePendiente` `servicios.gasto_id`; las listas «Categorías de gasto» y «Tipos de comprobante de gasto», con su siembra; `contaduria.registrar_gasto` y `contaduria.cancelar_gasto`; la interna `contaduria.registrar_gasto_mantenimiento` y su llamada desde `mantenimiento.registrar_servicio`; y la siembra de `mantenimiento.servicio_categoria_gasto` y `mantenimiento.servicio_ubicacion_gasto`.

**Leer:**
- [gastos](../modulos/contaduria/gastos.md) — todo.
- [máquinas, fallas y servicios](../modulos/mantenimiento/maquinas-fallas-y-servicios.md) — registrar un servicio con costo y sus dos parámetros del gasto.
- [archivos](../modulos/admin/archivos.md) — ligar el comprobante.

### Parte 4 · Nómina

**Construye:** las tablas `nominas`, `nomina_lineas`, `nomina_linea_piezas` y `descuentos_nomina`; la cuenta de la nómina en `modulos/contaduria/dominio/`; la interna `contaduria.crear_nomina_semana` y su llamada desde `personal.cerrar_semana_asistencia`; la interna `contaduria.mover_fecha_pago_nomina` y su llamada desde `admin.cambiar_parametro`; `contaduria.guardar_descuento_semanal` y `contaduria.pagar_nomina`; la lectura `contaduria.estado_nomina_semana` y su llamada desde `personal.reabrir_semana_asistencia`; las lecturas de Personal `personal.asistencia_para_nomina` y `personal.fichas_para_nomina`; y los tres parámetros `nomina.`.

**Leer:**
- [nómina](../modulos/contaduria/nomina.md) — todo.
- [asistencia](../modulos/personal/asistencia.md) — las reglas, cerrar y reabrir la semana, y su lectura para la nómina.
- [personas](../modulos/personal/personas.md) — la ficha y su lectura para la nómina.
- [registros de operación](../modulos/produccion/registros-de-operacion.md) — la tarifa congelada y `produccion.registros_para_nomina`.
- [tarifas](../modulos/personal/tarifas.md) — la regla 4: la operación sin tarifa.
- [acceso con Google](../modulos/admin/acceso-con-google.md) — «Confirmar con Google».
- [bitácora](../modulos/admin/bitacora.md) — `sensible_sueldos`.

## Cómo se construye

- Un solo agente, una parte a la vez.
- Las pruebas usan las órdenes, las recepciones, los servicios, las personas, la asistencia y los registros reales de las fases anteriores.
- El dinero se prueba con datos al azar y con varias conexiones al mismo tiempo: pagos, depósitos, compensaciones y cancelaciones nunca dejan un saldo por pagar fuera de su lugar; y a lo largo de varias semanas, con registros que llegan tarde, que toman su tarifa después o que se cancelan después de pagados, la nómina nunca paga un registro dos veces ni deja uno sin pagar.
- No va en esta fase: las pantallas y las consultas de Contaduría (fase 19) ni el paquete del contador (fase 18).

## Excepciones permitidas

- La regla del paquete del contador (`paquete_ya_enviado`) al cancelar un gasto, un pago o una compensación, y el aviso de un gasto de un mes ya mandado, llegan en la fase 18.
- Los gastos de caja de las tiendas (`contaduria.registrar_gasto_tienda` y `contaduria.cancelar_gasto_tienda`) y la llave `gastos.movimiento_caja_id` llegan con el POS.
- La tabla `terceros`, `contaduria.crear_tercero`, `contaduria.renombrar_tercero` y `contaduria.datos_terceros` ya existen desde la fase 10.

## Criterios de terminado

| Criterio | Prueba que lo demuestra |
|---|---|
| Las tres puntas: sin nada recibido, detenida a cargo de Aduana; cobrando más de lo recibido, a cargo de Contaduría; si no, conciliada; una factura parcial no se detiene | `modulos/contaduria/acciones/capturar-factura-proveedor.prueba.ts` |
| Los precios de la nota pasan a Compras antes de comparar, con un renglón de bitácora por precio, y la comparación es por cantidad | `capturar-factura-proveedor.prueba.ts` |
| Recibir una orden o rechazar lo recibido de más vuelve a revisar sus facturas sin pagos; una pagada o autorizada no cambia y avisa | `modulos/contaduria/internas/revisar-facturas-de-orden.prueba.ts` |
| La cuenta por pagar vence con los días de crédito menores de sus órdenes; una detenida no se paga ni sale en lo vencido ni en el flujo | `modulos/contaduria/acciones/pagar-cuenta-por-pagar.prueba.ts` y `modulos/contaduria/dominio/saldo-por-pagar.prueba.ts` |
| Pagar pide «Confirmar con Google» y nunca pasa del saldo, aun con dos pagos al mismo tiempo; la orden se cierra cuando todas sus facturas quedan pagadas | `pagar-cuenta-por-pagar.prueba.ts`, con dos conexiones |
| «Pagar lo recibido» pide a Dirección lo recibido más su IVA proporcional; autorizado, la cuenta queda por ese monto; rechazado, sigue detenida | `pedir-pago-lo-recibido.prueba.ts` y `aplicar-decision-pago-fuera-de-lo-normal.prueba.ts` |
| Una factura con pagos no se cancela; sin pagos, se cancela con su cuenta y se revisan las facturas que se capturaron después para sus órdenes | `cancelar-factura-proveedor.prueba.ts` |
| Con pagos, depósitos, compensaciones y cancelaciones al azar, el saldo de cada cuenta por pagar es su importe menos sus aplicaciones vigentes, y una orden está cerrada solo si sus facturas están pagadas | `modulos/contaduria/saldos-por-pagar.azar.prueba.ts`, con fast-check |
| Una deuda nace con una cuenta por pagar por mensualidad y solo se cancela sin pagos | `registrar-deuda.prueba.ts` y `cancelar-deuda.prueba.ts` |
| Un gasto guarda su categoría, dónde se gastó y de dónde salió; «Reparación de máquinas» solo la pone un servicio, y su gasto no se cancela desde Contaduría | `registrar-gasto.prueba.ts`, `cancelar-gasto.prueba.ts` y `registrar-gasto-mantenimiento.prueba.ts` |
| La cuenta de la nómina sigue sus reglas: días, piezas con y sin dañadas, correcciones, descuentos y lo que no alcanzó, con las dos opciones; el total nunca baja de 0 | `modulos/contaduria/dominio/cuenta-nomina.prueba.ts`, con fast-check |
| A lo largo de varias semanas, cada registro se paga una vez y se corrige una vez, aunque llegue tarde o tome su tarifa después | `modulos/contaduria/nomina.azar.prueba.ts`, con fast-check |
| Pagar la nómina pide «Confirmar con Google» y el total visto; se paga en orden, con su semana cerrada, una sola vez aunque se apriete dos veces, y queda congelada | `modulos/contaduria/acciones/pagar-nomina.prueba.ts`, con dos conexiones |
| Sin «ven sueldos y tarifas» no se paga la nómina ni se pone un descuento, y su bitácora llega sin montos | `pagar-nomina.prueba.ts` y `guardar-descuento-semanal.prueba.ts` |
| Cambiar el día de pago mueve las nóminas por pagar con su renglón de bitácora; una semana con la nómina pagada ya no se reabre | `mover-fecha-pago-nomina.prueba.ts` y `modulos/personal/acciones/reabrir-semana-asistencia.prueba.ts` |

## Revisión de fase

Delicada ●: tres [auditores](../../.claude/agents/auditor.md), cada uno con su tema, y el [desmentidor](../../.claude/agents/desmentidor.md):

- **dinero** (las tres puntas, los saldos por pagar, los pagos, depósitos y compensaciones, los gastos y la cuenta de la nómina, al centavo);
- **permisos y recorte** (Aduana nunca recibe precios ni valor recibido; «ven sueldos y tarifas» en la nómina y los descuentos; «Confirmar con Google» donde se pide; solo un servicio pone «Reparación de máquinas»);
- **concurrencia e idempotencia** (los candados de las cuentas por pagar y de la nómina, un pago o una nómina repetidos que no pagan dos veces, y un registro que se paga una sola vez).
