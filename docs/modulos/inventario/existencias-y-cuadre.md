# Existencias y cuadre

> **Qué cubre:** las existencias como cuenta del libro (por ubicación y variante, y el material por rollo), las cuentas que salen de ellas (libres, disponible en bodega, comprometido, libre total), sus lecturas y el cuadre de cada noche.
> **Estado:** Decidido.
> **Se construye en:** [fase 9 ●](../../fases/09-inventario-libro-existencias-reservas-y-traspasos.md).
> **Se conecta con:** [libro de movimientos](libro-de-movimientos.md) · [reservas](reservas.md) · [traspasos](traspasos.md) · [excepciones](excepciones.md) · [eventos y trabajos](../../cimientos/EVENTOS-Y-TRABAJOS.md) · [tallas y tipos de prenda](../catalogo/tallas-y-tipos-de-prenda.md) · [lotes](../produccion/lotes.md) · [cuenta de material](../patronaje/cuenta-de-material.md) · [proyección de material](../compras/proyeccion-de-material.md) · [alertas e indicadores](../direccion/alertas-e-indicadores.md) · [pantallas de Aduana](../../interfaz/fabrica/aduana.md) · [pantallas de Bodega](../../interfaz/fabrica/bodega.md) · [pantallas de Dirección](../../interfaz/fabrica/direccion.md) · [pantallas de Tienda en línea](../../interfaz/fabrica/tienda-en-linea.md) · [material en bodega](material-en-bodega.md) · [entregas a corte](entregas-a-corte.md) · [conteos y carga inicial](conteos.md) · [diferencias, ajustes y mermas](diferencias-ajustes-y-mermas.md) · [mínimos y reabasto](minimos-y-reabasto.md) · [recepción del taller](recepcion-del-taller.md) · [mandar a producción](../ventas/mandar-a-produccion.md) · [contador y cuadres](../contaduria/contador-y-cuadres.md) · [pedidos en línea](../linea/pedidos-en-linea.md)

## Para qué sirve

Las existencias dicen cuántas piezas de cada variante hay en cada ubicación, y cuánto material: la tela por rollo y los avíos y consumibles por material. No son el inventario: son la suma del [libro](libro-de-movimientos.md), guardada para leerla rápido. Cada noche, el cuadre la vuelve a sacar del libro y revisa que todo cuadre.

Ejemplo: a las 03:00 corre el cuadre del 8 de noviembre. Recalcula cada existencia desde el libro, revisa los tramos de los traspasos y los totales, y escribe su renglón: «Cuadró». Si algo no cuadra, lo corrige en las existencias (el libro manda) y amanece como excepción en la bandeja de Bodega.

## Reglas

1. **Proyección del libro.** Solo la escriben dos: la transacción del movimiento, que suma, y el cuadre de la noche, que corrige. Nadie la edita a mano.
2. **Puede ser negativa.** No se tapa con cero. La pantalla muestra 0 y «{n} por aclarar», y lo explica una DF-.
3. **Las cuentas:**

   | Cuenta | Cómo sale |
   |---|---|
   | Existencia (ubicación, variante) | Σ de los renglones que llegan ahí − Σ de los que salen. Igual en material, con `cantidad` |
   | Reservas en la ubicación | Σ de las reservas activas de esa variante en esa ubicación (ver [reservas](reservas.md)) |
   | **Libres** (ubicación, variante) | Existencia − reservas en la ubicación. Puede ser negativo |
   | **Disponible en bodega** | El mayor de 0 y los libres de Bodega. Solicitudes, traspasos y sugerencias solo toman de aquí |
   | Total (variante) | Σ de la existencia en las siete ubicaciones |
   | Comprometido (variante) | Σ de sus reservas activas en todas las ubicaciones |
   | Libre total | Total − comprometido |
   | En diferencia (ubicación, variante) | Σ de las piezas de sus DF- abiertas (ver [diferencias, ajustes y mermas](diferencias-ajustes-y-mermas.md)) |

4. **El material:** la tela se lleva por rollo y los avíos y consumibles por material, en su unidad de inventario. Un rollo está en una sola ubicación.
5. **El cuadre nunca toca el libro.** Si la existencia guardada no es la del libro, corrige la existencia y deja la excepción con los dos valores.
6. **El cuadre no frena las ventas:** corre en tandas por ubicación, cada una en su propia transacción corta (ver [sincronización](../../cimientos/SINCRONIZACION.md)).

## La tabla `existencias`

