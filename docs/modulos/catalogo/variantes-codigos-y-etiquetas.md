# Variantes, códigos y etiquetas

> **Qué cubre:** cada talla de un producto con su código de barras para siempre: el rango de la fábrica y el de las tiendas, el estado de su etiqueta, imprimir etiquetas, el aviso cuando quedan pocos códigos y lo que baja a la tablet.
> **Estado:** Decidido.
> **Se construye en:** [fase 8](../../fases/08-catalogo.md).
> **Se conecta con:** [productos](productos.md) · [tallas y tipos de prenda](tallas-y-tipos-de-prenda.md) · [precios](precios.md) · [listas de precios](listas-de-precios.md) · [folios](../admin/folios.md) · [archivos](../admin/archivos.md) · [etiquetas](../../impresos/etiquetas.md) · [migración](../../MIGRACION.md) · [pantallas de Catálogo](../../interfaz/fabrica/catalogo.md) · [reclamos y devoluciones](../calidad/reclamos-y-devoluciones.md) · [recepción del taller](../inventario/recepcion-del-taller.md) · [pedidos en línea](../linea/pedidos-en-linea.md)

## Para qué sirve

Una variante es un producto en una talla. Lleva un código de barras de 6 dígitos que nunca cambia y nunca se vuelve a usar: es lo que escanean las cajas y Aduana, y lo que encuentra la búsqueda «¿Dónde está?». La existencia, las reservas, los lotes y los pedidos se llevan por variante.

Ejemplo: Catálogo da de alta el pants deportivo con Infantil de 4 a 16. Nacen 7 variantes con los códigos 100266 a 100272, todas «Por imprimir». En Etiquetas aprieta «PDF de 7 etiquetas»: sale el PDF, las 7 quedan impresas y el aviso dice «PDF de 7 etiquetas de Pants deportivo listo. Ya se pueden recibir en las tiendas».

## Reglas

1. **Un código para siempre.** Seis dígitos, Code 128, único en toda la tabla. Nunca se recicla ni se renumera: una talla dada de baja conserva su código «retirado», y descontinuar tampoco lo libera.
2. **Los códigos de fábrica van del 100001 al 499999** y salen del contador `codigo_barras` de [folios](../admin/folios.md), nunca de «el mayor más uno». Un alta con varias tallas toma todos sus códigos seguidos en un solo paso. Al llegar a 499999 no hay más: la acción contesta `sin_codigos`.
3. **El rango 5xxxxx (500001 a 599999) es de los códigos que ya nacieron en las tiendas** y se migran tal cual, con `codigo_migrado_de_tienda`. Las tiendas ya no crean códigos. Al migrar, el contador de fábrica arranca en el mayor código de fábrica más uno (ver [migración](../../MIGRACION.md)).
4. **El estado de la etiqueta:**

   | Estado | Qué significa | Cómo llega |
   |---|---|---|
   | `por_imprimir` | Talla normal nueva: le falta su etiqueta | Al nacer |
   | `impresa` | Ya tiene etiqueta | Al generar su PDF en Catálogo |
   | `por_reimprimir` | Su etiqueta trae un precio viejo | Cambió el precio de mostrador que cobra esa talla y `catalogo.etiqueta_lleva_precio` está prendido |
   | `al_fabricar` | Talla de pedido especial: se etiqueta con su pedido | Al nacer; no cambia |

   Reimprimir una etiqueta ya impresa no cambia su estado.
5. **El precio va en la etiqueta solo si la dueña lo decide** con `catalogo.etiqueta_lleva_precio` (no, al inicio; decisión de integración 33). Con «sí», un cambio del precio de mostrador marca para reimprimir las tallas normales activas, ya impresas, que cobran ese precio: con el precio base, todas las que no tienen precio propio; con un precio de talla, solo esa (ver [precios](precios.md)).
6. **Lo que no se etiqueta en Catálogo:** las tallas de pedido especial (salen con su lote), las descontinuadas y las dadas de baja.
7. **Las etiquetas de un lote recibido las imprime Aduana,** donde está la impresora, al recibir el lote ([recepción del taller](../inventario/recepcion-del-taller.md)). Ese «impresas» es del lote recibido, no de la variante.
8. **La existencia de una variante en la ficha** es la suma de todas las ubicaciones; sale en ámbar con `catalogo.pocas_piezas` (5) o menos, y «Sin recibir» si la variante todavía no tiene ningún movimiento. La cuenta la da Inventario (ver [existencias y cuadre](../inventario/existencias-y-cuadre.md)).
9. **Las variantes son parte del producto:** cada cambio de una variante sube la versión del producto (ver [idempotencia y concurrencia](../../cimientos/IDEMPOTENCIA-Y-CONCURRENCIA.md)).

