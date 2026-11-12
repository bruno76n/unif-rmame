# Fase 18: Tienda en línea, Dirección y contador

> **Etapa:** Módulos.
> **Estado:** Terminada.
> **Antes de empezar:** lee la [forma de trabajo](../trabajo/FORMA-DE-TRABAJO.md) y la [revisión de fase](../trabajo/REVISION-DE-FASE.md).
> **Se conecta con:** [fases](FASES.md) · [fase 17](17-contaduria-por-pagar-facturas-gastos-y-nomina.md) · [fase 19](19-web-principal.md)

## Objetivo

La fábrica recibe los pedidos de la tienda en línea sin rechazar nunca uno ya cobrado: aparta sus prendas de la misma existencia que todo lo demás y las sigue hasta aduana. Contaduría manda cada mes al contador el mismo paquete, que ya no cambia una vez mandado, y cada noche revisa que los saldos cuadren. Dirección recibe solo las alertas nuevas de lo que cruza departamentos y no está bien. Con esta fase quedan completos los módulos.

## Depende de

- [Fase 17](17-contaduria-por-pagar-facturas-gastos-y-nomina.md), terminada y en verde.

## Qué se construye

### Parte 1 · Pedidos en línea

**Construye:** las tablas `pedidos_linea` y `pedido_linea_renglones`, con las que dejan su `@llavePendiente` las llaves de reservas y traspasos a los W-; `linea.recibir_pedido` y `linea.confirmar_pago`, que llegan del sitio con la credencial de uniformame.mx y su alcance; `linea.cancelar_pedido`; las internas `linea.prendas_en_camino`, `linea.prendas_en_aduana`, `linea.vencer_pedido` y `linea.pausar_publicaciones_producto`, con sus llamadas desde `inventario.surtir_a_aduana`, `inventario.recibir_en_aduana`, `catalogo.aplicar_cambios_producto` y `catalogo.descontinuar_productos`; el trabajo «Vencer reservas»; «No la encuentro» con una pieza de un W-; las lecturas `linea.pedidos_abiertos_de_variante` (y con ella `talla_con_pedidos` para los W-), `linea.pedidos_abiertos` (y con ella el paso 6 del cuadre para los W-) y `catalogo.datos_variantes`; y los parámetros `linea.acepta_pago_pendiente` y `linea.dias_pedido_rojo` (este lo usa la pantalla de la fase 19).

