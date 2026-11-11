# Tallas y tipos de prenda

> **Qué cubre:** los grupos de tallas con sus tallas; agregar, descontinuar, reactivar y dar de baja la talla de un producto; y los tipos de prenda, con sus medidas iniciales por talla y su flujo por omisión.
> **Estado:** Decidido.
> **Se construye en:** [fase 8](../../fases/08-catalogo.md).
> **Se conecta con:** [variantes, códigos y etiquetas](variantes-codigos-y-etiquetas.md) · [folios](../admin/folios.md) · [existencias y cuadre](../inventario/existencias-y-cuadre.md) · [reservas](../inventario/reservas.md) · [lotes](../produccion/lotes.md) · [recetas](../patronaje/recetas.md) · [desarrollos](../patronaje/desarrollos.md) · [pantallas de Catálogo](../../interfaz/fabrica/catalogo.md) · [pantallas de Patronaje](../../interfaz/fabrica/patronaje.md) · [pantallas de Ventas](../../interfaz/fabrica/ventas.md) · [operaciones y flujos](../produccion/operaciones-y-flujos.md) · [mínimos y reabasto](../inventario/minimos-y-reabasto.md) · [pedidos y sus versiones](../ventas/pedidos.md) · [pedidos en línea](../linea/pedidos-en-linea.md)

## Para qué sirve

Las tallas no van escritas en el código: son datos, agrupados y con su orden. Ese orden da el orden de las columnas en la matriz de la ficha, en la receta, en las existencias y en las casillas del pedido. Cada producto tiene una variante por talla, con su código de barras para siempre (ver [variantes](variantes-codigos-y-etiquetas.md)).

Ejemplo: la playera polo blanca con escudo del Instituto Juan Pablo II se dio de alta con Infantil de 4 a 16. Una mamá pide talla 18 y Catálogo se la agrega como «Pedido especial»: nace la variante con el siguiente código y el aviso «Talla 18 agregada con el código 100266. Se etiqueta al fabricar el pedido».

El **tipo de prenda** («Playera polo», «Pantalón escolar») es el molde de un producto nuevo: propone las medidas iniciales de la receta, con un número por talla, y el flujo de operaciones del taller.

## Reglas

1. **Las tallas viven en grupos.** El nombre de una talla es único en su grupo, sin importar mayúsculas. Su `orden` acomoda las columnas y define la talla de en medio.
2. **Una talla que ya usa algún producto no se renombra ni se quita,** aunque esas variantes estén dadas de baja: su nombre está en el historial. Sí se puede cambiar su orden. Una talla que nadie usa y se quita del grupo queda con baja.
3. **«Agregar talla» solo ofrece las tallas de los grupos del producto** (los grupos de sus variantes) que el producto no tiene activas ni descontinuadas.
4. **Una talla del producto es normal o de pedido especial.** La de pedido especial cobra el precio base más el recargo del producto, no se vende en línea, no lleva precio de mayoreo y se etiqueta al fabricar su pedido (ver [precios](precios.md) y [variantes](variantes-codigos-y-etiquetas.md)).
5. **Descontinuar una talla** la deja de fabricar y de etiquetar; se vende hasta acabarla. Ventas ya no la manda a producción ([mandar a producción](../ventas/mandar-a-produccion.md)). Se puede reactivar.
6. **Dar de baja una talla exige que nada la retenga:** existencia en cero en todas las ubicaciones (también si es negativa, en Tránsito o En camino a aduana), ninguna reserva activa, ningún lote sin terminar y ningún pedido abierto (PE-, PE-T1- o W-). Si algo la retiene, se rechaza y se propone descontinuarla. Así lo pide la decisión de integración 4, que manda sobre la muestra (la muestra solo avisaba).
7. **Cada candado lo revisa su dueño:** Catálogo pregunta con la lectura del módulo que tiene la existencia, la reserva, el lote o el pedido, y cada uno lo agrega la fase que construye ese módulo (ver «Lo que llega después»). Así nunca hay algo que retenga una talla sin su candado.
8. **La baja es definitiva.** El código queda retirado y no se vuelve a usar. Si se vuelve a agregar esa talla, nace otra variante con código nuevo («10, tuvo baja, lleva código nuevo»).
9. **Ni descontinuar ni dar de baja mueven inventario:** por eso la baja exige existencia cero; la existencia es la suma de los movimientos y no se saca a mano.
10. **Las tallas son parte del producto:** agregar, descontinuar, reactivar o dar de baja una talla sube la versión del producto. Quien tenía la ficha abierta recibe `409` y la ve completa otra vez (ver [idempotencia y concurrencia](../../cimientos/IDEMPOTENCIA-Y-CONCURRENCIA.md)).
11. **Un tipo de prenda es de una sección que lleva receta.** Sus medidas van en centímetros, entre `patronaje.medida_cm_min` (5) y `patronaje.medida_cm_max` (250), con un número por talla que puede quedar vacío. Quitar una medida la da de baja.
12. **El tipo de prenda solo propone.** El producto guarda su propio tipo y su propio flujo; cambiar el tipo después no cambia productos que ya existen (decisión de integración 9).

