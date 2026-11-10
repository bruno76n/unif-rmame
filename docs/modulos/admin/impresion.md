# Impresión

> **Qué cubre:** las impresoras de etiquetas registradas, los trabajos de impresión que el programa puente manda a la Zebra en ZPL, la confirmación de lo impreso, y el PDF cuando no hay puente.
> **Estado:** Decidido.
> **Se construye en:** [fase 4](../../fases/04-servicios-comunes.md).
> **Se conecta con:** [puente de impresión](../../apps/puente-de-impresion.md) · [etiquetas](../../impresos/etiquetas.md) · [hojas](../../impresos/hojas.md) · [archivos](archivos.md) · [corte y bultos](../produccion/corte-y-bultos.md) · [eventos y trabajos](../../cimientos/EVENTOS-Y-TRABAJOS.md) · [pantallas de Administración](../../interfaz/fabrica/administracion.md) · [surtido y despachos](../inventario/surtido-y-despachos.md) · [pantallas de Aduana](../../interfaz/fabrica/aduana.md) · [pantallas de Producción](../../interfaz/fabrica/produccion.md)

## Para qué sirve

En Aduana y en el taller hay una impresora de etiquetas Zebra ZD421 conectada a la red de la fábrica. Cuando alguien aprieta «Imprimir etiquetas» (los bultos del L-2026-122, los rollos de una recepción), la API guarda un trabajo de impresión y avisa en vivo al programa puente de esa computadora; el puente baja la etiqueta en ZPL, la manda a la Zebra y confirma. Si la impresora no está conectada, la pantalla ofrece el PDF para imprimir en cualquier impresora.

## Reglas

