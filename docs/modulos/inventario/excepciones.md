# Excepciones

> **Qué cubre:** lo que el servidor aceptó y no cuadra: los tipos de excepción, quién las abre, la bandeja de Bodega (y la de Contaduría), cómo se resuelven y cómo se cierra la de un aparato revocado.
> **Estado:** Decidido.
> **Se construye en:** [fase 9 ●](../../fases/09-inventario-libro-existencias-reservas-y-traspasos.md).
> **Se conecta con:** [sincronización](../../cimientos/SINCRONIZACION.md) · [dispositivos](../admin/dispositivos.md) · [existencias y cuadre](existencias-y-cuadre.md) · [reservas](reservas.md) · [registros de operación](../produccion/registros-de-operacion.md) · [pedidos en línea](../linea/pedidos-en-linea.md) · [pantallas comunes](../../interfaz/comunes.md) · [pantallas de Bodega](../../interfaz/fabrica/bodega.md) · [pantallas de Dirección](../../interfaz/fabrica/direccion.md) · [conteos y carga inicial](conteos.md) · [diferencias, ajustes y mermas](diferencias-ajustes-y-mermas.md) · [pantallas de Contaduría](../../interfaz/fabrica/contaduria.md) · [pantallas de Producción](../../interfaz/fabrica/produccion.md) · [pantallas de Tienda en línea](../../interfaz/fabrica/tienda-en-linea.md)

## Para qué sirve

Lo que ya pasó no se rechaza: una venta de la caja, un registro de la tablet o un pedido del sitio se aplican aunque algo no cuadre. Lo que no cuadra queda aquí, en una bandeja, para que alguien lo revise y diga qué hizo. Ejemplo: la tablet registra 26 piezas en el bulto B-2026-121-03, que tenía 24. El registro se aplica, y en Bodega · Excepciones aparece «Pasa del tope del bulto», con la hora, el bulto y la tablet de donde llegó. Producción lo revisa, cancela el registro que sobraba y aprieta «Resolver»: «Se canceló el registro repetido de Beto».

## Reglas

1. **Se aplica y se avisa.** Quien abre una excepción ya aplicó lo que llegó; la excepción no deshace nada.
2. **Resolver no mueve nada.** Si hace falta mover, se hace con su acción (un conteo, aclarar una diferencia, «No la encuentro», cancelar un registro); la resolución dice qué se hizo, con al menos `general.largo_minimo_motivo` (5) letras, y queda en la bitácora.
3. **Cada excepción va a su bandeja:** las de inventario y del taller, a Bodega (Producción ve las del taller); las de dinero, a Contaduría (`area`).
4. **Una venta sin existencia no es excepción:** es una DF- (ver [diferencias, ajustes y mermas](diferencias-ajustes-y-mermas.md)). Así la misma cosa no está en dos bandejas.
5. **Los tipos son del código, no del negocio:** van en un CHECK con todos los de abajo desde esta fase; la columna «Desde» dice cuándo empieza a abrirse cada uno.

## Los tipos

