# Entregas a corte

> **Qué cubre:** la tela y los avíos que Bodega entrega al taller para un lote: los rollos sugeridos y apartados de cada tela de la receta en orden de fecha de corte, entregar al corte, lo que el corte usó y lo que regresa, recibir del corte y devolver la entrega de un lote que se quitó.
> **Estado:** Decidido.
> **Se construye en:** [fase 12](../../fases/12-produccion.md).
> **Se conecta con:** [material en bodega](material-en-bodega.md) · [libro de movimientos](libro-de-movimientos.md) · [recepciones en aduana](recepciones-en-aduana.md) · [existencias y cuadre](existencias-y-cuadre.md) · [corte y bultos](../produccion/corte-y-bultos.md) · [lotes](../produccion/lotes.md) · [órdenes de producción](../produccion/ordenes-de-produccion.md) · [cambios a pedido](../produccion/cambios-a-pedido.md) · [cuenta de material](../patronaje/cuenta-de-material.md) · [proyección de material](../compras/proyeccion-de-material.md) · [eventos y trabajos](../../cimientos/EVENTOS-Y-TRABAJOS.md) · [pantallas de Bodega](../../interfaz/fabrica/bodega.md) · [pantallas de Producción](../../interfaz/fabrica/produccion.md) · [conteos y carga inicial](conteos.md) · [diferencias, ajustes y mermas](diferencias-ajustes-y-mermas.md) · [recepción del taller](recepcion-del-taller.md)

## Para qué sirve

Bodega entrega al corte los rollos completos de cada tela que pide la receta (la principal, la de combinación y el forro) y sus avíos, y nadie cuenta dos veces con el mismo rollo. El cortador usa lo que usa y regresa lo que sobra. Ejemplo de la muestra: el L-2026-122 lleva 214 m de gabardina azul marino. En Bodega están el R-0431 y el R-0432 de la partida P-2224 (92 y 88.5 m) y el R-0433 de la P-2231 (95 m). Ninguna partida alcanza sola, así que el sistema le aparta los tres, empezando por la partida con más metros. Bodega aprieta «Entregar al corte»: los tres rollos y los avíos del lote pasan al Taller, el lote deja de comprometer material en Compras y, al cerrar el corte, lo que sobre del último rollo regresa a Bodega.

## Reglas

1. **Los rollos sugeridos:** para cada tela de la receta de cada lote por cortar que todavía no la recibe, en orden de fecha de corte, con los rollos libres de esa tela en Bodega: primero la primera partida que alcanza sola, del rollo más chico al más grande; si ninguna alcanza, las partidas de más metros a menos. Los metros salen de la cuenta de material de Patronaje (ver [cuenta de material](../patronaje/cuenta-de-material.md)). Un rollo libre es uno disponible en Bodega sin apartado sugerido ni entregado de un lote anterior.
2. **Se apartan como sugeridos,** para que dos cortes no cuenten con el mismo rollo. Se vuelven a calcular al crear un lote o cambiar su fecha de corte o sus piezas, al recibir material en Bodega, al entregar, al recibir del corte, en la carga inicial y cada noche al terminar el cuadre. Nunca tocan lo ya entregado.
3. **Entregar al corte es de un solo lado:** Bodega entrega los rollos completos de las telas de la receta, con todos sus metros en Bodega, y, en la primera entrega del lote, los avíos que pide la receta, que no se capturan: salen de la misma cuenta. El corte lo confirma al cerrarse con esos rollos. Se puede guardar quién recibió.
4. **Solo un lote por cortar con receta recibe tela,** y la versión de receta con que la pantalla calculó tiene que seguir vigente.
5. **Un rollo entregado a un lote no se entrega a otro.** Uno sugerido para otro lote sí se puede tomar: su apartado se libera.
6. **Un avío que no alcanza se entrega igual:** Bodega queda en negativo y nace su diferencia, a cargo de Bodega.
7. **Al cerrar el corte,** de cada tela: sale lo que se usó de cada rollo (los completos y lo usado del último, según la receta o según lo que se escribió que quedó); lo que quedó del último queda por recibir como rollo o como retazo, o sale como merma; los rollos entregados que no se usaron quedan por recibir. Nacen las piezas cortadas del lote en el Taller. Un rollo que el corte usó y Bodega no entregó se entrega en el mismo cierre (ver [corte y bultos](../produccion/corte-y-bultos.md)).
8. **Lo que regresa del corte se queda en el Taller** hasta que Bodega lo recibe; entonces pasa a Bodega y vuelve a estar disponible.
9. **Si se quita un lote con tela entregada** (un cambio de pedido lo deja en cero), su entrega queda devuelta: sus rollos quedan por recibir, sus apartados se liberan y sus avíos regresan a Bodega con un traspaso `regresa` del Taller.
10. **Lo entregado ya no se compromete:** una tela que ya se le entregó a un lote, y sus avíos al entregarse, ya no cuentan como comprometidos para Compras ni como libres para el corte en Bodega. Una tela de la receta que todavía no se le entrega sigue comprometida (ver [proyección de material](../compras/proyeccion-de-material.md)).
11. **Una tela que no hay no detiene las demás:** se entrega lo que hay, con el aviso «Faltan {m} m de {tela} para el corte completo», y esa tela se entrega cuando llegue, en otra entrega del mismo lote, o se agrega en la captura del corte.

