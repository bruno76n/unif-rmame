# Mínimos y reabasto

> **Qué cubre:** los dos mínimos de existencia de Bodega y de cada tienda, la meta y la cuenta del reabasto (cuánto mover de Bodega y cuánto mandar a fabricar); mover de Bodega a una tienda con su RB-; y la sugerencia de fabricar que Producción levanta en una orden.
> **Estado:** Decidido.
> **Se construye en:** [fase 14 ●](../../fases/14-inventario-recepcion-del-taller-conteos-ajustes-y-reabasto.md).
> **Se conecta con:** [existencias y cuadre](existencias-y-cuadre.md) · [traspasos](traspasos.md) · [libro de movimientos](libro-de-movimientos.md) · [recepciones en aduana](recepciones-en-aduana.md) · [surtido y despachos](surtido-y-despachos.md) · [órdenes de producción](../produccion/ordenes-de-produccion.md) · [lotes](../produccion/lotes.md) · [configuración](../admin/configuracion.md) · [folios](../admin/folios.md) · [productos](../catalogo/productos.md) · [tallas y tipos de prenda](../catalogo/tallas-y-tipos-de-prenda.md) · [pantallas de Bodega](../../interfaz/fabrica/bodega.md) · [pantallas de Producción](../../interfaz/fabrica/produccion.md) · [pantallas de Administración](../../interfaz/fabrica/administracion.md) · [flujo 05 · Reabasto y surtido a tiendas](../../flujos/fabrica/05-reabasto-y-surtido-a-tiendas.md) · [migración](../../MIGRACION.md)

## Para qué sirve

Ninguna tienda se queda sin la talla que más se vende, y nadie mueve de más. Ejemplo: la Tienda 1 tiene 2 playeras polo talla 10, una talla de mayor venta (mínimo 8, meta 16), y le vienen 3 en camino: le faltan 11. Bodega tiene 7 libres, así que Reabasto propone «Mover 7» y «A producción 4». Bodega mueve: nace el A-23, `reabasto`, con el RB-061 de la Tienda 1 de hoy. Las 4 que faltan van a Producción como sugerencia, y Producción levanta la orden con «Levantar orden».

## Reglas