| Tipo | Qué pasó | La abre | Bandeja | Desde |
|---|---|---|---|---|
| `dispositivo_revocado` | Llegó de un aparato revocado algo que pasó antes de revocarlo: quedó retenido | La subida (ver [sincronización](../../cimientos/SINCRONIZACION.md#el-aparato-revocado)) | Bodega | Fase 9 |
| `cuadre_proyeccion` | La existencia guardada no era la del libro (el cuadre la corrigió), o un tramo de un traspaso no cuadra | El cuadre | Bodega | Fase 9 |
| `sin_confirmar` | Algo lleva más de `inventario.dias_sin_confirmar_excepcion` en camino o en tránsito | El cuadre | Bodega | Fase 9 |
| `reserva_sin_documento` | Una reserva activa cuyo documento ya se canceló o se cerró | El cuadre | Bodega | Fase 9 |
| `rollo_en_dos_lugares` | Un rollo con metros en dos ubicaciones, o entregado fuera del Taller | El cuadre | Bodega | Fase 11 |
| `pasa_tope_bulto` | La tablet registró en un bulto más piezas de las que tiene | Producción, al recibir el registro | Bodega; la ve Producción | Fase 12 |
| `lote_no_en_proceso` | Un registro de la tablet de un lote ya revisado o en aduana | Producción | Bodega; la ve Producción | Fase 12 |
| `referencia_desconocida` | Un comando de un aparato trae un documento o un archivo que no existe, o que es de otra ubicación | El módulo del comando | Bodega | Con el POS |
| `pedido_linea_sin_pieza` | Un W- sin pieza en ningún lado: su reserva quedó en Bodega, en negativo | [Reservas](reservas.md) | Bodega | Fase 18 |
| `pago_despues_de_vencer` | Llegó el pago de un W- cuyas reservas ya vencieron, y ya no hay pieza | [Reservas](reservas.md) | Bodega | Fase 18 |
| `variante_sin_canal_linea` | Un W- trae una prenda que no se vende en línea | Tienda en línea | Bodega | Fase 18 |
| `totales_no_cuadran` | Los totales que mandó el sitio o la caja no salen de sus renglones | Tienda en línea; la caja | Contaduría | Fase 18 |
| `pago_de_pedido_cancelado` | Llegó el pago de un W- ya cancelado | Tienda en línea | Contaduría | Fase 18 |
| `cancelacion_tardia` | Una cancelación llegó cuando el otro lado ya la había atendido | La caja | Bodega | Con el POS |
| `recepcion_duplicada` | La caja recibió un despacho que ya estaba recibido | La caja | Bodega | Con el POS |
| `conteo_no_coincide` | El conteo de una tienda no da lo que el sistema decía a esa hora | La caja | Bodega | Con el POS |
| `folio_repetido` · `hora_adelantada` · `turno_desconocido` · `turno_cerrado` · `turnos_abiertos_dos` · `devuelve_de_mas` · `entrega_de_mas` · `entrega_sin_recibir` | Lo que no cuadra en la caja de una tienda | La caja | Bodega | Con el POS |
| `anticipo_mayor_total` · `corte_no_coincide` · `corte_repetido` | Lo de dinero que no cuadra en la caja o en su corte | La caja; Contaduría | Contaduría | Con el POS |

## La tabla `excepciones`

| Columna | Tipo | Nulo | Qué es |
|---|---|---|---|
| `id` | uuid | no | Llave |
| `tipo` | text | no | CHECK con los tipos de arriba |
| `area` | text | no | CHECK (`bodega`, `contaduria`). default `bodega`. Va a `contaduria` lo de dinero |
| `estado` | text | no | CHECK (`por_revisar`, `resuelta`) |
| `descripcion` | text | no | Qué pasó, en palabras |
| `ubicacion_id` · `variante_id` | uuid | sí | → `ubicaciones.id` y `variantes.id` |
| `documento_tipo` · `documento_id` · `documento_folio` | text · uuid · text | sí | El documento, con el vocabulario de `movimientos.documento_tipo` |
| `comando_id` | uuid | sí | → `comandos_recibidos.id` |
| `dispositivo_id` | uuid | sí | → `dispositivos.id`: de dónde llegó |
| `persona_id` | uuid | sí | → `personas.id` |
| `cuadre_id` | uuid | sí | → `cuadres.id` |
| `datos` | jsonb | sí | Lo que llegó, tal cual |
| `detectada_en` | timestamptz | no | |
| `resuelta_en` · `resuelta_por` · `resolucion` | timestamptz · uuid · text | sí | Llenos con `resuelta` (CHECK); la resolución, de al menos 5 letras |

- Lleva las columnas comunes (ver [base de datos](../../cimientos/BASE-DE-DATOS.md#columnas-comunes)).
- **Índices:** (`area`, `estado`, `detectada_en`) donde está `por_revisar` · (`tipo`) · (`documento_id`) · (`comando_id`).

## Estados

| De | A | Acción | Quién |
|---|---|---|---|
| — | `por_revisar` | El servidor aplica algo que no cuadra, o el cuadre lo encuentra | La API |
| `por_revisar` | `resuelta` | «Resolver», con lo que se hizo | Bodega; Producción las del taller; Contaduría las de su bandeja |
| `por_revisar` | `resuelta` | La dueña aplica el movimiento retenido de un aparato revocado | La API, con `inventario.marcar_excepcion_resuelta` |

## Acciones

### `inventario.resolver_excepcion`

| | |
|---|---|
| **Pantalla** | Bodega · Excepciones (o Pendientes) · «Resolver» → ventana; las del taller también desde Producción; las de dinero desde Contaduría |
| **Quién** | Bodega. Las del taller (`pasa_tope_bulto`, `lote_no_en_proceso`), también Producción. Las de `area = contaduria`, Contaduría |
| **Recibe** | `excepcion_id` · uuid · obligatorio<br>`resolucion` · texto · al menos 5 letras · obligatorio<br>`version` · obligatorio |
| **Reglas y errores** | `400`: «Escribe qué se hizo»<br>`422 ya_resuelta`: «Ya la resolvió {nombre}» |
| **Escribe** | La excepción en `resuelta`, con quién, cuándo y su resolución. Nada más: no mueve inventario |
| **Regresa** | «Excepción resuelta: queda en Resueltas» |
| **Eventos** | `excepcion.resuelta` |
| **Bitácora** | «Resolvió la excepción {tipo}», con qué pasó y qué se hizo |

## Acciones internas

### `inventario.registrar_excepcion`

| | |
|---|---|
| **La llaman** | Cualquier módulo que aplicó lo que llegó y no cuadra: la subida de un aparato (`dispositivo_revocado`), el cuadre, Reservas, Producción, Tienda en línea y, con el POS, la caja |
| **Recibe** | `tipo` y `descripcion`, obligatorios; y, si los hay, `area`, `ubicacion_id`, `variante_id`, el documento, `comando_id`, `dispositivo_id`, `persona_id`, `cuadre_id` y `datos` |
| **Reglas** | `tipo_desconocido`: un tipo que no está en el CHECK es un error del programa |
| **Escribe** | La excepción en `por_revisar`, con `detectada_en` |
| **Regresa** | `excepcion_id`, para que la subida lo guarde en el comando (`excepcion`) |
| **Eventos** | `excepcion.creada`: la pastilla de su bandeja, en vivo |

### `inventario.marcar_excepcion_resuelta`

| | |
|---|---|
| **La llama** | `admin.aplicar_comando_retenido`, cuando la dueña aplica el movimiento que llegó de un aparato revocado (ver [dispositivos](../admin/dispositivos.md#adminaplicar_comando_retenido)) |
| **Recibe** | `excepcion_id` · `resolucion` (ya armada: «Se aplicó el movimiento retenido») · `resuelta_por` |
| **Reglas** | Si ya está resuelta, no hace nada y no falla: el comando ya se aplicó |
| **Escribe** | La excepción en `resuelta`. No mueve inventario: lo mueve la acción del comando |
| **Eventos** | `excepcion.resuelta` |

## Permisos

- Ver la bandeja y resolver: Bodega; las del taller, también Producción; la de dinero, Contaduría.
- Dirección ve cuántas hay por revisar en sus indicadores.

## Eventos

`excepcion.creada` · `excepcion.resuelta`.

## Lo que llega después

- Cada tipo empieza a abrirse con la fase que dice su tabla.
- **Con el POS:** los tipos de la caja, y la caja ve en la respuesta de su subida (`excepcion`) lo que no cuadró.

## Cómo está hecho

*Lo escribe Claude Code al terminar la fase 9.*

**Fase 9, parte 4.**

- **La tabla** `excepciones` está en `modulos/inventario/tablas.ts` (migración `0029`), con sus CHECK:
  - el tipo (los 27 de este archivo), el área, el estado y el tipo de documento;
  - `resuelta` si y solo si tiene su hora y su resolución.
- **Sus llaves:** `comando_id` es una llave diferida, que se revisa al confirmar: la subida abre la excepción antes de guardar su comando (decisión 487). `cuadre_id` lleva su `@llavePendiente` hasta la parte 5. `comandos_recibidos.excepcion_id` ya es llave foránea.
- **Las internas** están en `internas/excepciones.ts`:
  - `registrar_excepcion` abre la excepción en su bandeja (los tipos de dinero van a Contaduría), con el comando, el aparato y la persona de quien la abre, y guarda `excepcion.creada`. Un tipo que no es del código es un `Error` (`tipo_desconocido`).
  - `marcar_excepcion_resuelta` no hace nada si ya estaba resuelta.
- **`inventario.resolver_excepcion`** (`acciones/resolver-excepcion.ts`) revisa la bandeja de quien resuelve: Bodega lo de Bodega, Producción las del taller, Contaduría las de dinero y la dueña todo (decisión 490). Pide al menos `general.largo_minimo_motivo` letras y la versión de la excepción. No mueve nada.
- **Quién abre cada una:**
  - **La subida:** lo retenido de un aparato revocado abre `dispositivo_revocado`, con su carga sin secretos, y la respuesta trae la excepción (decisión 488).
  - **Reservas:** abre `pedido_linea_sin_pieza` y `pago_despues_de_vencer` (decisión 492).
  - **El módulo de prueba** abre las suyas de verdad: `pasa_tope_bulto` y `cancelacion_tardia` (decisión 489).
- **Pruebas:**
  - `acciones/resolver-excepcion.prueba.ts`, con las cuentas de prueba nuevas de Bodega, Producción y Contaduría (decisión 493);
  - `modulos/admin/acciones/aplicar-comando-retenido.prueba.ts`;
  - `internas/reservar.prueba.ts`, el W- sin pieza;
  - `nucleo/sincronizacion/subir.prueba.ts` y `revocado.prueba.ts`.
