# Productos

> **Qué cubre:** qué es un producto y para quién es, dónde se vende, su alta (desde cero, a partir de otro, desde un pedido o desde un desarrollo), «Aplicar cambios» de la ficha, la foto de referencia, descontinuar y reactivar.
> **Estado:** Decidido.
> **Se construye en:** [fase 8](../../fases/08-catalogo.md).
> **Se conecta con:** [variantes, códigos y etiquetas](variantes-codigos-y-etiquetas.md) · [precios](precios.md) · [folios](../admin/folios.md) · [archivos](../admin/archivos.md) · [recetas](../patronaje/recetas.md) · [desarrollos](../patronaje/desarrollos.md) · [pedidos en línea](../linea/pedidos-en-linea.md) · [pantallas de Catálogo](../../interfaz/fabrica/catalogo.md) · [pantallas de Patronaje](../../interfaz/fabrica/patronaje.md) · [flujo de producto nuevo](../../flujos/fabrica/03-producto-nuevo.md) · [operaciones y flujos](../produccion/operaciones-y-flujos.md) · [mínimos y reabasto](../inventario/minimos-y-reabasto.md) · [pedidos y sus versiones](../ventas/pedidos.md) · [alertas e indicadores](../direccion/alertas-e-indicadores.md) · [pantallas de Tienda en línea](../../interfaz/fabrica/tienda-en-linea.md) · [la tablet del taller](../../apps/tablet.md)

## Para qué sirve

Catálogo decide qué productos existen y cómo se venden. Un producto es una prenda, un accesorio o un servicio de mostrador, con sus tallas (cada una es una [variante](variantes-codigos-y-etiquetas.md) con su código), sus [precios](precios.md) en cada lista, dónde se vende, su categoría para mayoreo y su foto de referencia. El alta sigue con su receta en Patronaje.

Ejemplo: Catálogo crea «Playera polo blanca con escudo» para el Instituto Juan Pablo II a partir de la playera polo blanca básica. Se copian las tallas, los canales, los precios, las medidas y la receta; nacen sus variantes con códigos seguidos y el aviso dice «Playera polo blanca con escudo creado con 7 variantes, códigos 100266 a 100272». Con «Crear y seguir con la receta», Patronaje abre la receta copiada, que queda sin verificar hasta el primer corte.

## Reglas

1. **Para quién:** «Ninguna escuela: básico o general» (escuela vacía) o una escuela, y entonces es un modelo de esa escuela. La pantalla empieza en «Ninguna escuela».
2. **El nombre es único por escuela,** sin importar mayúsculas: dos escuelas sí pueden tener una prenda con el mismo nombre, y entre los básicos tampoco se repite.
3. **Dónde se vende:** mostrador (Tienda 1 y Tienda 2), en línea (uniformame.mx) y a externos (Ventas). Un producto activo tiene al menos uno: «Marca al menos un lugar donde se vende, o descontinúa el producto.»
4. **En línea, solo productos de «Ninguna escuela» y nunca un servicio** (decisión del 6 de noviembre). Catálogo decide si se *puede* vender en línea; publicarlo, las fotos de venta y los textos los decide el panel de uniformame.mx.
5. **Un servicio de mostrador** (bordado de nombre, pegado de escudo) lleva `es_servicio`: nunca se vende en línea, no sale en el buscador del pedido externo y no lleva receta. Tiene su variante de talla única con código, para cobrarse con escáner; su venta en caja no mueve existencia.
6. **La sección decide si lleva receta.** Un producto de una sección con receta lleva tipo de prenda; uno de «Accesorios y servicios» no (ver [escuelas y secciones](escuelas-y-secciones.md)).
7. **El modelo exclusivo de un mayorista** que no es escuela se da de alta como «Ninguna escuela», solo con «Ventas a externos» y con precio solo en la lista de ese cliente.
8. **Los cambios de la ficha se aplican juntos:** canales, categoría, recargo, tipo de prenda y precios van en un solo «Aplicar cambios», en una sola transacción. La foto se guarda en el momento, aparte.
9. **El producto es un agregado:** su versión sube con cualquier cambio en él, en sus variantes o en sus precios. La ficha manda esa versión y, si alguien cambió algo mientras tanto, recibe `409` y la ve completa otra vez (ver [idempotencia y concurrencia](../../cimientos/IDEMPOTENCIA-Y-CONCURRENCIA.md)).
10. **Descontinuar no borra nada:** deja de venderse en todos los canales y sale de las listas de los clientes, pero conserva sus códigos, precios, historial y canales marcados, para cuando se reactive. Descontinuar lleva motivo; reactivar, no.
11. **Ni el alta ni descontinuar mueven inventario.** Un producto nuevo no tiene existencia: sus tallas salen «Sin recibir».

