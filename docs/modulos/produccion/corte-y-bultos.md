# Corte y bultos

> **Qué cubre:** el corte de un lote, que se captura ya cerrado en la web y sin medir tela: sin receta no se corta; los rollos de cada tela, lo que se usó según la receta, lo que quedó y a dónde va; las piezas por talla; quién cortó y sus registros; los bultos B- que arma el servidor y sus etiquetas.
> **Estado:** Decidido.
> **Se construye en:** [fase 12](../../fases/12-produccion.md).
> **Se conecta con:** [lotes](lotes.md) · [registros de operación](registros-de-operacion.md) · [operaciones y flujos](operaciones-y-flujos.md) · [entregas a corte](../inventario/entregas-a-corte.md) · [material en bodega](../inventario/material-en-bodega.md) · [recetas](../patronaje/recetas.md) · [cuenta de material](../patronaje/cuenta-de-material.md) · [tarifas](../personal/tarifas.md) · [paquete compartido](../../cimientos/PAQUETE-COMPARTIDO.md) · [impresión](../admin/impresion.md) · [etiquetas](../../impresos/etiquetas.md) · [pantallas de Producción](../../interfaz/fabrica/produccion.md) · [órdenes de producción](ordenes-de-produccion.md) · [reclamos y devoluciones](../calidad/reclamos-y-devoluciones.md) · [recepción del taller](../inventario/recepcion-del-taller.md) · [pantallas de Patronaje](../../interfaz/fabrica/patronaje.md) · [la tablet del taller](../../apps/tablet.md) · [hojas](../../impresos/hojas.md) · [pantallas de la tablet](../../interfaz/tablet.md)

## Para qué sirve

El cortador va por los rollos, corta, usa lo que usa y regresa lo que sobra; la oficina captura el corte ya hecho, de una vez, y nadie mide tela: lo que se usó sale de la receta. Ejemplo: el L-2026-122 lleva 190 pantalones; según la receta, 214 m de gabardina azul marino. La captura trae puestos los rollos que Bodega entregó y lo que queda del último según la receta; se confirman las piezas de cada talla y quién cortó, y lo que quedó solo se cambia si fue distinto (la receta decía 10 m y ya no quedó nada). Al cerrar, la tela usada sale del inventario, lo que quedó regresa a Bodega, nacen las piezas del lote en el Taller, el servidor arma los bultos (B-2026-122-01, B-2026-122-02…) y el lote queda en proceso, listo para la tablet.

## Reglas

