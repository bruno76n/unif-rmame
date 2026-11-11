# Materiales

> **Qué cubre:** las telas, los avíos y los consumibles del taller: en qué unidad se guardan, cómo los captura Patronaje y cómo los toma la tablet, su alta con su proveedor y su costo, cómo se piden, su baja y su reactivación.
> **Estado:** Decidido.
> **Se construye en:** [fase 10](../../fases/10-patronaje-y-compras.md).
> **Se conecta con:** [proveedores y precios](proveedores-y-precios.md) · [proyección de material](proyeccion-de-material.md) · [recetas](../patronaje/recetas.md) · [material en bodega](../inventario/material-en-bodega.md) · [configuración](../admin/configuracion.md) · [pantallas de Compras](../../interfaz/fabrica/compras.md) · [pantallas de Bodega](../../interfaz/fabrica/bodega.md) · [órdenes de compra](ordenes-de-compra.md) · [conteos y carga inicial](../inventario/conteos.md) · [la tablet del taller](../../apps/tablet.md) · [pantallas de la tablet](../../interfaz/tablet.md)

## Para qué sirve

Un material es lo que se compra para fabricar: la tela, los avíos (cierres, botones, etiquetas, hilo) y los consumibles del taller (agujas, aceite, bandas). Cada uno dice en qué unidad se guarda, cómo lo captura Patronaje en sus recetas y cómo se pide. Ejemplo: la gabardina azul marino es tela, se guarda en metros, «Ancho 1.50 m»; la surte Textiles Aurora; no debe quedar menos de 150 m, se compra de 50 en 50 y cada pedido cubre 60 días. El hilo poliéster marino se guarda en conos de 5,000 m, pero Patronaje lo captura en metros por prenda.

## Reglas

