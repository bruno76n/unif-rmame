# Diferencias, ajustes y mermas

> **Qué cubre:** la diferencia DF- que explica un hueco (lo que no llegó, lo que llegó de más, un avío que no alcanzó, un negativo del cuadre) y cómo se cierra; el ajuste AJ- que mueve la diferencia vista cuando Dirección lo autoriza; y la merma de producción que llega de la tablet.
> **Estado:** Decidido.
> **Se construye en:** [fase 14 ●](../../fases/14-inventario-recepcion-del-taller-conteos-ajustes-y-reabasto.md).
> **Se conecta con:** [libro de movimientos](libro-de-movimientos.md) · [existencias y cuadre](existencias-y-cuadre.md) · [traspasos](traspasos.md) · [recepciones en aduana](recepciones-en-aduana.md) · [surtido y despachos](surtido-y-despachos.md) · [recepción del taller](recepcion-del-taller.md) · [entregas a corte](entregas-a-corte.md) · [conteos](conteos.md) · [excepciones](excepciones.md) · [reservas](reservas.md) · [autorizaciones](../direccion/autorizaciones.md) · [configuración](../admin/configuracion.md) · [folios](../admin/folios.md) · [registros de operación](../produccion/registros-de-operacion.md) · [pantallas de Bodega](../../interfaz/fabrica/bodega.md) · [pantallas de Dirección](../../interfaz/fabrica/direccion.md) · [lo común de las pantallas](../../interfaz/comunes.md) · [pantallas de Aduana](../../interfaz/fabrica/aduana.md) · [flujo 08 · Diferencias y ajustes](../../flujos/fabrica/08-diferencias-y-ajustes.md)

## Para qué sirve

El inventario nunca tapa un hueco: lo explica. Ejemplo: Aduana despacha a Bodega el D-0412 con 24 playeras polo talla 10 del A-17; Bodega cuenta 22 y recibe «con diferencias». Las 2 que faltan se quedan en Tránsito, a cargo de Aduana, y nace la DF-031: «Aduana mandó 24 en D-0412 y Bodega recibió 22». Al día siguiente aparecen en la mesa de Aduana: Bodega aclara la DF-031 como «No salió» y las 2 regresan de Tránsito a Aduana en un A- nuevo, listas para despacharse otra vez. Si nunca hubieran aparecido, «Se perdió» pide el AJ-0046 y, cuando Dirección lo autoriza, las 2 salen del inventario.

## Reglas