Agregar, descontinuar, reactivar y dar de baja una talla están en [tallas y tipos de prenda](tallas-y-tipos-de-prenda.md); las variantes del alta, en [productos](productos.md).

## La tabla `variantes`

| Columna | Tipo | Nulo | Qué es |
|---|---|---|---|
| `id` | uuid | no | Llave |
| `producto_id` | uuid | no | → `productos.id` |
| `talla_id` | uuid | no | → `tallas.id` |
| `codigo` | text | no | CHECK `^[0-9]{6}$` |
| `codigo_migrado_de_tienda` | boolean | no | default false. CHECK: falso con un código de 100001 a 499999; verdadero con uno de 500001 a 599999 |
| `es_pedido_especial` | boolean | no | default false |
| `estado_etiqueta` | text | no | CHECK (`por_imprimir`, `impresa`, `por_reimprimir`, `al_fabricar`). CHECK: `al_fabricar` si y solo si `es_pedido_especial` |
| `etiqueta_impresa_en` · `etiqueta_impresa_por` | timestamptz · uuid | sí | La última vez que pasó a `impresa`. Llenos en `impresa` y en `por_reimprimir`, salvo `etiqueta_impresa_por` en las que entraron con la [migración](../../MIGRACION.md#las-cargas-de-arranque), que ya traían su etiqueta |
| `reimprimir_desde` | timestamptz | sí | Cuándo pasó a `por_reimprimir`. Lleno solo en ese estado |
| `descontinuada_en` · `descontinuada_por` · `motivo_descontinuada` | timestamptz · uuid · text | sí | Talla descontinuada. El motivo va lleno con la fecha (CHECK) |
| `reactivada_en` · `reactivada_por` | timestamptz · uuid | sí | La última reactivación de una talla descontinuada |
| `baja_en` · `baja_por` · `motivo_baja` | timestamptz · uuid · text | sí | Talla dada de baja. El motivo va lleno con la fecha (CHECK) |

- No lleva `reactivado_en`: una talla dada de baja no vuelve.
- Lleva las columnas comunes y, como baja a la tablet, `xid_escritura` (ver [base de datos](../../cimientos/BASE-DE-DATOS.md#columnas-comunes)). Las columnas `_por` apuntan a `usuarios.id`.
- **Índices:** único (`codigo`) · único (`id`, `producto_id`), para la llave compuesta de `precios` · único (`producto_id`, `talla_id`) donde `baja_en` es nulo · (`producto_id`) · (`producto_id`) donde `estado_etiqueta` es `por_imprimir` o `por_reimprimir` y `baja_en` es nulo · (`version`).

## Acciones

### `catalogo.imprimir_etiquetas`

| | |
|---|---|
| **Pantalla** | Catálogo · Etiquetas · «PDF de {n} etiquetas» (las variantes nuevas de un producto) y «Generar PDF» (por variante); Productos o Listas de precios · barra de selección · «Imprimir etiquetas» → ventana «Etiquetas de {n} productos» · «Generar PDF · {n} etiquetas» |
| **Quién** | Catálogo |
| **Recibe** | Una de las dos:<br>· `renglones` · lista: por variante, `variante_id` y `cuantas` (de 1 a `catalogo.etiquetas_max_por_talla`);<br>· `producto_ids` · lista: una etiqueta por cada variante activa normal de esos productos.<br>`solo_pendientes` · booleano · opcional: solo las `por_imprimir` y `por_reimprimir` (el botón de las variantes nuevas) |
| **Reglas y errores** | `400`: «Sin etiquetas» (el total en cero)<br>Con `renglones`, cada variante tiene que poder etiquetarse:<br>· `422 talla_especial`: «La talla {t} es de pedido especial: se etiqueta al fabricar el pedido.»<br>· `422 talla_dada_de_baja`: «La talla {t} está dada de baja: su código ya no se imprime.»<br>· `422 talla_descontinuada`: «La talla {t} está descontinuada: ya no se etiqueta.»<br>Con `producto_ids`, esas tallas simplemente no entran |
| **Escribe** | El PDF con las etiquetas, generado y guardado antes de confirmar: si algo falla, nada queda marcado. Las variantes `por_imprimir` o `por_reimprimir` que entraron pasan a `impresa`, con quién y cuándo, y sube la versión de su producto. Las que ya estaban impresas no cambian |
| **Llama** | `admin.guardar_archivo`, con el propósito `etiqueta` |
| **Regresa** | `archivo_id`, la dirección firmada del PDF y cuántas etiquetas. «PDF de {n} etiquetas de {producto} listo. Ya se pueden recibir en las tiendas» (las nuevas de un producto) o «PDF de {n} etiquetas listo» |
| **Eventos** | `etiquetas.impresas` |
| **Bitácora** | Un renglón por producto (ver [bitácora](../admin/bitacora.md)): «Imprimió {n} etiquetas de {producto}» |

Cómo se ve cada etiqueta es el tipo `prenda` de [etiquetas](../../impresos/etiquetas.md): prenda, «{escuela o Básico} · Talla {t}», las barras, el código, el precio de mostrador si `catalogo.etiqueta_lleva_precio` lo pide (con el recargo en una talla de pedido especial) y «Pedido especial» si lo es.

**Reimprimir sin cambiar nada** no es una acción: es `GET /v1/etiquetas/prenda/{variante_id}?formato=pdf&copias={n}` (ver [impresión](../admin/impresion.md)).

## Trabajos

### Revisar los códigos de barras que quedan · `catalogo.revisar_codigos_de_barras`

| | |
|---|---|
| **Cuándo** | Cada día a las 04:00, hora de México. Es mecánico: no depende de una decisión del negocio |
| **Lee** | Cuántos códigos de fábrica quedan, con `admin.siguiente_folio` (`codigo_barras`) |
| **Escribe** | Solo el aviso |
| **Avisa** | Si quedan menos de `catalogo.codigos_restantes_aviso` (5,000): el aviso `codigos_por_acabarse` a la dueña, «Quedan {n} códigos de barras de fábrica (hasta 499999).» Uno por semana mientras siga abajo |
| **Repetible** | Su clave de periodo es el día. Si ya hay un aviso de este tipo de los últimos 7 días, no crea otro |

### El aviso `codigos_por_acabarse`

| Lo hace nacer | A quién | Texto | Correo al inicio |
|---|---|---|---|
| El trabajo de arriba | La dueña | «Quedan {n} códigos de barras de fábrica (hasta 499999).» | Sí |

Se suma a los tipos de [avisos](../admin/avisos.md) con la misma forma, y su migración lo agrega al CHECK de `avisos.tipo`.

## Lecturas

### `catalogo.variante_por_codigo(codigo)`

| | |
|---|---|
| **La usa** | Calidad, con el código de la prenda de un reclamo (ver [reclamos y devoluciones](../calidad/reclamos-y-devoluciones.md)). Se construye en la fase 13 |
| **Regresa** | La variante de ese código, con su producto y su talla, o nada |

### `catalogo.datos_variantes(variantes)`

Se construye en la [fase 18](../../fases/18-tienda-en-linea-direccion-y-contador.md), con los pedidos en línea.

| | |
|---|---|
| **La usa** | Tienda en línea, al recibir un W- (ver [pedidos en línea](../linea/pedidos-en-linea.md)) |
| **Regresa** | Por variante: su producto y su nombre, su talla, si está dada de baja y si su producto se vende en línea (activo y con el canal «Tienda en línea») |

## Lo que baja a la tablet

| Tabla | Filtro | Columnas |
|---|---|---|
| `variantes` | Todas, también las dadas de baja | `id`, `producto_id`, `talla_id` |

Nunca bajan a la tablet el código de barras ni nada de precios. Con [productos](productos.md#lo-que-baja-a-la-tablet) y [tallas](tallas-y-tipos-de-prenda.md#lo-que-baja-a-la-tablet), la tablet arma «{prenda} · talla {t}» de cada bulto.

**Por qué bajan todas y no solo las de los lotes en proceso:** un lote que entra a la tablet no cambia estos renglones. Con un filtro por lote, Producción tendría que tocar el catálogo para que bajaran (ver [sincronización](../../cimientos/SINCRONIZACION.md#filtros-que-cambian-sin-tocar-el-renglón)), y eso le subiría la versión al producto y le daría un `409` a quien tiene abierta su ficha. Son pocos renglones y no traen nada que la tablet no deba ver.

## Parámetros

Los cambia solo la dueña, en Configuración (ver [configuración](../admin/configuracion.md)).

| Parámetro | Valor inicial | Sección | Baja a | Para qué |
|---|---|---|---|---|
| `catalogo.etiqueta_lleva_precio` | No | Decisiones de operación | Caja (con el POS) | Si la etiqueta lleva el precio de mostrador y un cambio de ese precio marca para reimprimir |
| `catalogo.codigos_restantes_aviso` | 5,000 | Parámetros | — | Con menos códigos de fábrica, avisa a la dueña |
| `catalogo.etiquetas_max_por_talla` | 999 | Técnicos | — | Cuántas etiquetas de una talla en un solo PDF |
| `catalogo.pocas_piezas` | 5 | Parámetros | — | Con esta existencia o menos, la variante sale en ámbar en la ficha |
| `avisos.correo_codigos_por_acabarse` | Sí | Parámetros | — | Si el aviso de códigos va también por correo |

## Permisos

- Imprimir etiquetas: Catálogo.
- Las variantes las leen casi todos los departamentos: son los renglones de las existencias, de los lotes y de los pedidos. Lo que se recorta son los precios, que viven en [precios](precios.md).

## Eventos

`etiquetas.impresas`. Los de las tallas están en [tallas y tipos de prenda](tallas-y-tipos-de-prenda.md#eventos).

## Lo que llega después

- **Fase 13:** la lectura `catalogo.variante_por_codigo`, para los reclamos de Calidad.
- **Fase 14:** las etiquetas de los lotes que recibe Aduana.
- **Fase 20:** el tipo de etiqueta `prenda` con su ZPL y su PDF; desde entonces `catalogo.imprimir_etiquetas` genera el PDF real. Antes se prueba con el tipo de etiqueta de prueba de la fase 4.
- **Fase 23:** la migración de los códigos que nacieron en tienda y el arranque del contador de fábrica.
- **Con el POS:** las variantes bajan a la caja de cada tienda, todas, también las dadas de baja, para que un código viejo siga resolviendo; sin `etiqueta_impresa_por`, `descontinuada_por` ni `baja_por`. La caja arma su lista «Cambios de catálogo» con lo que baja (tallas nuevas y, con `catalogo.etiqueta_lleva_precio`, las tallas por reimprimir). Un código que una tienda escanea y no existe llega a Catálogo como «Código no registrado».

## Cómo está hecho

**Fase 8, parte 3.**

- **La tabla** `variantes` es de `catalogo` (migración `0024`), con sus CHECK (el código de 6 dígitos y su rango según si vino de tienda, el estado de la etiqueta, `al_fabricar` solo en pedido especial, la impresión y el reimprimir con su fecha, el motivo de descontinuar y de la baja), su único de código, el de (`id`, `producto_id`) para la llave de `precios`, el de la talla viva por producto y `xid_escritura`.
- **Los códigos** salen del contador `codigo_barras` en un solo paso por alta (`tomarCodigos`, en `dominio/productos.ts`): seguidos aunque haya dos altas a la vez, y nunca se reciclan.
- **Lo que baja a la tablet** (`bajada.ts`): todas las variantes, solo con su producto y su talla, después de las tallas y los productos; nunca el código.

**Fase 8, parte 5.**

- **`catalogo.imprimir_etiquetas`** (`acciones/imprimir-etiquetas.ts`) lleva una de las dos listas; las dos juntas o ninguna son «Sin etiquetas», que revisa la acción (decisión 452). Con `renglones` rechaza pedido especial, descontinuadas y dadas de baja, y el máximo por talla; con `producto_ids` esas tallas no entran. Dibuja con el tipo de etiqueta `prenda`, un id por etiqueta, y guarda el PDF con `admin.guardar_archivo` (propósito `etiqueta`) antes de marcar nada: si el PDF no se guarda, la acción falla y nada cambia. Las pendientes pasan a `impresa` y su producto sube de versión; deja un renglón de bitácora por producto y el evento `etiquetas.impresas`. El mensaje de «ya se pueden recibir» es el de las nuevas de un producto (`solo_pendientes` con un solo producto, decisión 455).
- **El tipo `prenda`** lo registra por ahora el módulo de prueba, con el mismo dibujo que el tipo `prueba` (decisión 451); la fase 20 lo pasa a `catalogo` con su dibujo real.
- **El trabajo** `catalogo.revisar_codigos_de_barras` (`trabajos/revisar-codigos-de-barras.ts`) corre a las 04:00, lee `quedan` de `admin.siguiente_folio` y, abajo de `catalogo.codigos_restantes_aviso`, avisa a la dueña si no hubo un aviso igual en los últimos 7 días (decisión 453).
- **El aviso** `codigos_por_acabarse` entra al CHECK de `avisos.tipo` con la migración `0025`, y su correo con `avisos.correo_codigos_por_acabarse` (decisión 454).
- **Pruebas:** `acciones/imprimir-etiquetas.prueba.ts` (las nuevas de un producto, reimprimir sin tocar, las tallas que no se etiquetan, «Sin etiquetas» y el máximo, y sin almacén nada queda marcado) y `trabajos/revisar-codigos-de-barras.prueba.ts` (el aviso una vez por semana y su horario).

**Fase 8, correcciones de la auditoría.**

- **`catalogo.imprimir_etiquetas`** bloquea primero los productos, en orden por id, y luego las variantes: el mismo orden que el alta, las tallas y «Aplicar cambios» (decisión 464).
- **El aviso de códigos** dice el último código con lo que da `admin.siguiente_folio` (el siguiente más los que quedan), no con un número fijo.