## Estados

| De | A | Acción | Quién |
|---|---|---|---|
| — | activo | «Crear producto», «Crear y seguir con la receta» o «Crear y agregar al pedido» | Catálogo; Ventas desde un pedido |
| activo | descontinuado | «Descontinuar con motivo», uno o varios | Catálogo |
| descontinuado | activo | «Reactivar producto», sin motivo | Catálogo |

Activo es `baja_en` vacío.

## La tabla `productos`

| Columna | Tipo | Nulo | Qué es |
|---|---|---|---|
| `id` | uuid | no | Llave |
| `nombre` | text | no | «Nombre de la prenda», de 4 a 80 |
| `seccion_id` | uuid | no | → `secciones.id` |
| `escuela_id` | uuid | sí | → `escuelas.id`. Vacío: «Ninguna escuela: básico o general» |
| `tipo_prenda_id` | uuid | sí | → `tipos_prenda.id`. Vacío solo en una sección que no lleva receta |
| `flujo_id` | uuid | sí | → `flujos.id`: el flujo de operaciones del taller. Vacío en servicios y en lo que no se fabrica. Lleva su `@llavePendiente` hasta la fase 12 |
| `categoria_mayoreo_id` | uuid | no | → `categorias_mayoreo.id` |
| `es_servicio` | boolean | no | default false |
| `canal_mostrador` · `canal_en_linea` · `canal_externos` | boolean | no | Dónde se vende |
| `recargo_pedido_especial_centavos` | bigint | no | CHECK ≥ 0 y múltiplo de 100. Se suma al precio base de cada lista en las tallas de pedido especial |
| `foto_archivo_id` | uuid | sí | → `archivos.id`. Foto de referencia interna (caja, Ventas, etiquetas) |
| `producto_base_id` | uuid | sí | → `productos.id`: de cuál se copió |
| `baja_en` · `baja_por` · `motivo_baja` · `reactivado_en` | | sí | Descontinuado. Al reactivar se limpian los tres primeros y se pone `reactivado_en` |