## Estados

| Documento | De | A | Qué pasa |
|---|---|---|---|
| Entrega a corte | — | `entregada` | «Entregar al corte» |
| Entrega a corte | `entregada` | `cerrada` | Se cierra el corte del lote |
| Entrega a corte | `entregada` | `devuelta` | Se quitó el lote: todo regresa |
| Apartado de rollo | — | `sugerido` | Los rollos sugeridos |
| Apartado de rollo | `sugerido` | `entregado` | «Entregar al corte» |
| Apartado de rollo | `entregado` | `usado` | El rollo quedó en el corte |
| Apartado de rollo | `sugerido` o `entregado` | `liberado` | No se usó, o la sugerencia cambió |

## La tabla `entregas_corte`

| Columna | Tipo | Nulo | Qué es |
|---|---|---|---|
| `id` | uuid | no | Llave |
| `lote_id` | uuid | no | → `lotes.id`. Un lote puede tener más de una |
| `receta_version_id` | uuid | no | → `receta_versiones.id`: con qué versión se calcularon los avíos |
| `estado` | text | no | CHECK (`entregada`, `cerrada`, `devuelta`) |
| `entregada_en` · `entregada_por` | timestamptz · uuid | no | `entregada_por` → `usuarios.id` |
| `recibio_persona_id` | uuid | sí | → `personas.id`: el cortador, si se guardó |
| `movimiento_id` | uuid | no | → `movimientos.id`, de tipo `entrega_corte` |
| `corte_id` | uuid | sí | → `cortes.id`. Al cerrar |

