# Proveedores y precios de compra

> **Qué cubre:** los proveedores y su ficha ligada al tercero, qué materiales surte cada uno y su último precio, el proveedor habitual, el historial de precios de compra donde la nota del proveedor manda, el plazo real de cada proveedor y el costo de un material.
> **Estado:** Decidido.
> **Se construye en:** [fase 10](../../fases/10-patronaje-y-compras.md).
> **Se conecta con:** [materiales](materiales.md) · [órdenes de compra](ordenes-de-compra.md) · [proyección de material](proyeccion-de-material.md) · [terceros y deudas](../contaduria/terceros-y-deudas.md) · [facturas de proveedor](../contaduria/facturas-de-proveedor.md) · [material en bodega](../inventario/material-en-bodega.md) · [recepciones en aduana](../inventario/recepciones-en-aduana.md) · [lotes](../produccion/lotes.md) · [migración](../../MIGRACION.md) · [pantallas de Compras](../../interfaz/fabrica/compras.md) · [conteos y carga inicial](../inventario/conteos.md)

## Para qué sirve

Un material se puede comprar a varios proveedores; uno es el habitual: el que sugiere Por pedir y con cuyo plazo se calcula cuándo pedir. El precio no se amarra: se escribe al levantar la orden, se congela al enviarla y, si la nota del proveedor cobra otro, manda la nota. Cada precio queda en un historial que solo crece.

Ejemplo de la muestra: Textiles Aurora, de León, surte gabardinas y popelinas lisas, a crédito de 30 días. Dice que tarda 12 días, pero sus entregas tardaron 14 en promedio: Por pedir calcula con 14 y Proveedores lo marca fuera de plazo. La gabardina azul marino se la compramos a $78 el metro. Si la siguiente orden dice $84, al enviarla queda en el historial «antes $78»; si después la nota cobra $82, el precio de esa línea pasa a $82 «según la nota».

## Reglas

1. **El proveedor cuelga de su tercero.** Su nombre y su RFC viven en la ficha común de Contaduría, que puede ser también cliente o acreedor (ver [terceros y deudas](../contaduria/terceros-y-deudas.md)); las acciones de Compras los leen con `contaduria.datos_terceros`. Aquí van su ciudad, su teléfono, su condición de pago, lo que dice que tarda y lo que surte. Si el nombre de un proveedor nuevo ya es un tercero que no es proveedor (un cliente, por ejemplo), se liga a esa ficha en lugar de crear otra.
2. **Nombre único** entre los proveedores, sin importar acentos ni mayúsculas: lo cuida la ficha del tercero.
3. **La condición de pago** es `dias_credito`: 0 es «Contado»; otro número, «Crédito {n} días». Se copia a la orden al enviarla, así que un cambio vale para las órdenes que se envíen después. Contaduría la usa para el vencimiento de la factura.
4. **Lo que dice que tarda** va de 1 a `compras.dias_dice_tardar_maximo` (90) días. Con él se propone la fecha prometida de sus órdenes y se mide si una entrega llegó a tiempo.
5. **El plazo real** es el promedio redondeado de los días de cada entrega: el día de la recepción menos el día en que se envió su orden. Cada recepción cuenta como una entrega, así que una orden que llega en partes cuenta varias veces y una entrega incompleta sí castiga el plazo. Sin entregas, el plazo real es lo que dice que tarda.
6. **A tiempo y fuera de plazo.** Una entrega llegó a tiempo si tardó lo que el proveedor dice hoy que tarda, o menos. El proveedor está fuera de plazo si su plazo real es mayor que lo que dice.
7. **Varios proveedores por material, uno habitual.** El habitual tiene que estar entre los que lo surten y no puede dejar de surtirlo. Al levantar una orden se puede comprar a otro, también a uno que nunca lo ha surtido: al enviarla, queda entre los que lo surten.
8. **El precio no se amarra.** Se escribe al levantar la orden o en el borrador, sin autorización; se congela al enviarla; y si la nota del proveedor cobra otro, manda la nota. Un cambio de `compras.umbral_cambio_precio_pct` (15 %) o más contra el precio anterior se marca en ámbar: solo marca, no detiene nada.
9. **El historial de precios solo crece.** Nace un renglón con el alta del material, al agregar un proveedor a un material, al enviar una orden (por cada línea cuyo precio es distinto del último con ese proveedor, o es el primero con él) y al capturar la nota (por cada línea que cobró otro precio). El último precio de cada proveedor con cada material es una copia del renglón más nuevo de ese par, escrita en la misma transacción.
10. **Precios por unidad de inventario,** en centavos, mayores que 0 y hasta `compras.precio_max_centavos` ($99,999.99). Aceptan centavos: un botón cuesta $0.38.
11. **Las bajas no borran.** Un proveedor se da de baja sin órdenes en borrador, enviadas ni recibidas en parte, y sin ser el habitual de ningún material; su tercero no cambia. Un proveedor deja de surtir un material si no es el habitual y el material no está en un borrador con él. El historial de precios se queda.