1. **Sin receta no se corta.** El lote de una prenda sin receta no tiene captura, y Bodega no entrega su tela.
2. **El corte se captura cerrado,** en la web y con internet. Hay uno por lote; nace cerrado y no se modifica ni se cancela: un error de piezas se corrige con la merma de las operaciones, y uno de tela, con un ajuste de inventario.
3. **Los rollos, por tela.** Cada tela de la receta (la principal, la de combinación y el forro) lleva sus rollos: los que Bodega entregó o, si no entregó, los sugeridos, en el orden en que se usan, todos completos menos el último. Cada tela lleva al menos un rollo. Un rollo que se agrega en la captura y Bodega no entregó se entrega en el mismo cierre.
4. **Los rollos automáticos:** mientras no se cambie, quite ni agregue un rollo de una tela, la pantalla los ajusta al cambiar las piezas, en orden, hasta cubrir lo que pide la receta.
5. **Nadie mide tela.** De cada tela se usa lo que pide la receta para las piezas cortadas, con sus decimales (la principal con el desperdicio de la prenda; la combinación y el forro sin él), y lo que quedó del último rollo viene calculado. Solo se cambia si de verdad quedó otra cosa (el rollo traía más o menos, o algo salió mal): desde 0 y menos que los metros del rollo (un rollo que no se usó se quita de la lista). Lo escrito ya no se mueve al cambiar las piezas; cambiar el último rollo regresa a lo calculado. Quedar abajo del **piso del patrón** (la tela que pide la receta para esas piezas, sin desperdicio), «Faltan {m} m de {tela}» y la mezcla de partidas solo avisan.
6. **A dónde va lo que quedó:** con `inventario.metros_frontera_rollo` (15 m) o más, el rollo regresa a Bodega con esos metros; con menos, regresa como retazo RZ- («Sirve», como viene), o es merma si se marca «Ya no sirve»; con 0, nada (ver [material en bodega](../inventario/material-en-bodega.md)).
7. **Las piezas por talla** son enteras, no pasan de las planeadas, y en total hay al menos una.
8. **Quién cortó** se guarda siempre: una persona activa del Taller. Al cerrar nace un registro por bulto en la operación de corte del flujo, a su nombre, con la tarifa vigente de esa operación o vacía: cuenta para la nómina por pieza igual que un registro de la tablet (ver [registros de operación](registros-de-operacion.md)). Esos registros no se cancelan.
9. **La receta:** la versión que mostró la captura tiene que seguir vigente al cerrar; el lote la congela, junto con el flujo del producto. Si la receta estaba sin verificar, este corte la verifica. Si Bodega entregó la tela con otra versión, se avisa.
10. **Los bultos los arma el servidor:** por talla con piezas, el mínimo de bultos de hasta `produccion.bulto_max_piezas` (24), lo más parejos posible; numerados desde 1 en el orden de las tallas. Su folio es B-{año del lote}-{número del lote}-{n, con 2 cifras}: B-2026-121-03 es el bulto 3 del L-2026-121. Se busca sin importar mayúsculas.
11. **El rendimiento,** de la tela principal: metros por pieza = usados ÷ cortadas, contra el patrón por pieza; arriba de `produccion.rendimiento_rojo_porcentaje` (10 %) sale en rojo y avisa al cerrar.
12. **Una sola cuenta:** lo que pide la receta, el piso del patrón, «La tela alcanza», los rollos automáticos y lo que queda según la receta son funciones del [paquete compartido](../../cimientos/PAQUETE-COMPARTIDO.md) con la cuenta de [cuenta de material](../patronaje/cuenta-de-material.md): la pantalla las corre mientras se escribe y la API las repite al cerrar.
13. **Todas las telas van igual:** la de combinación y el forro se entregan por rollo completo, se cierran con lo que pide la receta y lo que sobra regresa a Bodega, como la principal. El desperdicio y el rendimiento son solo de la principal.

## La tabla `cortes`

| Columna | Tipo | Nulo | Qué es |
|---|---|---|---|
| `id` | uuid | no | Llave (v7) |
| `lote_id` | uuid | no | → `lotes.id`. Único: un lote se corta una vez |
| `fecha` | date | no | El día del corte |
| `cerrado_en` | timestamptz | no | «Cerrar corte» |
| `corto_persona_id` | uuid | no | → `personas.id`: quién cortó |
| `verifico_receta` | boolean | no | Verdadero si con este corte la receta quedó verificada |