| Columna | Tipo | Nulo | Qué es |
|---|---|---|---|
| `id` | uuid | no | Llave |
| `ubicacion_id` | uuid | no | → `ubicaciones.id` |
| `variante_id` | uuid | no | → `variantes.id` |
| `piezas` | integer | no | default 0. Puede ser negativa |
| `ultimo_movimiento_id` | uuid | sí | → `movimientos.id` |

Lleva las columnas comunes. **Índices:** único (`ubicacion_id`, `variante_id`) · (`variante_id`) · (`version`).

## La tabla `existencias_material`

| Columna | Tipo | Nulo | Qué es |
|---|---|---|---|
| `id` | uuid | no | Llave |
| `ubicacion_id` | uuid | no | → `ubicaciones.id` |
| `material_id` | uuid | no | → `materiales.id` |
| `rollo_id` | uuid | sí | → `rollos.id`. Lleno en tela; vacío en avíos y consumibles |
| `cantidad` | numeric(12,3) | no | default 0. En la unidad de inventario del material. Puede ser negativa |
| `ultimo_movimiento_id` | uuid | sí | → `movimientos.id` |

Lleva las columnas comunes. **Índices:** único (`ubicacion_id`, `material_id`, `rollo_id`) con `NULLS NOT DISTINCT` · (`rollo_id`) · (`version`). `material_id` y `rollo_id` llevan su `@llavePendiente` hasta las fases 10 y 11.

## La tabla `cuadres`

Una corrida del cuadre por día de negocio.

| Columna | Tipo | Nulo | Qué es |
|---|---|---|---|
| `id` | uuid | no | Llave |
| `fecha` | date | no | El día de negocio que revisa. Único |
| `iniciado_en` · `terminado_en` | timestamptz | no · sí | |
| `estado` | text | no | CHECK (`corriendo`, `cuadro`, `con_residuo`, `fallo`) |
| `renglones_revisados` · `proyecciones_corregidas` · `diferencias_creadas` · `excepciones_creadas` | integer | no | default 0 |
| `error` | text | sí | Si falló |

Lleva las columnas comunes. `cuadro`: sin residuo. `con_residuo`: corrigió existencias o creó DF- o excepciones. `fallo`: no terminó.

## El cuadre de la noche

### `inventario.correr_cuadre` · interna

| | |
|---|---|
| **La llama** | El trabajo «Cuadre nocturno» |
| **Recibe** | `fecha`: el día de negocio que terminó |
| **Reglas** | `cuadre_ya_corrio`: una sola corrida por fecha |
| **Escribe** | Su renglón en `cuadres`, primero `corriendo` y al final `cuadro`, `con_residuo` o `fallo`, con sus contadores; y lo que encuentran sus pasos |
| **Eventos** | `cuadre.terminado`, con su estado |

**Los pasos:**

