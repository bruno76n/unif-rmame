# Recetas

> **Qué cubre:** la receta de cada prenda: sus medidas en centímetros, la tela en metros por talla y los avíos en su unidad; guardarla como versión, copiarla del producto base, verificarla en el corte, y saber si cubre unas tallas.
> **Estado:** Decidido.
> **Se construye en:** [fase 10](../../fases/10-patronaje-y-compras.md).
> **Se conecta con:** [cuenta de material](cuenta-de-material.md) · [desarrollos](desarrollos.md) · [productos](../catalogo/productos.md) · [tallas y tipos de prenda](../catalogo/tallas-y-tipos-de-prenda.md) · [materiales](../compras/materiales.md) · [corte y bultos](../produccion/corte-y-bultos.md) · [mandar a producción](../ventas/mandar-a-produccion.md) · [pantallas de Patronaje](../../interfaz/fabrica/patronaje.md)

## Para qué sirve

La receta dice qué lleva cada prenda, talla por talla. Con ella Compras proyecta cuánta tela comprar, Bodega entrega lo justo al corte y el cortador sabe cuánta tela debería usar. Sin receta no se corta.

Ejemplo: Patronaje captura la receta del pantalón escolar azul marino: medidas en centímetros (cintura, cadera, largo exterior, tiro), gabardina azul marino en metros por prenda en cada talla, y los avíos (un cierre de 14 cm, un botón, una etiqueta de talla y el hilo, que se captura en metros y se guarda en conos de 5,000 m). La guarda como versión 1: «Receta guardada como versión 1. Compras ya puede proyectar su tela». Queda «Sin verificar» hasta que Producción cierra el primer corte de un lote de esa prenda.

## Reglas

1. **Una receta por producto** de una sección que lleva receta. Nace con el producto, en «Sin receta».
2. **Guardar es una versión nueva.** Una versión guardada no cambia: un cambio es otra versión, con su motivo. Los lotes ya cortados conservan la versión con la que se cortaron (la congelan al cerrar el corte).
3. **Las medidas van en centímetros,** talla por talla, entre `patronaje.medida_cm_min` (5) y `patronaje.medida_cm_max` (250). Cada medida tiene al menos 3 letras y no se repite en la versión. Mientras la prenda no tiene medidas propias, se muestran las de su tipo de prenda (ver [tallas y tipos de prenda](../catalogo/tallas-y-tipos-de-prenda.md)).
4. **La tela va en metros por prenda, talla por talla.** Hay una sola tela principal, la única que lleva desperdicio; la combinación y el forro no lo llevan. Más de `patronaje.tela_max_m_por_prenda` (5 m) en una talla es un error de captura.
5. **Un avío va igual en todas las tallas o por talla,** en una unidad que su material acepte: la de inventario si es `m` o `pza`; `cm` si el material va en `m`; o la unidad de receta del material, con su factor (el hilo en metros que se guarda en conos).
6. **La conversión se congela en la versión:** `receta_por_unidad_inventario` es 1 si es la misma unidad, 100 si la receta va en cm y el material en m, o el `factor_receta` del material. Si después Compras cambia el material, la versión guardada no cambia.
7. **Las tallas normales son obligatorias; las de pedido especial, opcionales.** Antes de mandar a producción una talla de pedido especial, se pregunta si la receta la cubre.
8. **La verificación:** «Sin receta» → «Sin verificar» (versión 1, o la copia del base) → «Verificada contra corte» (al cerrar el primer corte). Una versión nueva quita la verificación solo si cambia la tela o los avíos (material, papel, modo, unidad o cantidades); si solo cambian medidas, sigue verificada.
9. **A partir de otro producto,** la receta nace como copia de la versión vigente del base, solo con las tallas del producto nuevo, y las medidas del alta reemplazan a las copiadas. Queda sin verificar hasta su primer corte.
10. **Sin receta no se corta,** y un lote sin receta no compromete material (ver [cuenta de material](cuenta-de-material.md)).
11. **La receta es un agregado:** guardar cualquier parte sube la versión de `recetas`, que es la que manda la pantalla (ver [idempotencia y concurrencia](../../cimientos/IDEMPOTENCIA-Y-CONCURRENCIA.md)).