## El costo de un material

- **Avíos y consumibles:** el precio vigente de su línea en la orden enviada más reciente (por la hora de envío) que no esté cancelada, con cualquier proveedor. El precio vigente de una línea es el de la nota, si la nota cobró otro, o el de la orden. Sin órdenes, el precio del alta.
- **Tela:** cada rollo guarda como costo el precio vigente de su línea, y la nota lo corrige en todos los rollos de esa línea (ver [material en bodega](../inventario/material-en-bodega.md)). El costo del material es el mismo de arriba y sirve para la lista de Materiales.
- **No es un promedio:** la tela va al costo de cada rollo, y los avíos y los consumibles, a su última compra.

## La tabla `proveedores`

| Columna | Tipo | Nulo | Qué es |
|---|---|---|---|
| `id` | uuid | no | Llave (v7) |
| `tercero_id` | uuid | no | → `terceros.id`. Único. Ahí viven su nombre y su RFC |
| `ciudad` | text | no | De 2 a 60 |
| `telefono` | text | no | Los 10 dígitos, sin espacios. La pantalla lo muestra «33 5550 0178» |
| `dias_credito` | integer | no | CHECK ≥ 0. 0 = contado |
| `dias_dice_tardar` | integer | no | CHECK > 0. El plazo real se calcula (regla 5) |
| `surte` | text | sí | «Qué surte», en texto. Hasta 120 |
| `baja_en` · `baja_por` · `motivo_baja` · `reactivado_en` | | sí | |

