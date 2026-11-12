# Material en bodega

> **Qué cubre:** la tela rollo por rollo, con su etiqueta R-, su partida P- y su costo; los retazos RZ- que sirven; los avíos por cantidad; y los consumibles que toma el taller.
> **Estado:** Decidido.
> **Se construye en:** [fase 11](../../fases/11-aduana-y-bodega.md).
> **Se conecta con:** [recepciones en aduana](recepciones-en-aduana.md) · [entregas a corte](entregas-a-corte.md) · [libro de movimientos](libro-de-movimientos.md) · [existencias y cuadre](existencias-y-cuadre.md) · [conteos](conteos.md) · [materiales](../compras/materiales.md) · [proveedores y precios](../compras/proveedores-y-precios.md) · [proyección de material](../compras/proyeccion-de-material.md) · [lotes](../produccion/lotes.md) · [registros de operación](../produccion/registros-de-operacion.md) · [etiquetas](../../impresos/etiquetas.md) · [pantallas de Bodega](../../interfaz/fabrica/bodega.md) · [corte y bultos](../produccion/corte-y-bultos.md) · [facturas de proveedor](../contaduria/facturas-de-proveedor.md) · [pantallas de Aduana](../../interfaz/fabrica/aduana.md) · [pantallas de Producción](../../interfaz/fabrica/produccion.md)

## Para qué sirve

La tela se sigue rollo por rollo, porque cada rollo tiene su tono y su costo; los avíos y los consumibles se cuentan por cantidad. Ejemplo de la muestra: en Bodega hay tres rollos de gabardina azul marino, R-0431 y R-0432 de la partida P-2224 (92 y 88.5 m) y R-0433 de la P-2231 (95 m). Cada uno sabe cuántos metros le quedan y dónde está, y su partida dice su tono: un corte que mezcla la P-2224 y la P-2231 avisa que el tono puede variar entre piezas. Del corte del L-2026-119 sobraron 4 m de piqué blanco que sirven: son el retazo RZ-012, que Bodega recibe y puede volver a entregar.

## Reglas

1. **La tela va por rollo.** Cada rollo nace con su folio R- al recibirlo en Aduana (ver [recepciones en aduana](recepciones-en-aduana.md)) o en la carga inicial. Dónde está y cuántos metros le quedan no se guardan en el rollo: salen de su existencia de material, la que lleva su `rollo_id` (ver [existencias y cuadre](existencias-y-cuadre.md)). Un rollo tiene metros en una sola ubicación; si no, el cuadre de la noche abre `rollo_en_dos_lugares`.
2. **La partida es el tono.** El código de la etiqueta del proveedor se guarda tal cual, en mayúsculas y sin revisar su forma, con un folio interno P-. Una partida es única por proveedor, material y código: la segunda vez que llega, se reusa. Un rollo de carga inicial puede no tener partida.
3. **El costo del metro** de un rollo es el precio vigente de su línea de la orden al recibirlo. Si la nota del proveedor cobra otro, la nota manda y el costo cambia en todos los rollos de esa línea. Solo lo reciben las cuentas con Compras o Contaduría; ninguna acción ni consulta de Inventario lo regresa.
4. **Los avíos y los consumibles** no llevan rollo: su existencia es una cantidad en su unidad de inventario, sin `rollo_id`.
5. **El retazo** es el mismo rollo cuando el corte dejó menos de `inventario.metros_frontera_rollo` (15 m) y no se marcó «Ya no sirve»: el rollo queda marcado como retazo y lleva además su folio RZ- y su etiqueta. Con la frontera o más, regresa como rollo; con menos y «Ya no sirve», es merma.
6. **Los consumibles que toma el taller** se descuentan de `inventario.ubicacion_consumibles` (Bodega, al inicio), aunque la tablet diga «Se descuenta del taller», con quién los tomó. Llegan en la unidad de la tablet y el servidor los pasa a la de inventario: cantidad ÷ factor de la tablet, a tres decimales, la mitad hacia arriba (3 agujas de una caja de 100 son 0.030 cajas). Lo que ya se tomó nunca se rechaza por existencia.
7. **La etiqueta de cada rollo:** los de un proveedor la llevan desde Aduana, que la imprime al despacharlos y la anota (ver [surtido y despachos](surtido-y-despachos.md)); los de la carga inicial y los retazos la sacan en PDF en Bodega. La del retazo es la de su rollo con su folio RZ-. Cómo se ve cada una está en [etiquetas](../../impresos/etiquetas.md).

## Estados del rollo

| De | A | Qué pasa | Quién |
|---|---|---|---|
| — | `disponible` | Se recibe en Aduana o en la carga inicial | Aduana; Bodega |
| `disponible` | `entregado` | «Entregar al corte», solo desde Bodega | Bodega |
| `entregado` | `agotado` | Al cerrar el corte: se usó completo, o lo que quedó «Ya no sirve» | Producción |
| `entregado` | `por_recibir` | Al cerrar el corte: quedó la frontera o más, quedó un retazo que sirve, o se entregó y no se usó. Está en el Taller hasta que Bodega lo recibe | Producción |
| `por_recibir` | `disponible` | «Recibir» en Bodega | Bodega |
| `disponible` | `devuelto` | Lo de más que Dirección rechazó sale al proveedor | Aduana |

