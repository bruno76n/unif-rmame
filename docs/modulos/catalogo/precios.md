# Precios

> **Qué cubre:** el precio de cada producto en cada lista, con su precio base y el propio de una talla, y su historial; el precio de una talla, el precio sugerido de un cliente externo, el cambio de precios en bloque, el precio en línea y los avisos de la ficha.
> **Estado:** Decidido.
> **Se construye en:** [fase 8](../../fases/08-catalogo.md).
> **Se conecta con:** [productos](productos.md) · [listas de precios](listas-de-precios.md) · [variantes, códigos y etiquetas](variantes-codigos-y-etiquetas.md) · [paquete compartido](../../cimientos/PAQUETE-COMPARTIDO.md) · [pedidos](../ventas/pedidos.md) · [pantallas de Catálogo](../../interfaz/fabrica/catalogo.md) · [pantallas de Compras](../../interfaz/fabrica/compras.md) · [clientes externos](../ventas/clientes.md) · [migración](../../MIGRACION.md)

## Para qué sirve

Cada producto tiene un precio en cada lista donde se vende (Mostrador, Mayoreo, En línea y la de cada cliente externo). El **precio base** lo toman todas sus tallas; una talla puede tener **su propio precio**. Cada cambio es un renglón nuevo: nada se borra, y Listas de precios y la bitácora enseñan desde cuándo vale cada precio y cuánto era antes.

Ejemplo: la playera polo blanca con escudo cuesta $410 en Mostrador, pero la talla 16 lleva más tela y Catálogo le pone su propio precio: «Talla 16 en Mostrador: $435». Las demás tallas siguen tomando los $410. Si un día Catálogo borra el precio de la talla 16, esa talla regresa al base.

Los precios de compra de los materiales no son de aquí: viven en Compras, aceptan centavos y tienen su propio tope, `compras.precio_max_centavos` (ver [proveedores y precios](../compras/proveedores-y-precios.md)).

## Reglas

1. **Pesos enteros.** Un precio de venta va en centavos, múltiplo de 100, de $1 a `catalogo.precio_max_centavos` ($99,999).
2. **Base o de talla.** El precio de una talla normal en una lista es el suyo, si lo tiene, o el base de esa lista. Una talla de pedido especial nunca tiene precio propio: cobra el base más el recargo del producto, y no aplica en En línea ni en Mayoreo.
3. **Un solo precio vigente** por lista, producto y talla (o base).
4. **Cambiar es cerrar y crear,** en la misma transacción: el vigente se cierra con `vigente_hasta` y `fin_motivo` (`reemplazado` o `quitado`) y nace el nuevo. Fuera de eso, un renglón no cambia: el rol de la app solo puede escribir `vigente_hasta` y `fin_motivo` en esta tabla (permiso por columna).
5. **Sin precios programados en la primera versión:** `vigente_desde` es el momento en que se escribe. La columna ya permite una fecha futura después, sin cambiar la tabla.
6. **Cada precio dice de dónde vino** (`origen`): el alta, la ficha, el cambio en bloque, Tienda en línea, el panel de uniformame.mx o la migración.
7. **El precio en línea vive en Catálogo,** en la lista En línea (decisión de integración 28). uniformame.mx no escribe en Catálogo: solo puede mandar el comando «cambiar precio en línea» con su credencial, por `linea`.
8. **Un precio es parte de su producto:** cada cambio sube la versión del producto (ver [productos](productos.md)).
9. **Los cambios que se aplican juntos van juntos:** «Aplicar cambios» y el cambio en bloque escriben todos sus precios en una sola transacción, con su origen en la bitácora.
10. **Un pedido congela su precio.** Lo que ya se confirmó no cambia cuando cambia un precio aquí (ver [pedidos](../ventas/pedidos.md)).

## La tabla `precios`

| Columna | Tipo | Nulo | Qué es |
|---|---|---|---|
| `id` | uuid | no | Llave |
| `lista_id` | uuid | no | → `listas_precios.id` |
| `producto_id` | uuid | no | → `productos.id` |
| `variante_id` | uuid | sí | Vacío: el precio base del producto en esa lista. Lleno: el propio de esa talla, con la llave compuesta (`variante_id`, `producto_id`) → `variantes` (`id`, `producto_id`), para que la talla sea de ese producto. Nunca una talla de pedido especial |
| `precio_centavos` | bigint | no | CHECK > 0 y múltiplo de 100 |
| `vigente_desde` | timestamptz | no | default `now()`. El «Vigente desde» de Listas de precios |
| `vigente_hasta` | timestamptz | sí | Vacío: el vigente |
| `fin_motivo` | text | sí | CHECK (`reemplazado`, `quitado`). Lleno si y solo si `vigente_hasta` está lleno |
| `origen` | text | no | CHECK (`alta_producto`, `ficha`, `cambio_en_bloque`, `tienda_en_linea`, `panel_uniformame`, `migracion`) |
| `confirmado_con_google_en` | timestamptz | sí | CHECK: obligatorio con `cambio_en_bloque` |
| `dispositivo_id` | uuid | sí | → `dispositivos.id`: la credencial de uniformame.mx, con `panel_uniformame` |
| `usuario_panel_id` | uuid | sí | Quién del panel lo cambió. CHECK: lleno con `panel_uniformame`. Lleva su `@llavePendiente` (`usuarios_panel.id`) hasta que exista uniformame.mx |