Lleva las columnas comunes (ver [base de datos](../../cimientos/BASE-DE-DATOS.md#columnas-comunes)). **Índice:** único (`tercero_id`).

## La tabla `material_proveedores`

Qué proveedores surten cada material, con su último precio. Es parte del material: agregar, quitar o hacer habitual un proveedor sube la `version` del material (ver [idempotencia y concurrencia](../../cimientos/IDEMPOTENCIA-Y-CONCURRENCIA.md#que-nadie-pise-a-nadie)).

| Columna | Tipo | Nulo | Qué es |
|---|---|---|---|
| `id` | uuid | no | Llave |
| `material_id` | uuid | no | → `materiales.id` |
| `proveedor_id` | uuid | no | → `proveedores.id` |
| `ultimo_precio_centavos` | bigint | no | CHECK > 0. Por unidad de inventario. Copia del renglón más nuevo del historial de este par |
| `baja_en` · `baja_por` · `motivo_baja` · `reactivado_en` | | sí | «Ya no lo surte». El habitual no se da de baja |

Lleva las columnas comunes. **Índices:** único (`material_id`, `proveedor_id`) · (`proveedor_id`). «Última compra {fecha}» no se guarda: es el día de envío de la orden más reciente de ese par.

## La tabla `precios_compra`

El historial de precios de compra. **Solo crece:** el rol de la app no puede cambiar ni borrar un renglón (ver [base de datos](../../cimientos/BASE-DE-DATOS.md)).

| Columna | Tipo | Nulo | Qué es |
|---|---|---|---|
| `id` | uuid | no | Llave |
| `material_id` | uuid | no | → `materiales.id` |
| `proveedor_id` | uuid | no | → `proveedores.id` |
| `precio_centavos` | bigint | no | CHECK > 0. Por unidad de inventario |
| `origen` | text | no | CHECK (`alta`, `proveedor_agregado`, `orden`, `nota`): «alta», «al agregar al proveedor», «en la orden», «según la nota» |
| `orden_compra_id` · `orden_compra_linea_id` | uuid | sí | → `ordenes_compra.id` · `orden_compra_lineas.id`. CHECK: llenos si y solo si el origen es `orden` o `nota` |
| `precio_anterior_centavos` | bigint | sí | Contra qué se compara: en `orden` y `proveedor_agregado`, el último con ese proveedor; en `nota`, el que tenía la línea. Nulo si no hay |
| `cambio_porcentaje` | numeric(6,3) | sí | (precio − anterior) ÷ anterior × 100. Nulo sin anterior. La marca ámbar se calcula contra el parámetro; no se guarda |
| `fecha` | date | no | Día de negocio |

Lleva las columnas comunes; `creado_por` es quien puso el precio. **Índices:** (`material_id`, `creado_en` desc) · (`material_id`, `proveedor_id`, `creado_en` desc).

## Acciones

Todas son de la web, con el departamento Compras.

### `compras.crear_proveedor`

| | |
|---|---|
| **Pantalla** | Compras · Proveedores · «Nuevo proveedor» → ventana · «Agregar proveedor» |
| **Recibe** | `nombre` · texto · de 3 a 80 · obligatorio<br>`ciudad` · texto · de 2 a 60 · obligatorio<br>`telefono` · texto · obligatorio (se guardan sus 10 dígitos)<br>`dias_credito` · entero ≥ 0 · obligatorio<br>`dias_dice_tardar` · entero · obligatorio<br>`surte` · texto · hasta 120 · opcional<br>`rfc` · 12 o 13 letras y números · opcional |
| **Reglas y errores** | `400`: «Escribe el nombre del proveedor» · «Escribe la ciudad» · «Escribe el teléfono a 10 dígitos» · «Entre 1 y 90 días» (hasta `compras.dias_dice_tardar_maximo`) · «El RFC lleva 12 o 13 letras y números»<br>`422 proveedor_repetido`: «Ya existe un proveedor con ese nombre» |
| **Escribe** | Llama `contaduria.crear_tercero` con rol `proveedor`, el nombre, el RFC y `ligar_si_existe`: si ya hay un tercero con ese nombre que no es proveedor, prende su rol de proveedor en esa misma ficha; si ya es proveedor, es `proveedor_repetido`. Después, el proveedor con su `tercero_id`, sin entregas |
| **Regresa** | `proveedor_id`. «{nombre} ya está en Proveedores». Si se ligó, además: «Se ligó a la ficha de {nombre} que ya existía en Contaduría.» |
| **Eventos** | `proveedor.creado` |
| **Bitácora** | «Proveedor nuevo: {proveedor}, {ciudad}» |

### `compras.guardar_proveedor`

| | |
|---|---|
| **Pantalla** | Cajón Proveedor · «Guardar» |
| **Recibe** | `proveedor_id` · `version` · y, solo lo que cambia: `nombre`, `rfc`, `ciudad`, `telefono`, `dias_credito`, `dias_dice_tardar` y `surte` |
| **Reglas y errores** | `400`: los mismos del alta<br>`422 proveedor_repetido`: «Ya existe un proveedor con ese nombre»<br>`422 sin_cambios`: «Sin cambios» |
| **Escribe** | Lo que cambió. Si cambió el nombre o el RFC, llama `contaduria.renombrar_tercero` (su `nombre_repetido` sale como `proveedor_repetido`). Un cambio de condición vale para las órdenes que se envíen después. Un cambio de lo que dice que tarda cambia cuáles de sus entregas fueron a tiempo y la fecha que se propone al enviar sus órdenes; si tiene entregas, su plazo real no cambia |
| **Regresa** | «{proveedor}: ahora dice que tarda {n} días», o «Cambios guardados en {proveedor}» si cambió otra cosa |
| **Eventos** | `proveedor.cambiado` |
| **Bitácora** | Un renglón por campo: «{proveedor}: {campo} {antes} → {después}» |

### `compras.dar_baja_proveedor`

| | |
|---|---|
| **Pantalla** | Cajón Proveedor · «Dar de baja» (pantalla nueva) |
| **Recibe** | `proveedor_id` · `motivo` (al menos `general.largo_minimo_motivo`, 5 letras) · `version` |
| **Reglas y errores** | `400`: «Escribe al menos 5 letras.»<br>`422 proveedor_con_ordenes`: «{proveedor} tiene órdenes abiertas: {OC}. Termínalas o cancélalas antes.» (en borrador, enviadas o recibidas en parte)<br>`422 proveedor_habitual_de`: «{proveedor} es el habitual de {material}[ y {n} más]: haz habitual a otro antes.» |
| **Escribe** | `baja_en`, `baja_por` y `motivo_baja`. Su tercero no cambia: puede ser cliente |
| **Regresa** | «{proveedor} dado de baja» |
| **Eventos** | `proveedor.cambiado` |
| **Bitácora** | «Dio de baja {proveedor}: {motivo}» |

### `compras.reactivar_proveedor`

| | |
|---|---|
| **Pantalla** | Compras · Proveedores · dados de baja · «Reactivar» (pantalla nueva) |
| **Recibe** | `proveedor_id` · `version` |
| **Reglas y errores** | `422 proveedor_activo`: «{proveedor} ya está activo.» |
| **Escribe** | Limpia la baja y pone `reactivado_en` |
| **Regresa** | «{proveedor} vuelve a estar activo» |
| **Eventos** | `proveedor.cambiado` |
| **Bitácora** | «{proveedor} vuelve a estar activo» |

### `compras.agregar_proveedor_material`

| | |
|---|---|
| **Pantalla** | Cajón Material · «Agregar proveedor» → ventana «Otro proveedor para {material}» · «Agregar» |
| **Recibe** | `material_id` · `proveedor_id` · `precio_centavos` (por unidad de inventario) · `version` del material |
| **Reglas y errores** | `400`: «Escoge el proveedor.» · «Escribe el precio.»<br>`422 ya_lo_surte`: «{proveedor} ya surte {material}.»<br>`422 proveedor_dado_de_baja`: «{proveedor} está dado de baja.» |
| **Escribe** | El renglón del par, nuevo o reactivado si lo había dejado de surtir, con ese precio como último; y el precio en el historial, con origen `proveedor_agregado` |
| **Regresa** | «{proveedor} ya surte {material}» |
| **Eventos** | `material.cambiado` |
| **Bitácora** | «{proveedor} surte {material} a ${precio}» |

### `compras.quitar_proveedor_material`

| | |
|---|---|
| **Pantalla** | Cajón Material · «Proveedores» · «Ya no lo surte» (pantalla nueva) |
| **Recibe** | `material_id` · `proveedor_id` · `motivo` (al menos 5 letras) · `version` del material |
| **Reglas y errores** | `400`: «Escribe al menos 5 letras.»<br>`422 proveedor_habitual`: «{proveedor} es el habitual de {material}: haz habitual a otro antes de quitarlo.»<br>`422 en_borrador`: «{material} está en el borrador {OC} con {proveedor}: descártalo o cámbialo antes.» |
| **Escribe** | La baja del renglón del par. El historial de precios se queda |
| **Regresa** | «{proveedor} ya no surte {material}» |
| **Eventos** | `material.cambiado` |
| **Bitácora** | «{proveedor} ya no surte {material}: {motivo}» |

### `compras.hacer_habitual`

| | |
|---|---|
| **Pantalla** | Cajón Material · «Proveedores» · «Hacer habitual» |
| **Recibe** | `material_id` · `proveedor_id` · `version` del material |
| **Reglas y errores** | `422 no_lo_surte`: «{proveedor} no surte {material}: agrégalo primero.»<br>`422 ya_es_habitual`: «{proveedor} ya es el habitual de {material}.»<br>`422 proveedor_dado_de_baja`: «{proveedor} está dado de baja.» |
| **Escribe** | `materiales.proveedor_habitual_id`. Por pedir usa desde ahora su plazo real |
| **Regresa** | «{proveedor} es el proveedor habitual de {material}. El pedido sugerido usa su tiempo de entrega» |
| **Eventos** | `material.cambiado` |
| **Bitácora** | «{proveedor} pasa a ser el proveedor habitual de {material}» |

## Acciones internas

### `compras.registrar_precios_nota`

| | |
|---|---|
| **La llama** | Contaduría, al «Capturar nota o factura» (ver [facturas de proveedor](../contaduria/facturas-de-proveedor.md)) |
| **Recibe** | `orden_compra_id` · `lineas`: [{`orden_compra_linea_id`, `precio_centavos`}] |
| **Reglas** | `422 orden_no_enviada`: «{OC} no se ha enviado: no tiene nota que capturar.» (en borrador o cancelada) |
| **Escribe** | En cada línea con un precio distinto del vigente: `precio_nota_centavos`, `precio_nota_en` y `precio_nota_por` en la línea de la orden, que sube la versión de la orden; el precio en el historial, con origen `nota`; y el último precio de ese proveedor con ese material. Una línea con el mismo precio no cambia |
| **Regresa** | Las líneas que cambiaron, con su precio anterior y el nuevo |
| **Eventos** | `orden_compra.cambiada` |

La acción de Contaduría que la llama lleva, con el mismo `comando_id`, un renglón de bitácora por cada precio nuevo: «Precio de {material} con {proveedor}: ${antes} → ${nuevo} ({OC}, según la nota)».

## Lecturas

### `compras.costo_material(materiales)`

| | |
|---|---|
| **La usan** | Producción, para el costo del lote: los avíos a su última compra (ver [lotes](../produccion/lotes.md)); y las consultas de Compras |
| **Regresa** | Por material, su costo en centavos por unidad de inventario, con la regla de [arriba](#el-costo-de-un-material) |

## Parámetros

Los cambia solo la dueña, en Configuración (ver [configuración](../admin/configuracion.md)). Todos van en «Parámetros».

| Parámetro | Valor inicial | Para qué |
|---|---|---|
| `compras.dias_dice_tardar_maximo` | 90 días | Lo más que un proveedor puede decir que tarda |
| `compras.umbral_cambio_precio_pct` | 15 % | Desde cuánto cambio un precio nuevo sale en ámbar |
| `compras.precio_max_centavos` | $99,999.99 | El tope del costo y del precio de compra. Es otro que el tope de los precios de venta |

Usa también `general.largo_minimo_motivo`.

## Permisos

- Todo lo de este archivo: Compras.
- Los precios y el costo los reciben solo las cuentas con Compras o Contaduría: Aduana y Bodega nunca los reciben.
- Contaduría ve al proveedor en la ficha de su tercero.

## Eventos

`proveedor.creado` · `proveedor.cambiado` · `material.cambiado` · `orden_compra.cambiada`.

## Lo que llega después

- **Fase 11:** las entregas para el plazo real y las entregas a tiempo, con las recepciones de Aduana (`inventario.recibido_de_ordenes`); y la llamada de `compras.registrar_precios_nota` a `inventario.actualizar_costo_rollos`, porque la nota manda en el costo de los rollos de esa línea. Hasta entonces, todo proveedor está «Sin entregas todavía».
- **Fase 12:** Producción lee `compras.costo_material` para el costo del lote.
- **Fase 17:** lo demás de los terceros (su cajón en Contaduría, deudas y compensaciones). La tabla `terceros` y las dos internas que usa este archivo se construyen antes, en la [fase 10](../../fases/10-patronaje-y-compras.md).
- **Fase 17:** Contaduría llama `compras.registrar_precios_nota` al capturar la nota o factura, y vence la factura con la condición que se copió a la orden.
- **Fase 23:** los proveedores de hoy entran al arrancar (ver [migración](../../MIGRACION.md)).

## Cómo está hecho

**Fase 10, parte 1.**

- **Las tablas** `proveedores`, `material_proveedores` y `precios_compra` están en `modulos/compras/tablas.ts` (migración `0032`), con sus CHECK. `precios_compra` solo crece (`marcar_solo_crece`); sus llaves a las órdenes llevan `@llavePendiente` hasta la parte 4.
- **Lo común** (`dominio/comunes.ts`): `leerProveedor` bloquea el proveedor (`update` para cambiarlo, `share` para usarlo: nadie lo da de baja mientras se vuelve habitual) y trae su nombre y su RFC con `contaduria.datos_terceros`. `registrarPrecio` escribe el renglón del historial con su anterior y su cambio, y copia el precio como el último del par, que nace, se reactiva o se actualiza en la misma transacción. Un cambio de más de 999.999 % se guarda como 999.999, lo que cabe en `numeric(6,3)` (decisión 512).
- **Las acciones** (`acciones/proveedores.ts` y `acciones/proveedores-de-material.ts`), con sus contratos en `packages/compartido/src/contratos/compras/`:
  - `crear_proveedor` llama `contaduria.crear_tercero` con `ligar_si_existe`; su `rol_ya_existe` sale como `proveedor_repetido`, y el «Se ligó…» va en los avisos. El teléfono se guarda con sus 10 dígitos.
  - `guardar_proveedor` compara lo que llegó con lo guardado, escribe un renglón de bitácora por campo y llama `contaduria.renombrar_tercero` si cambió el nombre o el RFC (su `nombre_repetido` sale como `proveedor_repetido`).
  - `dar_baja_proveedor` mira solo los materiales activos de los que es habitual; uno ya dado de baja responde `proveedor_dado_de_baja` (decisión 520). El candado `proveedor_con_ordenes` llega con las órdenes (parte 4).
  - `agregar_proveedor_material`, `quitar_proveedor_material` y `hacer_habitual` toman la versión del material. El candado `en_borrador` llega con las órdenes.
- **La lectura** `compras.costo_material` (`lecturas/costo-material.ts`) regresa, por ahora, el precio del alta: las órdenes llegan en la parte 4 (decisión 521).
- **Los parámetros** están en `modulos/compras/parametros.ts`.
- **Pruebas:** `acciones/crear-proveedor.prueba.ts`, `guardar-proveedor.prueba.ts`, `dar-baja-proveedor.prueba.ts`, `quitar-proveedor-material.prueba.ts`, `hacer-habitual.prueba.ts`, `tablas.prueba.ts` (el historial que solo crece, el anterior y el cambio, el último precio del par) y `lecturas/costo-material.prueba.ts`. Las ayudas están en `nucleo/pruebas/compras-de-prueba.ts`, con una cuenta de prueba de Compras.