1. **Tres tipos:** `tela` (se mide en metros, porque los rollos llevan metros), `avio` (lo escoge Patronaje en sus recetas) y `consumible` (sale solo en la tablet, en «Tomar consumible»).
2. **La unidad en que se guarda** es una de la lista «Unidades de material» de [configuración](../admin/configuracion.md): el material guarda su clave. Cada unidad dice si se cuenta entera (piezas, conos, cajas) o acepta decimales (metros, litros, kilos). «Se cuenta entera» vale al comprar y al contar; al consumir, se aceptan tres decimales (tres agujas de una caja de 100 son 0.030 cajas).
3. **Si Patronaje lo captura en otra unidad,** el material dice cuál (`unidad_receta`: `m`, `cm` o `pza`) y cuántas de esas caben en una de inventario (`factor_receta`): de cm a m, 100; de m a un cono de 5,000 m, 5,000; de pza a una caja de 100, 100.
4. **Si la tablet lo toma en otra unidad,** el material dice cuál (`unidad_tablet`) y cuántas hacen una de inventario (`factor_tablet`): 100 agujas son 1 caja; 4 cuartos son 1 litro. Solo un consumible la lleva, y se escribe en el alta o en «Cómo se pide».
5. **Nace sin existencia.** Lo que haya hoy lo registra Bodega como carga inicial (ver [conteos](../inventario/conteos.md)).
6. **Su nombre es único,** sin importar acentos ni mayúsculas.
7. **El alta pide su proveedor y su costo:** en la misma transacción nacen el renglón de ese proveedor, que queda como el habitual, y el primer precio del historial (ver [proveedores y precios](proveedores-y-precios.md)).
8. **El costo no se guarda en el material:** se calcula con su historial de precios (ver [proveedores y precios](proveedores-y-precios.md#el-costo-de-un-material)).
9. **Cómo se pide:** su mínimo, su múltiplo de compra, los días que cubre cada pedido y su consumo diario inicial alimentan Por pedir (ver [proyección de material](proyeccion-de-material.md)).
10. **Se da de baja solo si nada lo usa:** sin existencia, sin estar en una orden abierta y sin estar en la receta vigente de una prenda. Dado de baja, sale de Por pedir, de las recetas nuevas y de la tablet. Se reactiva si su proveedor habitual sigue activo.
11. **Es un agregado con sus proveedores:** agregar, quitar o hacer habitual un proveedor sube la `version` del material, así que quien lo ve en el cajón Material choca si alguien más lo cambió (ver [idempotencia y concurrencia](../../cimientos/IDEMPOTENCIA-Y-CONCURRENCIA.md#que-nadie-pise-a-nadie)).

## La tabla `materiales`

| Columna | Tipo | Nulo | Qué es |
|---|---|---|---|
| `id` | uuid | no | Llave (v7) |
| `nombre` | text | no | De 3 a 80 |
| `nombre_normalizado` | text | no | En minúsculas y sin acentos. Único |
| `tipo` | text | no | CHECK (`tela`, `avio`, `consumible`) |
| `unidad` | text | no | La clave de su unidad en la lista «Unidades de material». La tela, siempre `m` |
| `presentacion` | text | sí | «Ancho 1.50 m», «Cono de 5,000 m», «Caja de 100». Solo para la pantalla. Hasta 60 |
| `unidad_receta` | text | sí | CHECK (`m`, `cm`, `pza`). Vacía: la misma que `unidad` |
| `factor_receta` | numeric(12,3) | sí | CHECK > 0. Obligatorio con `unidad_receta` (CHECK) |
| `unidad_tablet` | text | sí | Cómo la nombra la tablet: «agujas», «cuartos». Vacía: la tablet lo toma en su unidad de inventario. CHECK: solo con `tipo = consumible` |
| `factor_tablet` | numeric(12,3) | sí | CHECK > 0. Obligatorio con `unidad_tablet` |
| `color` | text | sí | `#RRGGBB`: la muestra de color de las listas |
| `minimo` | numeric(12,3) | no | default 0. CHECK ≥ 0. «Mínimo que debe quedar» |
| `multiplo_compra` | numeric(12,3) | no | default 1. CHECK > 0. Toda cantidad de una orden es múltiplo de él |
| `dias_cubre` | integer | no | CHECK > 0. «Cada pedido cubre» |
| `consumo_diario_inicial` | numeric(12,3) | sí | El consumo por día de un mes normal mientras no se mide (ver [proyección de material](proyeccion-de-material.md#el-consumo)). Vacío: sin consumo |
| `proveedor_habitual_id` | uuid | no | → `proveedores.id`. Tiene que estar entre sus proveedores activos |
| `baja_en` · `baja_por` · `motivo_baja` · `reactivado_en` | | sí | |

Lleva las columnas comunes y, como los consumibles bajan a la tablet, `xid_escritura` (ver [base de datos](../../cimientos/BASE-DE-DATOS.md#columnas-comunes)). **Índices:** único (`nombre_normalizado`) · (`tipo`) donde `baja_en` es nulo · (`proveedor_habitual_id`).

### La lista «Unidades de material»

Este archivo siembra la lista `unidades_material` de [configuración](../admin/configuracion.md). La dueña puede agregar más, diciendo si se cuentan enteras.

| Nombre | Clave | Se cuenta entera |
|---|---|---|
| m | `m` | No |
| pza | `pza` | Sí |
| conos | `conos` | Sí |
| cajas | `cajas` | Sí |
| L | `l` | No |
| kg | `kg` | No |

La clave es el nombre en minúsculas y sin acentos, como en todo valor nuevo de la lista. `m` y `pza` son claves que reconoce el código, igual que `cm` en las recetas: con ellas se arma la conversión de la receta.

## Acciones

Todas son de la web, con el departamento Compras.

### `compras.crear_material`

| | |
|---|---|
| **Pantalla** | Compras · Materiales · «Nuevo material» → ventana · «Agregar material» |
| **Recibe** | `nombre` · texto · de 3 a 80 · obligatorio<br>`tipo` · `tela`, `avio` o `consumible` · obligatorio<br>`unidad` · la clave de una unidad · obligatorio<br>`presentacion` · texto · hasta 60 · opcional<br>`color` · `#RRGGBB` · opcional<br>`unidad_receta` y `factor_receta` · opcionales (el factor, obligatorio con la unidad)<br>`unidad_tablet` y `factor_tablet` · opcionales: solo un consumible (el factor, obligatorio con la unidad)<br>`proveedor_id` · uuid · obligatorio<br>`costo_centavos` · entero mayor que 0 · obligatorio: por unidad de inventario<br>`minimo` · entero ≥ 0 · obligatorio<br>`multiplo_compra` · entero ≥ 1 · obligatorio<br>`dias_cubre` · entero · obligatorio (la pantalla propone `compras.dias_cubre_inicial`)<br>`consumo_diario_inicial` · decimal ≥ 0 · opcional |
| **Reglas y errores** | `400`: «Escribe el nombre del material» · «Escribe el costo, por ejemplo 78 o 6.50» (mayor que 0, hasta 2 decimales y hasta `compras.precio_max_centavos`) · «Escribe un número entero, puede ser 0» (mínimo) · «Escribe un número entero mayor a 0» (múltiplo) · «Entre 1 y 365 días» (hasta `compras.dias_cubre_maximo`)<br>`422 nombre_repetido`: «Ya existe un material con ese nombre»<br>`422 unidad_no_existe`: «Escoge cómo se mide.»<br>`422 tela_en_metros`: «La tela se mide en metros.»<br>`422 falta_conversion`: «Escribe cuántas {unidad de receta} trae un {unidad}.» o «Escribe cuántas {unidad de la tablet} hacen un {unidad}.»<br>`422 solo_consumible_en_tablet`: «Solo un consumible se toma en la tablet.»<br>`422 proveedor_dado_de_baja`: «{proveedor} está dado de baja.» |
| **Escribe** | El material sin existencia, con ese proveedor como habitual; el renglón del proveedor con su último precio; y el primer precio del historial, con origen `alta`. Ningún movimiento |
| **Regresa** | `material_id`. «{material} ya está en Materiales. Lo que haya hoy lo registra Bodega como carga inicial» |
| **Eventos** | `material.creado` (un consumible, además, baja a la tablet) |
| **Bitácora** | «Material nuevo: {material}, {unidad}, con {proveedor} a ${costo}», con el material y su precio en `despues` |

### `compras.guardar_material`

| | |
|---|---|
| **Pantalla** | Cajón Material · «Cómo se pide» · «Guardar cambios» |
| **Recibe** | `material_id` · `version` · y, solo lo que cambia: `minimo` (entero de 0 a 9,999,999), `multiplo_compra` (entero de 1 a 9,999,999), `dias_cubre`, `consumo_diario_inicial`, `presentacion`, `color`, `unidad_tablet` y `factor_tablet` |
| **Reglas y errores** | `400`: los mismos del alta<br>`422 falta_conversion` y `422 solo_consumible_en_tablet`: los del alta<br>`422 sin_cambios`: «Sin cambios» |
| **Escribe** | Lo que cambió. El pedido sugerido y el estado se recalculan al leer |
| **Regresa** | «Cambios guardados en {material}. El pedido sugerido ya los usa» |
| **Eventos** | `material.cambiado` |
| **Bitácora** | Un renglón por campo: «{material}: {campo} {antes} → {después}» |

### `compras.dar_baja_material`

| | |
|---|---|
| **Pantalla** | Cajón Material · «Dar de baja» (pantalla nueva) |
| **Recibe** | `material_id` · `motivo` (al menos `general.largo_minimo_motivo`, 5 letras) · `version` |
| **Reglas y errores** | `400`: «Escribe al menos 5 letras.»<br>`422 material_con_existencia`: «Todavía hay {cantidad} de {material} en {ubicaciones}.» (con `inventario.existencia_material`)<br>`422 material_en_orden`: «{material} está en {OC}: termina o cancela la orden antes.» (en borrador, enviada o recibida en parte)<br>`422 material_en_receta`: «{material} está en la receta vigente de {prenda}[ y {n} más]: cámbiala en Patronaje antes.» (con `patronaje.recetas_con_material`) |
| **Escribe** | `baja_en`, `baja_por` y `motivo_baja` |
| **Regresa** | «{material} dado de baja» |
| **Eventos** | `material.cambiado` |
| **Bitácora** | «Dio de baja {material}: {motivo}» |

### `compras.reactivar_material`

| | |
|---|---|
| **Pantalla** | Compras · Materiales · dados de baja · «Reactivar» (pantalla nueva) |
| **Recibe** | `material_id` · `version` |
| **Reglas y errores** | `422 material_activo`: «{material} ya está activo.»<br>`422 habitual_dado_de_baja`: «Su proveedor habitual, {proveedor}, está dado de baja: reactívalo o haz habitual a otro.» |
| **Escribe** | Limpia la baja y pone `reactivado_en` |
| **Regresa** | «{material} vuelve a estar activo» |
| **Eventos** | `material.cambiado` |
| **Bitácora** | «{material} vuelve a estar activo» |

## Lecturas

### `compras.datos_materiales(materiales)`

Se construye en la [fase 12](../../fases/12-produccion.md), con «Tomar consumible».

| | |
|---|---|
| **La usan** | Producción («Tomar consumible»: que sea un consumible activo y su factor de la tablet) e Inventario (que sea consumible al descontarlo; en la carga inicial, su tipo, su unidad y su proveedor habitual) |
| **Regresa** | Por material: su nombre, su tipo, su unidad de inventario y si se cuenta entera, su unidad y su factor de la tablet, su proveedor habitual y si está de baja. Nunca su costo |

## Lo que baja a la tablet

| Tabla | Filtro | Columnas |
|---|---|---|
| `materiales` | Los consumibles activos. Al darse de baja, baja como `quitar` y sale de «Tomar consumible» | `id`, `nombre`, `unidad`, `unidad_tablet`, `factor_tablet` |

Nunca bajan su mínimo, su múltiplo, sus días, su consumo, su proveedor ni su costo.

## Parámetros

Los cambia solo la dueña, en Configuración. Todos van en «Parámetros».

| Parámetro | Valor inicial | Para qué |
|---|---|---|
| `compras.dias_cubre_inicial` | 60 días | Lo que propone «Cada pedido cubre» en un material nuevo |
| `compras.dias_cubre_maximo` | 365 días | Lo más que puede cubrir un pedido |

Usa también `compras.precio_max_centavos` ([proveedores y precios](proveedores-y-precios.md#parámetros)) y `general.largo_minimo_motivo`.

## Permisos

- Todo lo de este archivo: Compras.
- Los materiales los leen también Patronaje (sus recetas), Bodega y Aduana (sus existencias, sin costos) y la tablet (los consumibles, arriba).

## Eventos

`material.creado` · `material.cambiado`.

## Lo que llega después

- **Fase 12:** la tablet usa los consumibles en «Tomar consumible», con su unidad de la tablet (ver [material en bodega](../inventario/material-en-bodega.md)), y con ella llega la lectura `compras.datos_materiales`.
- **Fase 14:** la carga inicial de lo que hay hoy de cada material (ver [conteos](../inventario/conteos.md)).

## Cómo está hecho

**Fase 10, parte 1.**

- **La tabla** `materiales` está en `modulos/compras/tablas.ts` (migración `0032`), con sus CHECK: la tela en `m`, cada unidad de conversión con su factor y la de la tablet solo en un consumible. La misma migración pone las llaves de `materiales.id` que dejó pendientes el inventario (`movimiento_lineas`, `existencias_material` y `traspaso_lineas`).
- **La lista «Unidades de material»** la siembra `modulos/compras/siembra.ts`, con sus seis unidades; solo la dueña agrega (decisión 516).
- **Las acciones** (`acciones/materiales.ts`):
  - `crear_material` revisa el costo y los días contra los parámetros, la unidad en la lista y la conversión; toma el proveedor compartido y deja el material, su par y el primer precio en una transacción.
  - `guardar_material` compara lo que llegó con lo guardado (los enteros como `numeric` con tres decimales) y escribe un renglón de bitácora por campo.
  - `dar_baja_material` revisa también las recetas vigentes con `patronaje.recetas_con_material` (`material_en_receta`, desde la parte 2). Bloquea el material antes de leer su existencia: un movimiento a medias que lo usa comparte su renglón por la llave foránea, así que la baja espera a que termine y ve lo que dejó (decisión 515). La existencia, por ubicación, la da `inventario.existencia_material` (decisión 513).
  - `reactivar_material` revisa que su proveedor habitual siga activo.
- **Lo que baja** está en `modulos/compras/bajada.ts`: los consumibles activos con `nombre`, `unidad`, `unidad_tablet` y `factor_tablet` (que baja como número).
- **Quién lee** cada tabla, para los avisos en vivo, está en `permisos.ts`: los precios, solo Compras y Contaduría.
- **Pruebas:** `acciones/crear-material.prueba.ts`, `dar-baja-material.prueba.ts`, `reactivar-material.prueba.ts` y `bajada.prueba.ts`. Las del inventario que movían material usan materiales de verdad (`materialesDePrueba`).