Lleva las columnas comunes; `creado_por` es la cuenta que lo cerró y nunca va vacía (ver [base de datos](../../cimientos/BASE-DE-DATOS.md#columnas-comunes)). **Índices:** único (`lote_id`) · (`fecha`). Nunca cambia. Sus telas van en `corte_telas`. Los metros usados, por pieza, el piso del patrón y el rendimiento se calculan.

## La tabla `corte_telas`

Una por cada tela de la receta que llevó el corte.

| Columna | Tipo | Nulo | Qué es |
|---|---|---|---|
| `id` | uuid | no | Llave |
| `corte_id` | uuid | no | → `cortes.id` |
| `material_id` | uuid | no | → `materiales.id`: la tela, la de todos sus rollos |
| `papel` | text | no | CHECK (`tela_principal`, `combinacion`, `forro`), como en la receta |
| `metros_receta` | numeric(12,3) | no | Lo que pide la receta para las piezas cortadas, con sus decimales: lo que se usa si nadie cambia lo que quedó. CHECK > 0 |
| `metros_quedaron` | numeric(12,3) | no | Lo que quedó del último rollo. CHECK ≥ 0 |
| `quedaron_cambiado` | boolean | no | Verdadero si se escribió otra cosa que lo calculado |
| `destino_sobrante` | text | no | CHECK (`ninguno`, `rollo`, `retazo`, `merma`) |
| `retazo_id` | uuid | sí | → `retazos.id`. CHECK: lleno con `retazo` |

Lleva las columnas comunes. **Índices:** único (`corte_id`, `material_id`) · único (`corte_id`) donde `papel` = `tela_principal`. Nunca cambia.

## La tabla `corte_rollos`

| Columna | Tipo | Nulo | Qué es |
|---|---|---|---|
| `id` | uuid | no | Llave |
| `corte_tela_id` | uuid | no | → `corte_telas.id`: la tela del corte a la que pertenece |
| `rollo_id` | uuid | no | → `rollos.id` |
| `orden` | smallint | no | 1, 2, 3… en el orden en que se usaron, dentro de su tela |
| `es_ultimo` | boolean | no | El último de su tela, el que dejó lo que quedó. Uno por tela (índice único parcial) |
| `apartado_rollo_id` | uuid | sí | → `apartados_rollo.id`: con qué apartado llegó al corte |
| `metros_al_cortar` | numeric(12,3) | no | Lo que tenía el rollo en el Taller al cerrar. CHECK > 0 |
| `metros_usados` | numeric(12,3) | no | Completo: todo; el último: lo que tenía − lo que quedó. CHECK > 0 y ≤ `metros_al_cortar` |

Lleva las columnas comunes. **Índices:** único (`rollo_id`, `corte_tela_id`) · único (`corte_tela_id`, `orden`) · (`rollo_id`). De aquí sale la partida de tela de un lote para un reclamo.

## La tabla `bultos`

| Columna | Tipo | Nulo | Qué es |
|---|---|---|---|
| `id` | uuid | no | Llave (v7) |
| `folio` | text | no | B-2026-121-03. Único sin importar mayúsculas |
| `lote_id` | uuid | no | → `lotes.id` |
| `variante_id` | uuid | no | → `variantes.id`: la talla del bulto, que tiene que estar en las tallas del lote |
| `numero` | smallint | no | Desde 1 dentro del lote. Único con `lote_id` |
| `piezas` | integer | no | Las cortadas que lleva. CHECK > 0 |

Lleva las columnas comunes y, como baja a la tablet, `xid_escritura`. **Índices:** único (`upper(folio)`) · único (`lote_id`, `numero`) · (`lote_id`, `variante_id`). No tiene estado: lo que pasó cada operación sale de los registros.

## Acciones

Todas son de la web, con el departamento Producción.

### `produccion.cerrar_corte`

| | |
|---|---|
| **Pantalla** | Producción · Corte · «Cerrar corte» |
| **Recibe** | `lote_id` · `version` del lote · `receta_version_id`: la que mostró la captura · `telas`: una por cada tela de la receta, con su `material_id`; sus `rollos`, al menos uno, en el orden en que se usaron, con su `rollo_id` (el último es el que dejó lo que quedó); `metros_quedaron` (≥ 0, 3 decimales), solo si se cambió lo calculado; y `ya_no_sirve`, si lo que quedó, con más de 0 y menos que la frontera, es merma · `tallas`: una por talla del lote, con `variante_id` y `piezas` (entero ≥ 0, hasta 4 cifras) · `corto_persona_id` |
| **Reglas y errores** | `400`: «Escoge el rollo» · «Número entero» · «Escribe los metros con números, por ejemplo 12.5»<br>`400 rollo_repetido`: «Ese rollo ya está en la lista.» · `400 tela_repetida`: «Esa tela ya está en la lista.» · `400 talla_repetida`: «Esa talla ya está en la lista.»<br>`422 lote_no_por_cortar`: «{lote} ya está cortado.»<br>`422 sin_receta`: «Sin receta no se puede cortar: el sistema no sabe cuánta tela lleva cada talla.»<br>`422 receta_cambio`: «La receta de {prenda} cambió mientras capturabas: revisa la tela y vuelve a cerrar.»<br>`422 falta_tela`: «La receta lleva {tela}: agrega sus rollos.»<br>`422 tela_fuera_de_receta`: «{tela} no está en la receta de {prenda}.»<br>`422 rollo_otra_tela`: «{rollo} no es de {tela}.»<br>`422 rollo_no_disponible`: «{rollo} ya no está disponible para este corte.» (sin metros, entregado a otro lote, agotado o devuelto)<br>`422 piezas_mas_que_planeado`: «Máximo {planeado}»<br>`422 sin_piezas`: «Escribe cuántas piezas salieron»<br>`422 quedo_mas_que_rollo`: «Del rollo {rollo} no pueden quedar más de {m} m»<br>`422 rollo_sin_usar`: «Del rollo {rollo} no se usó nada: quítalo de la lista»<br>`422 cortador_no_valido`: «¿Quién cortó?»<br>Avisos que no detienen: «Faltan {m} m de {tela} · {piezas} piezas llevan {m} m según la receta · los {n} rollos tienen {m} m» · «Con {m} m de {tela} no salen {piezas} piezas según el patrón, que pide {m} m: revisa lo que quedó.» · «Se mezclan las partidas {P} y {P}: el tono puede variar entre piezas.» · «+{n}% sobre el patrón» · «La receta de {prenda} cambió desde que bodega entregó la tela» (lo dice `inventario.registrar_corte`) |
| **Escribe** | El corte, con la fecha y quién cortó; por cada tela, lo que pide la receta, lo que quedó y si se cambió, su destino y su retazo, y sus rollos en orden, con lo que tenía cada uno y lo que se usó; las cortadas de cada talla. El lote: `en_proceso`, con su flujo, su versión de receta, `cortado_en` y la fecha de corte de hoy. Los bultos (regla 10). Un registro por bulto en la operación de corte, con origen `corte`, la persona que cortó, buenas = las piezas del bulto, la tarifa vigente y su clave derivada (uuid v5 de la clave de la acción, «corte» y el número de bulto). En el inventario, con `inventario.registrar_corte`: por cada tela, el consumo de cada rollo, la merma o el retazo y lo que regresa; las piezas cortadas de cada talla en el Taller y los rollos entregados que no se usaron |
| **Llama** | `patronaje.calcular_material` (lo que pide la receta y el piso del patrón) · `inventario.registrar_corte` · `patronaje.verificar_receta`, si la receta estaba sin verificar · `personal.tarifa_vigente`, para los registros del corte |
| **Regresa** | El lote, el corte, los bultos (folio, talla y piezas), los metros usados de cada tela, los metros por pieza de la principal y los retazos. «{lote} cortado: {n} piezas a {m} m por pieza», o «{lote} cortado. La receta de {prenda} queda verificada» |
| **Eventos** | `lote.cortado` (con sus piezas y sus bultos) · `corte.cerrado`. Bajan a la tablet el lote, sus bultos y sus registros |
| **Bitácora** | «Cerró el corte de {lote}: {n} piezas, {m} m, cortó {persona}», con el estado y las planeadas en `antes`, y las piezas por talla, cada tela con sus rollos y sus metros, lo que quedó y si se cambió, la receta, el flujo y los bultos en `despues` |

### `produccion.imprimir_etiquetas_bulto`

| | |
|---|---|
| **Pantalla** | Producción · cajón del lote · «Imprimir etiquetas de bulto» |
| **Recibe** | `lote_id` · `bulto_ids`, opcional (vacío: todos los del lote) |
| **Reglas y errores** | `400`: «Ese bulto no es de {lote}.»<br>`422 lote_sin_cortar`: «{lote} no tiene bultos: primero se cierra el corte.»<br>`422 sin_impresora_taller`: «No hay impresora del taller: descarga el PDF de las etiquetas.» |
| **Escribe** | Un trabajo de impresión para la impresora del Taller, con la etiqueta `bulto` de cada bulto |
| **Llama** | `admin.mandar_a_imprimir` |
| **Regresa** | Cuántas, la primera y la última. «{n} etiquetas de bulto a la impresora del taller: {primero} a {último}» |
| **Bitácora** | «Imprimió {n} etiquetas de bulto de {lote}: {primero} a {último}», con los folios |

## Lecturas

### `produccion.cortes_de_prenda`

| | |
|---|---|
| **La usa** | Patronaje, para el desperdicio medido de una prenda ([cuenta de material](../patronaje/cuenta-de-material.md), regla 5) |
| **Recibe** | `producto_id`, opcional: sin él, todas las prendas |
| **Regresa** | Los cortes cerrados, en orden: el lote, la prenda, la versión de receta con que se cortó, las piezas cortadas por talla y los metros que salieron de los rollos de su tela principal |

## Lo que baja a la tablet

| Tabla | Filtro | Columnas |
|---|---|---|
| `bultos` | De los lotes en proceso y terminados | `id`, `folio`, `lote_id`, `variante_id`, `numero`, `piezas` |

## Parámetros

Los cambia solo la dueña, en Configuración (ver [configuración](../admin/configuracion.md)). Todos van en «Parámetros».

| Parámetro | Valor inicial | Para qué |
|---|---|---|
| `produccion.bulto_max_piezas` | 24 piezas | Lo más que lleva un bulto |
| `produccion.rendimiento_rojo_porcentaje` | 10 % | Arriba de esto contra el patrón, el rendimiento sale en rojo |
| `produccion.tela_por_entregar_rojo_dias` | 1 día | «Tela por entregar» en rojo a estos días o menos del corte (en ámbar desde `inventario.dias_entrega_corte`) |

Usa también `inventario.metros_frontera_rollo` ([material en bodega](../inventario/material-en-bodega.md#parámetros)) y el desperdicio de la prenda ([cuenta de material](../patronaje/cuenta-de-material.md#parámetros)).

## Permisos

- Cerrar el corte e imprimir etiquetas de bulto: Producción.
- El precio por metro de cada rollo y el costo del lote solo viajan a las cuentas con Compras o Contaduría.
- «Capturar receta» y «Ver receta» desde el corte piden Patronaje.

## Eventos

`lote.cortado` · `corte.cerrado`.

## Lo que llega después

- **Fase 20:** la etiqueta `bulto` y la hoja del lote; hasta entonces se prueban con el tipo de prueba de la fase 4.
- **Con el POS:** el corte de un lote de un pedido especial de tienda mueve su etapa a «en taller» (`tiendas.mover_etapa_pedido_especial`).

## Cómo está hecho

**Fase 12, parte 3.**

- **Las tablas** `cortes`, `corte_telas`, `corte_rollos` y `bultos` son de `produccion` (`tablas.ts`, migración `0040`); las tres del corte solo crecen. Los bultos llevan `xid_escritura` y bajan a la tablet con su lote (`bajada.ts`).
- **Las cuentas** son del paquete compartido: `laTelaAlcanza`, `rollosAutomaticos` y `usoDeLaTela` (`packages/compartido/src/calculos/corte.ts`), con lo que pide la receta y el piso del patrón, con sus decimales, que da `patronaje.calcular_material` (`pideLaReceta`, decisión 605). Las prueba `corte.prueba.ts` con fast-check.
- **`produccion.cerrar_corte`** (`acciones/corte.ts`, contrato en `packages/compartido/src/contratos/produccion/corte.ts`): toma la versión del lote, revisa quién cortó, las piezas, la receta y las telas; bloquea los rollos con `inventario.rollos_para_corte`; decide a dónde va lo que quedó con `inventario.metros_frontera_rollo`; verifica la receta si estaba sin verificar; escribe el corte; llama `inventario.registrar_corte`; congela el flujo y la receta del lote, y arma los bultos (`dominio/bultos.ts`). Al cerrar nace el registro de cada bulto en la operación de corte (`registrosDelCorte` de `dominio/registros.ts`, decisión 602). Lee el flujo que congela con `FOR SHARE`, y rechaza una tela o una talla repetidas.
- **`imprimir_etiquetas_bulto`** manda la etiqueta `bulto` (la de prueba hasta la fase 20) a la impresora del Taller; sin ella, `sin_impresora_taller` (decisión 609). Sin `bulto_ids`, o con la lista vacía, van todos los del lote.
- **La lectura `produccion.cortes_de_prenda`** (`lecturas/lotes.ts`) regresa los cortes cerrados de una prenda (o de todas): el lote, la versión de receta con que se cortó, sus piezas cortadas por talla y los metros que salieron de los rollos de su tela principal (decisión 618). La usa Patronaje para el desperdicio medido (ver [cuenta de material](../patronaje/cuenta-de-material.md)).
- **Los parámetros** `produccion.bulto_max_piezas`, `produccion.rendimiento_rojo_porcentaje` y `produccion.tela_por_entregar_rojo_dias`.
- **Pruebas:** `acciones/cerrar-corte.prueba.ts` (con lo que pide la receta, retazo, merma, lo que no deja cerrar, las repetidas, la tela de la receta que falta, los avisos que no detienen, los sugeridos que se liberan, las etiquetas).