## Estados

| De | A | Acción | Quién |
|---|---|---|---|
| — | `sin_receta` | Nace con el producto | Catálogo, con `patronaje.iniciar_receta` |
| `sin_receta` | `sin_verificar` | «Guardar receta» (versión 1), o el alta a partir de otro producto con receta | Patronaje; Catálogo en el alta |
| `sin_verificar` | `verificada` | «Cerrar corte» de un lote de la prenda | Producción, con `patronaje.verificar_receta` |
| `verificada` | `sin_verificar` | «Guardar como versión {v+1}» que cambia la tela o los avíos | Patronaje |

**«Sin receta · corte próximo»:** una prenda sin receta con un lote por cortar en `patronaje.corte_proximo_dias` (14) o menos sale primero en los pendientes de Patronaje; en rojo, en el menú y en «Próximo corte», con `patronaje.corte_urgente_dias` (7) o menos.

## La tabla `recetas`

| Columna | Tipo | Nulo | Qué es |
|---|---|---|---|
| `id` | uuid | no | Llave |
| `producto_id` | uuid | no | → `productos.id`. Único |
| `estado` | text | no | CHECK (`sin_receta`, `sin_verificar`, `verificada`) |
| `version_vigente_id` | uuid | sí | La versión vigente, con la llave compuesta (`version_vigente_id`, `id`) → `receta_versiones` (`id`, `receta_id`). CHECK: vacía si y solo si está en `sin_receta` |
| `verificada_en` | timestamptz | sí | Cuando se cerró el corte que la verificó. CHECK: llena si y solo si está `verificada` |
| `verificada_lote_id` | uuid | sí | → `lotes.id`: el lote cuyo corte la verificó. Lleva su `@llavePendiente` hasta la fase 12 |