- Lleva las columnas comunes; `creado_por` es quien lo puso en la fábrica y va vacío desde el panel (ver [base de datos](../../cimientos/BASE-DE-DATOS.md#columnas-comunes)).
- **Índices:** único (`lista_id`, `producto_id`, `variante_id`) con `NULLS NOT DISTINCT`, donde `vigente_hasta` es nulo · (`producto_id`, `lista_id`, `vigente_desde` desc), para el historial · (`version`).

## El precio sugerido a un cliente externo

Ventas siempre ve un precio sugerido por talla, calculado por el servidor con `catalogo.precio_sugerido` en este orden (regla del 6 de noviembre):

1. **Su lista:** el precio de la talla en la lista del cliente (el suyo o el base). Origen `lista_cliente`.
2. **Su porcentaje:** si no hay y el cliente tiene porcentaje (alguno de los dos), el precio de Mostrador de la talla × (1 − % ÷ 100), redondeado a peso entero con `aPesoEntero` del [paquete compartido](../../cimientos/PAQUETE-COMPARTIDO.md) (al más cercano; la mitad, hacia arriba). El % es el que dice la categoría de mayoreo del producto: `basicos` toma el de básicos del cliente; `especiales`, el de especiales; `ninguno` es sin descuento (0 %). Si el % que toca está vacío en la lista del cliente, se pasa al paso 3. Origen `porcentaje_cliente`.
3. **Mayoreo:** si no, el precio de la talla en la lista Mayoreo. Origen `mayoreo`.
4. **Mostrador:** si no, el de Mostrador. Origen `mostrador`.
5. **Sin precio:** si no hay ninguno, la prenda solo entra al pedido con un precio dado: «Sin precio para este cliente en Catálogo».

**Una talla de pedido especial** se calcula con el precio base, no tiene paso 3, y su recargo va aparte (`recargo_especial_centavos`): el porcentaje nunca toca el recargo. Los porcentajes del cliente viven en su lista (ver [listas de precios](listas-de-precios.md)). Qué hace Ventas con el sugerido y el precio dado está en [pedidos](../ventas/pedidos.md).

## Los avisos de la ficha

Al cambiar precios en la ficha salen avisos que no bloquean:

- «Ojo: Mayoreo ({precio}) quedó arriba de mostrador ({precio}).», cuando el precio de Mayoreo de una talla queda arriba del de Mostrador de esa talla.
- «Ojo: El precio de {lista} cambia más de 30% ({antes} a {nuevo}). ¿Es correcto?», cuando un precio cambia más de `catalogo.aviso_cambio_precio_pct`.
- Con `catalogo.etiqueta_lleva_precio`: «Cambió el precio de mostrador: {n} etiquetas de {producto} quedan por reimprimir.»

Los dos primeros los calcula una función del [paquete compartido](../../cimientos/PAQUETE-COMPARTIDO.md) mientras se escribe, y la API la repite al aplicar. El tercero lo da la API al aplicar, porque cuenta las etiquetas impresas.

## Acciones

### `catalogo.cambiar_precios_en_bloque`

| | |
|---|---|
| **Pantalla** | Productos o Listas de precios · barra de selección · «Cambiar precios» → ventana «Cambiar precios en bloque» · «Confirmar con Google y aplicar a {n} precios» |
| **Quién** | Catálogo · «Confirmar con Google» |
| **Recibe** | `lista_id` · uuid · obligatorio<br>`productos` · lista de `producto_id` y su `version` · obligatorio<br>`direccion` · `subir` o `bajar` · obligatorio<br>`modo` · `por_ciento` o `pesos` · obligatorio<br>`cantidad` · entero de 1 a 999 · obligatorio<br>`redondear` · booleano · obligatorio |
| **Reglas y errores** | `400`: la cantidad, solo números y hasta 3 cifras<br>`422 tope_por_ciento`: «Más de 50% se cambia producto por producto.» (el valor de `catalogo.bloque_tope_pct`)<br>`422 tope_pesos`: «Más de $999 se cambia producto por producto.» (el valor de `catalogo.bloque_tope_centavos`)<br>`422 sin_cambio`: «Con ese cambio no se mueve ningún precio.»<br>`422 sin_precio_en_lista`: «Ninguno de esos productos tiene precio en {lista}.»<br>`422 precio_fuera_de_rango`: «{producto} quedaría en ${n}: el precio va de $1 a $99,999. Quítalo de la selección o cámbialo en su ficha.» Si uno sale del rango no se cambia ninguno: nada se recorta en silencio |
| **Escribe** | Cada precio vigente de esa lista en los productos escogidos, el base y los propios de talla. El nuevo es el de antes más o menos la cantidad (por ciento o pesos); con `redondear`, al múltiplo más cercano de `catalogo.bloque_redondeo_centavos` ($5); siempre a peso entero. Cierra y crea con origen `cambio_en_bloque` y su `confirmado_con_google_en`. Los productos sin precio en esa lista se dejan igual. Con la lista Mostrador y `catalogo.etiqueta_lleva_precio`, las tallas que cobran esos precios y ya estaban impresas pasan a `por_reimprimir`. Sube la versión de cada producto |
| **Regresa** | Cuántos precios cambiaron y qué productos se dejaron igual. «{n} precios actualizados en {lista}. Quedan en la bitácora» |
| **Eventos** | `precio.cambiado` |
| **Bitácora** | Un renglón por producto (ver [bitácora](../admin/bitacora.md)): «Precio de {lista}: {antes} → {después} {+n%}», con su `confirmado_con_google_en`. Si el producto tenía precios de talla, van en el mismo renglón, en `antes` y `despues` |

La ventana enseña la vista previa con la consulta `catalogo.cambio_en_bloque_previo` (ver [pantallas de Catálogo](../../interfaz/fabrica/catalogo.md)), que usa la misma función que esta acción: lo que se ve es lo que se aplica.

## Acciones internas

### `catalogo.cambiar_precio_en_linea`

| | |
|---|---|
| **La llaman** | Las acciones de `linea` que cambian el precio en línea: desde la fábrica y desde el panel de uniformame.mx con su credencial (decisión de integración 28) |
| **Recibe** | `producto_id` · `precio_centavos` · `origen` (`tienda_en_linea` o `panel_uniformame`) · `usuario_panel_id` y `dispositivo_id` (desde el panel) |
| **Reglas** | El precio, en pesos enteros de $1 a `catalogo.precio_max_centavos`: «Escribe un precio mayor que cero»<br>`422 canal_en_linea_apagado`: «{producto} no se vende en línea: lo prende Catálogo.» |
| **Escribe** | Cierra el precio base vigente de la lista En línea y crea el nuevo con ese origen. Sube la versión del producto |
| **Regresa** | El precio de antes y el nuevo |
| **Eventos** | `precio.cambiado` |

La bitácora la escribe la acción de `linea` que la llama, con el texto «Precio en línea de {producto}: {antes} → {después}» y su origen (`fabrica` o `panel_linea`); sale también en la bitácora de Catálogo.

## Lecturas

### `catalogo.precio_talla(lista, variante)`

| | |
|---|---|
| **La usan** | Catálogo, Ventas, Tienda en línea y las etiquetas |
| **Regresa** | El precio vigente de esa talla en esa lista, con la regla 2: el suyo o el base; en una talla de pedido especial, el base más el recargo, y vacío en En línea y en Mayoreo. Vacío también si no hay precio base: «Sin precio» |

### `catalogo.precio_sugerido(cliente, variante)`

| | |
|---|---|
| **La usa** | Ventas: el pedido, el buscador de prendas y el alta desde el pedido |
| **Regresa** | `precio_sugerido_centavos`, `origen_sugerido` (`lista_cliente`, `porcentaje_cliente`, `mayoreo` o `mostrador`), `porcentaje_aplicado` y `recargo_especial_centavos`, con la regla de [arriba](#el-precio-sugerido-a-un-cliente-externo). Vacío en el paso 5 |

## Parámetros

Los cambia solo la dueña, en Configuración (ver [configuración](../admin/configuracion.md)). Todos van en la sección «Parámetros».

| Parámetro | Valor inicial | Para qué |
|---|---|---|
| `catalogo.precio_max_centavos` | $99,999 | El precio más alto de una lista |
| `catalogo.aviso_cambio_precio_pct` | 30 % | Un cambio de precio de más de esto sale con «Ojo» en la ficha |
| `catalogo.bloque_tope_pct` | 50 % | Lo más que sube o baja un cambio en bloque por ciento |
| `catalogo.bloque_tope_centavos` | $999 | Lo más que sube o baja un cambio en bloque en pesos |
| `catalogo.bloque_redondeo_centavos` | $5 | A qué múltiplo redondea el cambio en bloque (el interruptor empieza encendido) |

## Permisos

- Cambiar precios: Catálogo, en la ficha y en bloque (el bloque, con «Confirmar con Google»).
- El precio en línea, además, desde `linea` con `catalogo.cambiar_precio_en_linea`.
- Los precios no viajan a los departamentos que no ven precios: Producción, Calidad, la Puerta del taller, Mantenimiento, Aduana y Bodega (ver [permisos](../admin/permisos.md#qué-ve-cada-departamento)).

## Eventos

`precio.cambiado`, con la lista y el producto (nunca el monto).

## Lo que llega después

- **Fase 16:** Ventas usa `catalogo.precio_sugerido` en el pedido, con su precio dado, y lo congela al confirmar.
- **Con uniformame.mx:** quién llama a `catalogo.cambiar_precio_en_linea` (la casilla «Precio en línea» de Tienda en línea y el panel) y la llave de `usuario_panel_id`. uniformame.mx lee de aquí la lista En línea, de solo lectura.
- **Con el POS:** los precios de las listas Mostrador y Mayoreo bajan a la caja de cada tienda: en la foto, solo los vigentes; después, todo renglón que cambió, también los que se cierran. Sin `confirmado_con_google_en`, `dispositivo_id`, `usuario_panel_id` ni `creado_por`. La caja arma su lista «Cambios de catálogo» con los precios que cambiaron desde lo último que vio.

## Cómo está hecho

**Fase 8, parte 3.**

- **La tabla** `precios` es de `catalogo` (migración `0024`), con sus CHECK (pesos enteros, el fin con su motivo, el origen, la confirmación del bloque y el usuario del panel), la llave compuesta (`variante_id`, `producto_id`) hacia `variantes`, y el único del vigente por lista, producto y talla (la talla vacía, como un valor más, decisión 444). `usuario_panel_id` lleva su `@llavePendiente`.
- **El rol de la app solo cierra un precio:** su `UPDATE` solo alcanza `vigente_hasta`, `fin_motivo` y `actualizado_en`, y el disparador `solo_cerrar_precio` no deja cambiar un precio ya cerrado (decisión 443).
- **El alta** escribe los precios base con origen `alta_producto` (ver [productos](productos.md#cómo-está-hecho)).

**Fase 8, parte 4.**

- **Lo común** (`dominio/precios.ts`): los vigentes con su candado, `cambiarPrecio` (cierra el vigente, `reemplazado` o `quitado`, y crea el nuevo con su origen), el precio de una talla sin recargo (el suyo o el base; en pedido especial, el base), el precio de Mostrador por talla y `marcarPorReimprimir`, que con `catalogo.etiqueta_lleva_precio` pasa a `por_reimprimir` las tallas normales activas, ya impresas, cuyo precio de Mostrador cambió (compara el de antes y el de después de cada talla, así cubre el base, el de talla y el que se quita, decisión 448).
- **`catalogo.cambiar_precios_en_bloque`** (`acciones/cambiar-precios-en-bloque.ts`, contrato en `packages/compartido/src/contratos/catalogo/precios.ts`): «Confirmar con Google»; los dos topes; los productos en orden por id; el precio nuevo de `precioDelCambioEnBloque` del paquete compartido; si uno saldría del rango no cambia ninguno; `sin_precio_en_lista` y `sin_cambio`. Los que se dejan igual solo revisan su versión y salen en `sin_cambio` (decisión 447). Un renglón por producto con sus precios de talla en `antes` y `despues`, y su confirmación.
- **`catalogo.cambiar_precio_en_linea`** (`internas/cambiar-precio-en-linea.ts`): cierra y crea el base de En línea con su origen y sube la versión del producto; un producto descontinuado o sin el canal responde `canal_en_linea_apagado` (decisión 449).
- **Las lecturas** (`lecturas/precios.ts`): `catalogo.precio_talla` (el suyo o el base; en pedido especial, el base más el recargo y vacío en En línea y Mayoreo) y `catalogo.precio_sugerido` (los pasos de `precioSugerido`, con el recargo aparte).
- **Las pruebas:** `modulos/catalogo/tablas.prueba.ts` (dos vigentes chocan; la app solo cierra un precio y uno cerrado no cambia), `acciones/cambiar-precios-en-bloque.prueba.ts` (con datos al azar; Google, los topes, el redondeo a $5, el rango, los que se dejan igual), `lecturas/precio-talla.prueba.ts`, `lecturas/precio-sugerido.prueba.ts` (con datos al azar y con la base) e `internas/cambiar-precio-en-linea.prueba.ts`.