Lleva las columnas comunes (ver [base de datos](../../cimientos/BASE-DE-DATOS.md#columnas-comunes)). **Índices:** (`lote_id`) · (`estado`). Sus rollos están en `apartados_rollo` y sus cantidades, en los renglones de su movimiento.

## La tabla `apartados_rollo`

| Columna | Tipo | Nulo | Qué es |
|---|---|---|---|
| `id` | uuid | no | Llave |
| `rollo_id` | uuid | no | → `rollos.id` |
| `lote_id` | uuid | no | → `lotes.id` |
| `fecha_corte` | date | no | La del lote: ordena quién tiene prioridad |
| `estado` | text | no | CHECK (`sugerido`, `entregado`, `usado`, `liberado`) |
| `entrega_corte_id` | uuid | sí | → `entregas_corte.id` |
| `corte_id` | uuid | sí | → `cortes.id`. Al cerrar el corte |

Lleva las columnas comunes. **Índices:** único (`rollo_id`) donde está `sugerido` o `entregado` · (`lote_id`, `estado`).

## Acciones

Todas son de la web, con el departamento Bodega.

### `inventario.entregar_al_corte`

| | |
|---|---|
| **Pantalla** | Bodega · cajón Entrega al corte · «Entregar al corte». Se abre con «Entregar tela» en Pendientes o «Entregar» en Materiales |
| **Recibe** | `lote_id` · `receta_version_id`: la que usó la pantalla · `rollo_ids`: al menos uno, de las telas de la receta · `recibio_persona_id`, opcional |
| **Reglas y errores** | `400 sin_rollos`: «Marca al menos un rollo»<br>`422 lote_no_por_cortar`: «{lote} ya se cortó»<br>`422 sin_receta`: «{prenda} no tiene receta: no se corta hasta que Patronaje la capture»<br>`422 receta_cambio`: «La receta de {prenda} cambió: vuelve a abrir la entrega»<br>`422 rollo_no_disponible`: «{rollo} ya está entregado a {lote}» (de una tela que la receta no lleva, fuera de Bodega o entregado a otro lote)<br>Avisos que no detienen: «Se mezclan las partidas {P} y {P}: el tono puede variar entre piezas.» · «Faltan {m} m de {tela} para el corte completo.» |
| **Escribe** | La entrega, `entregada`, con la versión de receta y su movimiento. El movimiento `entrega_corte`, de Bodega al Taller: un renglón por rollo con todos sus metros en Bodega y, si es la primera entrega del lote, uno por avío. Los apartados: los rollos entregados, `entregado` (nace el apartado si no lo tenían); los sugeridos del lote que no se entregaron y el sugerido de otro lote que se tomó, `liberado`. Los rollos, `entregado`. Vuelve a calcular los rollos sugeridos de los demás lotes |
| **Llama** | `produccion.lotes_por_cortar` · `patronaje.calcular_material` (los avíos del lote) |
| **Regresa** | «{lote}: {n} rollos pasan al taller» y, si un avío no alcanzó, «. No cuadró {cantidad} de {avío}: queda en diferencias» |
| **Eventos** | `entrega_corte.entregada` |
| **Bitácora** | «Entregó al corte {lote}», con los rollos, sus metros y los avíos |

### `inventario.recibir_del_corte`

| | |
|---|---|
| **Pantalla** | Bodega · Materiales · «Regresa del corte» · «Recibir»; también en Pendientes («Retazo» o «Rollo del corte») |
| **Recibe** | `rollo_id` (en un retazo, su rollo) · `version` del rollo |
| **Reglas y errores** | `422 no_por_recibir`: «{folio} ya está en bodega» (tiene que estar por recibir y en el Taller) |
| **Escribe** | La recepción `bodega_regreso_corte`, completa, con el rollo y sus metros. El movimiento `regreso_retazo` (si es retazo) o `regreso_rollo`, del Taller a Bodega, por los metros que tiene en el Taller. El rollo, `disponible`; el retazo, `recibido`, con su recepción. Vuelve a calcular los rollos sugeridos |
| **Regresa** | «{folio} recibido en bodega: {metros} m de {tela}» |
| **Eventos** | `rollo.regreso` |
| **Bitácora** | «Recibió {folio} del corte», con sus metros |

## Acciones internas

### `inventario.registrar_corte`

| | |
|---|---|
| **La llama** | `produccion.cerrar_corte` (ver [corte y bultos](../produccion/corte-y-bultos.md)) |
| **Recibe** | `corte_id` · `lote_id` · `folio_lote` · `prenda` (su nombre, para el aviso) · `receta_version_id` · `telas`: por tela, su `material_id`, sus `rollos` (`rollo_id`, `orden`, `metros_usados` y `es_ultimo`), `metros_quedaron` y `destino_sobrante` (`ninguno`, `rollo`, `retazo` o `merma`) · `tallas`: `variante_id` y piezas cortadas |
| **Reglas** | `422 rollo_de_otro_lote`: «{rollo} está entregado a {lote}»<br>`422 rollo_no_disponible`: un rollo que no está en el Taller ni disponible en Bodega<br>`422 destino_no_cuadra`: `rollo` solo con la frontera o más; `retazo` o `merma`, con menos y más de 0 |
| **Escribe** | La entrega en el mismo cierre de un rollo que Bodega no entregó (regla 7), liberando los sugeridos del lote. Por cada tela: el movimiento `consumo_corte` por lo usado de cada rollo; los rollos completos, `agotado`. El último: `rollo`, se queda en el Taller por recibir; `retazo`, nace el retazo RZ- por recibir y el rollo queda marcado como retazo y por recibir; `merma`, el movimiento `merma_corte` y `agotado`; `ninguno`, `agotado`. Los rollos entregados que no se usaron, por recibir, con su apartado liberado; los de los usados, `usado`. Las entregas del lote, `cerradas`. El movimiento `piezas_cortadas`, de Fuera al Taller, por talla y con el lote. Si la receta no es la de la entrega, el aviso «La receta de {prenda} cambió desde que bodega entregó la tela» |
| **Llama** | `admin.tomar_folio`, tipo `retazo`, por cada retazo que nace |
| **Regresa** | Los retazos y sus folios |
| **Eventos** | `corte.registrado` · `rollo.por_recibir`, para Pendientes de Bodega |

### `inventario.devolver_entrega_corte`

| | |
|---|---|
| **La llama** | Producción, al aplicar un cambio de pedido que deja en cero un lote con tela entregada (ver [cambios a pedido](../produccion/cambios-a-pedido.md)) |
| **Recibe** | `lote_id` |
| **Escribe** | La entrega, `devuelta`. Sus rollos, por recibir, y sus apartados, liberados. Un traspaso `regresa`, del Taller a Bodega, con los avíos entregados |
| **Eventos** | `rollo.por_recibir` |

### `inventario.recalcular_rollos_sugeridos`

| | |
|---|---|
| **La llaman** | Producción, al crear un lote o cambiar su fecha de corte o sus piezas; este módulo, después de recibir material en Bodega, entregar, recibir del corte y la carga inicial; y su trabajo de la noche |
| **Recibe** | `material_id`, opcional: sin él, todas las telas |
| **Escribe** | Los apartados `sugerido` con la regla 1: crea los nuevos y libera los que ya no tocan. No toca los entregados |

## Lecturas

### `inventario.lotes_con_tela_entregada(lotes)`

| | |
|---|---|
| **La usan** | Compras (el comprometido) y Producción (si un pedido suma piezas a un lote que todavía no tiene tela) |
| **Regresa** | Cuáles de esos lotes tienen una entrega `entregada` o `cerrada` y, de cada uno, qué telas ya recibió y si ya recibió sus avíos |

## Trabajos

### «Rollos sugeridos»

| | |
|---|---|
| **Cuándo** | Al terminar el cuadre nocturno: lo encola el evento `cuadre.terminado` (ver [existencias y cuadre](existencias-y-cuadre.md)) |
| **Hace** | Llama `inventario.recalcular_rollos_sugeridos` para todas las telas, una tela por transacción |
| **Repetible** | Sí: calcula lo mismo con los mismos rollos y lotes |

## Parámetros

Los cambia solo la dueña, en Configuración (ver [configuración](../admin/configuracion.md)). Todos van en «Parámetros».

| Parámetro | Valor inicial | Para qué |
|---|---|---|
| `inventario.dias_entrega_corte` | 3 días | Un corte sale en Pendientes de Bodega y de Producción estos días antes de su fecha |

## Permisos

- Entregar y recibir del corte: Bodega.
- Nada de esto regresa costos: el costo del metro de cada rollo solo viaja a Compras y Contaduría.

## Eventos

`entrega_corte.entregada` · `corte.registrado` · `rollo.por_recibir` · `rollo.regreso`.

## Lo que llega después

- **Fase 14:** la diferencia del avío que no alcanzó; la carga inicial, que también vuelve a calcular los rollos sugeridos.
- **Fase 16:** los cambios de pedido que devuelven una entrega.

## Cómo está hecho

**Fase 12, parte 3.**

- **Las tablas** `entregas_corte`, `apartados_rollo` y `retazos` son de `inventario` (`tablas.ts`, migración `0040`), con sus CHECK y el único del apartado vivo por rollo.
- **Los rollos sugeridos:** la regla es la función pura `sugerirRollos` (`dominio/rollos-sugeridos.ts`); la primera partida que alcanza sola es la de menor folio (decisión 603). `inventario.recalcular_rollos_sugeridos` (`internas/rollos-sugeridos.ts`) la corre con un candado por nombre, con lo que pide cada tela de cada lote por cortar (`patronaje.calcular_material`) que todavía no la recibe, y crea o libera los sugeridos. La llaman Producción al nacer o crecer un lote, la recepción de tela en Bodega, entregar y recibir del corte, y el trabajo «Rollos sugeridos» tras `cuadre.terminado` (`trabajos/rollos-sugeridos.ts`).
- **`entregar_al_corte`** (`acciones/entregas-corte.ts`, contratos en `packages/compartido/src/contratos/inventario/corte.ts`): bloquea primero el lote (`loteConReceta`, `FOR UPDATE`), así que dos entregas del mismo lote, o una entrega y el cierre de su corte, van una tras otra y los avíos salen una sola vez; después bloquea los rollos en orden de id (`rollosEnUso` de `dominio/corte.ts`), revisa el lote por cortar y su receta vigente, y escribe la entrega, el movimiento, los apartados y los rollos. Un rollo que no está entregado a otro lote pero no está disponible dice «{rollo} no está disponible para {lote}» (decisión 604). Los avisos de mezcla y de tela que falta no se repiten para una tela que el lote ya recibió en otra entrega (decisión 608).
- **`recibir_del_corte`** toma la versión del rollo, escribe la recepción `bodega_regreso_corte` con el lote de su último apartado y el movimiento `regreso_rollo` o `regreso_retazo`.
- **`registrar_corte`** (`internas/registrar-corte.ts`): revisa que lo que quedó vaya a donde le toca con la frontera (`destino_no_cuadra`); toma primero las variantes de las piezas cortadas con `tomarCandadosDeInventario`, en el orden fijo de los candados (decisión 500); entrega en el mismo cierre lo que Bodega no entregó, liberando los sugeridos del lote, y escribe el consumo, la merma, el retazo con su folio RZ- y las piezas cortadas, cada movimiento con su número; los rollos que no se usaron quedan por recibir. **`rollos_para_corte`** (`lecturas/rollos-para-corte.ts`) bloquea los rollos para que el cierre cuente con lo mismo que después mueve (decisión 606).
- **`lotes_con_tela_entregada`** y **`devolver_entrega_corte`** (`internas/entregas-corte.ts`); los avíos de una entrega devuelta regresan con la fase 16 (decisión 601).
- **El parámetro** `inventario.dias_entrega_corte`.
- **Pruebas:** `acciones/entregar-al-corte.prueba.ts` (también lo sugerido que se libera, la segunda entrega sin avíos, dos entregas a la vez y sin receta), `internas/recalcular-rollos-sugeridos.prueba.ts` (con fast-check) e `internas/devolver-entrega-corte.prueba.ts` (también recibir del corte, el comprometido y el desperdicio medido).

**Fase 14, parte 1.** El avío que no alcanzó abre su DF- `material_corte` en Bodega, a cargo de Bodega, por lo que faltaba, con su lote, su entrega y su movimiento. Lo prueba `acciones/entregar-al-corte.prueba.ts`.

**Fase 14, cierre.** Lo que faltó de un avío se calcula con la existencia que dejó el movimiento de la entrega, ya bloqueada: dos entregas a la vez del mismo avío abren la DF- de lo que de verdad faltó (decisión 659). Lo prueba `acciones/entregar-al-corte.prueba.ts`.
