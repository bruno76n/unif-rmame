# Conteos y carga inicial

> **Qué cubre:** el conteo ciego de Bodega y de Aduana (por sección o de una diferencia), con lo que decía el sistema a la hora de contar y el ajuste que pide si no cuadra; y la carga inicial: la existencia de arranque de las prendas y del material.
> **Estado:** Decidido.
> **Se construye en:** [fase 14 ●](../../fases/14-inventario-recepcion-del-taller-conteos-ajustes-y-reabasto.md).
> **Se conecta con:** [libro de movimientos](libro-de-movimientos.md) · [diferencias, ajustes y mermas](diferencias-ajustes-y-mermas.md) · [existencias y cuadre](existencias-y-cuadre.md) · [material en bodega](material-en-bodega.md) · [entregas a corte](entregas-a-corte.md) · [excepciones](excepciones.md) · [autorizaciones](../direccion/autorizaciones.md) · [escuelas y secciones](../catalogo/escuelas-y-secciones.md) · [materiales](../compras/materiales.md) · [proveedores y precios](../compras/proveedores-y-precios.md) · [folios](../admin/folios.md) · [respaldos](../admin/respaldos.md) · [migración](../../MIGRACION.md) · [pantallas de Bodega](../../interfaz/fabrica/bodega.md) · [pantallas de Administración del sistema](../../interfaz/fabrica/administracion.md) · [pantallas de Catálogo](../../interfaz/fabrica/catalogo.md) · [pantallas de Compras](../../interfaz/fabrica/compras.md) · [pantallas de Dirección](../../interfaz/fabrica/direccion.md) · [pantallas de Ventas a externos](../../interfaz/fabrica/ventas.md)

## Para qué sirve

Lo que dice el sistema se compara con lo que hay, sin pisar lo que pasó mientras se contaba. Ejemplo: Bodega cuenta la sección Playeras a las 10:00 y guarda a las 10:40; a las 10:20 surtió 4 playeras polo talla 10. El sistema decía 30 a las 10:00 y Bodega contó 28: el CN-024 guarda «sistema 30, contado 28» y pide el AJ-0046 por −2. Cuando Dirección lo autoriza salen 2 y quedan 24, lo que de verdad hay. Contra la existencia de las 10:40 (26), el ajuste habría metido 2 que no existen.

## Reglas

