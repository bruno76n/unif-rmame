# Lotes

> **Qué cubre:** el lote L-, lo que se corta junto y avanza junto: una prenda con sus tallas, su etapa, su avance por operación, su salud (atorado, atrasado, en riesgo), lo que un pedido tiene en producción y el costo del lote.
> **Estado:** Decidido.
> **Se construye en:** [fase 12](../../fases/12-produccion.md).
> **Se conecta con:** [órdenes de producción](ordenes-de-produccion.md) · [corte y bultos](corte-y-bultos.md) · [operaciones y flujos](operaciones-y-flujos.md) · [registros de operación](registros-de-operacion.md) · [entregas a corte](../inventario/entregas-a-corte.md) · [recepción del taller](../inventario/recepcion-del-taller.md) · [existencias y cuadre](../inventario/existencias-y-cuadre.md) · [material en bodega](../inventario/material-en-bodega.md) · [proyección de material](../compras/proyeccion-de-material.md) · [proveedores y precios](../compras/proveedores-y-precios.md) · [revisión de lotes](../calidad/revision-de-lotes.md) · [máquinas, fallas y servicios](../mantenimiento/maquinas-fallas-y-servicios.md) · [tarifas](../personal/tarifas.md) · [tallas y tipos de prenda](../catalogo/tallas-y-tipos-de-prenda.md) · [pedidos](../ventas/pedidos.md) · [alertas e indicadores](../direccion/alertas-e-indicadores.md) · [dispositivos](../admin/dispositivos.md) · [eventos y trabajos](../../cimientos/EVENTOS-Y-TRABAJOS.md) · [pantallas comunes](../../interfaz/comunes.md) · [pantallas de Producción](../../interfaz/fabrica/produccion.md) · [pantallas de Calidad](../../interfaz/fabrica/calidad.md) · [pantallas de Patronaje](../../interfaz/fabrica/patronaje.md) · [paquete compartido](../../cimientos/PAQUETE-COMPARTIDO.md) · [reclamos y devoluciones](../calidad/reclamos-y-devoluciones.md) · [mínimos y reabasto](../inventario/minimos-y-reabasto.md) · [cambios a un pedido en producción](cambios-a-pedido.md) · [mandar a producción](../ventas/mandar-a-produccion.md) · [pantallas de Mantenimiento](../../interfaz/fabrica/mantenimiento.md) · [la tablet del taller](../../apps/tablet.md) · [hojas](../../impresos/hojas.md) · [pantallas de la tablet](../../interfaz/tablet.md)

## Para qué sirve

El lote es lo que se corta junto y avanza junto por el taller. Ejemplo de la muestra: el L-2026-122 es el pantalón azul marino del PE-0149 de Distribuidora Escolar Zamora, 190 piezas en sus tallas, con su OP-2026-064. Nace por cortar; al cerrar el corte pasa a en proceso, con su flujo y su versión de receta congelados; cada registro de la tablet lo avanza; cuando la última operación completa todas sus tallas queda terminado; Calidad lo revisa y Aduana lo recibe. Mientras tanto, Producción, Ventas y Dirección ven si va en tiempo, en riesgo, atrasado o atorado.

## Reglas

1. **Un lote es una prenda,** con una o más tallas, y siempre cuelga de una orden de producción (ver [órdenes de producción](ordenes-de-produccion.md)). Su folio es L-{año}-{n}.
2. **La etapa se guarda; la salud se calcula.** Las etapas están abajo; la salud (regla 7) nunca se guarda.
3. **El destino** es un pedido, una tienda o la temporada (Bodega). Si Ventas cancela el pedido, sus lotes que no han llegado a aduana pasan a temporada sin perder su pedido. Las piezas que un cambio de pedido quitó de un lote ya cortado van a Bodega al recibirse en aduana (`piezas_a_bodega`).
4. **Lo que lleva cada talla:** las planeadas, que cambian mientras el lote no se corta; las cortadas, al cerrar el corte, sin pasar de las planeadas; y las terminadas y la merma, que son proyección de los registros: se suman con cada registro o cancelación en la misma transacción y cada noche se recalculan desde los registros.
5. **Terminado:** cuando un registro de la última operación deja, en todas sus tallas, terminadas + merma = cortadas. Cancelar un registro de un lote terminado lo regresa a en proceso; uno revisado o en aduana ya no se toca.
6. **El avance, por operación:**
   - **hechas** = las buenas de sus registros vigentes, y su **merma**, las dañadas;
   - **puede reportar hasta** lo que hizo la operación anterior; la primera después del corte, las cortadas;
   - **el tope de un bulto** en una operación = lo que hizo la anterior en ese bulto (o las piezas del bulto) − buenas y dañadas vigentes de esta operación en ese bulto;
   - **el cuello de botella** («Se junta») es la operación con más piezas esperando: la mayor diferencia contra la anterior;
   - **listas** = la suma de las terminadas; **faltan** = cortadas − merma − listas.