Lleva las columnas comunes (ver [base de datos](../../cimientos/BASE-DE-DATOS.md#columnas-comunes)). **Índices:** único (`producto_id`) · (`estado`).

## La tabla `receta_versiones`

| Columna | Tipo | Nulo | Qué es |
|---|---|---|---|
| `id` | uuid | no | Llave. Único (`id`, `receta_id`) |
| `receta_id` | uuid | no | → `recetas.id` |
| `numero` | integer | no | 1, 2, 3… Único con `receta_id` |
| `motivo` | text | no | «Captura inicial» en la primera; «Copiada de {base}[ · {escuela}], versión {v}» si se copió; después, el motivo del cambio (de 5 a 120 letras) |
| `copiada_de_version_id` | uuid | sí | → `receta_versiones.id`: la versión del producto base |

Lleva las columnas comunes: `creado_en` y `creado_por` son la fecha y quién de la versión. **Solo crece:** una versión guardada no cambia.

## La tabla `receta_lineas`

Cada material de una versión.

| Columna | Tipo | Nulo | Qué es |
|---|---|---|---|
| `id` | uuid | no | Llave |
| `receta_version_id` | uuid | no | → `receta_versiones.id` |
| `papel` | text | no | CHECK (`tela_principal`, `combinacion`, `forro`, `avio`) |
| `material_id` | uuid | no | → `materiales.id`. Una tela si el papel no es `avio`. Único con `receta_version_id` |
| `modo` | text | no | CHECK (`igual`, `por_talla`): «Igual en todas las tallas» o «Cambia por talla». CHECK: las telas siempre `por_talla` |
| `unidad_receta` | text | no | CHECK (`m`, `cm`, `pza`). CHECK: las telas siempre `m` |
| `cantidad` | numeric(12,3) | sí | Por prenda, en `unidad_receta`. CHECK: llena si y solo si el modo es `igual`; ≥ 0 |
| `receta_por_unidad_inventario` | numeric(12,3) | no | CHECK > 0. La conversión congelada (regla 6) |
| `orden` | integer | no | El orden en su tabla (tela o avíos) |

Lleva las columnas comunes. **Índices:** único (`receta_version_id`) donde el papel es `tela_principal` · único (`receta_version_id`, `material_id`) · (`material_id`), para «dónde se usa este material». Como su versión, las líneas, sus tallas y sus medidas **solo crecen**: nacen con la versión y no cambian.

## La tabla `receta_linea_tallas`

| Columna | Tipo | Nulo | Qué es |
|---|---|---|---|
| `id` | uuid | no | Llave |
| `receta_linea_id` | uuid | no | → `receta_lineas.id` |
| `talla_id` | uuid | no | → `tallas.id`. Único con `receta_linea_id` |
| `cantidad` | numeric(12,3) | no | Por prenda, en la unidad de la línea. CHECK ≥ 0 |

Lleva las columnas comunes.

## La tabla `receta_medidas`

| Columna | Tipo | Nulo | Qué es |
|---|---|---|---|
| `id` | uuid | no | Llave |
| `receta_version_id` | uuid | no | → `receta_versiones.id` |
| `medida` | text | no | El nombre de la medida |
| `orden` | integer | no | El orden del renglón |
| `talla_id` | uuid | no | → `tallas.id` |
| `valor_cm` | numeric(12,3) | no | Centímetros |

Lleva las columnas comunes. **Índice:** único (`receta_version_id`, `lower(medida)`, `talla_id`).

## Acciones

### `patronaje.guardar_receta`

| | |
|---|---|
| **Pantalla** | Patronaje · página de la receta · barra de guardar · «Guardar receta» o «Guardar como versión {v+1}» |
| **Quién** | Patronaje |
| **Recibe** | `producto_id` · uuid · obligatorio<br>`version` · la de `recetas` · obligatorio<br>`motivo` · texto · hasta 120 · obligatorio si ya hay versión<br>`medidas` · lista (puede ir vacía): por medida, `medida`, `orden` y `valores` (por talla, `talla_id` y `valor_cm`)<br>`lineas` · lista: por material, `papel`, `material_id`, `modo`, `unidad_receta`, `cantidad` (con `igual`) o `tallas` (con `por_talla`: `talla_id` y `cantidad`) y `orden`. Una sola tela principal |
| **Reglas y errores** | `400`, con los textos de la muestra (el aviso dice el primero; la barra, el primero y «y {n} más»): «{medida}: falta la talla {t}, en centímetros» · «{medida}: faltan {n} tallas, en centímetros» · «{medida}, talla {t}: {v} cm no parece medida de la prenda. Va en centímetros» · «{tela o avío}: falta la talla {t}, en {metros, centímetros o piezas}» · «{tela o avío}: faltan {n} tallas, en {unidad}» (solo tallas normales) · «{material}: revisa la talla {t}» (una talla de pedido especial con algo que no es número) · «{tela}, talla {t}: {v} m por prenda es demasiado. La tela va en metros, por ejemplo 1.06» · «{avío}: escribe cuánto lleva cada prenda, en {unidad}» · «Escribe el motivo del cambio» · «Falta la tela» · «{medida} ya está en las medidas» · una medida de menos de 3 letras<br>`422 tela_en_metros`: «{tela}: la tela va en metros por prenda, talla por talla.»<br>`422 unidad_sin_conversion`: «{avío} se guarda en {unidad del material}: captúralo en {unidades que acepta}.»<br>`422 material_tipo_no_cuadra`: «{material} es {avío o consumible}: no va como tela.» o «{material} es tela: va en la tabla de tela.»<br>`422 material_repetido`: «{material} ya está en la receta.»<br>`422 material_dado_de_baja`: «{material} está dado de baja en Compras.»<br>`422 talla_ajena`: «La talla {t} no es de {producto}.»<br>`422 seccion_sin_receta`: «{sección} no lleva receta.»<br>`422 sin_cambios`: «Sin cambios»<br>Aviso que no bloquea: «Queda sin verificar hasta que se mida en el próximo corte» (estaba verificada y la perdió) |
| **Escribe** | La siguiente versión con su motivo («Captura inicial» en la primera), sus líneas con la conversión congelada, sus tallas y sus medidas. En `recetas`: la versión vigente y el estado `sin_verificar`, salvo que estuviera verificada y no cambien la tela ni los avíos |
| **Regresa** | El número de versión, el estado y si perdió la verificación. «Receta guardada como versión 1. Compras ya puede proyectar su tela» o «Versión {v} guardada. Los lotes ya cortados conservan la versión {v-1}» |
| **Eventos** | `receta.guardada`: «hay cambios» para Compras, Bodega y Producción |
| **Bitácora** | «Receta de {prenda}: versión {v}. {motivo}», con la versión anterior en `antes` (líneas y medidas) y la nueva en `despues` |

## Acciones internas

### `patronaje.iniciar_receta`

| | |
|---|---|
| **La llama** | `catalogo.crear_producto`, si la sección lleva receta (ver [productos](../catalogo/productos.md)) |
| **Recibe** | `producto_id` · `producto_base_id` (si viene a partir de otro) · `medidas` (las del alta) |
| **Escribe** | La receta en `sin_receta`. Si el base tiene receta: su versión vigente copiada como versión 1 («Copiada de {base}[ · {escuela}], versión {v}», con `copiada_de_version_id`), solo con las tallas del producto nuevo y con las medidas del alta en lugar de las copiadas; queda `sin_verificar`. Si el base no tiene receta, las medidas del alta no tienen dónde guardarse: se descartan y Catálogo avisa «Las medidas se capturan con la receta en Patronaje» |
| **Regresa** | `receta_id` y su estado, para «Crear y seguir con la receta» |

### `patronaje.verificar_receta`

| | |
|---|---|
| **La llama** | `produccion.cerrar_corte` (ver [corte y bultos](../produccion/corte-y-bultos.md)) |
| **Recibe** | `producto_id` · `lote_id` |
| **Reglas** | `422 sin_receta`: «Sin receta no se puede cortar: el sistema no sabe cuánta tela lleva cada talla.» |
| **Escribe** | Si estaba `sin_verificar`: `verificada`, con `verificada_en` y `verificada_lote_id` |
| **Regresa** | La versión vigente, que el lote congela, y si la verificó, para el aviso «{L} cortado. La receta de {prenda} queda verificada» |
| **Eventos** | `receta.verificada` |

## Lecturas

### `patronaje.receta_cubre_tallas(producto, tallas)`

| | |
|---|---|
| **La usan** | Ventas al mandar a producción, Producción al crear una orden, y Catálogo al agregar una talla normal |
| **Regresa** | Si la versión vigente tiene valor en todas esas tallas, también las de pedido especial; y cuáles le faltan |

### `patronaje.recetas_con_material(material)`

| | |
|---|---|
| **La usa** | Compras, al dar de baja un material (ver [materiales](../compras/materiales.md)) |
| **Regresa** | Las prendas activas cuya versión vigente lleva ese material |

## Parámetros

Los cambia solo la dueña, en Configuración (ver [configuración](../admin/configuracion.md)). Todos van en «Parámetros».

| Parámetro | Valor inicial | Para qué |
|---|---|---|
| `patronaje.medida_cm_min` · `patronaje.medida_cm_max` | 5 · 250 cm | Lo que se acepta como medida de una prenda. Se siembran en la [fase 8](../../fases/08-catalogo.md), porque los tipos de prenda los usan desde ahí |
| `patronaje.tela_max_m_por_prenda` | 5 m | Más tela por prenda en una talla es un error de captura |
| `patronaje.corte_proximo_dias` | 14 días | «Sin receta · corte próximo» en los pendientes de Patronaje |
| `patronaje.corte_urgente_dias` | 7 días | El rojo del menú y del «Próximo corte» |

## Permisos

- Guardar la receta: Patronaje.
- La leen Compras, Bodega, Producción y Ventas (sin costos: la receta no tiene dinero) y Catálogo (su estado y sus medidas).

## Eventos

`receta.guardada` · `receta.verificada`.

## Lo que llega después

- **Fase 12:** `patronaje.verificar_receta` desde el cierre del corte y la llave de `verificada_lote_id`; «Sin receta · corte próximo» con los lotes por cortar; y, al guardar una versión, el aviso a Bodega y Producción «{lote} ya tiene tela entregada con la versión {v}: Bodega revisa si alcanza», cuando un lote por cortar ya recibió su tela calculada con otra versión.
- **Fase 16:** Ventas pregunta `patronaje.receta_cubre_tallas` antes de mandar a producción.
- **Con uniformame.mx:** lee, de solo lectura, las medidas de la versión vigente de los productos sin escuela.

## Cómo está hecho

**Fase 10, parte 2.**

- **Las tablas** están en `modulos/patronaje/tablas.ts` (migración `0033`), con los CHECK de este archivo. La versión vigente usa la llave compuesta (`version_vigente_id`, `id`) → `receta_versiones` (`id`, `receta_id`). Las versiones, sus líneas, sus tallas y sus medidas solo crecen (`marcar_solo_crece`). El motivo de una versión va de 5 a 200 letras en la base: el de una copia («Copiada de {base} · {escuela}, versión {v}») puede pasar de 120 (decisión 531). La misma migración da su receta, en «Sin receta», a los productos que ya existían en una sección con receta (decisión 525).
- **Lo común** (`dominio/recetas.ts`): la prenda con sus tallas vivas, la receta con candado, leer y escribir el contenido de una versión, y compararlo: todo para «Sin cambios», o solo los materiales (sin su orden) para saber si se pierde la verificación.
- **`patronaje.guardar_receta`** (`acciones/guardar-receta.ts`, con su contrato en `packages/compartido/src/contratos/patronaje/recetas.ts`):
  - Revisa primero lo que es `422` (las tallas ajenas y cada material contra el suyo) y después junta los `400` por renglón (`medidas.{i}`, `lineas.{i}`, `motivo`, `lineas`), con los textos de la muestra; el mensaje es el primero (decisión 522). Las tallas que se piden son las normales del producto que no están dadas de baja (decisión 524).
  - Un consumible puede ir como avío; solo la tela tiene su tabla (decisión 523).
  - Lee los materiales con `FOR SHARE`: nadie los da de baja mientras entran a la receta (decisión 532).
  - Congela la conversión: 1 en la misma unidad (`m` o `pza`), 100 de `cm` a `m`, o el `factor_receta` del material.
- **Las internas** (`internas/recetas.ts`): `iniciar_receta` la crea en «Sin receta» y, a partir de otro con receta, copia su versión vigente como versión 1 solo con las tallas del producto nuevo y con las medidas del alta (o las copiadas, si el alta no trae). `verificar_receta` regresa la versión vigente y si la verificó (decisión 528).
- **Las lecturas** (`lecturas/recetas.ts`): `receta_cubre_tallas` dice también si la prenda tiene receta, para que Catálogo no la lea (decisión 526); `recetas_con_material` regresa las prendas activas por nombre.
- **Quién la usa ya:** `catalogo.crear_producto` llama `iniciar_receta` y regresa `receta_id` y `receta_estado`; `catalogo.agregar_talla` avisa si la receta no tiene la talla normal nueva; `compras.dar_baja_material` responde `material_en_receta`.
- **Pruebas:** `acciones/guardar-receta.prueba.ts` (la versión que no cambia y su conversión congelada, la verificación, las reglas de captura y de los materiales, la sección sin receta, `409` y `403`), `internas/iniciar-receta.prueba.ts` (desde cero, la copia del base con sus tallas y las medidas del alta, la base sin receta, y la verificación), `catalogo/acciones/agregar-talla.prueba.ts` y `compras/acciones/dar-baja-material.prueba.ts`. Las ayudas están en `nucleo/pruebas/patronaje-de-prueba.ts`, con una cuenta de prueba de Patronaje (decisión 529).

**Fase 10, cierre.** Una talla con algo que no es número da «{material}: revisa la talla {t}»: el contrato deja pasar el texto de cada talla y la acción lo revisa con la misma forma de las demás cantidades (`cantidad` del contrato). Las medidas del tipo de prenda no se copian a la versión: mientras la prenda no tiene medidas propias, la pantalla muestra las de su tipo (regla 3), y eso llega con ella en la fase 19 (decisión 555). `patronaje.calcular_material` revisa que la versión que recibe sea de la receta de ese producto.