- **CHECK:** `canal_en_linea` solo si `escuela_id` va vacío y `es_servicio` es falso · descontinuado, o al menos un canal marcado.
- Lleva las columnas comunes y, como baja a la tablet, `xid_escritura` (ver [base de datos](../../cimientos/BASE-DE-DATOS.md#columnas-comunes)).
- **Índices:** único (`lower(nombre)`, `escuela_id`) con `NULLS NOT DISTINCT` · (`seccion_id`) donde `baja_en` es nulo · (`escuela_id`) · (`version`).

## Acciones

Todas son de la web. Los errores `422` llevan su `codigo` y su mensaje (formato en [API](../../cimientos/API.md)). Los precios van en centavos y son pesos enteros, de $1 a `catalogo.precio_max_centavos` ($99,999); el detalle está en [precios](precios.md).

### `catalogo.crear_producto`

| | |
|---|---|
| **Pantalla** | Catálogo · cajón «Nuevo producto» · «Crear y seguir con la receta» o «Crear producto»<br>Ventas · pedido · «Crear a partir de otro producto» · «Crear y agregar al pedido»<br>Patronaje · cajón del desarrollo · «Dar de alta en catálogo» |
| **Quién** | Catálogo. Ventas a externos, solo con `origen = pedido` |
| **Recibe** | La tabla de abajo |
| **Reglas y errores** | `400`: «Escoge el producto base.» · «Escribe el nombre de la prenda.» (menos de 4 letras) · «Escoge la sección.» · «Marca al menos un grupo de tallas.» · «Marca al menos un lugar donde se vende.» · «Un precio entero, de $1 en adelante.» · «Un precio entero, de $1 a {tope}.» (el tope es `catalogo.precio_max_centavos`) · «Cada lista va una sola vez.» · «Escoge el tipo de prenda.» (no existe) · «Las medidas van en centímetros, mayores que cero.»<br>`422 escuela_dada_de_baja`: «{escuela} está dada de baja: reactívala antes.»<br>`422 nombre_repetido`: «Ya existe una prenda con ese nombre para ese modelo.»; a partir de otro producto: «Ya existe una prenda con ese nombre para ese modelo: cámbiale el nombre o el modelo.»<br>`422 falta_precio_mostrador`: «Falta el precio de mostrador.» (se vende en mostrador)<br>`422 falta_precio_en_linea`: «Falta el precio de la tienda en línea.» (se vende en línea y no hay precio de mostrador del cual tomarlo)<br>`422 falta_precio_cliente`: «Falta el precio de {corta}.» (solo desde un pedido)<br>`422 en_linea_solo_sin_escuela`: «Solo productos de «Ninguna escuela» se venden en línea.»<br>`422 servicio_en_linea`: «Los servicios de mostrador no se venden en línea»<br>`422 externos_obligatorio`: «Desde un pedido, el producto se vende a externos.»<br>`422 falta_tipo_prenda`: «Escoge el tipo de prenda.» (la sección lleva receta y no sale un tipo del producto base ni de la sección)<br>`422 especial_desde_cero`: «Desde cero no hay tallas de pedido especial: se agregan después en la ficha.»<br>`422 talla_no_disponible`: «La talla {t} ya no está en su grupo.»<br>`422 base_no_disponible`: «{producto} ya no está activo: escoge otro producto base.» (también si el base es un servicio)<br>`422 sin_codigos`: «No quedan códigos de barras de fábrica para {n} tallas. Avisa a soporte.»<br>La lista Mayoreo ya no es obligatoria (decisión del 6 de noviembre): el «Falta el precio de mayoreo.» de la muestra no aplica |
| **Escribe** | El producto activo, sin foto, con su base, su tipo de prenda y su recargo resueltos (abajo).<br>Una variante por talla, con códigos seguidos: las normales nacen `por_imprimir`; las de pedido especial, `al_fabricar`.<br>Los precios base de cada lista, con origen `alta_producto`. A partir de otro producto copia también los precios propios de talla del base, en las mismas tallas y listas.<br>Ningún movimiento |
| **Llama** | `admin.tomar_folio` (`codigo_barras`), con un bloque de tantos códigos como tallas |
| **Regresa** | `producto_id`, `variantes` (id, talla y código), `codigo_desde` y `codigo_hasta`. «{producto} creado con {n} variantes, códigos {a} a {b}»; desde un pedido: «{producto} creado en Catálogo y agregado al pedido» |
| **Eventos** | `producto.creado` |
| **Bitácora** | «Producto nuevo con {n} variantes, códigos {a} a {b}», más «, a partir de {base}» si lo tiene, con el producto, sus variantes con código y sus precios en `despues` |

**Lo que recibe:**

| Campo | Tipo | Obligatorio | Notas |
|---|---|---|---|
| `modo` | `desde_cero` o `a_partir_de` | sí | |
| `origen` | `catalogo`, `pedido` o `desarrollo` | sí | De qué pantalla viene |
| `producto_base_id` | uuid | con `a_partir_de` | Activo y no servicio |
| `cliente_id` | uuid | con `origen = pedido` | Da la lista del cliente |
| `desarrollo_id` | uuid | con `origen = desarrollo` | Llega con la fase 10 |
| `nombre` | texto, de 4 a 80 | sí | |
| `seccion_id` | uuid | sí | |
| `escuela_id` | uuid o vacío | sí | Vacío: «Ninguna escuela» |
| `tipo_prenda_id` | uuid | no | Si falta: el del base; si no, el de la sección |
| `categoria_mayoreo_id` | uuid | sí | La pantalla propone la que dice `defecto_para` (ver [listas de precios](listas-de-precios.md#la-tabla-categorias_mayoreo)) |
| `es_servicio` | booleano | no | Falso si no viene |
| `tallas` | lista de `talla_id` y `es_pedido_especial` | sí, al menos una | |
| `canales` | `mostrador`, `en_linea`, `externos` | sí | De entrada solo mostrador; desde un pedido, solo externos |
| `precios` | lista de `lista_id` y `precio_centavos` | según los canales | El precio base de cada lista |
| `medidas` | lista de `medida`, `orden` y `valores` (por talla, `talla_id` y `valor_cm`) | no | Solo `a_partir_de` |
| `recargo_pedido_especial_centavos` | entero ≥ 0, múltiplo de 100 | no | Si falta: el del base; desde cero, `catalogo.recargo_pedido_especial_inicial_centavos` |

**Cómo se resuelve lo que no viene:**

- **Tipo de prenda:** el que viene; si no, el del producto base; si no, el de la sección (`secciones.tipo_prenda_defecto_id`). Si la sección lleva receta y no sale ninguno: `falta_tipo_prenda`.
- **Recargo de pedido especial:** el que viene; si no, el del base; desde cero, `catalogo.recargo_pedido_especial_inicial_centavos` ($50). Después se edita en la ficha. El porcentaje de mayoreo no lo toca.
- **Precio en línea:** si se vende en línea y viene vacío, toma el de mostrador.
- **Tallas:** desde cero, solo normales; a partir de otro, las del base (normales y de pedido especial) que caen en los grupos marcados.
- **Medidas:** van a la versión 1 de la receta copiada del base (fase 10). Si el base no tiene receta, no hay dónde guardarlas: se descartan, con el aviso que no bloquea «Las medidas se capturan con la receta en Patronaje».

### `catalogo.aplicar_cambios_producto`

| | |
|---|---|
| **Pantalla** | Catálogo · cajón «Ficha de producto» · franja «{n} cambios por aplicar» · «Aplicar cambios» |
| **Quién** | Catálogo |
| **Recibe** | `producto_id` · uuid · obligatorio<br>`version` · la de la ficha · obligatorio<br>`canales` · solo los que cambian (`mostrador`, `en_linea`, `externos`) · opcional<br>`categoria_mayoreo_id` · uuid · opcional<br>`recargo_pedido_especial_centavos` · entero ≥ 0, múltiplo de 100 · opcional<br>`tipo_prenda_id` · uuid · opcional<br>`precios` · lista · opcional: por cambio, `lista_id`, `variante_id` (vacío es el precio base) y `precio_centavos` (vacío es quitarlo; en una talla, regresarla al base) |
| **Reglas y errores** | `400`: «El precio de {lista} debe ser un número entero.» · «El precio de {lista} va de $1 a {tope}.» (el tope es `catalogo.precio_max_centavos`) · «Cada precio va una sola vez.» · «Esa sección no lleva receta: sus productos no tienen tipo de prenda.»<br>`422 sin_canal`: «Marca al menos un lugar donde se vende, o descontinúa el producto.»<br>`422 falta_precio`: «Falta el precio de {lista}.» Son obligatorios el de Mostrador si se vende en mostrador, el de En línea si se vende en línea, y el base de una lista de cliente que ya lo tenía<br>`422 en_linea_solo_sin_escuela` · `422 servicio_en_linea` (los mismos del alta)<br>`422 precio_talla_especial`: «La talla {t} es de pedido especial: cobra el precio base más ${recargo}.»<br>`422 lista_no_aplica`: «{lista} no aplica a {producto}: no se vende en ese canal.»<br>`422 producto_descontinuado`: «{producto} está descontinuado: reactívalo para cambiarlo.»<br>`422 sin_cambios`: «Sin cambios»<br>Avisos que no bloquean, de [precios](precios.md#los-avisos-de-la-ficha): mayoreo arriba de mostrador, un cambio de más de `catalogo.aviso_cambio_precio_pct` y, con `catalogo.etiqueta_lleva_precio`, las etiquetas que quedan por reimprimir |
| **Escribe** | En el producto: los canales, la categoría, el recargo y el tipo de prenda que cambiaron.<br>En precios: por cada cambio, cierra el vigente (`reemplazado` o `quitado`) y crea el nuevo con origen `ficha` (ver [precios](precios.md#la-tabla-precios)).<br>Con `catalogo.etiqueta_lleva_precio` y un cambio de Mostrador, las tallas que cobran ese precio y ya estaban impresas pasan a `por_reimprimir` (ver [variantes](variantes-codigos-y-etiquetas.md)).<br>Ningún movimiento |
| **Regresa** | Cuántos cambios y a dónde llegan, para «{n} cambios aplicados a {producto}. Ya llegan a {destinos}». Los destinos: «las tiendas» (Mostrador o Mayoreo), «la tienda en línea» (En línea), «ventas a externos» (una lista de cliente), «todos los canales» (un canal) y «mayoreo» (la categoría) |
| **Llama** | `linea.pausar_publicaciones_producto` (`canal_apagado`), si se apaga «Tienda en línea» (fase 18) |
| **Eventos** | `producto.cambiado` · `precio.cambiado`, uno por lista que cambió |
| **Bitácora** | Un renglón por cambio, para que la bitácora de Catálogo los filtre por tipo y por lista (ver [bitácora](../admin/bitacora.md)): «Precio de {lista}, talla {t}: {antes} → {después} {+n%}» (sin la talla en el precio base) · «Precio de {lista}: {precio} (nuevo)» · «Precio de {lista}: se quita (era {precio})» · «Empieza a venderse {canal}» · «Deja de venderse {canal}» · «{categoría antes} a {categoría después}» · «Recargo de pedido especial: {antes} → {después}» · «Tipo de prenda: {antes} → {después}» |

### `catalogo.subir_foto_producto`

| | |
|---|---|
| **Pantalla** | Ficha de producto · «Subir foto» o «Cambiar foto». Se guarda en el momento, sin «Aplicar cambios» |
| **Quién** | Catálogo |
| **Recibe** | `producto_id` · uuid · obligatorio<br>`archivo_id` · uuid · obligatorio: el que dio `POST /v1/archivos/subida` con el propósito `foto` (ver [archivos](../admin/archivos.md))<br>`version` · la del producto · obligatorio |
| **Reglas y errores** | `422 foto_formato`: «La foto debe ser JPG, PNG o WebP.»<br>`422 foto_pesada`: «La foto pesa más de {n} MB. Súbela más ligera.» (más de `catalogo.foto_max_mb`)<br>Los de `admin.ligar_archivo` (el archivo no terminó de subir, es de otra cuenta o ya es de otro documento) |
| **Escribe** | `foto_archivo_id`. La foto anterior se queda en archivos, ligada a este producto, como historial |
| **Llama** | `admin.ligar_archivo` (propósito `foto`, el producto) |
| **Regresa** | Si ya se puede publicar (se vende en línea): «Foto guardada. {producto} ya se puede publicar en línea» o «Foto guardada». También la versión nueva del producto, para que la ficha siga con sus cambios por aplicar |
| **Eventos** | `producto.cambiado` |
| **Bitácora** | «Cambió la foto de {producto}», con `foto_archivo_id` en `antes` y `despues` |

### `catalogo.descontinuar_productos`

| | |
|---|---|
| **Pantalla** | Ficha · «Descontinuar con motivo»; Productos · barra de selección · «Descontinuar con motivo» → ventana «Descontinuar» |
| **Quién** | Catálogo |
| **Recibe** | `productos` · lista de `producto_id` y su `version` · al menos uno<br>`motivo` · texto · al menos `general.largo_minimo_motivo` (5) letras · obligatorio |
| **Reglas y errores** | `400`: «Escribe al menos 5 letras.»<br>`422 ya_descontinuados`: «Esos productos ya están descontinuados» (ninguno activo). Los que ya estaban descontinuados se ignoran |
| **Escribe** | En cada activo: `baja_en`, `baja_por` y `motivo_baja`. Los canales se conservan. Ningún movimiento |
| **Regresa** | «{producto} descontinuado. Su historial y sus códigos se conservan» o «{n} productos descontinuados» |
| **Llama** | `linea.pausar_publicaciones_producto` (`descontinuado`), por producto (fase 18) |
| **Eventos** | `producto.descontinuado`, uno por producto |
| **Bitácora** | Un renglón por producto, con el motivo |

### `catalogo.reactivar_producto`

| | |
|---|---|
| **Pantalla** | Ficha · «Reactivar producto» |
| **Quién** | Catálogo |
| **Recibe** | `producto_id` · uuid · obligatorio<br>`version` · obligatorio |
| **Reglas y errores** | `422 producto_activo`: «{producto} ya está activo.»<br>`422 escuela_dada_de_baja`: «{escuela} está dada de baja: reactívala antes.» |
| **Escribe** | Limpia `baja_en`, `baja_por` y `motivo_baja`, y pone `reactivado_en`. Vuelve con los canales que tenía. La publicación en línea no se reanuda sola: la decide el panel de uniformame.mx |
| **Regresa** | «{producto} vuelve a estar activo» |
| **Eventos** | `producto.reactivado` |
| **Bitácora** | «Vuelve a venderse», con el motivo que tenía en `antes` |

## Lecturas

### `catalogo.productos_descontinuados()`

Se construye en la [fase 18](../../fases/18-tienda-en-linea-direccion-y-contador.md), con las alertas de Dirección.

| | |
|---|---|
| **La usa** | Dirección, para la alerta «{producto} descontinuado con {n} piezas en existencia» (ver [alertas e indicadores](../direccion/alertas-e-indicadores.md)) |
| **Regresa** | Por producto descontinuado: su nombre y sus variantes |

## Lo que baja a la tablet

| Tabla | Filtro | Columnas |
|---|---|---|
| `productos` | Todos, también los descontinuados | `id`, `nombre` |

Ni precios ni recargo. Por qué bajan todos y no solo los de los lotes en proceso está en [variantes](variantes-codigos-y-etiquetas.md#lo-que-baja-a-la-tablet).

## Parámetros

Los cambia solo la dueña, en Configuración (ver [configuración](../admin/configuracion.md)). Este módulo los siembra en la fase 8.

| Parámetro | Valor inicial | Sección | Para qué |
|---|---|---|---|
| `catalogo.recargo_pedido_especial_inicial_centavos` | $50 | Parámetros | El recargo de pedido especial de un producto nuevo desde cero |
| `catalogo.foto_max_mb` | 5 MB | Técnicos | Lo más que pesa la foto de referencia |

Usa también `general.largo_minimo_motivo` ([configuración](../admin/configuracion.md)) y los de [precios](precios.md#parámetros).

## Permisos

- Crear: Catálogo; Ventas a externos solo desde un pedido.
- Aplicar cambios, foto, descontinuar y reactivar: Catálogo.
- Los productos los leen casi todos los departamentos. Producción, Calidad, la Puerta del taller, Mantenimiento, Aduana y Bodega los reciben sin el recargo de pedido especial, igual que sin precios (ver [permisos](../admin/permisos.md#qué-ve-cada-departamento)).

## Eventos

`producto.creado` · `producto.cambiado` · `precio.cambiado` · `producto.descontinuado` · `producto.reactivado`.

## Lo que llega después

- **Fase 10:** al crear el producto, su receta: `patronaje.iniciar_receta` si la sección lleva receta (a partir de otro, copia la del base como versión 1, con las medidas del alta, sin verificar); `receta_id` y `receta_estado` en la respuesta, para que «Crear y seguir con la receta» abra Patronaje. Y el origen `desarrollo`: la regla `desarrollo_no_disponible` («{DS} ya no está en Ficha técnica: revisa el desarrollo.») y `patronaje.ligar_producto_desarrollo`, que pasa el desarrollo a «En catálogo».
- **Fase 12:** el flujo del producto. `flujo_id` entra a `catalogo.crear_producto` (si falta: el del base; si no, el del tipo de prenda; vacío en servicios y secciones sin receta) y a `catalogo.aplicar_cambios_producto` (los lotes ya cortados conservan el suyo; bitácora «Flujo: {antes} → {después}»), con la llave de `productos.flujo_id`.
- **Fase 16:** Ventas usa el alta con `origen = pedido`. El alta y su regla `falta_precio_cliente` se construyen y se prueban aquí, con una lista de cliente hecha con `catalogo.crear_lista_cliente`.
- **Fase 18:** `linea.pausar_publicaciones_producto` desde «Aplicar cambios» (cuando se apaga «Tienda en línea») y desde «Descontinuar», que no hace nada mientras no exista uniformame.mx; y la alerta de Dirección «{producto} descontinuado con {n} piezas en existencia».
- **Con uniformame.mx:** las publicaciones, las fotos de venta y las fichas que juntan los colores de una prenda (decisión de integración 17). Lo que uniformame.mx lee de aquí: los productos con canal en línea y sus variantes, de solo lectura.
- **Con el POS:** los productos bajan a la caja, todos, activos y descontinuados (un código viejo tiene que seguir resolviendo), sin `producto_base_id`, `flujo_id`, `tipo_prenda_id` ni `creado_por`.

## Cómo está hecho

**Fase 8, parte 3.**

- **La tabla** `productos` es de `catalogo` (`tablas.ts`, migración `0024_productos_variantes_y_precios.sql`), con sus CHECK (el nombre, en línea solo sin escuela ni servicio, un canal mientras esté activo, el recargo en pesos enteros), `xid_escritura` y el único del nombre por escuela, que trata la escuela vacía como un valor más (`coalesce` con un id que no existe, decisión 444). `flujo_id` nace con su `@llavePendiente`. Los parámetros del catálogo los siembra `parametros.ts`.
- **Lo común** (`dominio/productos.ts`): leer el producto y la variante con su candado, tomar la versión del producto (el agregado: cualquier cambio en él o en sus variantes la sube), tomar un bloque de códigos (`admin.tomar_folio` con `n`; `folio_agotado` sale como `sin_codigos`), el tope del precio, el canal en línea y el evento.
- **`catalogo.crear_producto`** (`acciones/crear-producto.ts`, contrato en `packages/compartido/src/contratos/catalogo/productos.ts`): el contrato no pide departamento y la acción revisa que sea Catálogo, o Ventas a externos solo desde un pedido (decisión 440). Revisa el base, los canales, la sección y el tipo de prenda que le toca, las tallas y los precios (el de En línea se toma del de Mostrador; desde un pedido, el de la lista del cliente). El nombre repetido lo detecta el único de la base. Toma un solo bloque de códigos; sin códigos suficientes no crea nada. A partir de otro copia los precios propios de talla del base en las listas que lleva el nuevo (decisión 445). Las medidas se descartan con su aviso si no hay receta del base (fase 10).
- **`catalogo.subir_foto_producto`, `catalogo.descontinuar_productos` y `catalogo.reactivar_producto`** (`acciones/productos.ts`): la foto revisa su formato y su peso con la lectura nueva `admin.datos_de_archivo` (decisión 441) y la liga con `admin.ligar_archivo`; regresa la versión nueva del producto. Descontinuar bloquea los productos en orden por id, ignora los que ya estaban y deja un renglón y un evento por producto. Reactivar vuelve con sus canales y pide que su escuela esté activa.
- **`catalogo.aplicar_cambios_producto`** (`acciones/aplicar-cambios-producto.ts`, parte 4): toma la versión de la ficha; revisa los canales (`sin_canal` y los de en línea), los precios (la lista del canal, la talla del producto y no de pedido especial, el tope) y que queden los obligatorios (`falta_precio`); quitar un precio de una lista cuyo canal se apagó sí se puede (decisión 450). Cada precio que cambia cierra y crea con origen `ficha`. Un renglón de bitácora por cambio, con los textos del archivo; un `precio.cambiado` por lista; los avisos de `avisosDeLaFicha` y el de las etiquetas por reimprimir. Prueba: `acciones/aplicar-cambios-producto.prueba.ts` (cerrar y crear, el `409`, los renglones con el mismo comando, los canales y sus CHECK, la talla especial, la lista que no aplica, el precio que falta, las etiquetas por reimprimir y los avisos).
- **Lo que baja a la tablet** (`bajada.ts`): todos los productos, solo con su nombre.
- **Las pruebas:** `modulos/catalogo/acciones/crear-producto.prueba.ts` (los códigos seguidos, dos altas a la vez, `sin_codigos` sin dejar nada, lo que resuelve, el nombre por escuela, los canales, los precios que faltan, a partir de otro, desde un pedido y quién puede), `subir-foto-producto.prueba.ts` (la versión nueva, el historial, el formato y el peso, con el simulador de R2), `descontinuar-productos.prueba.ts` y `modulos/catalogo/bajada.prueba.ts`.

**Fase 8, correcciones de la auditoría.**

- **A partir de otro**, las tallas las resuelve el alta: las vivas del base (normales y de pedido especial) en los grupos de las tallas que llegan; los canales los manda la pantalla, que propone los del base (decisión 461). Lo prueba `crear-producto.prueba.ts` («a partir de otro, las tallas son las del base»).
- **El alta** rechaza una escuela dada de baja (`422 escuela_dada_de_baja`) y lee la escuela y las tallas con `FOR SHARE`, para que no se den de baja mientras confirma; revisa que el tipo de prenda exista y que cada lista vaya una vez (`400`). El recargo inicial del parámetro se lleva a peso entero (decisión 460).
- **El tope del precio** sale en el mensaje con `catalogo.precio_max_centavos`; el contrato solo pide pesos enteros de $1 en adelante (decisión 462).
- **«Aplicar cambios»** rechaza un precio repetido (`400`) y un tipo de prenda en una sección sin receta (decisión 465).

**Fase 10, parte 2.** En una sección que lleva receta (y que no es un servicio), `catalogo.crear_producto` llama `patronaje.iniciar_receta` después de dar de alta las variantes, y regresa `receta_id` y `receta_estado` para «Crear y seguir con la receta». A partir de otro con receta, las medidas del alta van a la versión 1 copiada; si el base no tiene receta, se descartan con su aviso (ver [recetas](../patronaje/recetas.md#cómo-está-hecho)).

**Fase 10, parte 3.** Con `origen = desarrollo`, `desarrollo_id` es obligatorio (`400` «Escoge el desarrollo.», decisión 537); después de crear el producto, `patronaje.ligar_producto_desarrollo` deja el desarrollo «En catálogo», y si ya no está en ficha técnica responde `desarrollo_no_disponible` y no se crea nada.
