# Fase 12: Producción

> **Etapa:** Módulos.
> **Estado:** Pendiente.
> **Antes de empezar:** lee la [forma de trabajo](../trabajo/FORMA-DE-TRABAJO.md) y la [revisión de fase](../trabajo/REVISION-DE-FASE.md).
> **Se conecta con:** [fases](FASES.md) · [fase 11](11-aduana-y-bodega.md) · [fase 13](13-calidad-y-mantenimiento.md)

## Objetivo

El taller queda en el sistema de punta a punta: el flujo de cada prenda, la orden que manda fabricar con sus lotes, la tela que Bodega entrega al corte, el corte capturado cerrado con sus bultos y quién cortó, y lo que sube la tablet: piezas por operación con su tarifa congelada, consumibles y PIN bloqueados. Cada lote sabe su avance y su salud.

## Depende de

- [Fase 11](11-aduana-y-bodega.md), terminada y en verde.

## Qué se construye

### Parte 1 · Operaciones y flujos

**Construye:** las tablas `operaciones` (con la siembra de «Corte»), `flujos` y `flujo_operaciones`; `produccion.crear_flujo` (con su llamada a `personal.copiar_tarifas_flujo`), `produccion.agregar_operacion_flujo` y `produccion.quitar_operacion_flujo`, con el candado del flujo; la lectura `produccion.flujo_vigente`; en Catálogo, `flujo_id` en `catalogo.crear_producto` y `catalogo.aplicar_cambios_producto` (bitácora «Flujo: {antes} → {después}») y `flujo_defecto_id` en `catalogo.guardar_tipo_prenda`, con sus llaves; la llave de `tarifas_operacion.flujo_operacion_id` y la regla `operacion_de_baja` de Personal; y su bajada a la tablet.