**El retazo:** `por_recibir` (al cerrar el corte con «Sirve») → `recibido` («Recibir» en Bodega).

## La tabla `rollos`

| Columna | Tipo | Nulo | Qué es |
|---|---|---|---|
| `id` | uuid | no | Llave (v7) |
| `folio` | text | no | R-0431. Único |
| `material_id` | uuid | no | → `materiales.id`. Una tela |
| `partida_tela_id` | uuid | sí | → `partidas_tela.id`. Vacío solo en una carga inicial sin partida |
| `proveedor_id` | uuid | sí | → `proveedores.id` |
| `orden_compra_id` · `orden_compra_linea_id` | uuid | sí | La orden y su línea. Vacíos en la carga inicial |
| `recepcion_id` | uuid | sí | → `recepciones.id`. Vacío en la carga inicial |
| `metros_iniciales` | numeric(12,3) | no | CHECK > 0. Los metros marcados al recibirlo |
| `costo_metro_centavos` | bigint | sí | CHECK > 0. El costo del metro (regla 3) |
| `estado` | text | no | CHECK (`disponible`, `entregado`, `por_recibir`, `agotado`, `devuelto`) |
| `es_retazo` | boolean | no | default false. Verdadero desde que el corte lo dejó como retazo |
| `es_carga_inicial` | boolean | no | default false |
| `etiqueta_impresa_en` | timestamptz | sí | La última vez que Aduana imprimió su etiqueta. Vacío: no ha pasado por ahí |