## Estados de una talla del producto

| De | A | Acción | Quién |
|---|---|---|---|
| — | activa | El alta del producto o «Agregar talla». Toma el siguiente código | Catálogo; Ventas desde un pedido |
| activa | descontinuada | «Descontinuar talla», con motivo | Catálogo |
| descontinuada | activa | «Reactivar talla», sin motivo | Catálogo |
| activa o descontinuada | dada de baja | «Dar de baja esta talla», con motivo, si nada la retiene | Catálogo |

Una talla dada de baja no vuelve. Las columnas de cada estado están en [la tabla `variantes`](variantes-codigos-y-etiquetas.md#la-tabla-variantes).

## La tabla `grupos_talla`

| Columna | Tipo | Nulo | Qué es |
|---|---|---|---|
| `id` | uuid | no | Llave |
| `nombre` | text | no | De 3 a 40. Único sin importar mayúsculas |
| `orden` | integer | no | El orden de los grupos en el alta |
| `baja_en` · `baja_por` · `motivo_baja` · `reactivado_en` | | sí | La primera versión no da de baja un grupo |

Lleva las columnas comunes (ver [base de datos](../../cimientos/BASE-DE-DATOS.md#columnas-comunes)). **Índice:** único (`lower(nombre)`).

## La tabla `tallas`

| Columna | Tipo | Nulo | Qué es |
|---|---|---|---|
| `id` | uuid | no | Llave |
| `grupo_talla_id` | uuid | no | → `grupos_talla.id` |
| `nombre` | text | no | De 1 a 10. Lo que dicen la etiqueta, el ticket y la matriz |
| `orden` | integer | no | El orden dentro del grupo |
| `baja_en` · `baja_por` · `motivo_baja` · `reactivado_en` | | sí | Quitada del grupo sin uso |

Lleva las columnas comunes y, como baja a la tablet, `xid_escritura`. **Índice:** único (`grupo_talla_id`, `lower(nombre)`).

### La siembra

Los cuatro grupos de la muestra son parte de la siembra del sistema: existen en toda base y Catálogo agrega los que falten.

| Grupo | Tallas, en orden |
|---|---|
| Infantil | 3 · 4 · 6 · 8 · 10 · 12 · 14 · 16 · 18 |
| Juvenil y adulto | CH · M · G · XG · XXG |
| Pantalón por cintura | 26 · 28 · 30 · 32 · 34 · 36 · 38 |
| Talla única | Única |

## La tabla `tipos_prenda`

| Columna | Tipo | Nulo | Qué es |
|---|---|---|---|
| `id` | uuid | no | Llave |
| `nombre` | text | no | De 3 a 40. Único sin importar mayúsculas |
| `seccion_id` | uuid | no | → `secciones.id`. Una sección que lleva receta. Filtra el selector «Tipo de prenda» del alta |
| `flujo_defecto_id` | uuid | sí | → `flujos.id`: el flujo que propone el alta si no se escoge otro. Lleva su `@llavePendiente` hasta la fase 12 |
| `orden` | integer | no | |
| `baja_en` · `baja_por` · `motivo_baja` · `reactivado_en` | | sí | |

Lleva las columnas comunes. **Índice:** único (`lower(nombre)`). No tiene siembra: los tipos los da de alta Catálogo; los datos de la muestra traen los que usan sus productos.

## La tabla `tipo_prenda_medidas`

Las medidas iniciales de un tipo, con un número por talla para corregir en la receta.

| Columna | Tipo | Nulo | Qué es |
|---|---|---|---|
| `id` | uuid | no | Llave |
| `tipo_prenda_id` | uuid | no | → `tipos_prenda.id` |
| `medida` | text | no | El nombre de la medida («Largo», «Pecho»). Al menos 3 letras |
| `orden` | integer | no | El orden del renglón |
| `talla_id` | uuid | no | → `tallas.id` |
| `valor_cm` | numeric(12,3) | sí | Centímetros. Vacío: sin número propuesto |
| `baja_en` · `baja_por` · `motivo_baja` · `reactivado_en` | | sí | Una medida que se quita |

Lleva las columnas comunes. **Índice:** único (`tipo_prenda_id`, `lower(medida)`, `talla_id`) donde `baja_en` es nulo.

## Acciones

Todas son de la web y van con el departamento Catálogo. Los errores `422` llevan su `codigo` y su mensaje (formato en [API](../../cimientos/API.md)).

### `catalogo.agregar_talla`

| | |
|---|---|
| **Pantalla** | Catálogo · ficha del producto · «Tallas, códigos y precios» · «Agregar talla» con «Normal» o «Pedido especial» · «Agregar» |
| **Quién** | Catálogo |
| **Recibe** | `producto_id` · uuid · obligatorio<br>`talla_id` · uuid · obligatorio<br>`es_pedido_especial` · booleano · obligatorio<br>`version` · la del producto · obligatorio |
| **Reglas y errores** | `422 talla_ya_existe`: «{producto} ya tiene la talla {t}.» (activa o descontinuada)<br>`422 talla_de_otro_grupo`: «La talla {t} no es de los grupos de tallas de {producto}.»<br>`422 producto_descontinuado`: «{producto} está descontinuado: reactívalo para cambiarlo.»<br>`422 sin_codigos`: si `admin.tomar_folio` contesta que se acabaron los códigos, «No quedan códigos de barras de fábrica. Avisa a soporte.» |
| **Escribe** | Una variante nueva con el siguiente código: la normal nace `por_imprimir`; la de pedido especial, `al_fabricar`. No crea precios: la talla toma el precio base de cada lista. Sube la versión del producto |
| **Llama** | `admin.tomar_folio` (`codigo_barras`) |
| **Regresa** | `variante_id` y `codigo`. «Talla {t} agregada con el código {código}. Falta imprimir su etiqueta» o «Talla {t} agregada con el código {código}. Se etiqueta al fabricar el pedido» |
| **Eventos** | `variante.agregada` |
| **Bitácora** | «Talla {t} agregada con el código {código}», o «Talla {t} por pedido especial agregada con el código {código}», con la variante en `despues` |

### `catalogo.descontinuar_talla`

| | |
|---|---|
| **Pantalla** | Ficha del producto · matriz · «Descontinuar talla», junto a «Dar de baja esta talla» (pantalla nueva: la muestra no trae el botón) |
| **Quién** | Catálogo |
| **Recibe** | `variante_id` · uuid · obligatorio<br>`motivo` · texto · al menos `general.largo_minimo_motivo` (5) letras · obligatorio<br>`version` · la del producto · obligatorio |
| **Reglas y errores** | `400`: «Escribe al menos 5 letras.»<br>`422 talla_ya_descontinuada`: «La talla {t} ya está descontinuada.»<br>`422 talla_dada_de_baja`: «La talla {t} ya está dada de baja.» |
| **Escribe** | En la variante: `descontinuada_en`, `descontinuada_por` y `motivo_descontinuada`. Sube la versión del producto |
| **Regresa** | «Talla {t} descontinuada: se vende hasta acabarla» |
| **Eventos** | `variante.descontinuada` |
| **Bitácora** | «Talla {t} descontinuada. {motivo}», con las tres columnas en `antes` y `despues` |

### `catalogo.reactivar_talla`

| | |
|---|---|
| **Pantalla** | Ficha del producto · matriz · «Reactivar talla» en una talla descontinuada (pantalla nueva) |
| **Quién** | Catálogo |
| **Recibe** | `variante_id` · uuid · obligatorio<br>`version` · la del producto · obligatorio |
| **Reglas y errores** | `422 talla_no_descontinuada`: «La talla {t} no está descontinuada.»<br>`422 talla_dada_de_baja`: «La talla {t} está dada de baja: agrégala otra vez y lleva código nuevo.» |
| **Escribe** | Limpia `descontinuada_en`, `descontinuada_por` y `motivo_descontinuada`, y pone `reactivada_en` y `reactivada_por`. Sube la versión del producto |
| **Regresa** | «Talla {t} vuelve a fabricarse» |
| **Eventos** | `variante.reactivada` |
| **Bitácora** | «Talla {t} vuelve a fabricarse», con el motivo que tenía en `antes` |

### `catalogo.dar_baja_talla`

| | |
|---|---|
| **Pantalla** | Ficha del producto · «Dar de baja esta talla» → ventana «Dar de baja la talla {t}» · «Dar de baja» |
| **Quién** | Catálogo |
| **Recibe** | `variante_id` · uuid · obligatorio<br>`motivo` · texto · al menos 5 letras · obligatorio<br>`version` · la del producto · obligatorio |
| **Reglas y errores** | `400`: «Escribe al menos 5 letras.»<br>`422 talla_dada_de_baja`: «La talla {t} ya está dada de baja.»<br>Los candados de la regla 6, cada uno desde la fase de su módulo:<br>· `422 talla_con_existencia`: «Todavía hay {n} piezas de la talla {t} en {ubicaciones}. Descontinúala: se vende hasta acabarla.»<br>· `422 talla_con_reservas`: «La talla {t} tiene {n} piezas apartadas ({folios}). Espera a que se entreguen o se liberen.»<br>· `422 talla_con_lotes`: «La talla {t} está en lotes sin terminar: {lotes}.»<br>· `422 talla_con_pedidos`: «La talla {t} está en pedidos abiertos: {folios}.» |
| **Escribe** | En la variante: `baja_en`, `baja_por` y `motivo_baja`. El código queda retirado para siempre. Ningún movimiento. Sube la versión del producto |
| **Regresa** | «Talla {t} dada de baja. El código {código} no se vuelve a usar» |
| **Eventos** | `variante.dada_de_baja` |
| **Bitácora** | «Talla {t}, código {código}. {motivo}» |

### `catalogo.guardar_grupo_talla`

| | |
|---|---|
| **Pantalla** | Catálogo · Escuelas y tallas · «Grupos de tallas» · «Agregar grupo», o un grupo · «Agregar talla» y el orden (pantalla nueva: en la muestra los grupos solo se consultan) |
| **Quién** | Catálogo |
| **Recibe** | `grupo_talla_id` · uuid · opcional: sin él es un grupo nuevo<br>`nombre` · texto · de 3 a 40 · obligatorio<br>`tallas` · lista · obligatoria: por talla, `talla_id` (opcional: sin él es nueva), `nombre` (de 1 a 10) y `orden`<br>`version` · la del grupo · obligatorio si ya existe |
| **Reglas y errores** | `422 grupo_repetido`: «Ese grupo de tallas ya existe.»<br>`422 talla_repetida`: «La talla {t} ya está en el grupo.»<br>`422 talla_en_uso`: «La talla {t} ya la usan {n} productos: no se renombra ni se quita.» |
| **Escribe** | El grupo y sus tallas: las nuevas, los nombres y el orden. Una talla sin uso que ya no viene queda con baja |
| **Regresa** | «Grupo {grupo} guardado» |
| **Eventos** | `talla.cambiada` |
| **Bitácora** | «Grupo {grupo}: {tallas}», con las tallas y su orden en `antes` y `despues` |

### `catalogo.guardar_tipo_prenda`

| | |
|---|---|
| **Pantalla** | Catálogo · Escuelas y tallas · «Tipos de prenda» · «Agregar tipo», o un tipo · «Guardar» (pantalla nueva) |
| **Quién** | Catálogo |
| **Recibe** | `tipo_prenda_id` · uuid · opcional: sin él es nuevo<br>`nombre` · texto · de 3 a 40 · obligatorio<br>`seccion_id` · uuid · obligatorio<br>`medidas` · lista · obligatoria, puede ir vacía: por medida, `medida` (al menos 3 letras), `orden` y `valores` (por talla, `talla_id` y `valor_cm`, que puede ir vacío)<br>`version` · la del tipo · obligatorio si ya existe |
| **Reglas y errores** | `400`: una medida de menos de 3 letras · «{medida}, talla {t}: {v} cm no parece medida de la prenda. Va en centímetros» (fuera de `patronaje.medida_cm_min` a `patronaje.medida_cm_max`)<br>`422 tipo_repetido`: «Ese tipo de prenda ya existe.»<br>`422 medida_repetida`: «{medida} ya está en las medidas»<br>`422 seccion_sin_receta`: «{sección} no lleva receta: sus productos no tienen medidas.» |
| **Escribe** | El tipo y sus medidas. Una medida que ya no viene queda con baja |
| **Regresa** | «Tipo de prenda {tipo} guardado» |
| **Eventos** | `tipo_prenda.guardado`: solo para que se actualicen las pantallas abiertas; no baja a ningún aparato |
| **Bitácora** | «Tipo de prenda {tipo}: {cambios}», con `antes` y `despues` |

## Lo que baja a la tablet

| Tabla | Filtro | Columnas |
|---|---|---|
| `tallas` | Todas, también las de baja | `id`, `nombre`, `orden` |

La tablet solo necesita el nombre de la talla para decir «{prenda} · talla {t}» en cada bulto. Bajan todas, no solo las de los lotes en proceso, para que un lote que entra o sale de la tablet no obligue a tocar el catálogo (ver [variantes](variantes-codigos-y-etiquetas.md#lo-que-baja-a-la-tablet)).

## Parámetros

Este archivo no tiene parámetros propios. Usa:

| Parámetro | Valor inicial | Su archivo | Para qué aquí |
|---|---|---|---|
| `general.largo_minimo_motivo` | 5 letras | [configuración](../admin/configuracion.md) | El motivo de descontinuar y de dar de baja |
| `patronaje.medida_cm_min` · `patronaje.medida_cm_max` | 5 · 250 cm | [recetas](../patronaje/recetas.md) | Lo que se acepta como medida de un tipo de prenda. Son de Patronaje, pero se siembran en la fase 8 porque los tipos de prenda los usan desde aquí |

## Permisos

- Todas las acciones: Catálogo.
- Las tallas y los tipos de prenda los leen también Patronaje (la receta por talla), Ventas (las casillas por talla del pedido), Producción, Aduana y Bodega (las existencias por talla). Nada de aquí trae precios.

## Eventos

`variante.agregada` · `variante.descontinuada` · `variante.reactivada` · `variante.dada_de_baja` · `talla.cambiada` · `tipo_prenda.guardado`.

## Lo que llega después

- **Fase 9:** los candados `talla_con_existencia` y `talla_con_reservas` de `catalogo.dar_baja_talla`, con la lectura de inventario de lo que retiene una variante. Antes de revisar, toma el candado de la variante en el orden fijo, para que ningún movimiento se cruce con la baja.
- **Fase 10:** al agregar una talla normal a una prenda con receta, el aviso que no bloquea «La receta de {producto} no tiene la talla {t}: Patronaje la completa.»; y, mientras la receta nueva no tiene medidas propias, su pantalla muestra las del tipo de prenda (fase 19, decisión 555).
- **Fase 12:** `flujo_defecto_id` en `catalogo.guardar_tipo_prenda`, la llave de `tipos_prenda.flujo_defecto_id` y el candado `talla_con_lotes`.
- **Fase 16:** el candado `talla_con_pedidos` con los pedidos abiertos de Ventas (PE-).
- **Fase 18:** el mismo candado con los pedidos en línea abiertos (W-), con `linea.pedidos_abiertos_de_variante` (ver [pedidos en línea](../linea/pedidos-en-linea.md)).
- **Con el POS:** el candado con los pedidos especiales de tienda (PE-T1-); los grupos y las tallas bajan a la caja (todos); y agregar una talla por un código que reportó una tienda como no registrado lo marca atendido con `tiendas.atender_codigo_no_registrado`.

## Cómo está hecho

**Fase 8, parte 1.**

- **Las tablas** `grupos_talla`, `tallas`, `tipos_prenda` y `tipo_prenda_medidas` son de `catalogo` (migración `0022`). Las tallas llevan `xid_escritura` y bajan a la tablet todas, con su nombre y su orden (`bajada.ts`). Los cuatro grupos con sus tallas son parte de la siembra del sistema (`siembra.ts`), que agrega solo lo que falta. `flujo_defecto_id` nace con su `@llavePendiente`.
- **`catalogo.guardar_grupo_talla`** (`acciones/guardar-grupo-talla.ts`): se manda el grupo completo; un grupo nuevo, o el que existe con su versión (en `datos`, decisión 432); `grupo_repetido` y `talla_repetida`; renombra y reordena; la que ya no viene queda con baja, y una que vuelve con el nombre de una quitada la reactiva (decisión 438). Que una talla en uso no se renombre ni se quite llega con los productos, en la parte 3 (decisión 436).
- **`catalogo.guardar_tipo_prenda`** (`acciones/guardar-tipo-prenda.ts`): la sección tiene que llevar receta (`seccion_sin_receta`); `tipo_repetido`; `medida_repetida`; cada número entre `patronaje.medida_cm_min` y `patronaje.medida_cm_max` (`400` en `medidas`); las medidas que ya no vienen quedan con baja. Esos dos parámetros los siembra el módulo `patronaje`, que por ahora solo tiene su `index.ts` y su `parametros.ts`.
- **Fase 8, parte 3:** las tallas de un producto (`acciones/tallas-del-producto.ts`): agregar una toma el siguiente código y la versión del producto, solo de los grupos de sus variantes (`talla_de_otro_grupo`, `talla_ya_existe`); descontinuar con motivo, reactivar sin él, y dar de baja con motivo, para siempre (sus candados los agrega la fase de cada módulo). Que una talla en uso no se renombre ni se quite lo revisa `dominio/tallas.ts` con las variantes de cualquier estado. Pruebas: `agregar-talla.prueba.ts`, `dar-baja-talla.prueba.ts`, `reactivar-talla.prueba.ts` y, en `guardar-grupo-talla.prueba.ts`, la talla en uso.
- **Las pruebas:** `modulos/catalogo/acciones/guardar-grupo-talla.prueba.ts` (nuevo, repetido, renombrar, reordenar, quitar, la que vuelve, el `409`) y `guardar-tipo-prenda.prueba.ts` (el rango, la medida repetida, la sección sin receta, el tipo repetido, la medida quitada, la bitácora y el `409`). La siembra la revisa `agregar-seccion.prueba.ts`; la foto de la tablet, `nucleo/sincronizacion/foto.prueba.ts`.

**Fase 9, parte 3.** `catalogo.dar_baja_talla` lee primero `inventario.piezas_de_variante` con `bloquear`, antes de su producto y su variante: ese es el orden de un movimiento, y así ninguno se cruza con la baja (decisión 484).
- **`talla_con_existencia`** suma las piezas sin signo y nombra las ubicaciones.
- **`talla_con_reservas`** nombra el tipo de cada documento hasta que cada fase dé su folio (decisión 483).
- **Pruebas:** `dar-baja-talla.prueba.ts`. Incluye una baja que espera a un movimiento abierto y luego ve su existencia.

**Fase 10, parte 2.** `catalogo.agregar_talla` pregunta a `patronaje.receta_cubre_tallas` al agregar una talla normal: si la prenda tiene receta y no la cubre, regresa el aviso «La receta de {producto} no tiene la talla {t}: Patronaje la completa.». Lo prueba `acciones/agregar-talla.prueba.ts`.

**Fase 12, parte 1.** `catalogo.guardar_tipo_prenda` recibe `flujo_defecto_id`, que tiene que estar vigente (`produccion.flujo_vigente`), y lo anota en la bitácora; `tipos_prenda.flujo_defecto_id` ya es llave. Lo prueba `acciones/flujo-del-producto.prueba.ts`.
