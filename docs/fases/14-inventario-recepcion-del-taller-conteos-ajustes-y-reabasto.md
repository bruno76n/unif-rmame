# Fase 14: Inventario: recepción del taller, conteos, ajustes y reabasto ●

> **Etapa:** Módulos.
> **Estado:** Pendiente.
> **Antes de empezar:** lee la [forma de trabajo](../trabajo/FORMA-DE-TRABAJO.md) y la [revisión de fase](../trabajo/REVISION-DE-FASE.md).
> **Se conecta con:** [fases](FASES.md) · [fase 13](13-calidad-y-mantenimiento.md) · [fase 15](15-contaduria-terceros-credito-y-cobranza.md)

## Objetivo

Cada hueco del inventario tiene su diferencia, que se cuenta o se aclara, y solo Dirección autoriza un ajuste, que mueve lo que se vio y nada más. Aduana recibe lo que termina el taller contándolo a ciegas y lo reparte a su destino. La existencia de arranque entra sin ajuste. Y Bodega sabe qué mover a cada tienda y qué pedirle a Producción.

## Depende de

- [Fase 13](13-calidad-y-mantenimiento.md), terminada y en verde.

## Qué se construye

### Parte 1 · Diferencias, ajustes y conteos

**Construye:** las tablas `diferencias`, `ajustes`, `ajuste_lineas`, `conteos` y `conteo_lineas` (con ellas deja su `@llavePendiente` `autorizaciones.ajuste_id`) y la lista «Motivos de ajuste» con su siembra; `abrirDiferencia` en `modulos/inventario/dominio/` y, con ella, las DF- de recibir en aduana y de recibir un despacho (lo que faltó, sobró o no venía) y la del avío que no alcanzó al entregar al corte; `inventario.aclarar_diferencia`, con el movimiento `aclaracion_recepcion` y el A- de lo que entra a Aduana; `inventario.aplicar_decision_ajuste`, registrada como el efecto de `ajuste_inventario`; `inventario.guardar_conteo`; y los pasos 3 y 5 del cuadre con las DF-.