1. **Una DF- explica un hueco, no lo tapa.** Nace sola cuando algo no cuadra y dice dónde está el hueco, de qué prenda o material, cuánto (con signo: − faltó, + sobró), a cargo de quién y por qué, con su texto. Mientras está abierta, el libro sigue diciendo dónde quedó cada pieza (ver [libro de movimientos](libro-de-movimientos.md#reglas), regla 5).
2. **Dónde nace cada una:**

   | Origen | Cuándo nace | El hueco | A cargo de | Nace | Desde |
   |---|---|---|---|---|---|
   | `recepcion` | Al recibir lo que venía en camino a aduana o en tránsito, por renglón que faltó, sobró o no venía | El tramo de su traspaso | Quien lo mandó: su origen en camino a aduana; Aduana en tránsito | `por_aclarar` | Fase 14 |
   | `recepcion_taller` | Aduana contó una talla de un lote o de un reproceso distinta de lo que aprobó Calidad | El Taller | El Taller | `por_aclarar` | Fase 14 |
   | `material_corte` | Un avío se entregó al corte sin existencia en Bodega | Bodega | Bodega | `por_aclarar` | Fase 14 |
   | `cuadre` | El cuadre de la noche halló una existencia negativa sin DF- abierta (ver [El cuadre](#el-cuadre)) | Esa ubicación | Esa ubicación | `por_contar` en prenda; `por_aclarar` en material | Fase 14 |
   | `no_la_encontro` | Bodega no encuentra una pieza apartada para un pedido («No la encuentro», ver [entregas y devoluciones de clientes](entregas-y-devoluciones-de-clientes.md#inventariono_la_encuentro)) | Bodega | Bodega | `por_contar` | Fase 16 |
   | `venta_sin_existencia` · `venta_pieza_reservada` · `no_la_encontro` · `conteo` | Lo que llega de una tienda | La tienda | La tienda | `por_contar`; la de conteo, `esperando_autorizacion` con su AJ- | Con el POS |

3. **Dos maneras de cerrarla.** La que nace `por_contar` se cuenta (ver [conteos](conteos.md)): si cuadra queda resuelta; si no, nace un AJ-. La de recepción y la de material se aclaran con «Aclarar». Una de material nunca se cuenta: los conteos son de prendas.
4. **Aclarar una de recepción** dice dónde estaba de verdad lo pendiente (ver [abajo](#cómo-se-aclara-una-de-recepción)).
5. **Aclarar una de material:** `aclarada` cuando su existencia ya no es negativa (llegó el material y cubrió el hueco), sin movimiento; o `ajuste`, que pide un AJ- por lo que faltaba.
6. **Todo ajuste pide autorización de Dirección** y mueve solo la diferencia que se vio, nunca contra la existencia de hoy: lo que pasó después de contar no se pisa.
7. **Lo que mueve un ajuste,** renglón por renglón, en su ubicación: en un conteo, contado − sistema; en una de recepción, lo que deja el hueco en cero (lo que faltó sale, lo que sobró entra); en una de material, lo que faltaba, que entra.
8. **Motivos:** aclarar pide un motivo escrito de `general.largo_minimo_motivo` (5) letras o más; un ajuste, además, uno de la lista «Motivos de ajuste».
9. **Un traspaso que tuvo DF- queda `con_diferencia`** aunque todas se aclaren: dice que la tuvo.
10. **La merma de producción** sale del Taller con el registro de la tablet que trae dañadas, y regresa si el registro se cancela. Nunca se rechaza.

## Cómo se aclara una de recepción

| Aclaración | Quiere decir | Si faltó | Si sobró |
|---|---|---|---|
| `llego` | Se contó mal al recibir, o llegó después | Lo pendiente pasa del hueco al lugar que recibió | Lo de más regresa del lugar que recibió al hueco. No aplica si recibió Aduana |
| `no_salio` | El origen mandó otra cantidad de la que dijo | Lo pendiente regresa del hueco a su origen. No aplica en la del taller | Lo de más sale del origen al hueco. No aplica si el origen es Aduana, ni en la del taller |
| `venia_en_otro` | Se cruzó con otro traspaso o con otro lote | Se aclara junto con su espejo: la otra DF- de recepción por aclarar, de la misma prenda y talla, con las mismas piezas al revés. Lo pendiente pasa del hueco de la que faltó al de la que sobró, en dos renglones que cruzan por el lugar que recibió de más, así ese lugar no cambia | Lo mismo, desde la otra |
| `perdida` | Ninguna de las anteriores | AJ-: lo pendiente sale del hueco | AJ-: lo que sobró entra al hueco |

- **El lugar que recibió** es Aduana en un tramo en camino a aduana y en la del taller, y el destino del traspaso en un tramo en tránsito. **El origen** es el del traspaso en camino a aduana, y Aduana en tránsito.
- **Nada entra ni sale de Aduana sin traspaso.** Lo que entra a Aduana al aclarar (lo que sí llegó en camino, lo que no salió del tránsito, lo que el Taller trajo después) entra en un A- nuevo, `en_aduana`, del mismo tipo, origen y destino que su traspaso, con sus reservas; el del taller, con el reparto de la recepción (ver [recepción del taller](recepcion-del-taller.md#reglas)). Así Aduana lo ve y lo despacha como cualquier otro. Lo que tendría que salir de Aduana se aclara como `venia_en_otro` o `perdida`.
- `llego`, `no_salio` y `venia_en_otro` escriben un movimiento `aclaracion_recepcion`: cada renglón con su traspaso en los tramos y con su lote en el Taller (ver [libro de movimientos](libro-de-movimientos.md#los-tipos-de-movimiento)). En el traspaso no cambia lo que dijo cada lado: su tramo queda en cero en el libro, que es donde lo cuenta el cuadre.

## Estados

**La diferencia**

| De | A | Qué pasa | Quién |
|---|---|---|---|
| — | `por_contar` | El cuadre, en prenda; «No la encuentro» en Bodega. Con el POS: venta sin existencia, venta de pieza reservada, «No la encuentro» de una tienda | La API; Bodega |
| — | `por_aclarar` | Una recepción que no cuadró, un avío entregado sin existencia, el cuadre en material | La API |
| — | `esperando_autorizacion` | Con el POS: el conteo de una tienda con diferencias, con su AJ- | La API |
| `por_contar` | `conteo_pedido` | Con el POS: «Pedir conteo» a la tienda | Bodega |
| `conteo_pedido` | `por_contar` | Con el POS: se cancela el conteo pedido | Bodega |
| `por_contar` · `conteo_pedido` | `resuelta` (`cuadro`) | El conteo cuadra | Bodega o Aduana; la tienda, con el POS |
| `por_contar` · `conteo_pedido` | `esperando_autorizacion` | El conteo no cuadra: nace el AJ- | Bodega o Aduana; la tienda, con el POS |
| `por_aclarar` | `resuelta` (`aclarada`) | «Aclarar» como `llego`, `no_salio` o `venia_en_otro`; en material, `aclarada` | Bodega |
| `por_aclarar` | `esperando_autorizacion` | «Aclarar» como `perdida`; en material, `ajuste`: nace el AJ- | Bodega |
| `esperando_autorizacion` | `resuelta` (`ajuste`) | Dirección autoriza el AJ- | Dirección |
| `esperando_autorizacion` | `por_contar` o `por_aclarar` | Dirección rechaza el AJ-: regresa a como estaba antes de pedirlo | Dirección |

**El ajuste**

| De | A | Qué pasa | Quién |
|---|---|---|---|
| — | `esperando_autorizacion` | Un conteo con diferencias, o una DF- aclarada como `perdida` o `ajuste`. Nace con su AU- | Bodega o Aduana; la caja, con el POS |
| `esperando_autorizacion` | `autorizado` | «Autorizar»: nace el movimiento `ajuste` con la diferencia guardada | Dirección |
| `esperando_autorizacion` | `rechazado` | «Rechazar» con su motivo. La existencia no cambia | Dirección |

## La tabla `diferencias`

| Columna | Tipo | Nulo | Qué es |
|---|---|---|---|
| `id` | uuid | no | Llave. Con el POS, si la destapó la caja, el id que hizo el aparato |
| `folio` | text | no | DF-031 (contador `diferencia` de [folios](../admin/folios.md)). Único. Siempre lo pone el servidor |
| `origen` | text | no | CHECK con los ocho de la regla 2 |
| `ubicacion_id` | uuid | no | → `ubicaciones.id`: el hueco. Puede ser Tránsito, En camino a aduana o el Taller |
| `variante_id` · `piezas` | uuid · integer | sí | Una de prenda: la variante y las piezas, con signo. CHECK ≠ 0 |
| `material_id` · `rollo_id` · `cantidad` | uuid · uuid · numeric(12,3) | sí | Una de material: en su unidad de inventario, con signo; el rollo, si es tela |
| `descripcion` | text | no | El texto que se ve: «Aduana mandó 24 en D-0412 y Bodega recibió 22» · «Calidad aprobó 48 de L-2026-122 talla 10 y Aduana contó 46» · «Se entregaron 3 cajas de botón a L-2026-122 sin existencia en Bodega» · «El cuadre del 8 nov halló −2 en Bodega» |
| `sistema_decia` | integer | sí | En una de prenda: lo que esperaba el sistema (lo enviado, lo aprobado o la existencia al detectarla) |
| `a_cargo_ubicacion_id` | uuid | no | → `ubicaciones.id`: quien responde (regla 2) |
| `traspaso_id` · `traspaso_linea_id` | uuid | sí | El traspaso y su renglón, en las de un tramo |
| `recepcion_id` | uuid | sí | → `recepciones.id`: la recepción que no cuadró |
| `lote_id` | uuid | sí | → `lotes.id`: en la del taller, su lote; en la de material, el de su entrega |
| `entrega_corte_id` | uuid | sí | → `entregas_corte.id`, en la de material |
| `movimiento_id` | uuid | sí | → `movimientos.id`: el que la destapó |
| `cuadre_id` | uuid | sí | → `cuadres.id`, en la del cuadre |
| `venta_tienda_id` | uuid | sí | Con el POS: la venta que la destapó |
| `estado` | text | no | CHECK (`por_contar`, `conteo_pedido`, `esperando_autorizacion`, `por_aclarar`, `resuelta`) |
| `conteo_id` | uuid | sí | → `conteos.id`: el que la contó (o, con el POS, el pedido) |
| `ajuste_id` | uuid | sí | → `ajustes.id`: el AJ- que la explica |
| `resolucion` | text | sí | CHECK (`cuadro`, `ajuste`, `aclarada`) |
| `aclaracion` | text | sí | CHECK (`llego`, `no_salio`, `venia_en_otro`, `perdida`, `ajuste`, `aclarada`) |
| `aclarada_con_diferencia_id` | uuid | sí | → `diferencias.id`: su espejo, en `venia_en_otro` |
| `traspaso_nuevo_id` | uuid | sí | → `traspasos.id`: el A- en que entró a Aduana al aclararla |
| `motivo_resolucion` | text | sí | Lo que escribió quien la aclaró |
| `resuelta_en` · `resuelta_por` | timestamptz · uuid | sí | |
| `dispositivo_id` · `persona_id` | uuid | sí | Con el POS: la caja y quién, si la destapó una tienda |

- Lleva las columnas comunes (ver [base de datos](../../cimientos/BASE-DE-DATOS.md#columnas-comunes)).
- **CHECK:** de prenda (`variante_id` y `piezas`) o de material (`material_id` y `cantidad`) · `resuelta` si y solo si `resolucion` va llena · `aclaracion` de recepción (`llego`, `no_salio`, `venia_en_otro`, `perdida`) solo en `recepcion` y `recepcion_taller`; de material (`ajuste`, `aclarada`) solo en las de material.
- **Índices:** único (`folio`) · (`estado`) donde no es `resuelta` · (`ubicacion_id`, `variante_id`) y (`ubicacion_id`, `material_id`) donde no es `resuelta` · (`traspaso_id`) · (`lote_id`) · (`recepcion_id`) · (`ajuste_id`).
- `venta_tienda_id` lleva su `@llavePendiente` hasta el POS.

## La tabla `ajustes`

| Columna | Tipo | Nulo | Qué es |
|---|---|---|---|
| `id` | uuid | no | Llave |
| `folio` | text | no | AJ-0046 (contador `ajuste`). Único |
| `ubicacion_id` | uuid | no | → `ubicaciones.id`: donde se mueve la diferencia |
| `origen` | text | no | CHECK (`conteo`, `diferencia_recepcion`, `diferencia_material`) |
| `conteo_id` | uuid | sí | → `conteos.id`. CHECK: lleno en `conteo` |
| `diferencia_id` | uuid | sí | → `diferencias.id`: la que se aclaró. CHECK: lleno en los otros dos |
| `motivo_id` | uuid | no | → `lista_valores.id`, de «Motivos de ajuste» |
| `motivo_texto` | text | sí | Hasta 200 |
| `estado` | text | no | CHECK (`esperando_autorizacion`, `autorizado`, `rechazado`). default `esperando_autorizacion` |
| `autorizacion_id` | uuid | sí | → `autorizaciones.id`: su AU-. Se llena en la misma transacción en que nace |
| `decidido_en` · `decidido_por` | timestamptz · uuid | sí | CHECK: llenos fuera de `esperando_autorizacion` |
| `motivo_rechazo` | text | sí | CHECK: lleno en `rechazado` |
| `movimiento_id` | uuid | sí | → `movimientos.id`: el `ajuste`. CHECK: lleno en `autorizado` |

Lleva las columnas comunes. **Índices:** único (`folio`) · (`estado`) donde es `esperando_autorizacion` · (`ubicacion_id`). Con esta tabla deja su `@llavePendiente` `autorizaciones.ajuste_id`.

## La tabla `ajuste_lineas`

Cada diferencia que mueve el ajuste, fija desde que se vio.

| Columna | Tipo | Nulo | Qué es |
|---|---|---|---|
| `id` | uuid | no | Llave |
| `ajuste_id` | uuid | no | → `ajustes.id` |
| `renglon` | smallint | no | Único con `ajuste_id` |
| `variante_id` | uuid | sí | → `variantes.id` |
| `material_id` · `rollo_id` | uuid | sí | El material y, si es tela, el rollo |
| `conteo_linea_id` | uuid | sí | → `conteo_lineas.id`, en un conteo |
| `diferencia_id` | uuid | sí | → `diferencias.id` |
| `traspaso_id` | uuid | sí | → `traspasos.id`: si el hueco es un tramo |
| `lote_id` | uuid | sí | → `lotes.id`: si el hueco es el Taller |
| `piezas_sistema` · `piezas_contadas` | integer | sí | En un conteo: «Al contar: sistema {s}, contado {c}» |
| `piezas_diferencia` | integer | sí | Con signo: + entra, − sale. CHECK ≠ 0 |
| `cantidad_diferencia` | numeric(12,3) | sí | Lo mismo, en material. CHECK ≠ 0 |

Lleva las columnas comunes. **CHECK:** de prenda (`variante_id` y `piezas_diferencia`) o de material (`material_id` y `cantidad_diferencia`). **Índices:** (`ajuste_id`) · (`diferencia_id`).

## La lista «Motivos de ajuste»

Este archivo siembra la lista `motivos_ajuste` de [configuración](../admin/configuracion.md): «Venta que no tenía existencia en el sistema», «Pieza dañada o manchada», «Error al capturar una entrada o salida», «No se encontró: posible extravío» y «Apareció mercancía sin registrar». La dueña puede agregar más.

## Cómo nace una DF-

Lo hace una función del módulo, `abrirDiferencia`, en `modulos/inventario/dominio/` (como `escribirMovimiento`), dentro de la transacción de quien la llama: recibir en aduana, recibir un despacho, la recepción del taller, entregar al corte, «No la encuentro» y el cuadre. Toma su folio DF-, la escribe con su estado de nacimiento (regla 2), su texto, a cargo de quién y lo que la destapó (el traspaso y su renglón, la recepción, el lote, la entrega o el movimiento), y guarda `diferencia.creada`. Ningún otro módulo la llama: lo de las tiendas llegará por las internas de Inventario, con el POS.

## Acciones

Es de la web, con el departamento Bodega.

### `inventario.aclarar_diferencia`

| | |
|---|---|
| **Pantalla** | Bodega · ventana Aclarar {DF} · «Dar por aclarada». Se abre con «Aclarar» en Pendientes o en Diferencias (de recepción y de material) |
| **Recibe** | `diferencia_id` · `version`<br>`aclaracion`: `llego`, `no_salio`, `venia_en_otro` o `perdida` (recepción); `ajuste` o `aclarada` (material)<br>`motivo` · texto · obligatorio<br>`otra_diferencia_id` · obligatoria en `venia_en_otro`: su espejo<br>`motivo_id` · de «Motivos de ajuste» · obligatorio en `perdida` y `ajuste` |
| **Reglas y errores** | `400`: «Escribe el motivo, de {n} letras o más.» · «Escoge el motivo del ajuste.» · «Escoge con qué diferencia se cruzó.»<br>`422 no_por_aclarar`: «{DF} no está por aclarar.» (las que nacen `por_contar` se cuentan)<br>`422 aclaracion_no_aplica`: «Esa aclaración no aplica a {DF}.» (la tabla de [arriba](#cómo-se-aclara-una-de-recepción) y la regla 5)<br>`422 sigue_en_negativo`: «{material} sigue en negativo en {ubicación}: aclárala con ajuste.»<br>`422 espejo_no_corresponde`: «{DF} no es su espejo: tiene que ser de la misma prenda y talla, con las mismas piezas al revés, y estar por aclarar.» |
| **Escribe** | `llego`, `no_salio` y `venia_en_otro`: el movimiento `aclaracion_recepcion` de la tabla, y el A- nuevo si algo entra a Aduana; la DF- (y en `venia_en_otro` su espejo, tomadas las dos en orden) `resuelta`, `aclarada`, con la aclaración, el motivo, quién y cuándo. `aclarada` en material: lo mismo, sin movimiento. `perdida` y `ajuste`: el AJ- `esperando_autorizacion`, de la ubicación del hueco, con un renglón (regla 7) y su traspaso o su lote; la DF- `esperando_autorizacion`, con su AJ- |
| **Llama** | `admin.tomar_folio` (`ajuste`; `partida_aduana` si nace un A-) · `direccion.pedir_autorizacion`, en `perdida` y `ajuste`: tipo `ajuste_inventario`, con el AJ-: «Ajuste {AJ} en {ubicación}: 1 diferencia» |
| **Regresa** | «{DF} aclarada» · con un A- nuevo, «{DF} aclarada: {n} piezas en aduana en {A}» · con ajuste, «{AJ}: 1 diferencia espera autorización de Dirección» |
| **Eventos** | `diferencia.resuelta` · `traspaso.en_aduana` si nació un A- · `ajuste.pedido` |
| **Bitácora** | «Aclaró {DF}: {aclaración}», con el motivo, y el espejo o el AJ- en `despues` |

## Acciones internas

### `inventario.aplicar_decision_ajuste`

El efecto que este módulo registra para el tipo `ajuste_inventario` (ver [autorizaciones](../direccion/autorizaciones.md)).

| | |
|---|---|
| **La llama** | `direccion.decidir_autorizacion`, en su misma transacción: desde Dirección, o la dueña desde Bodega · Conteos y ajustes |
| **Recibe** | `autorizacion_id` · `decision` · `ajuste_id` · el motivo, si se rechaza · quién y cuándo |
| **Reglas** | El AJ- espera autorización; si no, es un error del programa: la AU- se decide una sola vez |
| **Escribe** | Autorizado: el movimiento `ajuste` con lo guardado en sus renglones, no con la existencia de hoy: lo que entra, de Fuera a la ubicación; lo que sale, de la ubicación a Fuera; con su traspaso en un tramo y su lote en el Taller. El AJ- `autorizado`, con su movimiento. Sus DF- `resuelta`, `ajuste`. Rechazado: el AJ- `rechazado`, con el motivo; sus DF- regresan a `por_contar` (las de conteo y cuadre) o `por_aclarar` (las de recepción y material). La existencia no cambia |
| **Regresa** | «{AJ} autorizado: se movió la diferencia» o «{AJ} rechazado» |
| **Eventos** | `ajuste.autorizado` o `ajuste.rechazado` · `diferencia.resuelta` al autorizar |

La bitácora es el renglón de Dirección.

### `inventario.registrar_merma_produccion`

Se construye en la [fase 12](../../fases/12-produccion.md): cada registro de la tablet con dañadas la necesita.

| | |
|---|---|
| **La llama** | `produccion.registrar_operacion`, con piezas dañadas (ver [registros de operación](../produccion/registros-de-operacion.md)) |
| **Recibe** | `registro_operacion_id` · `lote_id` · `variante_id` · `piezas` · `ocurrido_en` · `dispositivo_id` · `persona_id` |
| **Reglas** | Nunca rechaza: el tope del bulto lo revisa Producción y va a excepciones |
| **Escribe** | El movimiento `merma_produccion`, del Taller a Fuera, con el lote; su documento es el registro |
| **Regresa** | El movimiento |
| **Eventos** | Ninguno propio: el de la acción que la llama lleva `existencias` entre sus tablas |

### `inventario.revertir_merma_produccion`

Se construye en la [fase 12](../../fases/12-produccion.md), con la anterior.

| | |
|---|---|
| **La llama** | `produccion.cancelar_registro`, si el registro tenía dañadas |
| **Recibe** | `registro_operacion_id` |
| **Reglas** | Un movimiento se revierte una sola vez: revertir dos veces es un error del programa |
| **Escribe** | El movimiento `reversion` de su merma, de Fuera al Taller |
| **Regresa** | El movimiento |
| **Eventos** | Ninguno propio, como la anterior |

## El cuadre

Lo que esta fase agrega al cuadre de la noche (ver [existencias y cuadre](existencias-y-cuadre.md#el-cuadre-de-la-noche)):

- **Paso 3:** un traspaso `con_diferencia` tiene en sus tramos, en el libro, justo lo que dicen sus DF- abiertas.
- **Paso 4:** de un lote ya recibido en aduana, en el Taller solo quedan las piezas de sus reprocesos sin recibir y lo que dicen sus DF- de la recepción del taller abiertas (ver [recepción del taller](recepcion-del-taller.md#reglas)). Si no, `cuadre_proyeccion`.
- **Paso 5:** una existencia negativa sin DF- abierta de esa ubicación y esa variante (o ese material): en Bodega, en Aduana o en una tienda nace una DF- `cuadre` `por_contar`; en material, una `por_aclarar` donde esté. Un negativo de prenda en el Taller o en un tramo no se cuenta: abre `cuadre_proyeccion`.

## Parámetros

Ninguno propio: el largo del motivo es `general.largo_minimo_motivo` (ver [configuración](../admin/configuracion.md)).

## Permisos

- Aclarar: Bodega. Los ajustes los decide Dirección, y la dueña también desde Bodega · Conteos y ajustes (ver [autorizaciones](../direccion/autorizaciones.md)).
- Las DF- y los AJ- los ven Bodega, Aduana y Dirección, sin precios ni costos.

## Eventos

`diferencia.creada` · `diferencia.resuelta` · `ajuste.pedido` · `ajuste.autorizado` · `ajuste.rechazado`.

## Lo que llega después

- **Fase 19:** las pantallas Diferencias y Conteos y ajustes de Bodega, y las tarjetas de ajuste en Dirección.
- **Con el POS:** las DF- de las tiendas (venta sin existencia, venta de pieza reservada, «No la encuentro», conteo de tienda), «Pedir conteo» y su cancelación, y las DF- de cada tienda, que bajan a su caja.

## Cómo está hecho

*Lo escribe Claude Code al terminar la fase 14.*

**Fase 12, parte 4.** `inventario.registrar_merma_produccion` e `inventario.revertir_merma_produccion` viven en `modulos/inventario/internas/merma-produccion.ts`: el movimiento `merma_produccion` con el lote, la persona y la tablet, y su reversión con `revertirMovimiento`; la clave de cada uno sale del registro. Las prueba `produccion/acciones/registrar-operacion.prueba.ts`.