Lleva las columnas comunes (ver [base de datos](../../cimientos/BASE-DE-DATOS.md#columnas-comunes)). **Índices:** único (`folio`) · (`material_id`, `estado`) · (`orden_compra_linea_id`). Con ella, `existencias_material.rollo_id` deja su `@llavePendiente`.

## La tabla `partidas_tela`

| Columna | Tipo | Nulo | Qué es |
|---|---|---|---|
| `id` | uuid | no | Llave |
| `folio` | text | no | P-2224. Único |
| `codigo_proveedor` | text | no | El de la etiqueta del proveedor, en mayúsculas. De 1 a 20 |
| `material_id` | uuid | no | → `materiales.id` |
| `proveedor_id` | uuid | no | → `proveedores.id` |
| `primera_recepcion_id` | uuid | sí | → `recepciones.id`. La primera vez que llegó |

Lleva las columnas comunes. **Índices:** único (`folio`) · único (`proveedor_id`, `material_id`, `codigo_proveedor`).

## La tabla `retazos`

Se construye en la [fase 12](../../fases/12-produccion.md), porque nace al cerrar un corte.

| Columna | Tipo | Nulo | Qué es |
|---|---|---|---|
| `id` | uuid | no | Llave |
| `folio` | text | no | RZ-012. Único. Es el folio de su etiqueta |
| `rollo_id` | uuid | no | → `rollos.id`. Único: el rollo que quedó como retazo |
| `corte_id` · `lote_id` | uuid | no | → `cortes.id` · `lotes.id`. De qué corte salió |
| `metros` | numeric(12,3) | no | CHECK > 0. Menos que la frontera |
| `estado` | text | no | CHECK (`por_recibir`, `recibido`) |
| `recepcion_id` | uuid | sí | → `recepciones.id`. Cuando Bodega lo recibió |

Lleva las columnas comunes.

## Acciones internas

### `inventario.actualizar_costo_rollos`

| | |
|---|---|
| **La llama** | `compras.registrar_precios_nota`, cuando la nota del proveedor cobra otro precio en una línea (ver [proveedores y precios](../compras/proveedores-y-precios.md#comprasregistrar_precios_nota)) |
| **Recibe** | `orden_compra_linea_id` · `costo_metro_centavos` |
| **Escribe** | El costo del metro de todos los rollos de esa línea, estén donde estén |

### `inventario.tomar_consumible`

| | |
|---|---|
| **La llama** | `produccion.tomar_consumible`, al aplicar lo que sube la tablet (ver [registros de operación](../produccion/registros-de-operacion.md)) |
| **Recibe** | `id` (el que hizo la tablet) · `renglones`: `material_id` y `cantidad`, ya en la unidad de inventario (regla 6) · `persona_id` · `dispositivo_id` · `ocurrido_en` |
| **Reglas** | `422 no_es_consumible`: un material no es consumible. Nunca rechaza por existencia |
| **Escribe** | El movimiento `consumible_tomado`, de `inventario.ubicacion_consumibles` a Fuera, un renglón por material, con la persona; su documento es `toma_consumible`, con el id de la tablet |
| **Llama** | `compras.datos_materiales` (que sea consumible) |
| **Regresa** | El movimiento |
| **Eventos** | `consumible.tomado`, con `existencias_material` entre sus tablas |

## El cuadre de la noche

Con los rollos se construye el paso 2 del cuadre: ningún rollo tiene metros en dos ubicaciones, y un rollo entregado o por recibir solo tiene metros en el Taller (ver [existencias y cuadre](existencias-y-cuadre.md#el-cuadre-de-la-noche)).

## Parámetros

Los cambia solo la dueña, en Configuración (ver [configuración](../admin/configuracion.md)). Todos van en «Parámetros».

| Parámetro | Valor inicial | Para qué |
|---|---|---|
| `inventario.ubicacion_consumibles` | Bodega | De dónde se descuenta lo que toma el taller |
| `inventario.metros_frontera_rollo` | 15 m | Desde aquí lo que queda del corte regresa como rollo; abajo, es retazo o merma. Lo usa también Producción en el corte |

## Permisos

- Los rollos, las partidas y los retazos los ven Aduana, Bodega, Compras, Producción (en el corte) y Dirección, sin el costo.
- El costo del metro, solo las cuentas con Compras o Contaduría, en sus propias consultas.

## Eventos

`consumible.tomado`. Los de recibir, entregar y regresar un rollo están en el archivo de cada acción.

## Lo que llega después

- **Fase 12:** la tabla `retazos`; entregar al corte, el corte y lo que regresa de él, con sus estados del rollo (ver [entregas a corte](entregas-a-corte.md)); y «Tomar consumible» desde la tablet.
- **Fase 14:** la carga inicial de rollos, avíos y consumibles (ver [conteos](conteos.md)).
- **Fase 17:** la nota del proveedor que corrige el costo de los rollos, al capturarla Contaduría.
- **Fase 20:** la etiqueta `rollo`, que es también la del retazo, y su PDF en Bodega (ver [etiquetas](../../impresos/etiquetas.md)).

## Cómo está hecho

**Fase 11, parte 1.**

- **Las tablas** `partidas_tela` y `rollos` están en `apps/api/src/modulos/inventario/tablas.ts` (migración `0036`), con sus CHECK: los metros y el costo mayores que 0, el estado, la partida (vacía solo en una carga inicial) y la orden, la línea y la recepción en todo rollo de proveedor; el código de la partida, de 1 a 20 y en mayúsculas. Con ellas, `existencias_material.rollo_id`, `movimiento_lineas.rollo_id` y `traspaso_lineas.rollo_id` ya son llaves.
- **Los rollos y las partidas nacen** al recibir (ver [recepciones en aduana](recepciones-en-aduana.md#cómo-está-hecho)): la partida se busca por proveedor, material y código con un candado por proveedor y material, y si no está nace con su folio P-.
- **`inventario.actualizar_costo_rollos`** (`internas/material.ts`) cambia el costo de todos los rollos de la línea; la llama `compras.registrar_precios_nota` por cada línea que cobró otro precio.
- **`inventario.tomar_consumible`** (`internas/material.ts`) revisa con `compras.datos_materiales` que cada material sea consumible (`no_es_consumible`), lo saca de la ubicación de `inventario.ubicacion_consumibles` (el tipo: `bodega`, `taller` o `aduana`, decisión 564) con el movimiento `consumible_tomado` y la persona, y usa el id de la tablet como clave: la misma toma no se repite (decisión 570). `compras.datos_materiales` se adelantó de la fase 12 para esto (decisión 563).
- **El paso 2 del cuadre** (`internas/correr-cuadre.ts`, `rollosEnUnLugar`) corre después del paso 1 y abre `rollo_en_dos_lugares` por rollo con metros en dos ubicaciones, o entregado o por recibir fuera del Taller, con dónde tiene metros.
- **Los parámetros** `inventario.ubicacion_consumibles` y `inventario.metros_frontera_rollo` (`parametros.ts`).
- **Pruebas:** `internas/actualizar-costo-rollos.prueba.ts`, `internas/tomar-consumible.prueba.ts` y el caso nuevo de `correr-cuadre.prueba.ts`. Las pruebas del libro que mueven tela por rollo crean rollos de carga inicial con `rollosDePrueba` (`nucleo/pruebas/compras-de-prueba.ts`); el cuadre al azar usa un rollo por ubicación (decisión 568).

**Fase 12, parte 3.** La tabla `retazos` (migración `0040`): nace al cerrar el corte con su folio RZ- (`inventario.registrar_corte`) y pasa a `recibido` con la recepción de Bodega (`inventario.recibir_del_corte`). Los rollos pasan por `entregado`, `agotado` y `por_recibir` con el corte (ver [entregas a corte](entregas-a-corte.md#cómo-está-hecho)).

**Fase 14, parte 3.** La partida de un código de un proveedor (`partidasDe`) vive en `dominio/partidas.ts`: la usan la recepción de proveedor y la carga inicial de tela, que crea sus rollos `disponible` y de carga inicial (ver [conteos](conteos.md#cómo-está-hecho)).