1. **Ciego:** quien cuenta no ve lo que dice el sistema. Se cuenta por sección (`nuevo`) o una DF- que está por contar (`diferencia`), en Bodega o en Aduana.
2. **Lo que decía el sistema** se calcula al guardar, con la hora del conteo: la existencia de esa ubicación y esa variante con los movimientos que pasaron hasta `contado_en` (ver [libro de movimientos](libro-de-movimientos.md#reglas), regla 8). Se guarda y no cambia.
3. **Si no cuadra, nace un AJ-** con un renglón por variante que no cuadró, con su motivo de la lista «Motivos de ajuste», y espera a Dirección. La existencia no cambia hasta que se autoriza (ver [diferencias, ajustes y mermas](diferencias-ajustes-y-mermas.md)).
4. **Un conteo cierra las DF- que están por contar** en esa ubicación y esa variante, sean del conteo o no: si cuadró, quedan resueltas; si no, esperan con el AJ-.
5. **Solo prendas.** El material no se cuenta: su existencia se corrige con sus DF-.
6. **La carga inicial** es la existencia de arranque: entra como `carga_inicial`, sin AJ-, y solo donde esa variante (o ese material) no tiene movimientos todavía. Después, todo cambio va por conteo y ajuste, o por las DF- del material.
7. **La carga inicial del material:** la tela por rollo, cada uno con su folio R-, marcado de carga inicial y con el costo de su tela (ver [proveedores y precios](../compras/proveedores-y-precios.md#el-costo-de-un-material)); si no se dan los rollos, nace uno solo con toda la cantidad. La partida, si se da, es del proveedor habitual de la tela. Los avíos van por cantidad a Bodega, y los consumibles a `inventario.ubicacion_consumibles`. Una cantidad en 0 no mueve nada.

## Estados

| De | A | Qué pasa | Quién |
|---|---|---|---|
| — | `contado` | «Guardar conteo», «Guardar y pedir ajuste» o la carga inicial | Bodega o Aduana |
| — | `pedido` | Con el POS: «Pedir conteo a una tienda», con qué, dónde buscar, por qué y para cuándo | Bodega |
| `pedido` | `contado` | Con el POS: la tienda manda su conteo | La caja |
| `pedido` | `cancelado` | Con el POS: Bodega lo cancela | Bodega |

## La tabla `conteos`

| Columna | Tipo | Nulo | Qué es |
|---|---|---|---|
| `id` | uuid | no | Llave. Con el POS, si nace en la caja, el id que hizo el aparato |
| `folio` | text | no | CN-024 (contador `conteo`): los que nacen en el servidor, también el que Bodega le pide a una tienda. El propio de una tienda, que nace en su caja, CN-T1-007. Único |
| `tipo` | text | no | CHECK (`nuevo`, `diferencia`, `inicial`, `pedido_tienda`, `propio_tienda`). Los dos de tienda, con el POS |
| `ubicacion_id` | uuid | no | → `ubicaciones.id`. `nuevo`, `diferencia` e `inicial`: Bodega o Aduana |
| `alcance` | text | sí | CHECK (`prenda`, `seccion`, `toda`). Lleno en `inicial` |
| `producto_id` | uuid | sí | → `productos.id`. CHECK: lleno con alcance `prenda` |
| `seccion_id` | uuid | sí | → `secciones.id`. CHECK: lleno en `nuevo` y con alcance `seccion` |
| `diferencia_id` | uuid | sí | → `diferencias.id`. CHECK: lleno en `diferencia` |
| `estado` | text | no | CHECK (`pedido`, `contado`, `cancelado`). default `contado` |
| `contado_en` · `contado_por` | timestamptz · uuid | sí | La hora real del conteo y quién. CHECK: llenos en `contado` |
| `donde_buscar` · `por_que` · `para_cuando` · `pedido_en` · `pedido_por` | | sí | Con el POS: el conteo que Bodega le pide a una tienda. Qué contar es su `producto_id` con las tallas de `conteo_tallas_pedidas`. CHECK: llenos en `pedido_tienda` |
| `dispositivo_id` · `persona_id` | uuid | sí | Con el POS: la caja y quién contó |
| `cancelado_en` · `cancelado_por` · `motivo_cancelacion` | | sí | Con el POS |

Lleva las columnas comunes (ver [base de datos](../../cimientos/BASE-DE-DATOS.md#columnas-comunes)). **Índices:** único (`folio`) · (`ubicacion_id`, `contado_en` desc) · (`diferencia_id`).

## La tabla `conteo_tallas_pedidas`

Con el POS: las tallas exactas que Bodega le pide contar a una tienda. La caja arma con ellas la lista del conteo ciego y avisa lo que no es parte del conteo.

| Columna | Tipo | Nulo | Qué es |
|---|---|---|---|
| `id` | uuid | no | Llave |
| `conteo_id` | uuid | no | → `conteos.id`, de tipo `pedido_tienda` |
| `variante_id` | uuid | no | → `variantes.id`, del producto del conteo. Único con `conteo_id` |

Lleva las columnas comunes.

## La tabla `conteo_lineas`

Lo que decía el sistema y lo que se contó, congelado al contar.

| Columna | Tipo | Nulo | Qué es |
|---|---|---|---|
| `id` | uuid | no | Llave |
| `conteo_id` | uuid | no | → `conteos.id` |
| `variante_id` | uuid | no | → `variantes.id`. Único con `conteo_id` |
| `piezas_sistema` | integer | no | Lo que decía el libro a la hora del conteo (regla 2); en la carga inicial, 0 |
| `piezas_sistema_aparato` | integer | sí | Con el POS: lo que decía la caja. Si no es igual, la excepción `conteo_no_coincide` (ver [excepciones](excepciones.md)) |
| `piezas_contadas` | integer | no | CHECK ≥ 0 |
| `diferencia` | integer | no | Generada: contadas − sistema |

Lleva las columnas comunes. **Índices:** (`conteo_id`) · (`variante_id`).

## Acciones

Todas son de la web.

### `inventario.guardar_conteo`

| | |
|---|---|
| **Pantalla** | Bodega · cajón Nuevo conteo o Conteo de diferencia · «Guardar conteo», o «Guardar y pedir ajuste» si hay diferencias. Se abre con «Nuevo conteo» en Conteos y ajustes, o con «Contar» en Pendientes o en Diferencias |
| **Quién** | Bodega, en Bodega o en Aduana; Aduana, solo en Aduana |
| **Recibe** | `ubicacion_id` (Bodega o Aduana)<br>`seccion_id`, en un conteo nuevo · `diferencia_id` y su `version`, en el de una diferencia<br>`contado_en`, opcional: si no viene, ahora<br>`renglones`: al menos uno, con `variante_id` y `piezas` (entero de 0 a 9999)<br>`motivo_id`, de «Motivos de ajuste», obligatorio si hay diferencias · `motivo_texto`, opcional, hasta 200 |
| **Reglas y errores** | `400`: «Elige la sección que vas a contar.» · «Cuenta al menos una prenda.» · «La hora del conteo no puede ser después de ahora.» · en `motivo_id`: «Todo ajuste necesita motivo» (también como mensaje)<br>`422 ubicacion_no_contable`: «Aquí solo se cuenta en Bodega o en Aduana.» (el de una diferencia, donde está la diferencia)<br>`422 variante_ajena`: «{prenda} talla {t} no es de {sección}.» (o de la diferencia)<br>`422 diferencia_no_por_contar`: «{DF} ya no está por contar.» |
| **Escribe** | El conteo, `contado`, con su hora, quién y su sección o su diferencia. Sus renglones, con lo que decía el sistema (regla 2) y lo contado. Si hay diferencias: el AJ- `esperando_autorizacion`, origen `conteo`, en esa ubicación, con su motivo y un renglón por variante que no cuadró (sistema, contado y diferencia). Las DF- de la regla 4: `resuelta` (`cuadro`) con el conteo, o `esperando_autorizacion` con el AJ-. Ningún movimiento |
| **Llama** | `admin.tomar_folio` (`conteo` y, si hay diferencias, `ajuste`) · `direccion.pedir_autorizacion`, si hay diferencias: tipo `ajuste_inventario`, con el AJ-: «Ajuste {AJ} en {ubicación}: {n} diferencia(s)» |
| **Regresa** | Sin diferencias: «{CN}: {n} prenda(s) contada(s), todo cuadra»; el de una diferencia, «{DF} aclarada: el conteo cuadra con el sistema». Con diferencias: «{AJ}: 1 diferencia espera autorización de Dirección» o «{AJ}: {n} diferencias esperan autorización de Dirección» |
| **Eventos** | `conteo.guardado` · `ajuste.pedido`, si hubo · `diferencia.resuelta`, si cuadró |
| **Bitácora** | «Contó {sección} en {ubicación}» o «Contó {DF}», con las variantes, lo que decía el sistema y lo contado |

### `inventario.registrar_carga_inicial`

| | |
|---|---|
| **Pantalla** | Bodega · Conteos y ajustes · «Carga inicial» → cajón Carga inicial → «Registrar carga inicial» (pantalla nueva). Con el POS, el inventario inicial de la caja |
| **Quién** | Bodega |
| **Recibe** | `ubicacion_id` (Bodega o Aduana) · `alcance` (`prenda` con `producto_id`, `seccion` con `seccion_id`, o `toda`) · `contado_en`, opcional · `renglones`: al menos uno, con `variante_id` y `piezas` (entero ≥ 0) |
| **Reglas y errores** | `400`: «Cuenta al menos una prenda.» · «La hora del conteo no puede ser después de ahora.»<br>`422 ubicacion_no_contable`, como arriba<br>`422 variante_ajena`: la variante no es del alcance<br>`422 ya_tiene_movimientos`: «{prenda} talla {t} ya tiene movimientos en {ubicación}: usa un conteo.» |
| **Escribe** | El conteo `inicial`, `contado`, con su alcance; sus renglones con 0 en el sistema. El movimiento `carga_inicial`, de Fuera a la ubicación, con el conteo como documento, un renglón por variante con piezas. Ningún AJ-. Con el POS, la de una tienda sin caja pone su `ubicaciones.existencia_desde` |
| **Llama** | `admin.tomar_folio` (`conteo`) |
| **Regresa** | «{CN}: carga inicial de {n} piezas en {ubicación}» |
| **Eventos** | `conteo.guardado` |
| **Bitácora** | «Carga inicial en {ubicación}», con las variantes y sus piezas |

### `inventario.registrar_carga_inicial_material`

| | |
|---|---|
| **Pantalla** | Bodega · Materiales · «Carga inicial» → ventana → «Registrar carga inicial» |
| **Quién** | Bodega |
| **Recibe** | `material_id` · `cantidad` (≥ 0, en su unidad de inventario; entera si su unidad se cuenta entera) · `rollos`, opcional y solo en tela: cada uno con `metros` (> 0) y `partida` (opcional, de 1 a 20 letras) |
| **Reglas y errores** | `400`: «Escribe lo que contaste, puede ser 0.» · «Número entero» · «Los rollos suman {m} m y escribiste {n} m.» · «Solo la tela lleva rollos.» · «{material} no tiene proveedor habitual: carga sus rollos sin partida.»<br>`422 ya_tiene_carga_inicial`: «{material} ya tiene carga inicial o movimientos.» |
| **Escribe** | En tela: los rollos con su folio R-, `disponible`, `es_carga_inicial`, su costo y su partida (nace en `partidas_tela` si no existía, con el proveedor habitual). El movimiento `carga_inicial`, de Fuera a Bodega (un consumible, a `inventario.ubicacion_consumibles`): un renglón por rollo o uno por la cantidad; su documento es el propio movimiento. Con 0, nada |
| **Llama** | `compras.datos_materiales` · `compras.costo_material` (el costo de los rollos) · `admin.tomar_folio` (`rollo`, `partida`) · `inventario.recalcular_rollos_sugeridos`, en tela |
| **Regresa** | «{material}: carga inicial de {cantidad} en bodega» |
| **Eventos** | `carga_inicial.material` · `rollo.recibido`, uno por rollo: su etiqueta queda por imprimir |
| **Bitácora** | «Carga inicial de {material}», con la cantidad y los rollos |

## Parámetros

Ninguno propio en la primera versión.

## Permisos

- Contar: Bodega, en Bodega o en Aduana; Aduana, en Aduana.
- La carga inicial: Bodega.
- Nada de esto regresa precios ni costos: el costo de un rollo de carga inicial lo pone el servidor.

## Eventos

`conteo.guardado` · `carga_inicial.material`.

## Lo que llega después

- **Fase 19:** Conteos y ajustes, los cajones de conteo y las ventanas de carga inicial de Bodega.
- **Fase 23:** la migración carga la existencia de hoy con estas mismas acciones (ver [migración](../../MIGRACION.md)).
- **Con el POS:** el conteo de cada tienda (el suyo y el que pide Bodega, con `inventario.dias_para_cuando_conteo`), su AJ- con el motivo «Diferencia en conteo de tienda» y la excepción `conteo_no_coincide`; la carga inicial de una tienda; y los conteos de cada tienda, que bajan a su caja.

## Cómo está hecho

**Fase 14, parte 1.** `inventario.guardar_conteo` vive en `modulos/inventario/acciones/guardar-conteo.ts` (contrato en `packages/compartido/src/contratos/inventario/diferencias.ts`), con las tablas `conteos` y `conteo_lineas` de la migración `0045` (`conteo_lineas` solo crece y su diferencia es columna generada).

- **Quién:** el contrato pide Bodega o Aduana (decisión 632); dentro, una cuenta sin Bodega que cuenta en Bodega recibe `403 sin_departamento`. Solo se cuenta en Bodega o Aduana (`ubicacion_no_contable`).
- **Sin versión:** el conteo es un documento nuevo; la DF- que se cuenta la cuidan su candado y su estado (decisión 633).
- **Lo que decía el sistema** sale del libro con `ocurrido_en` hasta `contado_en`; `contado_en` nunca es después de ahora.
- **Si no cuadra,** pide el motivo de la lista y el AJ- de origen `conteo` con un renglón por variante (sistema, contado y diferencia, ligado a su renglón del conteo), con `pedirAjuste`.
- **Regla 4:** después de tomar el candado de las variantes, bloquea las DF- por contar de esa ubicación y esas variantes: las que cuadraron quedan `resuelta` (`cuadro`) con el conteo; las otras, `esperando_autorizacion` con el AJ-.
- **Pruebas:** `acciones/guardar-conteo.prueba.ts` (movimientos antes y después de la hora del conteo, el AJ- y su autorización, las DF- que cierra, el conteo de una DF-, quién cuenta y dónde, los `400`).