1. **Una impresora pertenece a una ubicación** (Aduana, Taller) y tiene su programa puente: el aparato registrado de tipo `puente_impresion` que le manda los trabajos. Un puente atiende una sola impresora: la dirección de esa Zebra en la red vive en la configuración del puente, no aquí (ver [puente de impresión](../../apps/puente-de-impresion.md)).
2. **Imprimir es pedir un trabajo:** la acción de cada módulo llama a `admin.mandar_a_imprimir` con el tipo de etiqueta, lo que se imprime y las copias. El trabajo nace `por_imprimir`.
3. **El puente se entera en vivo** (el evento `impresion`, ver [eventos y trabajos](../../cimientos/EVENTOS-Y-TRABAJOS.md)), pide sus trabajos y al entregárselos pasan a `mandado`.
4. **El puente confirma cada trabajo:** `impreso` o `fallo` con lo que dijo la impresora. Un trabajo terminado no cambia; un reintento de la confirmación recibe la misma respuesta.
5. **Quien pidió imprimir se entera:** «Etiquetas impresas en {impresora}» o «No se imprimió en {impresora}: {error}. Usa el PDF.».
6. **Una impresora está conectada** si su puente dio señales en los últimos `admin.minutos_puente_sin_contacto` (5 minutos) con una versión que no es menor que la mínima (ver [API](../../cimientos/API.md#la-versión-de-la-app)). Si no: «La impresora de {ubicación} no está conectada. Usa el PDF.», y la acción que pidió imprimir ofrece el PDF. El puente pregunta por sus trabajos cada minuto aunque no le lleguen avisos, así que callado más de 5 minutos es que no está.
7. **La etiqueta y la hoja no traen lo que la cuenta no puede ver.** La excepción es el precio de mostrador en la etiqueta de prenda: es el que ve el cliente, y va solo si `catalogo.etiqueta_lleva_precio` lo pide, la imprima quien la imprima (ver [variantes, códigos y etiquetas](../catalogo/variantes-codigos-y-etiquetas.md) y [etiquetas](../../impresos/etiquetas.md)). Ninguna lleva costos.
8. **El contenido de cada etiqueta y de cada hoja** lo define su archivo en [etiquetas](../../impresos/etiquetas.md) y [hojas](../../impresos/hojas.md). Este archivo es dueño del mecanismo: las impresoras, los trabajos y la ruta que los sirve.

## La tabla `impresoras`

| Columna | Tipo | Nulo | Qué es |
|---|---|---|---|
| `id` | uuid | no | Llave |
| `nombre` | text | no | Como sale en pantalla. Hasta 40 |
| `modelo` | text | no | Hasta 40 |
| `ubicacion_id` | uuid | no | → `ubicaciones.id` |
| `dispositivo_id` | uuid | sí | → `dispositivos.id`: el programa puente de esa computadora |
| `baja_en` · `baja_por` · `motivo_baja` | | sí | Dada de baja |

Lleva las columnas comunes. `dispositivo_id` lleva su `@llavePendiente` hasta la fase 6.

## La tabla `trabajos_impresion`

| Columna | Tipo | Nulo | Qué es |
|---|---|---|---|
| `id` | uuid | no | Llave |
| `impresora_id` | uuid | no | → `impresoras.id` |
| `tipo` | text | no | El tipo de etiqueta (abajo) |
| `ids` | uuid[] | no | Lo que se imprime |
| `copias` | smallint | no | De 1 a `admin.copias_max_impresion` |
| `estado` | text | no | CHECK (`por_imprimir`, `mandado`, `impreso`, `fallo`) |
| `mandado_en` | timestamptz | sí | Cuando el puente lo recibió |
| `terminado_en` | timestamptz | sí | |
| `error` | text | sí | Obligatorio con `fallo`. Hasta 200 |
| `pedido_por` | uuid | sí | → `usuarios.id` |
| `sesion_id` | uuid | sí | → `sesiones.id`: para avisarle el resultado |

Lleva las columnas comunes. **Índice:** (`impresora_id`, `creado_en`) donde `estado = 'por_imprimir'`. `pedido_por` y `sesion_id` llevan su `@llavePendiente` hasta la fase 5.

## Los tipos de etiqueta y de hoja

| Tipo | Qué es | Su módulo |
|---|---|---|
| `prenda` | La etiqueta de una variante, con su código de barras | catalogo |
| `rollo` | La etiqueta de un rollo; si quedó como retazo, la del retazo RZ- | inventario |
| `traspaso` | Todas las etiquetas que lleva un A- al salir de aduana: una de prenda por pieza de un lote o un reproceso, o una de rollo por rollo del material de un proveedor | inventario |
| `bulto` | La etiqueta de cada bulto | produccion |
| `lote` | La hoja del lote | produccion |
| `despacho` | La hoja de un despacho de Aduana | inventario |
| `orden_compra` | La hoja de la orden de compra | compras |
| `pedido` · `nota_entrega` | Las hojas del pedido y de la nota de entrega | ventas |
| `guia` | La guía de la paquetería, desde su archivo | linea |

Cada tipo lo registra su módulo en su `index.ts`: qué departamentos lo piden, la función que junta sus datos con el recorte de quien lo pide y su dibujo, que vive en `apps/api/src/impresos/`. Los tipos del negocio los arma la [fase 20](../../fases/20-tablet-puente-de-impresion-e-impresos.md); su contenido está en [etiquetas](../../impresos/etiquetas.md) y [hojas](../../impresos/hojas.md).

## Acciones

### `admin.guardar_impresora`

| | |
|---|---|
| **Pantalla** | Configuración · Empresa · «Impresoras de etiquetas» · «Agregar» / «Cambiar» / «Dar de baja» |
| **Quién** | Administración del sistema · `solo_duena` |
| **Recibe** | `impresora_id` · uuid · opcional: sin él es alta<br>`nombre` · texto · hasta 40 · obligatorio<br>`modelo` · texto · hasta 40 · obligatorio<br>`ubicacion_id` · uuid · obligatorio<br>`dispositivo_id` · uuid · opcional: su programa puente<br>`baja` · booleano · opcional, con `motivo_baja` · texto · de 5 a 80<br>`version` · entero · obligatorio si ya existe |
| **Reglas y errores** | `422 puente_no_valido`: el aparato no es un programa puente o está revocado, «Ese aparato no es un programa de impresión.»<br>`422 puente_ocupado`: ese puente ya atiende otra impresora sin baja, «{puente} ya atiende {impresora}.»<br>`400` en `motivo_baja`: «Escribe el motivo» |
| **Escribe** | `impresoras` |
| **Regresa** | «{nombre} guardada» o «{nombre} dada de baja» |
| **Eventos** | `impresora.cambiada` |
| **Bitácora** | «Agregó la impresora {nombre}» · «Cambió la impresora {nombre}» · «Dio de baja la impresora {nombre}: {motivo}» |

### `admin.confirmar_impresion`

| | |
|---|---|
| **Pantalla** | Ninguna: la manda el programa puente al terminar un trabajo |
| **Quién** | La llave de un `puente_impresion`, y el trabajo es de una impresora suya (si no, `403 fuera_de_alcance`) |
| **Recibe** | `trabajo_id` · uuid · obligatorio<br>`resultado` · `impreso` o `fallo` · obligatorio<br>`error` · texto · hasta 200 · obligatorio con `fallo` |
| **Reglas** | Un trabajo terminado no cambia: el reintento recibe la misma respuesta |
| **Escribe** | `trabajos_impresion`: estado, `terminado_en` y `error` |
| **Eventos** | `impresion.terminada`: el aviso en vivo `impresion_terminada` a la sesión que lo pidió |
| **Bitácora** | Ninguna: imprimir no cambia datos del negocio |
| **Sin internet** | No |

### `admin.mandar_a_imprimir` · interna

| | |
|---|---|
| **La llaman** | Las acciones de imprimir de cada módulo: las etiquetas de bulto, las de un A- en aduana y, con uniformame.mx, las guías |
| **Recibe** | `impresora_id`, o `ubicacion_id` (toma la impresora vigente de esa ubicación) · `tipo` · `ids` · `copias` |
| **Reglas y errores** | `422 impresora_sin_puente`: la impresora no tiene puente o su puente no da señales hace más de `admin.minutos_puente_sin_contacto`, «La impresora de {ubicación} no está conectada. Usa el PDF.» |
| **Escribe** | `trabajos_impresion` en `por_imprimir` |
| **Regresa** | `trabajo_id` |
| **Eventos** | `impresion.pedida`: el aviso en vivo `impresion` al puente |

## Lo que pide el programa puente y la pantalla

### `admin.trabajos_impresion`

| | |
|---|---|
| **Quién** | La llave de un `puente_impresion`. La pide al conectarse, con cada aviso `impresion` y cada `sync.intervalo_segundos` aunque no llegue aviso: es también su señal de vida |
| **Es** | Una acción (`POST`), no una consulta: entregar los trabajos los pasa a `mandado`. Sin bitácora, como confirmar |
| **Regresa** | Los trabajos `por_imprimir` de su impresora, en el orden en que se pidieron: id, impresora, tipo, ids, copias y la ruta de la etiqueta en ZPL. Al entregarlos pasan a `mandado`. Y `rotar_llave`, si ya le toca cambiar su llave (ver [dispositivos](dispositivos.md)) |
| **Recorte** | Solo su impresora |

### `admin.etiqueta` · `GET /v1/etiquetas/{tipo}/{id}?formato=zpl|pdf`

| | |
|---|---|
| **Pantalla** | «Imprimir» y «PDF» de etiquetas y hojas; también el puente al imprimir un trabajo |
| **Quién** | Un departamento que pueda ver ese tipo (lo dice su módulo), o un puente con un trabajo pendiente de esa etiqueta. Las guías piden además el permiso fino `imprime_guias` |
| **Recibe** | `formato` (`zpl` o `pdf`) · `copias` (opcional) · `ids` (opcional: varias del mismo tipo en un solo PDF) |
| **Regresa** | ZPL (`text/plain; charset=utf-8`) o PDF |
| **Recorte** | La etiqueta no trae lo que la cuenta no puede ver |

## Parámetros

| Parámetro | Valor inicial | Para qué |
|---|---|---|
| `admin.copias_max_impresion` | 100 | Las copias que puede llevar un trabajo |
| `admin.minutos_puente_sin_contacto` | 5 min | Sin señales del puente en ese tiempo, la impresora no está conectada |

Los dos van en la sección `tecnico`.

## Permisos

- Agregar, cambiar y dar de baja impresoras: solo la dueña.
- Pedir una impresión o un PDF: el departamento que puede ver ese tipo de etiqueta.
- Pedir y confirmar trabajos: solo el puente, sobre sus impresoras.

## Eventos

`impresora.cambiada` · `impresion.pedida` · `impresion.terminada`.

## Cómo está hecho

*Lo escribe Claude Code al terminar la fase 4.*