7. **La salud** de un lote en proceso, en este orden (gana la primera que aplica):

   | Salud | Cuándo |
   |---|---|
   | Atorado por máquina | Hay una falla abierta que detuvo una máquina de quien hace de base una operación del flujo con piezas esperando: esa operación está atorada y la falla es la causa. Se quita al resolver la falla |
   | Sin datos de la tablet | La última sincronización de las tablets del taller tiene `produccion.lote_atorado_dias` (2) días de trabajo o más: «Sin datos de la tablet · Desde {fecha}», no atorado |
   | Atorado por falta de avance | Desde su último registro vigente (o desde que se cortó) pasaron `produccion.lote_atorado_dias` días de trabajo o más, sin contar los días en que la tablet no subió nada de ningún lote: «Atorado en {operación}», la del cuello de botella. Se quita con el siguiente registro del lote |
   | Atrasado | Su fecha de entrega ya pasó |
   | En riesgo de atraso | Le faltan piezas y entrega en `produccion.riesgo_atraso_dias` (4) días o menos |
   | En tiempo | Lo demás |

8. **La salud y el tope viven en el [paquete compartido](../../cimientos/PAQUETE-COMPARTIDO.md):** la tablet los calcula sin internet con lo que le bajó, para ordenar «Bultos para ti» y no dejar registrar más del tope, y la API los vuelve a calcular.
9. **Lo que un pedido tiene en producción,** por talla: las planeadas de sus lotes por cortar, las cortadas − merma − las que van a Bodega de los que ya se cortaron (sin los que llegaron a aduana o se cancelaron) y las de sus reprocesos. Con un cambio de pedido por aplicar, las piezas de más se restan de Corte, Costura y Calidad, en ese orden.
10. **El costo del lote,** solo para cuentas con Compras o Contaduría:
    - **tela:** los metros usados de cada rollo × el costo del metro de ese rollo (ver [material en bodega](../inventario/material-en-bodega.md));
    - **avíos:** los avíos de su receta para las piezas cortadas × su costo de última compra (ver [proveedores y precios](../compras/proveedores-y-precios.md#el-costo-de-un-material));
    - **mano de obra:** en proceso, las tarifas vigentes de las operaciones de su flujo × las cortadas; terminado, la suma real de las tarifas de sus registros vigentes;
    - **por pieza:** el total ÷ las cortadas.
11. **Solo se cancela un lote por cortar** que un cambio de pedido dejó en cero piezas: «se quita de su orden». Nada se borra.
12. **El lote es un agregado con sus tallas:** cualquier cambio en sus tallas, también el de un registro de la tablet, sube su `version`. Así una revisión de Calidad que se hizo mientras llegaba un registro recibe `409` (ver [idempotencia y concurrencia](../../cimientos/IDEMPOTENCIA-Y-CONCURRENCIA.md#que-nadie-pise-a-nadie)).

## Etapas

| De | A | Qué pasa | Quién |
|---|---|---|---|
| — | `por_cortar` | Nace con su orden, o recibe piezas de un pedido | Producción; Ventas |
| `por_cortar` | `en_proceso` | «Cerrar corte», con receta: congela su flujo, su versión de receta y su fecha de corte | Producción |
| `por_cortar` | `cancelado` | Un cambio de pedido lo deja en cero | Producción |
| `en_proceso` | `terminado` | El registro que completa la última operación | El servidor, con la tablet |
| `terminado` | `en_proceso` | Se cancela un registro antes de la revisión | Producción |
| `terminado` | `revisado` | Calidad cierra su revisión | Calidad |
| `revisado` | `en_aduana` | Aduana lo recibe | Aduana |

## La tabla `lotes`

| Columna | Tipo | Nulo | Qué es |
|---|---|---|---|
| `id` | uuid | no | Llave (v7) |
| `folio` | text | no | L-2026-122. Único |
| `orden_produccion_id` | uuid | no | → `ordenes_produccion.id` |
| `producto_id` | uuid | no | → `productos.id` |
| `flujo_id` | uuid | sí | → `flujos.id`. El del producto, congelado al cerrar el corte. CHECK: lleno salvo en `por_cortar` y `cancelado` |
| `receta_version_id` | uuid | sí | → `receta_versiones.id`. La versión con que se cortó. CHECK: como la anterior |
| `destino` | text | no | CHECK (`pedido`, `tienda`, `temporada`) |
| `pedido_id` | uuid | sí | → `pedidos.id`. CHECK: lleno con destino `pedido`. Se conserva si pasa a temporada |
| `ubicacion_destino_id` | uuid | sí | → `ubicaciones.id`: la tienda o Bodega. CHECK: lleno con destino `tienda` o `temporada` |
| `paso_a_temporada_en` | timestamptz | sí | Cuando Ventas canceló su pedido |
| `estado` | text | no | CHECK (`por_cortar`, `en_proceso`, `terminado`, `revisado`, `en_aduana`, `cancelado`). default `por_cortar` |
| `fecha_corte` | date | no | La programada al nacer; al cerrar el corte, la de ese día |
| `fecha_entrega` | date | no | La de su orden; cambia si Ventas cambia la entrega del pedido |
| `cortado_en` · `terminado_en` · `revisado_en` · `en_aduana_en` | timestamptz | sí | Cuándo llegó a cada etapa |
| `cancelado_en` · `cancelado_por` · `motivo_cancelacion` | | sí | «Cambio de pedido {PE} versión {v}», lo arma el servidor |

Lleva las columnas comunes y, como baja a la tablet, `xid_escritura` (ver [base de datos](../../cimientos/BASE-DE-DATOS.md#columnas-comunes)). **Índices:** único (`folio`) · (`orden_produccion_id`) · (`estado`, `fecha_corte`) · (`estado`, `fecha_entrega`) · (`pedido_id`) · (`producto_id`, `estado`) · (`flujo_id`) donde está en proceso. Con ella dejan su `@llavePendiente` las columnas que apuntan a los lotes desde las fases 9 a 11 (movimientos, traspasos, reservas, recepciones y `recetas.verificada_lote_id`). `pedido_id` lleva la suya hasta la fase 16.

## La tabla `lote_tallas`

| Columna | Tipo | Nulo | Qué es |
|---|---|---|---|
| `id` | uuid | no | Llave |
| `lote_id` | uuid | no | → `lotes.id` |
| `variante_id` | uuid | no | → `variantes.id`. Del producto del lote |
| `piezas_planeadas` | integer | no | CHECK ≥ 0 |
| `piezas_cortadas` | integer | sí | CHECK ≥ 0. Vacía hasta el corte |
| `piezas_terminadas` | integer | no | default 0. Proyección: las buenas vigentes de la última operación en los bultos de esta talla |
| `piezas_merma` | integer | no | default 0. Proyección: las dañadas vigentes de todas las operaciones en esos bultos |
| `piezas_a_bodega` | integer | no | default 0. CHECK ≥ 0. Las cortadas que un cambio de pedido quitó; no pasan de las cortadas |

Lleva las columnas comunes y `xid_escritura`. **Índices:** único (`lote_id`, `variante_id`) · (`variante_id`). No hay CHECK que amarre terminadas + merma a las cortadas: lo que ya pasó en la tablet se acepta aunque pase del tope, y va a excepciones (ver [registros de operación](registros-de-operacion.md)).

## Acciones internas

### `produccion.marcar_lote_revisado`

| | |
|---|---|
| **La llama** | `calidad.revisar_lote`, al cerrar la revisión (ver [revisión de lotes](../calidad/revision-de-lotes.md)) |
| **Recibe** | `lote_id` · `revision_id` |
| **Escribe** | `terminado` → `revisado`, con `revisado_en` |
| **Eventos** | `lote.revisado` |

### `produccion.marcar_lote_en_aduana`

| | |
|---|---|
| **La llama** | Inventario, al recibir en aduana un lote del taller (ver [recepción del taller](../inventario/recepcion-del-taller.md)) |
| **Recibe** | `lote_id` · `recepcion_id` |
| **Escribe** | `revisado` → `en_aduana`, con `en_aduana_en` |
| **Eventos** | `lote.en_aduana` |

## Lecturas

### `produccion.piezas_en_produccion(pedido)`

| | |
|---|---|
| **La usa** | Ventas: el avance del pedido y su revisión antes de mandar a producción |
| **Regresa** | Por variante, lo que el pedido tiene en producción (regla 9). Sin tarifas ni costos |

### `produccion.lotes_por_cortar()`

| | |
|---|---|
| **La usan** | Compras (el comprometido) y Bodega (las entregas a corte y los rollos sugeridos) |
| **Regresa** | Los lotes por cortar: su producto, sus piezas planeadas por talla, su fecha de corte, para quién y si su prenda tiene receta |

### `produccion.lotes_sin_terminar_de_variante(variante)`

| | |
|---|---|
| **La usa** | Catálogo, al dar de baja una talla: `talla_con_lotes` (ver [tallas y tipos de prenda](../catalogo/tallas-y-tipos-de-prenda.md#catalogodar_baja_talla)) |
| **Regresa** | Los folios de los lotes por cortar, en proceso, terminados o revisados que llevan esa talla |

### `produccion.lote_para_aduana(lote)`

Se construye en la [fase 14](../../fases/14-inventario-recepcion-del-taller-conteos-ajustes-y-reabasto.md), con la recepción del taller.

| | |
|---|---|
| **La usa** | Inventario, al recibir en aduana el lote o uno de sus reprocesos (ver [recepción del taller](../inventario/recepcion-del-taller.md)) |
| **Regresa** | Su folio, su prenda, su estado, su destino (`pedido`, `tienda` o `temporada`, con el pedido o la ubicación), su fecha de entrega y, por talla, sus piezas a bodega. Sin tarifas ni costos |

### `produccion.lotes_atorados()`

Se construye en la [fase 18](../../fases/18-tienda-en-linea-direccion-y-contador.md), con las alertas de Dirección.

| | |
|---|---|
| **La usa** | Dirección, para la alerta «{lote} detenido en {operación} desde hace {n} días» (ver [alertas e indicadores](../direccion/alertas-e-indicadores.md)) |
| **Regresa** | Los lotes en proceso atorados (regla 7, por máquina o por falta de avance): su folio, la operación atorada y desde hace cuántos días de trabajo; si es por máquina, la máquina parada, su falla y sus horas de paro; y su pedido y su fecha de entrega, si tiene |

## Trabajos

### «Recalcular proyecciones de Producción»

| | |
|---|---|
| **Cuándo** | Cada noche, al empezar el «Cuadre nocturno» y antes de sus pasos: el trabajo del cuadre lo corre primero (ver [existencias y cuadre](../inventario/existencias-y-cuadre.md#el-cuadre-de-la-noche)) |
| **Hace** | Por tramos, con transacciones cortas: corrige las terminadas y la merma de cada talla que no cuadran con sus registros vigentes; si con eso un lote en proceso queda completo, lo pasa a terminado como lo haría un registro |
| **Escribe en la bitácora** | Lo que corrigió, con origen `sistema`, `antes` y `despues` |
| **Avisa** | `lote_tallas.corregidas` si corrigió algo. Después, el paso «Taller por lote» del cuadre compara contra el inventario |
| **Repetible** | Corrige hacia lo que dicen los registros: correrlo dos veces deja lo mismo |

### «Vigilar lotes atorados»

| | |
|---|---|
| **Cuándo** | Cada hora, en los días de `general.dias_de_trabajo` |
| **Hace** | Con la salud de cada lote en proceso (regla 7), guarda `lote.atorado` cuando un lote entra a atorado y no hay otro `lote.atorado` de ese lote después de su último registro o de su última falla. «Sin datos de la tablet» no cuenta como atorado |
| **Avisa** | En vivo a Producción, Dirección y Ventas, y el aviso `lote_atorado` a la dueña |
| **Repetible** | La regla de arriba: un lote atorado avisa una vez hasta que algo cambia |

### El aviso `lote_atorado`

| Lo hace nacer | A quién | Texto | Correo al inicio |
|---|---|---|---|
| El trabajo de arriba | La dueña | «{lote} atorado en {operación} desde hace {n} días de trabajo» | No |

Se suma a los tipos de [avisos](../admin/avisos.md) con la misma forma, y su migración lo agrega al CHECK de `avisos.tipo`.

## Lo que baja a la tablet

| Tabla | Filtro | Columnas |
|---|---|---|
| `lotes` | En proceso y terminados. El que sale de esas etapas baja una última vez, para que la tablet lo quite | `id`, `folio`, `producto_id`, `flujo_id`, `fecha_entrega`, `estado`, y «para quién», armado por el servidor (el cliente, la tienda o «Temporada · bodega») |
| `lote_tallas` | De esos lotes | `lote_id`, `variante_id`, cortadas, terminadas y merma |

Nunca bajan costos ni el pedido.

## Parámetros

Los cambia solo la dueña, en Configuración (ver [configuración](../admin/configuracion.md)).

| Parámetro | Valor inicial | Sección | Baja a | Para qué |
|---|---|---|---|---|
| `produccion.lote_atorado_dias` | 2 días de trabajo (de 1 a 5) | Decisiones de operación | La tablet | Sin avance en estos días, el lote está atorado; sin sincronizar estos días, «Sin datos de la tablet» |
| `produccion.riesgo_atraso_dias` | 4 días | Parámetros | La tablet | Faltan piezas y entrega en estos días o menos: «En riesgo de atraso» |
| `produccion.cortes_proximos_dias` | 7 días | Parámetros | — | El indicador «Corte» de Pendientes de Producción: los lotes que se cortan en estos días (ver [pantallas de Producción](../../interfaz/fabrica/produccion.md)) |
| `avisos.correo_lote_atorado` | No | Parámetros | — | Si el aviso de lote atorado va también por correo |

Usa también `general.dias_de_trabajo`, que también baja a la tablet.

## Permisos

- Los lotes los ven Producción, Ventas (los de sus pedidos), Calidad, Aduana, Bodega, Patronaje y Dirección.
- El costo del lote, solo las cuentas con Compras o Contaduría.

## Eventos

`lote.creado` · `lote.piezas_sumadas` · `lote.cortado` · `lote.terminado` · `lote.reabierto` · `lote.revisado` · `lote.en_aduana` · `lote.paso_a_temporada` · `lote.fecha_cambiada` · `lote.atorado` · `lote_tallas.corregidas`. Cada uno lo guarda la acción que lo dice.

## Lo que llega después

- **Fase 13:** el atorado por máquina, con `mantenimiento.fallas_que_detienen` (ver [máquinas, fallas y servicios](../mantenimiento/maquinas-fallas-y-servicios.md)); Calidad llama `produccion.marcar_lote_revisado`; lo que un pedido tiene en reproceso, con `calidad.en_reproceso_de_pedido`.
- **Fase 14:** Aduana lee el lote con `produccion.lote_para_aduana` y llama `produccion.marcar_lote_en_aduana` al recibirlo; y el paso «Taller por lote» del cuadre revisa los lotes ya recibidos (ver [diferencias, ajustes y mermas](../inventario/diferencias-ajustes-y-mermas.md#el-cuadre)).
- **Fase 16:** Ventas lee `produccion.piezas_en_produccion`; los lotes de pedido, su paso a temporada y el cambio de su fecha de entrega (ver [órdenes de producción](ordenes-de-produccion.md)); y los cambios de pedido que restan piezas o cancelan un lote.
- **Fase 18:** las alertas de Dirección con los lotes atorados, con la lectura `produccion.lotes_atorados`.
- **Con el POS:** un lote de un pedido especial de tienda avanza su etapa en la tienda (`tiendas.mover_etapa_pedido_especial`) al llegar a aduana.

## Cómo está hecho

**Fase 12, parte 2.**

- **Las tablas** `lotes` y `lote_tallas` son de `produccion` (`tablas.ts`, migración `0039`), con sus CHECK (la etapa, el destino, el flujo y la versión de receta llenos desde el corte, el pedido con destino `pedido`, la ubicación con tienda o temporada, las piezas que van a Bodega sin pasar de las cortadas) y `xid_escritura`. Con ellas, las columnas que apuntaban a los lotes (movimientos, traspasos, recepciones y `recetas.verificada_lote_id`) ya son llaves. La migración suma `lote_atorado` al CHECK de `avisos.tipo`.
- **Las internas** `marcar_lote_revisado` y `marcar_lote_en_aduana` (`internas/lotes.ts`) avanzan la etapa con su momento; fuera de orden es un error del programa (decisión 600). Al revisarse, sus tallas se tocan para que bajen como `quitar`.
- **Las lecturas** (`lecturas/lotes.ts`): `piezas_en_produccion` por variante (regla 9, sin reprocesos hasta la fase 13), `lotes_por_cortar` con sus tallas y si su prenda tiene receta, y `lotes_sin_terminar_de_variante`. Con ella, `catalogo.dar_baja_talla` responde `talla_con_lotes` (decisión 599), y un flujo con lotes en proceso o terminados no cambia (`flujo_con_lotes`).
- **La salud** es `saludDeLote` del paquete compartido (`packages/compartido/src/calculos/salud-lote.ts`), con `diasSinAvance`; la prueban `salud-lote.prueba.ts` con los casos de la regla 7 y fast-check (el orden de la regla, y que un día sin subir nunca vuelve atorado un lote). El trabajo «Vigilar lotes atorados» la usa con los registros, en la parte 4 (decisión 597).
- **Lo que baja a la tablet** (`bajada.ts`): los lotes en proceso y terminados con «para quién» (de un pedido dice «Pedido» hasta la fase 16, decisión 598) y sus tallas.
- **Los parámetros** de la salud están en `parametros.ts`; `lote_atorado_dias` y `riesgo_atraso_dias` bajan a la tablet.
- **Pruebas:** `internas/pasar-pedido-a-temporada.prueba.ts` (las etapas y los candados) y `bajada.prueba.ts`.

**Fase 12, parte 4.**

- **«Vigilar lotes atorados»** (`trabajos/vigilar-lotes-atorados.ts`) corre cada hora y no hace nada fuera de `general.dias_de_trabajo`. Arma la salud de cada lote en proceso con `saludDeLote`: el último avance es el día del último registro vigente de la tablet (o el del corte); la última sincronización, la última subida de las tablets del taller; los días sin subir, los días hasta ayer sin ningún registro de la tablet (decisión 614); el cuello de botella, la operación con más piezas esperando. Avisa de nuevo solo si llegó un registro del lote después de su último `lote.atorado` (decisión 613); el aviso no se repite mientras la dueña no lea el anterior, como todos.
- **«Recalcular proyecciones de Producción»** es la interna `produccion.recalcular_proyecciones` (`internas/proyecciones.ts`): un tramo de lotes cortados por llamada, en orden de id, con el siguiente para la próxima. Corrige cada talla hacia sus registros vigentes, con su bitácora y `lote_tallas.corregidas`; sube la versión del lote que corrigió y termina el que con eso queda completo. El cuadre la llama antes de sus pasos, 50 lotes por transacción (decisión 615).
- **Pruebas:** `trabajos/vigilar-lotes-atorados.prueba.ts` (una vez hasta que algo cambia, «Sin datos de la tablet» y los días de trabajo) e `internas/recalcular-proyecciones.prueba.ts` (descuadres al azar con fast-check, y el lote que se termina).

**Fase 13, parte 1.** `piezas_en_produccion` suma los reprocesos de `calidad.en_reproceso_de_pedido` de los lotes que ya llegaron a aduana (regla 9, decisión 621). El lote ya era un agregado con sus tallas: todo lo que cambia una talla sube su versión (regla 12), y la revisión de Calidad recibe `409` (lo prueba `calidad/acciones/revisar-lote.prueba.ts`).