**Leer:**
- [pedidos en línea](../modulos/linea/pedidos-en-linea.md) — todo.
- [reservas](../modulos/inventario/reservas.md) — reservar con `pedido_linea`, liberar, confirmar el pago, el orden de surtido y «Vencer reservas».
- [surtido y despachos](../modulos/inventario/surtido-y-despachos.md) — surtir a aduana un W-.
- [recepciones en aduana](../modulos/inventario/recepciones-en-aduana.md) — recibir un traspaso `pedido_linea`.
- [entregas y devoluciones de clientes](../modulos/inventario/entregas-y-devoluciones-de-clientes.md) — «No la encuentro».
- [excepciones](../modulos/inventario/excepciones.md) — los tipos de los W-.
- [sincronización](../cimientos/SINCRONIZACION.md#lo-que-puede-cada-aparato) y [dispositivos](../modulos/admin/dispositivos.md) — la credencial de servidor y su alcance.
- [variantes, códigos y etiquetas](../modulos/catalogo/variantes-codigos-y-etiquetas.md) — `catalogo.datos_variantes`.

### Parte 2 · Contador y cuadres

**Construye:** las tablas `paquetes_contador`, `paquete_contador_renglones` y `documentos_contador`, con las que deja su `@llavePendiente` `gastos.paquete_contador_id`; la cuenta del paquete en `modulos/contaduria/dominio/`; `contaduria.marcar_paquete_enviado` y `contaduria.adjuntar_documento_contador`; los trabajos «Crear el paquete del mes», «Armar el archivo del paquete» y «Cuadre de saldos», con el aviso `saldos_no_cuadran`; `paquete_ya_enviado` al cancelar un pago, una compensación o un gasto, y el aviso al registrar un gasto de un mes ya mandado; y la lectura `contaduria.resumen_direccion`.

**Leer:**
- [contador y cuadres](../modulos/contaduria/contador-y-cuadres.md) — todo.
- [pagos y saldo a favor](../modulos/contaduria/pagos-y-saldo-a-favor.md), [anticipos](../modulos/contaduria/anticipos.md), [cuentas por pagar](../modulos/contaduria/cuentas-por-pagar.md), [terceros y deudas](../modulos/contaduria/terceros-y-deudas.md), [gastos](../modulos/contaduria/gastos.md) y [nómina](../modulos/contaduria/nomina.md) — lo que suma cada concepto y lo que ya no se cancela.
- [archivos](../modulos/admin/archivos.md) — guardar el ZIP con `admin.guardar_archivo`.
- [avisos](../modulos/admin/avisos.md) — sumar un tipo de aviso.

### Parte 3 · Alertas e indicadores de Dirección

**Construye:** la tabla `alertas_direccion_vistas`; las reglas de las alertas en `modulos/direccion/dominio/`; el trabajo «Alertas de Dirección», con su aviso; las lecturas de cada dueño que leen las reglas: `produccion.lotes_atorados`, `catalogo.productos_descontinuados`, `inventario.existencia_de_variantes`, `inventario.ultimo_cuadre`, `admin.aparatos_sin_sincronizar` y `patronaje.desperdicio_prenda` para todas las prendas cortadas; y los parámetros `direccion.`.

**Leer:**
- [alertas e indicadores](../modulos/direccion/alertas-e-indicadores.md) — todo.
- [lotes](../modulos/produccion/lotes.md) — la salud (regla 7) y su lectura de lotes atorados.
- [cuenta de material](../modulos/patronaje/cuenta-de-material.md) — el desperdicio de una prenda.
- [proyección de material](../modulos/compras/proyeccion-de-material.md) — `compras.cuenta_material` y el estado «Sin tiempo de entrega».
- [existencias y cuadre](../modulos/inventario/existencias-y-cuadre.md) — el cuadre, sus estados y sus lecturas nuevas.
- [dispositivos](../modulos/admin/dispositivos.md) — la regla de los aparatos sin sincronizar.
- [productos](../modulos/catalogo/productos.md) — `catalogo.productos_descontinuados`.

## Cómo se construye

- Un solo agente, una parte a la vez.
- uniformame.mx todavía no existe: las pruebas crean la credencial de servidor y llaman como lo hará el sitio, con su llave.
- El paquete se prueba con un mes completo de los datos de las fases 15 a 17 y con datos al azar: lo congelado nunca cambia y cada gasto sale en un solo paquete.
- Cada alerta se prueba prendida y apagada, y el trabajo con dos corridas seguidas: solo la primera avisa.
- No va en esta fase: las pantallas y las consultas (fase 19), lo que falta del sitio (uniformame.mx) ni lo de las tiendas (POS).

## Excepciones permitidas

- Empacar, pedir la guía, «La recogió la paquetería», la entrega, las devoluciones en línea, el W- de cambio, los clientes con sesión, los cupones, los paquetes, las publicaciones y el panel llegan con uniformame.mx: hasta entonces un W- termina en «Listo para empacar».
- En el paquete del contador, las ventas y los anticipos de las tiendas salen en 0 hasta el POS, y las ventas en línea, las comisiones y los reembolsos, hasta la pasarela.
- `linea.pausar_publicaciones_producto` no escribe nada mientras no haya publicaciones.

## Criterios de terminado

| Criterio | Prueba que lo demuestra |
|---|---|
| Un W- pagado nunca se rechaza: sin pieza se aparta en Bodega con su excepción; con totales que no cuadran o una prenda que no se vende en línea, se guarda y abre la suya | `modulos/linea/acciones/recibir-pedido.prueba.ts` |
| La misma referencia de pago no entra a dos W-, y un comando repetido contesta lo mismo | `recibir-pedido.prueba.ts` y `confirmar-pago.prueba.ts` |
| Con pago pendiente, las reservas vencen y el W- queda vencido; el pago tardío vuelve a apartar o abre `pago_despues_de_vencer` | `modulos/inventario/trabajos/vencer-reservas.prueba.ts` y `confirmar-pago.prueba.ts` |
| El W- pasa a esperando prendas al surtirse y a listo para empacar con lo último en aduana | `modulos/linea/internas/prendas-en-camino.prueba.ts` y `prendas-en-aduana.prueba.ts` |
| Cancelar un W- libera sus reservas y regresa a su origen lo que estaba en aduana; uno cancelado o vencido ya no se cancela | `cancelar-pedido.prueba.ts` |
| «No la encuentro» con un W- abre su DF- y reasigna la reserva, o la deja sin pieza con su excepción | `modulos/inventario/acciones/no-la-encuentro.prueba.ts` |
| La credencial de uniformame.mx solo alcanza sus dos acciones; Aduana y Bodega nunca reciben precios ni datos del pago | `modulos/linea/alcance.prueba.ts` |
| El paquete de un mes suma cada concepto con sus documentos; al mandarlo se congela, y un gasto que llega tarde sale en el siguiente como de meses anteriores | `modulos/contaduria/dominio/paquete-mes.prueba.ts`, con fast-check, y `marcar-paquete-enviado.prueba.ts` |
| Con el paquete mandado, no se cancela un pago ni una compensación de ese mes, ni un gasto que salió en él | `cancelar-pago.prueba.ts`, `cancelar-compensacion.prueba.ts` y `cancelar-gasto.prueba.ts` |
| El cuadre de saldos encuentra un saldo guardado que no es su importe menos sus aplicaciones, y avisa a la dueña | `modulos/contaduria/trabajos/cuadre-saldos.prueba.ts` |
| Cada alerta sale cuando se cumple su regla y desaparece cuando deja de cumplirse | `modulos/direccion/dominio/alertas.prueba.ts` |
| El trabajo avisa una sola vez cada alerta nueva, y otra vez si reaparece | `modulos/direccion/trabajos/alertas-direccion.prueba.ts` |

## Revisión de fase

Normal: un [auditor](../../.claude/agents/auditor.md) con contexto limpio revisa los seis puntos de la [revisión de fase](../trabajo/REVISION-DE-FASE.md).