1. **Dos mínimos por ubicación:** uno para las tallas de mayor venta (`inventario.tallas_mayor_venta`: 8, 10, 12 y M) y otro para las demás. Tienen mínimo Bodega y las tiendas; Aduana, el Taller y los tramos no. Al inicio: Bodega 30 y 12; Tienda 1, 8 y 4; Tienda 2, 8 y 4. Solo la dueña los cambia, en Configuración · Decisiones de operación.
2. **Dónde aplica:** en Bodega, a las prendas activas; en una tienda, a las que se venden en mostrador.
3. **La meta** es el mínimo × `inventario.factor_meta_reabasto` (2). Las cuentas usan los **libres** de cada ubicación: la existencia menos lo reservado (ver [existencias y cuadre](existencias-y-cuadre.md#reglas)), porque una pieza apartada, separada o pedida ya no está para venderse ni para surtir.
4. **Lo que viene en camino hacia una ubicación** es lo que queda de los traspasos con ese destino que están en camino a aduana, en aduana o en tránsito (ver [traspasos](traspasos.md#lo-que-queda-en-cada-tramo-y-quién-responde)).
5. **Una tienda necesita reabasto** cuando sus libres están bajo su mínimo y sus libres más lo que viene en camino no llegan a la meta. Le falta la meta − los libres − lo que viene en camino. Primero se mueve de Bodega, hasta lo disponible; lo que siga faltando se sugiere fabricar, menos lo ya sugerido.
6. **Bodega bajo su mínimo** solo se fabrica: la meta − los libres − lo ya sugerido.
7. **Lo ya sugerido** son las sugerencias por decidir y las levantadas cuyo lote todavía no llega a aduana, de esa variante y esa ubicación.
8. **En cero y bajo mínimo:** una variante está en cero en una ubicación con mínimo si sus libres son 0 o menos, y bajo mínimo si son más de 0 y menos que su mínimo.
9. **Mover nunca pasa de lo disponible en Bodega** en ese momento (ver [existencias y cuadre](existencias-y-cuadre.md#reglas)): si se pide más, se mueve lo disponible y se avisa.
10. **Cada «Mover» es su propio A-** de tipo `reabasto`, de Bodega a la tienda; todos los del día para una tienda comparten su RB-. Así nadie cambia un traspaso que Aduana ya recibió.
11. **Una sugerencia de fabricar** dice qué variante, para qué ubicación y cuántas piezas; Producción la levanta en una orden (ver [órdenes de producción](../produccion/ordenes-de-produccion.md)). Descartarla no es acción de la primera versión: la que no se levanta sigue por decidir y cuenta como ya sugerida.
12. **Una tienda sin caja no entra a la cuenta.** Mientras su `existencia_desde` va vacía, Unifórmame no lleva su existencia: la lleva su punto de venta de hoy (ver [migración](../../MIGRACION.md#las-tiendas-sin-caja)). Sus mínimos se guardan para cuando llegue. Bodega le manda lo que pide con «Mandar a {tienda}», que es la misma `inventario.mover_a_tienda` con las piezas que se escriben.

## La cuenta del reabasto

Vive como función pura en `modulos/inventario/dominio/`: recibe los mínimos, las tallas de mayor venta y el factor de la meta, los libres de cada ubicación, lo disponible en Bodega, lo que viene en camino y lo ya sugerido, y regresa por ubicación y variante el mínimo, la meta, si está en cero o bajo mínimo, cuánto mover y cuánto fabricar (reglas 1 a 8). La usan las consultas de Reabasto y de Pendientes de Bodega (fase 19). No va al [paquete compartido](../../cimientos/PAQUETE-COMPARTIDO.md): ninguna pantalla la calcula mientras se escribe.

## Estados de la sugerencia

| De | A | Qué pasa | Quién |
|---|---|---|---|
| — | `por_decidir` | «A producción» | Bodega |
| `por_decidir` | `levantada` | «Levantar orden» | Producción |

## La tabla `minimos`

| Columna | Tipo | Nulo | Qué es |
|---|---|---|---|
| `id` | uuid | no | Llave |
| `ubicacion_id` | uuid | no | → `ubicaciones.id`: Bodega o una tienda |
| `nivel` | text | no | CHECK (`mayor_venta`, `demas`) |
| `piezas` | integer | no | CHECK > 0 |
| `baja_en` · `baja_por` | timestamptz · uuid | sí | Cuando otro lo reemplazó |

Lleva las columnas comunes (ver [base de datos](../../cimientos/BASE-DE-DATOS.md#columnas-comunes)) y, con el POS, `xid_escritura`: el de cada tienda baja a su caja. **Índice:** único (`ubicacion_id`, `nivel`) donde `baja_en` es nulo. **Siembra:** los seis mínimos de la regla 1.

## La tabla `sugerencias_reabasto`

| Columna | Tipo | Nulo | Qué es |
|---|---|---|---|
| `id` | uuid | no | Llave |
| `variante_id` | uuid | no | → `variantes.id` |
| `ubicacion_id` | uuid | no | → `ubicaciones.id`: para quién, Bodega o una tienda |
| `piezas` | integer | no | CHECK > 0 |
| `estado` | text | no | CHECK (`por_decidir`, `levantada`). default `por_decidir` |
| `orden_produccion_id` · `lote_id` | uuid | sí | → la orden y el lote que la levantaron. CHECK: llenos en `levantada` |
| `decidida_en` · `decidida_por` | timestamptz · uuid | sí | CHECK: llenos en `levantada` |

Lleva las columnas comunes. **Índices:** (`ubicacion_id`, `estado`) donde es `por_decidir` · (`variante_id`) · (`lote_id`).

## Acciones

Las dos son de la web, con el departamento Bodega.

### `inventario.mover_a_tienda`

| | |
|---|---|
| **Pantalla** | Bodega · Reabasto · «Mover {n}» y «Traspasar todo desde bodega · {n}»; también «Mover {n}» en el panel «Variantes en cero» de Pendientes, y «Mandar a {tienda}» en el cajón de la variante, para una tienda sin caja (regla 12) |
| **Recibe** | `renglones`: al menos uno, con `variante_id`, `ubicacion_destino_id` (una tienda) y `piezas` (> 0) |
| **Reglas y errores** | `422 destino_no_tienda`: «Escoge a qué tienda va.»<br>`422 sin_libres`: «{prenda} talla {t}: solo hay 0 libres en bodega.» (si en ningún renglón hay qué mover)<br>Aviso que no detiene: «{prenda} talla {t}: solo se movieron {n}» (regla 9)<br>Antes de ver lo disponible toma el candado de cada variante; antes de buscar el RB- del día, el del reabasto de esa tienda y ese día, para que dos «Mover» al mismo tiempo compartan el mismo |
| **Escribe** | Un A- de tipo `reabasto` por tienda de esta llamada, `en_camino_aduana`, de Bodega a la tienda, con `enviado_en` y el RB- de esa tienda de hoy (si no hay, nace). El movimiento `surtido_bodega`, de Bodega a En camino a aduana, con su A- |
| **Llama** | `admin.tomar_folio` (`partida_aduana` y, si nace, `reabasto`) |
| **Regresa** | Uno: «Traspaso a {tienda}: {n} {prenda} {talla}, enviado a aduana». Varios: «{n} piezas pasan a aduana para las tiendas» (las que de verdad se movieron) |
| **Eventos** | `traspaso.en_camino_aduana` |
| **Bitácora** | «Movió a {tienda}», con las variantes y sus piezas |

### `inventario.sugerir_fabricar`

| | |
|---|---|
| **Pantalla** | Bodega · Reabasto · «A producción» |
| **Recibe** | `renglones`: al menos uno, con `variante_id`, `ubicacion_id` (Bodega o una tienda) y `piezas` (> 0) |
| **Reglas y errores** | `422 ubicacion_sin_minimo`: «{ubicación} no lleva mínimo.» |
| **Escribe** | Una sugerencia `por_decidir` por renglón |
| **Regresa** | «Sugerencia enviada a producción: {n} {prenda} {talla}» |
| **Eventos** | `sugerencia.creada`: sale en Pendientes de Producción como «Sugerencia de bodega» |
| **Bitácora** | «Sugirió fabricar», con las variantes, las ubicaciones y las piezas |

## Acciones internas

### `inventario.guardar_minimo`

| | |
|---|---|
| **La llama** | `admin.cambiar_minimo`, solo la dueña (ver [configuración](../admin/configuracion.md)) |
| **Recibe** | `ubicacion_id` · `nivel` · `piezas` · `version` del mínimo vigente |
| **Reglas** | `422 ubicacion_sin_minimo`: «{ubicación} no lleva mínimo.» (Aduana, el Taller y los tramos). La misma cantidad que ya tenía: nada se escribe |
| **Escribe** | Da de baja el mínimo vigente y crea el nuevo: nada se borra |
| **Regresa** | El mínimo nuevo, con su versión |
| **Eventos** | `minimo.cambiado` |

La bitácora es el renglón de Administración.

### `inventario.decidir_sugerencia`

| | |
|---|---|
| **La llama** | `produccion.levantar_orden_sugerencia` (ver [órdenes de producción](../produccion/ordenes-de-produccion.md)) |
| **Recibe** | `sugerencia_ids` · `orden_produccion_id` · `lote_id` |
| **Reglas** | `422 sugerencia_ya_decidida`: «Esa sugerencia ya se levantó: {OP}.» Toma las sugerencias en orden, para que dos «Levantar orden» no levanten la misma |
| **Escribe** | Las sugerencias, `levantada`, con la orden, el lote, quién y cuándo |
| **Eventos** | `sugerencia.levantada` |

## Lecturas

### `inventario.sugerencias_de_fabricar(sugerencias)`

| | |
|---|---|
| **La usa** | Producción, para levantar la orden: que sean de una prenda y una ubicación, y sus piezas por talla |
| **Regresa** | Por sugerencia: su variante con su prenda, su ubicación, sus piezas y su estado, con su orden si ya se levantó |

### `inventario.minimos_vigentes()`

| | |
|---|---|
| **La usa** | Administración: los «Mínimos de existencia» de Configuración · Decisiones de operación |
| **Regresa** | Por ubicación con mínimo, los dos vigentes, con su versión |

## Parámetros

Los cambia solo la dueña, en Configuración (ver [configuración](../admin/configuracion.md)). Los dos van en «Parámetros»; los mínimos, en «Decisiones de operación».

| Parámetro | Valor inicial | Para qué |
|---|---|---|
| `inventario.factor_meta_reabasto` | 2 | La meta es el mínimo por esto |
| `inventario.tallas_mayor_venta` | 8, 10, 12, M | Las tallas que llevan el mínimo de mayor venta. Texto: los nombres de las tallas, separados por comas |

## Permisos

- Mover y sugerir: Bodega. Levantar una sugerencia: Producción.
- Cambiar los mínimos: solo la dueña.
- Nada de esto regresa precios ni costos.

## Eventos

`sugerencia.creada` · `sugerencia.levantada` · `minimo.cambiado`. El de cada A- lo guarda la acción que lo crea.

## Lo que llega después

- **Fase 19:** Reabasto y Pendientes de Bodega con la cuenta, «Variantes en cero», los mínimos en Configuración y «Sugerencia de bodega» en Producción.
- **Con el POS:** «Pedir a una tienda» (el envío SE-, con su fecha límite `inventario.dias_fecha_limite_se`, su urgencia y su nota), y en la cuenta lo que se pide a la otra tienda (sus libres menos su meta) y lo ya pedido, que cuenta como en camino; las solicitudes de las tiendas, con su atraso `inventario.dias_solicitud_atrasada`, y lo que Bodega todavía no surte de ellas, que también cuenta como en camino para esa tienda, para no mandarlo dos veces; la demanda sin atender; y los mínimos, que bajan a cada caja. La caja hace la misma cuenta que Reabasto.

## Cómo está hecho

*Lo escribe Claude Code al terminar la fase 14.*