1. **Existencias contra libro.** Recalcula cada `existencias` y `existencias_material` desde los renglones. Si no es igual, corrige la existencia y abre la excepción `cuadre_proyeccion` con los dos valores.
2. **Una pieza, un lugar.** Ningún rollo con cantidad en dos ubicaciones, y un rollo entregado o por recibir solo en el Taller: si no, `rollo_en_dos_lugares`.
3. **Los tramos de camino.** Un traspaso `recibido` o `salio` tiene cero en Tránsito y en En camino a aduana; uno `con_diferencia`, justo lo de sus DF- abiertas (ver [traspasos](traspasos.md#lo-que-queda-en-cada-tramo-y-quién-responde)). Si no, `cuadre_proyeccion`.
4. **El Taller por lote.** Las piezas del lote en el Taller (cortadas − merma de producción − recibidas en aduana) contra lo que lleva Producción en `lote_tallas`.
5. **Negativos sin explicar.** Una existencia negativa sin DF- abierta: nace una DF- `cuadre`, o `cuadre_proyeccion` donde no se cuenta (ver [diferencias, ajustes y mermas](diferencias-ajustes-y-mermas.md#el-cuadre)).
6. **Reservas.** Una reserva activa cuyo documento ya se canceló o se cerró: `reserva_sin_documento`. Lo dicen `ventas.documentos_abiertos` (PE- y NV-) y `linea.pedidos_abiertos` (W-). Las de pago vencido se liberan, como lo hace su trabajo cada pocos minutos.
7. **Lo que lleva días sin confirmar.** Un traspaso en camino o en tránsito por más de `inventario.dias_sin_confirmar_excepcion`: `sin_confirmar`.
8. **El total.** Aduana + Bodega + Tienda 1 + Tienda 2 + Taller + Tránsito + En camino a aduana = Total. Con el paso 1 bien, cuadra sin residuo.

Lo que no cuadra amanece como DF- o excepción en Bodega. La alerta de Dirección lee el último cuadre (ver [alertas e indicadores](../direccion/alertas-e-indicadores.md)).

### El trabajo «Cuadre nocturno»

| | |
|---|---|
| **Cuándo** | Cada día a `inventario.hora_cuadre` (03:00, hora de México) |
| **Hace** | Llama a `inventario.correr_cuadre` con el día de negocio que terminó |
| **Avisa** | Con `fallo`: el aviso `cuadre_fallido` a la dueña. Con `con_residuo`, nada aparte: lo encontrado ya está en la bandeja de Bodega |
| **Repetible** | La clave de periodo es la fecha, y `cuadre_ya_corrio` impide una segunda corrida |
| **Después** | El evento `cuadre.terminado` encola lo que corre al terminar: depurar los eventos viejos (ver [eventos y trabajos](../../cimientos/EVENTOS-Y-TRABAJOS.md#depurar-eventos)) y, desde sus fases, los rollos sugeridos y las alertas de Dirección |

### El aviso `cuadre_fallido`

| Lo hace nacer | A quién | Texto | Correo al inicio |
|---|---|---|---|
| El cuadre que no terminó | La dueña | «El cuadre de inventario del {fecha} no terminó. Soporte ya lo está revisando.» (el error va en el renglón del cuadre, no en el aviso) | Sí |

Se suma a los tipos de [avisos](../admin/avisos.md), con su `avisos.correo_cuadre_fallido`. Soporte recibe además su `trabajo_fallido`.

## Lecturas

### `inventario.libres(ubicacion, variante)`

| | |
|---|---|
| **La usan** | Ventas («Surtir de bodega · {n}») y la disponibilidad en línea |
| **Regresa** | Existencia menos reservas activas de esa variante en esa ubicación. Puede salir negativo |

### `inventario.existencia_material(material, ubicacion)`

| | |
|---|---|
| **La usan** | Compras (la cuenta de cada material y la baja de un material) y Ventas (la revisión del pedido) |
| **Regresa** | La existencia de ese material en esa ubicación, o en todas si no viene, en su unidad de inventario |

### `inventario.piezas_de_variante(variante, bloquear)`

| | |
|---|---|
| **La usa** | Catálogo, al dar de baja una talla (ver [tallas y tipos de prenda](../catalogo/tallas-y-tipos-de-prenda.md)) |
| **Regresa** | Por ubicación, la existencia que no es cero (también negativa, en Tránsito o en En camino a aduana), y las reservas activas con las piezas y el folio de su documento |
| **Con `bloquear`** | Antes de leer, toma el candado de la variante y sus existencias en el orden fijo: ningún movimiento ni reserva se cruza con lo que decide quien la llama |

### `inventario.existencia_de_variantes(variantes)`

Se construye en la [fase 18](../../fases/18-tienda-en-linea-direccion-y-contador.md), con las alertas de Dirección.

| | |
|---|---|
| **La usa** | Dirección, para la alerta de un producto descontinuado con existencia (ver [alertas e indicadores](../direccion/alertas-e-indicadores.md)) |
| **Regresa** | Por variante, la suma de su existencia en las siete ubicaciones |

### `inventario.ultimo_cuadre()`

Se construye en la [fase 18](../../fases/18-tienda-en-linea-direccion-y-contador.md), con las alertas de Dirección.

| | |
|---|---|
| **La usa** | Dirección, para la alerta del cuadre con residuo (ver [alertas e indicadores](../direccion/alertas-e-indicadores.md)) |
| **Regresa** | El último cuadre: su fecha, su estado, cuándo empezó y terminó, sus contadores y su error |

## Parámetros

Los cambia solo la dueña, en Configuración (ver [configuración](../admin/configuracion.md)).

| Parámetro | Valor inicial | Sección | Para qué |
|---|---|---|---|
| `inventario.hora_cuadre` | 03:00 | Técnicos | La hora del cuadre de la noche |
| `inventario.dias_sin_confirmar_excepcion` | 2 días | Parámetros | Lo que lleva más días en camino o en tránsito abre `sin_confirmar` |
| `avisos.correo_cuadre_fallido` | Sí | Parámetros | Si el aviso de cuadre fallido va también por correo |

## Permisos

Las existencias las leen las pantallas de Aduana, Bodega, Dirección, Catálogo (la existencia de cada variante en su ficha) y Tienda en línea (la disponibilidad), sin precios ni costos. Nadie las escribe con una acción propia.

## Eventos

`cuadre.terminado`.

## Lo que llega después

- **Fase 11:** el paso 2 (los rollos).
- **Fase 12:** el paso 4 (el Taller por lote), el trabajo que recalcula las proyecciones de Producción antes del cuadre y los rollos sugeridos al terminar el cuadre.
- **Fase 14:** el paso 5 (la DF- `cuadre`); en el paso 3, la cuenta de las DF- abiertas de un traspaso `con_diferencia`; y en el paso 4, los lotes ya recibidos en aduana (ver [diferencias, ajustes y mermas](diferencias-ajustes-y-mermas.md#el-cuadre)).
- **Fases 16 y 18:** en el paso 6, los documentos de Ventas (PE-, NV-, con `ventas.documentos_abiertos`) y de Tienda en línea (W-, con `linea.pedidos_abiertos`), y las reservas de pago vencido.
- **Fase 18:** las lecturas `inventario.ultimo_cuadre` y `inventario.existencia_de_variantes`, para las alertas de Dirección.
- **Fase 18:** las alertas de Dirección al terminar el cuadre.
- **Con el POS:** las existencias de cada tienda bajan a su caja, y en el paso 6 los apartados y los pedidos especiales de tienda.

## Cómo está hecho

**Fase 9, parte 1.**

- **Las tablas** `existencias` y `existencias_material` están en `modulos/inventario/tablas.ts` (migración `0026`). El único de material es `UNIQUE NULLS NOT DISTINCT` (`existencias_material_lugar`), para que un avío sin rollo tenga un solo renglón.
- **Las suma `escribirMovimiento`** en la misma transacción que el movimiento, con su `ultimo_movimiento_id`.
- **Las lecturas** están en `lecturas/existencias.ts`:
  - `inventario.existencia_material` suma todos los rollos y regresa la cantidad como texto con tres decimales; desde la fase 10, también por ubicación lo que no es cero, con su nombre, para que la baja de un material diga dónde hay (decisión 513);
  - `inventario.piezas_de_variante` regresa por ubicación lo que no es cero. Con `bloquear`, toma antes el candado de la variante y sus existencias en el orden fijo. Las reservas se le suman en la parte 3.
- **Quién lee:** Aduana, Bodega y Dirección leen el libro y el material; las existencias, además Catálogo y Tienda en línea (`index.ts`).
- **Pruebas:** `dominio/escribir-movimiento.prueba.ts` (las lecturas y el material) y `escribir-movimiento.azar.prueba.ts` (la existencia guardada siempre es la suma del libro).

**Fase 9, parte 3.**
- **`inventario.piezas_de_variante`** regresa también las reservas activas de la variante, con su motivo y su documento.
- **`inventario.libres`** está en `lecturas/reservas.ts`.

**Fase 9, parte 5.**

- **La tabla** `cuadres` está en `modulos/inventario/tablas.ts` (migración `0030`): única por fecha, y `terminado_en` lleno si y solo si ya no está `corriendo`. `excepciones.cuadre_id` ya es llave.
- **El cuadre** (`internas/correr-cuadre.ts`, `correrCuadre`) es una función del módulo y no una interna registrada: corre sus propias transacciones, y una interna corre dentro de la de quien la llama (decisión 495).
  - **Una sola corrida por fecha:** nace con un único por fecha; si ya estaba, regresa `ya_corrio`.
  - **Paso 1:** una tanda por ubicación. Bloquea sus existencias en el orden fijo (el material con el rollo vacío primero, como `escribirMovimiento`), las compara con la suma del libro (piezas y material) y corrige la que no es igual, con su `cuadre_proyeccion` y los dos valores.
  - **Paso 3:** los traspasos que terminaron ese día `recibido`, `salio`, `repartido` o `cancelado` tienen cero en los tramos de camino, por tramo y por variante (o material y rollo): un residuo no tapa a otro. Abre una excepción por traspaso, con lo que quedó en cada tramo en `datos.tramos` (decisión 504). Los `con_diferencia` esperan a las DF- de la fase 14 (decisión 496).
  - **Paso 6:** pregunta a `ventas.documentos_abiertos` y `linea.pedidos_abiertos` cuando esos módulos existen (decisión 497). Desde la fase 16 la da el módulo `ventas` de verdad, y el de prueba ya no existe (decisión 694).
  - **Paso 7:** lo que lleva más de `inventario.dias_sin_confirmar_excepcion` días en camino (desde `enviado_en`) o en tránsito (desde su último movimiento a Tránsito). Abre una excepción por traspaso mientras siga abierta (decisión 499).
  - **Paso 8:** el total de cada variante y de cada material contra el libro.
  - **Al final:** `cuadro` o `con_residuo` con sus contadores y el evento `cuadre.terminado`. Si una tanda falla, queda `fallo` con su error. Si el proceso se cortó y el cuadre se quedó `corriendo`, la siguiente vuelta del trabajo lo encuentra así, lo pasa a `fallo` («El cuadre se cortó sin terminar», `marcarCuadreCortado`), avisa y falla (decisión 505).
- **El trabajo** `inventario.cuadre_nocturno` (`trabajos/cuadre-nocturno.ts`) corre a `inventario.hora_cuadre` el día que terminó. Si el cuadre falla, avisa `cuadre_fallido` a la dueña y falla, para que soporte reciba su `trabajo_fallido`. El aviso va ligado a su cuadre (entidad `cuadres`): el de otra fecha no lo tapa aunque siga sin leer.
- **Al terminar:** `cuadre.terminado` encola `admin.depurar_eventos` (`trasEventos`).
- **El aviso** `cuadre_fallido` entra al CHECK de `avisos.tipo` en la migración `0030`, con la lista completa. `tipos-de-aviso.prueba.ts` revisa que el CHECK deje todos los tipos que se declaran (decisión 494).
- **Pruebas:**
  - `internas/correr-cuadre.prueba.ts`: la existencia alterada; el tramo, con dos variantes cuyos residuos se cancelarían; lo sin confirmar; la reserva sin documento; una sola corrida; y movimientos a media corrida que no esperan.
  - `internas/correr-cuadre.azar.prueba.ts`: existencias de prendas y de material alteradas al azar, con movimientos al azar desde otra conexión mientras el cuadre corre; al terminar todo es la suma del libro, con una excepción por cada alteración y ninguna más.
  - `trabajos/cuadre-nocturno.prueba.ts`: el horario, la depuración encolada, el aviso del cuadre que falla y el del cuadre que se quedó `corriendo`.

**Fase 10, parte 5.** Para la cuenta de cada material de Compras, `lecturas/materiales.ts` lee muchos materiales en una consulta: `inventario.existencias_de_materiales` (por material, lo que hay en Bodega y en Aduana) e `inventario.salidas_de_materiales` (por material, sus salidas por día desde un día y su primera salida; ver [proyección de material](../compras/proyeccion-de-material.md#cómo-está-hecho)). Su prueba es `lecturas/materiales.prueba.ts` (decisión 548).

**Fase 11, parte 1.** El paso 2 del cuadre (`rollosEnUnLugar`): ver [material en bodega](material-en-bodega.md#cómo-está-hecho).

**Fase 12, parte 4.**

- **Antes de sus pasos,** `correrCuadre` llama `produccion.recalcular_proyecciones` por tramos de 50 lotes, cada tramo en su transacción (ver [lotes](../produccion/lotes.md#cómo-está-hecho)).
- **Paso 4** (`tallerPorLote`): por lote y variante, las piezas en el Taller según el libro (`movimiento_lineas` con su lote) contra cortadas − merma de `lote_tallas`, para los lotes en proceso, terminados y revisados; los que ya llegaron a aduana salieron del Taller (decisión 616). Abre una `cuadre_proyeccion` por diferencia, con los dos valores.
- **Prueba:** el caso del paso 4 en `internas/correr-cuadre.prueba.ts`: tres piezas del lote fuera del Taller abren la excepción; al regresar, ya cuadra.

**Fase 14, parte 1.** En `internas/correr-cuadre.ts`: el paso 3 revisa los traspasos que terminaron ese día y los terminados que tienen alguna DF-, y suma a lo que quedó en cada tramo lo que dicen sus DF- abiertas (con su signo: una de −2 deja +2); lo que no da cero abre `cuadre_proyeccion`. El paso 5 (`negativosSinExplicar`) abre una DF- `cuadre` por cada existencia negativa sin DF- abierta de esa ubicación y esa variante (o material y rollo): por contar en prenda, por aclarar en material; en el Taller o en un tramo, `cuadre_proyeccion`, una sola vez mientras siga abierta. Las DF- que abre cuentan en `diferencias_creadas` y dejan el cuadre `con_residuo` (decisión 638). Lo prueban `internas/correr-cuadre.prueba.ts` y `diferencias.azar.prueba.ts`.

**Fase 14, parte 2.** El paso 4 revisa también los lotes `en_aduana`: en el Taller deben quedar solo las piezas de sus reprocesos sin recibir menos lo que dicen sus DF- de la recepción del taller abiertas (decisión 645).