**Leer:**
- [diferencias, ajustes y mermas](../modulos/inventario/diferencias-ajustes-y-mermas.md) — todo.
- [conteos](../modulos/inventario/conteos.md) — el conteo (la carga inicial es de la parte 3).
- [autorizaciones](../modulos/direccion/autorizaciones.md) — el tipo `ajuste_inventario` y cómo se registra un efecto.
- [recepciones en aduana](../modulos/inventario/recepciones-en-aduana.md#inventariorecibir_en_aduana) y [surtido y despachos](../modulos/inventario/surtido-y-despachos.md#inventariorecibir_despacho) — dónde nacen las DF- de un tramo.
- [entregas a corte](../modulos/inventario/entregas-a-corte.md#reglas) — el avío que no alcanza (regla 6).
- [traspasos](../modulos/inventario/traspasos.md#lo-que-queda-en-cada-tramo-y-quién-responde) — los tramos y quién responde.
- [existencias y cuadre](../modulos/inventario/existencias-y-cuadre.md#el-cuadre-de-la-noche) — los pasos 3 y 5.

### Parte 2 · Recepción del taller

**Construye:** `inventario.recibir_del_taller`, `inventario.recibir_reproceso` y la interna `inventario.registrar_entrada_del_taller`, con el reparto de los lotes de tienda y de temporada y de sus reprocesos, el consumo de los avíos y las DF- de la recepción del taller (y su `llego`, que entra con el mismo reparto); las lecturas `produccion.lote_para_aduana` y `calidad.reproceso_para_aduana`, y la revisión en `calidad.aprobadas_del_lote`; la llamada a `produccion.marcar_lote_en_aduana`; el paso 4 del cuadre con los lotes recibidos; y «Imprimir etiquetas» para lotes y reprocesos.

**Leer:**
- [recepción del taller](../modulos/inventario/recepcion-del-taller.md) — todo.
- [lotes](../modulos/produccion/lotes.md#lecturas) — `produccion.marcar_lote_en_aduana` y la lectura nueva.
- [revisión de lotes](../modulos/calidad/revision-de-lotes.md#lecturas) — las lecturas de Calidad.
- [traspasos](../modulos/inventario/traspasos.md#los-tipos) — los tipos de lote y el estado `en_aduana`.
- [entregas a corte](../modulos/inventario/entregas-a-corte.md) — los avíos que se entregan.
- [surtido y despachos](../modulos/inventario/surtido-y-despachos.md#inventariomarcar_etiquetas_impresas) — las etiquetas.

### Parte 3 · Carga inicial

**Construye:** `inventario.registrar_carga_inicial`, de Bodega o de Aduana, e `inventario.registrar_carga_inicial_material`, con sus rollos, su costo, su partida del proveedor habitual y el recálculo de los rollos sugeridos.

**Leer:**
- [conteos](../modulos/inventario/conteos.md#reglas) — la carga inicial (reglas 6 y 7).
- [material en bodega](../modulos/inventario/material-en-bodega.md) — los rollos y las partidas.
- [materiales](../modulos/compras/materiales.md#lecturas) — `compras.datos_materiales`.
- [proveedores y precios](../modulos/compras/proveedores-y-precios.md#el-costo-de-un-material) — el costo de un material.

### Parte 4 · Mínimos y reabasto

**Construye:** las tablas `minimos` (con su siembra) y `sugerencias_reabasto`; `inventario.guardar_minimo` y `admin.cambiar_minimo`; `inventario.mover_a_tienda`, con sus candados y su RB-, y la recepción en aduana de un `reabasto`; `inventario.sugerir_fabricar`; `inventario.decidir_sugerencia` y `produccion.levantar_orden_sugerencia`; las lecturas `inventario.sugerencias_de_fabricar` e `inventario.minimos_vigentes`; y la cuenta del reabasto en `modulos/inventario/dominio/`, que deja fuera a las tiendas sin caja (regla 12).

**Leer:**
- [mínimos y reabasto](../modulos/inventario/minimos-y-reabasto.md) — todo.
- [órdenes de producción](../modulos/produccion/ordenes-de-produccion.md) — `produccion.levantar_orden_sugerencia` y sus reglas.
- [configuración](../modulos/admin/configuracion.md#admincambiar_minimo) — `admin.cambiar_minimo`.
- [recepciones en aduana](../modulos/inventario/recepciones-en-aduana.md#inventariorecibir_en_aduana) — el tipo `reabasto`.

## Cómo se construye

- Un solo agente, una parte a la vez.
- Las diferencias y los ajustes se prueban con datos al azar: después de cualquier mezcla de recepciones con diferencias, aclaraciones y ajustes autorizados o rechazados, el cuadre de la noche corre sin residuo.
- Los candados se prueban con dos conexiones: dos «Mover» de la misma variante, dos «Mover» a la misma tienda el mismo día, dos «Levantar orden» de la misma sugerencia y dos aclaraciones del mismo par de espejos.
- Lo que decía el sistema al contar se prueba con movimientos antes y después de la hora del conteo.
- Al cerrar la fase, los datos de la muestra de Aduana y Bodega que faltaban (recepciones del taller, conteos, diferencias, ajustes, mínimos y sugerencias) se cargan con estas mismas acciones (ver [base de datos](../cimientos/BASE-DE-DATOS.md#siembra-del-sistema-y-datos-de-la-muestra)).
- No va en esta fase: las pantallas y las consultas de Aduana y Bodega (fase 19) ni las etiquetas reales (fase 20).

## Excepciones permitidas

- El reparto de un lote de pedido, su reserva `pedido_externo` y el de sus reprocesos se construyen en la fase 16, con los pedidos: antes no hay lotes de pedido.
- `inventario.registrar_merma_produccion` e `inventario.revertir_merma_produccion` viven en [diferencias, ajustes y mermas](../modulos/inventario/diferencias-ajustes-y-mermas.md), pero ya se construyeron en la fase 12.
- `produccion.levantar_orden_sugerencia` vive en [órdenes de producción](../modulos/produccion/ordenes-de-produccion.md) y `admin.cambiar_minimo` en [configuración](../modulos/admin/configuracion.md), pero se construyen aquí.
- La etiqueta de prenda se registra en la fase 20: aquí «Imprimir etiquetas» se prueba con el tipo de prueba de la fase 4.
- Lo de las tiendas (sus DF-, sus conteos, «Pedir conteo», «Pedir a una tienda», sus mínimos en la caja y recibir el reabasto en la tienda) llega con el POS: aquí el reabasto se prueba hasta el despacho.

## Criterios de terminado

| Criterio | Prueba que lo demuestra |
|---|---|
| Recibir con diferencias en aduana o un despacho abre una DF- por renglón, a cargo de quien lo mandó, y el traspaso queda `con_diferencia` | `modulos/inventario/acciones/recibir-en-aduana.prueba.ts` y `recibir-despacho.prueba.ts` |
| Cada aclaración mueve lo pendiente adonde dice su tabla y deja el tramo en cero en el libro; nada entra a Aduana sin su A-; la que no aplica da `aclaracion_no_aplica` | `modulos/inventario/acciones/aclarar-diferencia.prueba.ts` |
| `venia_en_otro` resuelve juntas las dos DF- espejo sin cambiar el lugar que recibió; dos aclaraciones a la vez no resuelven la misma dos veces | La misma prueba, con dos conexiones |
| Un ajuste autorizado mueve la diferencia guardada aunque después hubo movimientos; rechazado, la existencia no cambia y sus DF- regresan a como estaban | `modulos/inventario/internas/aplicar-decision-ajuste.prueba.ts` |
| El conteo guarda lo que decía el sistema a su hora, pide un AJ- con motivo si no cuadra y cierra las DF- por contar de esa ubicación y esa variante | `modulos/inventario/acciones/guardar-conteo.prueba.ts` |
| Un avío entregado sin existencia deja Bodega en negativo con su DF- `material_corte`; se aclara sin ajuste solo cuando ya no está en negativo | `entregar-al-corte.prueba.ts` y `aclarar-diferencia.prueba.ts` |
| En el cuadre, un traspaso `con_diferencia` tiene en sus tramos justo sus DF- abiertas, y un negativo sin DF- abre una `cuadre` (por contar en prenda, por aclarar en material) o `cuadre_proyeccion` en el Taller y en los tramos | `modulos/inventario/internas/correr-cuadre.prueba.ts` |
| Con recepciones, aclaraciones y ajustes al azar, el cuadre corre sin residuo | `modulos/inventario/diferencias.azar.prueba.ts`, con fast-check |
| Un lote se recibe a ciegas: un A- por destino con sus etiquetas por imprimir, una DF- por talla que no cuadró, sus avíos consumidos y el lote en aduana; la respuesta nunca trae lo aprobado | `modulos/inventario/acciones/recibir-del-taller.prueba.ts` |
| Un reproceso solo se recibe aprobado y una vez, con el reparto de su lote | `recibir-del-taller.prueba.ts` |
| De un lote recibido solo quedan en el Taller sus reprocesos sin recibir y lo de sus DF- abiertas, y el paso 4 lo revisa | `correr-cuadre.prueba.ts` |
| La carga inicial entra sin AJ- y solo donde no hay movimientos; la de tela crea sus rollos con su costo y la partida del proveedor habitual, y recalcula los sugeridos | `registrar-carga-inicial.prueba.ts` y `registrar-carga-inicial-material.prueba.ts` |
| «Mover» nunca pasa de lo disponible, aun con dos conexiones; los del día a una tienda comparten RB- y cada uno es su A- | `modulos/inventario/acciones/mover-a-tienda.prueba.ts` |
| La cuenta del reabasto da el mínimo, la meta, en cero o bajo mínimo, lo que se mueve y lo que se fabrica, como dicen sus reglas | `modulos/inventario/dominio/cuenta-reabasto.prueba.ts`, con fast-check |
| Levantar una sugerencia la deja levantada con su orden y su lote; dos a la vez no levantan la misma | `modulos/produccion/acciones/levantar-orden-sugerencia.prueba.ts` |
| Solo la dueña cambia un mínimo: el anterior queda de baja y el nuevo, vigente | `modulos/admin/acciones/cambiar-minimo.prueba.ts` |

## Revisión de fase

Delicada ●: tres [auditores](../../.claude/agents/auditor.md), cada uno con su tema, y el [desmentidor](../../.claude/agents/desmentidor.md):

- **inventario** (las DF-, sus aclaraciones y sus movimientos, los ajustes, la recepción del taller, la carga inicial y el cuadre);
- **autorizaciones y permisos** (el AJ- con Dirección y con la dueña desde Bodega, el conteo ciego que nunca regresa lo aprobado, los mínimos solo de la dueña, Bodega y Aduana en sus acciones);
- **concurrencia e idempotencia** (los candados de «Mover», del RB- y de las sugerencias, los espejos y las claves derivadas de las acciones que escriben varios movimientos).