**Leer:**
- [operaciones y flujos](../modulos/produccion/operaciones-y-flujos.md) — todo.
- [productos](../modulos/catalogo/productos.md#lo-que-llega-después) y [tallas y tipos de prenda](../modulos/catalogo/tallas-y-tipos-de-prenda.md#lo-que-llega-después) — lo que esta fase agrega al catálogo.
- [tarifas](../modulos/personal/tarifas.md#lo-que-llega-después) — lo que esta fase agrega a Personal.

### Parte 2 · Órdenes de producción y lotes

**Construye:** las tablas `ordenes_produccion`, `lotes` y `lote_tallas` (con ellas dejan su `@llavePendiente` las columnas que apuntan a los lotes); `produccion.crear_orden`; las internas `produccion.mandar_a_produccion`, `produccion.pasar_pedido_a_temporada`, `produccion.cambiar_fecha_entrega_pedido`, `produccion.marcar_lote_revisado` y `produccion.marcar_lote_en_aduana`; las lecturas `produccion.piezas_en_produccion`, `produccion.lotes_por_cortar` y `produccion.lotes_sin_terminar_de_variante`, con el candado `talla_con_lotes` de `catalogo.dar_baja_talla`; la salud del lote como función del paquete compartido; el trabajo «Vigilar lotes atorados» con su aviso `lote_atorado`; y la bajada de los lotes a la tablet.

**Leer:**
- [órdenes de producción](../modulos/produccion/ordenes-de-produccion.md) — todo menos `produccion.levantar_orden_sugerencia` (fase 14).
- [lotes](../modulos/produccion/lotes.md) — las reglas, las etapas, las tablas, las internas, las lecturas, el trabajo «Vigilar lotes atorados» y la bajada.
- [tallas y tipos de prenda](../modulos/catalogo/tallas-y-tipos-de-prenda.md#catalogodar_baja_talla) — el candado que se agrega aquí.
- [paquete compartido](../cimientos/PAQUETE-COMPARTIDO.md) — cómo vive y se prueba un cálculo puro.

### Parte 3 · Entregas a corte, corte y bultos

**Construye:** las tablas `entregas_corte`, `apartados_rollo`, `cortes`, `corte_telas`, `corte_rollos`, `bultos` y `retazos`; los rollos sugeridos (`inventario.recalcular_rollos_sugeridos` y su trabajo al terminar el cuadre); `inventario.entregar_al_corte`, `inventario.recibir_del_corte` y las internas `inventario.registrar_corte` e `inventario.devolver_entrega_corte`; la lectura `inventario.lotes_con_tela_entregada`; `produccion.cerrar_corte`, con los registros del corte, sus bultos y su llamada a `patronaje.verificar_receta`; `produccion.imprimir_etiquetas_bulto`; los rollos automáticos, «La tela alcanza» y lo que queda según la receta como funciones del paquete compartido; y, con todo eso, el comprometido de `compras.cuenta_material` y el desperdicio medido de `patronaje.desperdicio_prenda`.

**Leer:**
- [entregas a corte](../modulos/inventario/entregas-a-corte.md) — todo.
- [corte y bultos](../modulos/produccion/corte-y-bultos.md) — todo.
- [material en bodega](../modulos/inventario/material-en-bodega.md) — los estados del rollo, la frontera y la tabla `retazos`.
- [cuenta de material](../modulos/patronaje/cuenta-de-material.md) — lo que pide la receta, el piso del patrón y el desperdicio medido.
- [proyección de material](../modulos/compras/proyeccion-de-material.md#reglas) — el comprometido (regla 2).

### Parte 4 · Registros de la tablet

**Construye:** la tabla `registros_operacion`; `produccion.registrar_operacion`, `produccion.tomar_consumible` y `produccion.registrar_bloqueo_pin`, que llegan por la cola de la tablet; `produccion.cancelar_registro`; la interna `produccion.poner_tarifa_a_registros` y la lectura `produccion.registros_para_nomina`; la lectura `compras.datos_materiales`, con la que «Tomar consumible» sabe qué es consumible y su factor; las internas de inventario `inventario.registrar_merma_produccion` e `inventario.revertir_merma_produccion`; el tope del bulto y «Bultos para ti» como funciones del paquete compartido; el trabajo «Recalcular proyecciones de Producción», que el cuadre corre antes de sus pasos, y el paso 4 del cuadre (el Taller por lote); y la bajada de los registros a la tablet.

**Leer:**
- [registros de operación](../modulos/produccion/registros-de-operacion.md) — todo.
- [lotes](../modulos/produccion/lotes.md#recalcular-proyecciones-de-producción) — el trabajo de la noche y el avance.
- [diferencias, ajustes y mermas](../modulos/inventario/diferencias-ajustes-y-mermas.md#acciones-internas) — las dos internas de la merma de producción.
- [materiales](../modulos/compras/materiales.md#lecturas) — `compras.datos_materiales`.
- [excepciones](../modulos/inventario/excepciones.md) — `pasa_tope_bulto` y `lote_no_en_proceso`.
- [sincronización](../cimientos/SINCRONIZACION.md) — cómo sube la cola y qué es apartado o excepción.
- [existencias y cuadre](../modulos/inventario/existencias-y-cuadre.md#el-cuadre-de-la-noche) — el paso 4.

## Cómo se construye

- Un solo agente, una parte a la vez.
- Lo de la tablet se prueba con aparatos de prueba registrados como en la fase 6 y su cola de `sync/subir`; la tablet de verdad llega en la fase 20.
- Las funciones del paquete compartido (salud, tope, «Bultos para ti», rollos automáticos, «La tela alcanza» y lo que queda según la receta) se prueban con datos al azar y dan lo mismo en la tablet o la pantalla que en la API.
- Los pedidos de Ventas todavía no existen: las internas que usa Ventas se prueban directo, con pedidos de prueba.
- Al cerrar la fase, los datos de la muestra de Producción (flujos, órdenes, lotes, cortes, bultos y registros) se cargan con estas mismas acciones (ver [base de datos](../cimientos/BASE-DE-DATOS.md#siembra-del-sistema-y-datos-de-la-muestra)).
- No va en esta fase: las pantallas y las consultas de Producción (fase 19), la tablet (fase 20), Calidad (fase 13) ni la recepción del taller en aduana (fase 14).

## Excepciones permitidas

- `produccion.levantar_orden_sugerencia` vive en [órdenes de producción](../modulos/produccion/ordenes-de-produccion.md), pero se construye en la fase 14, con las sugerencias de Bodega.
- `inventario.registrar_merma_produccion` e `inventario.revertir_merma_produccion` viven en [diferencias, ajustes y mermas](../modulos/inventario/diferencias-ajustes-y-mermas.md) (fase 14), pero se construyen aquí: cada registro con dañadas las necesita.
- Las internas que llaman otras fases se construyen aquí y se prueban directo: las de pedidos (16), `produccion.marcar_lote_revisado` (13) y `produccion.marcar_lote_en_aduana` (14). `lotes.pedido_id` y `ordenes_produccion.pedido_id` llevan su `@llavePendiente` hasta la fase 16.
- El atorado por máquina llega con las fallas de Mantenimiento, en la fase 13.
- La diferencia de un avío que no alcanzó al entregar llega en la fase 14: hasta entonces Bodega solo queda en negativo.
- La etiqueta `bulto` la registra la fase 20: aquí se prueba con el tipo de prueba de la fase 4.
- Lo del pedido especial de tienda (su orden y `tiendas.mover_etapa_pedido_especial`) llega con el POS.

## Criterios de terminado

| Criterio | Prueba que lo demuestra |
|---|---|
| Un flujo nuevo copia las operaciones, el orden y las personas de su origen, y Personal copia sus tarifas; el de una sola operación lleva el corte y las de su parámetro | `modulos/produccion/acciones/crear-flujo.prueba.ts` |
| El corte siempre va primero y no se quita; un flujo no queda con menos de dos; con lotes en proceso o terminados sin revisar, el flujo no cambia | `agregar-operacion-flujo.prueba.ts` y `quitar-operacion-flujo.prueba.ts` |
| Una orden nueva nace con su lote por cortar, su fecha de corte y sus tallas; una prenda sin flujo no entra; sin receta entra con su aviso | `modulos/produccion/acciones/crear-orden.prueba.ts` |
| Mandar un pedido suma piezas al lote por cortar sin tela de esa prenda o abre una orden con un lote por prenda; cancelar el pedido pasa sus lotes a temporada | `modulos/produccion/internas/mandar-a-produccion.prueba.ts` y `pasar-pedido-a-temporada.prueba.ts` |
| La salud da atorado, sin datos de la tablet, atrasado, en riesgo o en tiempo en ese orden, sin contar los días en que la tablet no subió nada; lo mismo en la tablet que en la API | `packages/compartido/src/calculos/salud-lote.prueba.ts`, con fast-check |
| Un lote atorado avisa una vez hasta que algo cambia | `modulos/produccion/trabajos/vigilar-lotes-atorados.prueba.ts` |
| Los rollos sugeridos siguen la regla de las partidas en orden de fecha de corte y nunca dan el mismo rollo a dos lotes | `modulos/inventario/internas/recalcular-rollos-sugeridos.prueba.ts`, con fast-check |
| Entregar al corte pasa al Taller los rollos de cada tela de la receta y, en la primera entrega, los avíos; libera lo sugerido que no se usó y deja de comprometer lo entregado; una tela que falta sigue comprometida y se entrega después; sin receta o con otra versión no entrega | `modulos/inventario/acciones/entregar-al-corte.prueba.ts` y `modulos/compras/lecturas/cuenta-material.prueba.ts` |
| Cerrar el corte consume de cada tela lo que pide la receta, con sus decimales, o lo que resulta de lo que se escribió que quedó; manda lo que quedó a rollo, retazo o merma con la frontera, crea las piezas cortadas, arma los bultos parejos de hasta 24, crea un registro del corte por bulto a nombre de quien cortó y verifica la receta | `modulos/produccion/acciones/cerrar-corte.prueba.ts` |
| Sin tocar lo que quedó, el corte cierra con lo de la receta; quedar abajo del piso del patrón, lo que falta o la mezcla de partidas solo avisan; una tela de la receta sin rollos no deja cerrar | La misma prueba |
| De cada tela, lo usado más lo que quedó da los metros de sus rollos; lo que queda según la receta nunca es negativo; los rollos automáticos cubren lo que pide la receta y con ellos lo que queda nunca llega a los metros del último rollo; lo mismo en la pantalla que en la API | `packages/compartido/src/calculos/corte.prueba.ts`, con fast-check |
| Lo que regresa del corte se queda en el Taller hasta que Bodega lo recibe; quitar un lote con tela entregada la devuelve | `recibir-del-corte.prueba.ts` y `modulos/inventario/internas/devolver-entrega-corte.prueba.ts` |
| Un registro de la tablet se aplica con su hora y la tarifa que valía; uno mal formado se aparta; uno que pasa del tope o de un lote ya revisado se aplica con su excepción | `modulos/produccion/acciones/registrar-operacion.prueba.ts` |
| El registro que completa la última operación termina el lote; cancelarlo lo reabre; no se cancela si la siguiente ya reportó, si es del corte o si el lote ya pasó por Calidad | `registrar-operacion.prueba.ts` y `cancelar-registro.prueba.ts` |
| La tarifa que pone Personal llega a los registros que no la tenían | `modulos/produccion/internas/poner-tarifa-a-registros.prueba.ts` |
| Un consumible se descuenta en la unidad de inventario; un PIN bloqueado en la tablet queda bloqueado en Personal | `tomar-consumible.prueba.ts` y `registrar-bloqueo-pin.prueba.ts` |
| Con registros al azar, las proyecciones de cada talla siempre son la suma de sus registros vigentes, y el cuadre encuentra un Taller que no cuadra con su lote | `modulos/produccion/trabajos/recalcular-proyecciones.prueba.ts` y `modulos/inventario/internas/correr-cuadre.prueba.ts` |
| A la tablet bajan los lotes en proceso y terminados, sus bultos, sus registros y los flujos, nunca una tarifa ni un costo | `modulos/produccion/bajada.prueba.ts` |

## Revisión de fase

Normal: un [auditor](../../.claude/agents/auditor.md) con contexto limpio revisa los seis puntos de la [revisión de fase](../trabajo/REVISION-DE-FASE.md).
