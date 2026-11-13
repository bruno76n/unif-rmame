# Pantallas de Catálogo

> **Qué cubre:** las pantallas de Catálogo (Pendientes, Productos, Listas de precios, Etiquetas, Escuelas y tallas y Bitácora), los cajones Ficha de producto y Nuevo producto (también desde un pedido o un desarrollo) y sus ventanas, cada una con su consulta, sus textos, sus estados y sus botones.
> **Estado:** Decidido.
> **Se construye en:** [fase 19](../../fases/19-web-principal.md).
> **Se conecta con:** [productos](../../modulos/catalogo/productos.md) · [variantes, códigos y etiquetas](../../modulos/catalogo/variantes-codigos-y-etiquetas.md) · [tallas y tipos de prenda](../../modulos/catalogo/tallas-y-tipos-de-prenda.md) · [precios](../../modulos/catalogo/precios.md) · [listas de precios](../../modulos/catalogo/listas-de-precios.md) · [escuelas y secciones](../../modulos/catalogo/escuelas-y-secciones.md) · [operaciones y flujos](../../modulos/produccion/operaciones-y-flujos.md) · [clientes externos](../../modulos/ventas/clientes.md) · [conteos](../../modulos/inventario/conteos.md) · [bitácora](../../modulos/admin/bitacora.md) · [configuración](../../modulos/admin/configuracion.md) · [lo común de las pantallas](../comunes.md) · [etiquetas](../../impresos/etiquetas.md)

## Para qué sirve

Decide qué productos existen y cómo se venden: cada producto con sus tallas y un código de barras permanente por talla, sus precios en cada lista, dónde se vende, su categoría de mayoreo, su foto de referencia y sus etiquetas. Ejemplo: Rosa da de alta «Playera polo blanca con escudo» para el Instituto Juan Pablo II a partir de la polo blanca básica; nacen 9 variantes con los códigos 100267 a 100275, la receta se copia sin verificar y el sistema la lleva a Patronaje a revisarla.

## Quién entra

- Las cuentas con Catálogo. Ven todos los precios y la existencia total de cada variante; nunca costos.
- «Abrir receta» o «Capturar receta» y «Crear y seguir con la receta» solo salen si la cuenta tiene Patronaje.
- **Pastilla del menú:** los productos distintos con algo pendiente; nunca roja. La pestaña Pendientes cuenta renglones y va roja si hay un modelo sin precio.
- **Acción principal:** «Nuevo producto» → el cajón del alta, «Desde cero».
- **Pestañas:** Pendientes · Productos · Listas de precios · Etiquetas · Escuelas y tallas · Bitácora.

## Pendientes

**Consulta:** `catalogo.pendientes` (`grupo`: `todos`, `productos` o `etiquetas`).

| Cifra | Qué dice | Su línea | Lleva a |
|---|---|---|---|
| «Productos» | «{n} activos», en rojo si hay modelos sin precio | «{n} modelos sin precio» (rojo) | Productos |
| «Listas de precios» | «{n} listas» | «Siguiente código: {código}»; gráfica de cambios de precio por semana, 6 semanas | Listas de precios |
| «Etiquetas» | «{n} variantes sin etiqueta» (ámbar si hay) | «De {n} productos nuevos» o «Todas impresas» | Etiquetas |
| «Bitácora» | «{n} cambios esta semana» (de precio, desde el lunes) | Gráfica de cambios de precio por semana | Bitácora |

| Tipo | Referencia | Cantidad | Estado | Botón |
|---|---|---|---|---|
| «Modelo sin precio» | El producto; abajo «Modelo de cliente · {lista} · no se puede cotizar» | — | «Sin precio» (rojo) | «Abrir ficha» |
| «Etiquetas» | Un renglón por producto con variantes nuevas sin etiqueta; abajo «Tallas {8, 10, 12…}» | «{n} variantes» | «Por imprimir» (ámbar) | «Imprimir» → Etiquetas |
| «Reimprimir» | Solo si `catalogo.etiqueta_lleva_precio` está encendido: productos cuyo precio de mostrador cambió | «{n} variantes» | «Por imprimir» (ámbar) | «Imprimir» → Etiquetas |
| «Código no registrado» | Con el POS: un código que una caja leyó y no existe | — | «Por revisar» (ámbar) | «Agregar talla» → la ficha |

Fecha: siempre «—». Orden: rojo, luego ámbar. Vacío: «Sin pendientes».

## Productos

**Consulta:** `catalogo.productos` (`buscar`, `seccion_id`, `escuela`, `estado`, `canal`, `pildora`, `orden`).

- **Arriba:** «Lista» / «Galería»; el buscador «Producto, escuela o código» (4 cifras o más buscan los códigos que empiezan así); «{n} productos».
- **Filtros:** Sección · Escuela o modelo («Básicos, sin escuela» y cada escuela) · Estado («Activos» al abrir, «Descontinuados», «Todos los estados») · Canal («Se vende en mostrador», «en línea», «a externos»). **Píldoras:** «Todo {n}», «Sin foto {n}» y «Sin etiqueta {n}» (ámbar), «Sin precio de cliente {n}» (rojo); tocar la activa la quita.
- **Lista:** un bloque por sección (plegable, «{n} productos, {m} variantes», su «Nuevo producto» con la sección puesta). Columnas: casilla · Producto (foto, nombre y la escuela o «Básico») · Mayoreo (Básico, Especial, Accesorio o Sin descuento) · Se vende en (mostrador, en línea y externos; el de en línea en ámbar si está marcado sin foto) · Tallas («4 a 16 y CH a XG», abajo «{n} variantes, {e} por pedido») · Mostrador · Lo que lo detiene («Sin foto», «{n} sin etiqueta», «Sin precio · {lista}», «Descontinuado» o «Nada»). Producto, Mayoreo, Tallas y Mostrador ordenan.
- **Galería:** tarjetas por sección con foto, nombre, «{escuela} · {rango}», precio de mostrador o «Sin precio», los canales y lo que lo detiene.
- **Barra de selección** (solo en Lista): «{n} productos seleccionados» · «Imprimir etiquetas» · «Cambiar precios» · «Descontinuar con motivo» · quitar selección. Si ninguno tiene precio: «Los productos que escogiste no tienen precio en ninguna lista»; si todos ya están descontinuados: «Esos productos ya están descontinuados».
- **Vacío con filtros:** «Ningún producto cumple esos filtros.», con «Quitar filtros».

## Listas de precios

**Consulta:** `catalogo.listas_precios` (`lista_id`, al abrir Mostrador; `buscar`).

- **El selector de lista:** «Generales» (Mostrador, Mayoreo, En línea) y «Clientes externos» (una por cliente con lista). Buscador «Buscar producto en esta lista» y «{n} productos».
- **El encabezado:** nombre (y el cliente) y su descripción («La que cobran las dos tiendas en el mostrador.», «Mayoreo en mostrador: el descuento de cada cliente se aplica según la categoría de cada prenda.», «La que ve la tienda en línea. Los pedidos especiales no se publican.», «{Escuela o Mayorista} en {municipio}. Es su lista de precios: lo que ve Ventas a externos al levantar un pedido.»); a la derecha «{n} modelos sin precio» (rojo) o «Todo con precio» (verde). En la lista de un cliente, «% de básicos» y «% de especiales» → `catalogo.cambiar_porcentajes_cliente` (ver [listas de precios](../../modulos/catalogo/listas-de-precios.md)).
- **La tabla,** por sección: casilla · Producto (y escuela) · Mayoreo · Precio en esta lista (o «Sin precio» en rojo) · la referencia (Mostrador; En línea si se ve Mostrador) · Diferencia («Igual», «+$n», «−$n») · Vigente desde (fecha y «{precio} antes», o «Sin cambios»). Qué productos entran lo dice [listas de precios](../../modulos/catalogo/listas-de-precios.md).
- **Barra de selección:** «Imprimir etiquetas» y «Cambiar precios», con la lista que se ve.
- **Vacío:** «Ningún producto en esta lista.» o «… con esa búsqueda.»

## Etiquetas

**Consulta:** `catalogo.etiquetas` (`producto_id`).

- **«Variantes nuevas sin etiqueta»:** por producto, foto, nombre, «{escuela} · {n} variantes» y «PDF de {n} etiquetas» → `catalogo.imprimir_etiquetas`. Aviso: «PDF de {n} etiquetas de {producto} listo. Ya se pueden recibir en las tiendas».
- **«Por variante»:** el producto («{producto} · {escuela}») y «{n} variantes con código»; tabla Talla (con «Pedido especial») · Código · Etiqueta («Por imprimir», «Al fabricar el pedido», «Impresa») · Cuántas (hasta `catalogo.etiquetas_max_por_talla`); abajo «{n} etiquetas» y «Generar PDF».
- **La vista previa:** «Así queda la etiqueta de la talla {t}»: prenda, «{escuela o Básico} · Talla {t}», las barras, el código, el precio de mostrador si `catalogo.etiqueta_lleva_precio` (con su recargo si es de pedido especial) y «Pedido especial» si lo es (el diseño de la etiqueta, en [etiquetas](../../impresos/etiquetas.md)).

## Escuelas y tallas

**Consulta:** `catalogo.escuelas_y_tallas`.

- **«Escuelas y modelos»,** con «Agregar escuela»: color, nombre, municipio, « · cliente externo» si lo es, y «{n} modelos». En cada una, «Editar» → `catalogo.editar_escuela` y «Dar de baja» → ventana con motivo → `catalogo.dar_baja_escuela`; abajo, «Dadas de baja» con «Reactivar» → `catalogo.reactivar_escuela`.
- **«Grupos de tallas»:** cada grupo con sus tallas en orden y «{n} productos la usan»; «Agregar grupo», y en un grupo «Agregar talla» y el orden → `catalogo.guardar_grupo_talla`.
- **«Tipos de prenda»:** cada tipo con su sección, su flujo de Producción y sus medidas iniciales; «Agregar tipo» y «Guardar» → `catalogo.guardar_tipo_prenda`.
- **«Secciones»:** cada una con sus productos activos; se agregan en Administración del sistema.

## Bitácora

**Consulta:** `catalogo.bitacora` (`buscar`, `tipo_cambio`, `lista_id`).

- **Filtros:** «Producto, persona o código»; «Tipo de cambio» (Cambio de precio, Producto nuevo, Variante dada de baja, Descontinuado, Reactivado, Talla agregada, Canal de venta, Categoría de mayoreo); «Lista de precios»; «{n} cambios».
- **La tabla,** lo más reciente arriba: Fecha · Quién · Qué · Producto (y escuela) · Detalle («Precio de {lista}, talla {t}: {antes} → {después} {+n%}», «Talla {t}, código {código}. {motivo}», «Producto nuevo con {n} variantes, códigos {a} a {b}, a partir de {base}», «Empieza a venderse {canal}», «{categoría} a {categoría}»…). Los cambios del precio en línea hechos desde Tienda en línea salen aquí. Tocar un renglón abre la ficha.
- **Vacío:** «Ningún cambio cumple esos filtros.»

## Cajones

### Ficha de producto (ancho)

**Consulta:** `catalogo.ficha_producto` (`producto_id`).

- **Encabezado:** «{sección} · {escuela o Básico}», «Descontinuado» si lo está, lo que lo detiene y el nombre.
- **Arriba:** la foto con «Subir foto» o «Cambiar foto» → `catalogo.subir_foto_producto`, que se guarda en el momento (aviso «Foto guardada», o «… {producto} ya se puede publicar en línea»); los canales con su interruptor y su línea («Tienda 1 y Tienda 2», «Se puede vender en uniformame.mx. Publicarlo lo decide su panel», «Solo productos de «Ninguna escuela»», «Con la lista de {lista}», «Mayoristas, con su lista», «No se cotiza a clientes»); «Categoría para mayoreo» con su explicación; y el flujo de Producción.
- **«Tallas, códigos y precios»** («{n} variantes, {e} por pedido»): la matriz Talla · Código · Existencia «en toda la fábrica» (verde, ámbar con `catalogo.pocas_piezas` o menos, «Sin recibir», «Pedido especial») · una columna por lista · acciones. El renglón «Precio base» («Lo toma cada talla que no tenga el suyo. Las de pedido especial suman ${recargo}.»); cada talla con su cajita por lista (vacía, toma el base; con número, su propio precio). Una talla de pedido especial: base más recargo, «No se publica» en En línea y «No aplica» en Mayoreo. Por talla: «Descontinuar talla» → `catalogo.descontinuar_talla` (se vende hasta acabarla), «Reactivar talla» → `catalogo.reactivar_talla` y «Dar de baja esta talla» → ventana. Una dada de baja: «Baja», su código «retirado» y «Dada de baja el {fecha} por {persona}. {motivo}. El código no se vuelve a usar.»
- **«Agregar talla»:** las tallas de su grupo que no tiene («({grupo})», «{t}, tuvo baja, lleva código nuevo»), «Normal» o «Pedido especial», «Agregar» → `catalogo.agregar_talla` y «Código {siguiente}». Avisos: «Talla {t} agregada con el código {código}. Falta imprimir su etiqueta» o «… Se etiqueta al fabricar el pedido». Sin faltantes: «Ya tiene todas las tallas de su grupo.»
- **«Precio para otra lista de cliente»** (con «Ventas a externos»): agrega la columna de esa lista.
- **«Receta»:** «Receta verificada contra corte», «Receta capturada, sin verificar» o «Sin receta»; su resumen («{tela}: {m} m por prenda en talla {t} · {n} avíos · versión {v}»); «Abrir receta» o «Capturar receta» → Patronaje. **«Medidas de la prenda»** («En centímetros»), solo lectura. Las dos no salen en Accesorios y servicios.
- **«Cambios recientes»:** los últimos 5 de su historial; «Todavía no hay cambios registrados.»
- **Abajo:** «Descontinuar con motivo» o, si lo está, «Reactivar producto» → `catalogo.reactivar_producto` («{producto} vuelve a estar activo»). **Pie:** «Etiquetas» · «Crear otro a partir de este» · «Listo».
- **Los cambios por aplicar:** canales, categoría, flujo y precios no se guardan al escribir. Mientras haya, el pie se vuelve la franja «{n} cambios por aplicar» con la lista («Empieza a venderse en mostrador», «Categoría de mayoreo: {antes} a {después}», «Precio de {lista}, talla {t}: {antes} a {después}», «… (nuevo)», «… se quita (era {precio})»), los errores en rojo que bloquean y los «Ojo: …» que no; «Descartar cambios» y «Aplicar cambios» → `catalogo.aplicar_cambios_producto` («{n} cambios aplicados a {producto}. Ya llegan a {destinos}»). Con cambios sin aplicar, cerrar, ir a Etiquetas, crear otro o abrir la receta no sale: «Tienes cambios sin aplicar. Aplícalos o descártalos antes de cerrar». Los errores y avisos exactos están en [productos](../../modulos/catalogo/productos.md).

### Nuevo producto (ancho)

**Consulta:** `catalogo.alta_producto` (`origen`, `producto_base_id`, `seccion_id`, `cliente_id`, `desarrollo_id`).

- **Se abre desde:** «Nuevo producto» (barra superior o una sección), «Crear otro a partir de este», «Crear a partir de otro producto» en un pedido de Ventas (regresa al pedido) y «Dar de alta en catálogo» en un desarrollo de Patronaje (con su nombre y su escuela).
- **Encabezado:** «Nuevo producto {siguiente código}» y, desde un pedido, «· Regresa al pedido de {cliente}»; el nombre que se escribe o «¿Qué prenda es?».
- **Campos:** «Empezar» («A partir de un producto existente» / «Desde cero») · «Producto base» (copia nombre, sección, categoría, escuela, tallas, canales, precios, medidas, receta y flujo: «Se copian tallas, canales, precios, medidas y receta», «Receta versión {v} de {producto}: queda sin verificar en Patronaje» o «El producto base no tiene receta») · «Nombre de la prenda» · «Sección» con su flujo de Producción («Como playera polo»…) · «Para quién» («Ninguna escuela: básico o general» al abrir; cambia la categoría sola a Especial o Básico mientras no se cambie a mano) · «Categoría para mayoreo» · «Tallas» (Infantil, Juvenil y adulto, Pantalón por cintura, Talla única, con «desde» y «a»; «Se crean {n} variantes, una por talla, con los códigos {primero} a {último}.») · «Medidas de la prenda, en cm» (a partir de otro) · «Receta» (qué va a pasar: «Se copia la versión {v} de {producto}», «Se captura al crear el producto» o «Queda sin receta» en ámbar) · «Dónde se vende» (solo Mostrador al abrir; desde un pedido, solo Ventas a externos) · los precios que pide cada canal («Precio para {lista}», obligatorio desde un pedido).
- **Pie:** «Descartar» (o «Volver al pedido») y, según el caso, «Crear y seguir con la receta» (→ Patronaje, a la receta nueva), «Crear producto» (→ Productos, con su ficha abierta) o «Crear y agregar al pedido» (→ el pedido, con el cursor en sus tallas), todos → `catalogo.crear_producto`. Avisos: «{producto} creado con {n} variantes, códigos {a} a {b}» · «{producto} creado en Catálogo y agregado al pedido».
- Los mensajes de error de cada campo están en [productos](../../modulos/catalogo/productos.md); con errores no crea, marca los campos y el aviso ámbar dice el primero. Con datos escritos, «Descartar» pregunta antes.

## Ventanas

- **«Dar de baja la talla {t}»:** «{producto}, {escuela}. Código {código}.» y el motivo. «Dar de baja» → `catalogo.dar_baja_talla`; sus candados (existencia, reservas, lotes y pedidos abiertos) salen tal cual del archivo de la acción, con la salida que proponen («Descontinúala: se vende hasta acabarla»). Aviso: «Talla {t} dada de baja. El código {código} no se vuelve a usar».
- **«Descontinuar {producto}» / «Descontinuar {n} productos»:** hasta 4 nombres («y {n} más») y el motivo. «Descontinuar» → `catalogo.descontinuar_productos`. Aviso: «{producto} descontinuado. Su historial y sus códigos se conservan» o «{n} productos descontinuados».
- **«Etiquetas de {n} productos»:** «Generar PDF · {n} etiquetas» → `catalogo.imprimir_etiquetas` (sin las de pedido especial). Aviso: «PDF de {n} etiquetas listo».
- **«Cambiar precios en bloque»:** «{n} productos escogidos»; Lista (solo donde alguno tiene precio) · «Subir» / «Bajar» · «Por ciento» / «Pesos» · la cantidad · «Redondear a $5» (encendido). La vista previa sale de `catalogo.cambio_en_bloque_previo`: hasta 5 renglones «{producto} {escuela} {antes} → {después}», «{n} de {m} productos cambian en {lista}.», «{k} no tiene precio en esta lista y se dejan igual.», o en rojo «Más de 50% se cambia producto por producto.» · «Más de $999 se cambia producto por producto.» · «Con ese cambio no se mueve ningún precio.». «Confirmar con Google y aplicar a {n} precios» → `catalogo.cambiar_precios_en_bloque`. Aviso: «{n} precios actualizados en {lista}. Quedan en la bitácora».
- **«Agregar escuela»:** Nombre y Municipio. «Agregar escuela» → `catalogo.agregar_escuela`. Aviso: «{escuela} ya está en el catálogo. Ahora puedes crearle modelos».

## Lo que no se copia de la muestra

- Dar de baja una talla con piezas no las desaparece: la bloquean sus candados y la salida es descontinuarla.
- «Por lote recibido en aduana» no va en Catálogo: esas etiquetas se imprimen en Aduana al recibir el lote, donde está la impresora.
- El alta desde un pedido sin receta no dice que «el cortador reporta la tela que usa»: sin receta no se corta.
- Una escuela sin lista no deja huecos en los textos, y un precio que no cambió no queda en la bitácora.
- Cerrar el alta con datos escritos pregunta antes.

## Cómo está hecho

**Fase 19, parte 4.**

- **Las consultas** viven en `apps/api/src/modulos/catalogo/consultas/`, una por archivo, con sus contratos en `packages/compartido/src/contratos/catalogo/pantallas.ts`, y se registran en el `index.ts` del módulo: `catalogo.pendientes` (con la pastilla del menú, `pastillaCatalogo`: los productos distintos con algo pendiente, nunca roja), `catalogo.productos`, `catalogo.listas_precios`, `catalogo.etiquetas`, `catalogo.escuelas_y_tallas`, `catalogo.bitacora`, `catalogo.ficha_producto`, `catalogo.alta_producto` y `catalogo.cambio_en_bloque_previo`. Todas piden Catálogo; el alta, también Ventas a externos, que solo la lee desde un pedido, igual que `catalogo.crear_producto`. Lo que comparten (los modelos sin precio de la regla 8 de [listas de precios](../../modulos/catalogo/listas-de-precios.md), lo que detiene a un producto, el rango de tallas, el siguiente código con `admin.siguiente_folio`) está en `consultas/comunes.ts`.
- **Reglas que reusan:** el precio de la vista previa de una etiqueta sale de la lectura `catalogo.precio_talla`; la vista previa del cambio en bloque usa `precioDelCambioEnBloque` y `topeDelCambioEnBloque` del paquete compartido con los mismos parámetros que la acción; los «Ojo» de la ficha salen de `avisosDeLaFicha`. «Sin foto» es un producto activo que se vende en línea sin foto de referencia. El tipo de cambio de la bitácora sale de la acción del renglón y de su descripción («Precio …», «Empieza a / Deja de venderse …», la categoría en `despues`).
- **La web** está en `apps/web/src/rutas/catalogo/` (una ruta por pestaña; `route.tsx` es la página con su búsqueda) y en `apps/web/src/departamentos/catalogo/`: `pagina.tsx` (pestañas, «Nuevo producto» y los cajones), `direccion.ts` (todo en la dirección: los filtros y los cajones, que se abren con `?cajon=producto&id=<producto_id>` y `?cajon=nuevo_producto&origen=<catalogo|pedido|desarrollo>`, más `base`, `seccion_alta`, `cliente`, `desarrollo` y `pedido`), `pestanas/`, `cajones/` (`ficha-producto.tsx`, `nuevo-producto.tsx`) y `ventanas/`. Las acciones van con `useAccion` de lo común y vuelven a leer las consultas de Catálogo y el armazón (`acciones.ts`). Lo de otro departamento se abre por su dirección: la receta con `/patronaje/recetas?cajon=receta&id=<producto_id>` y el pedido con `/ventas/pedidos?cajon=pedido&id=<pedido_id>`.
- **Los cambios por aplicar** de la ficha (canales, categoría, flujo y precios) se guardan en el cajón hasta «Aplicar cambios»; con cambios, cerrar, «Etiquetas», «Crear otro a partir de este» y «Abrir receta» avisan «Tienes cambios sin aplicar…», y salir por el menú o por las pestañas pregunta con `usePreguntarAntesDeSalir`. El alta pregunta igual con datos escritos.
- **Las pruebas:** `consultas/*.prueba.ts` (una por consulta: lo que regresa con la muestra, sus filtros y que Bodega, Aduana y quien no es de Catálogo reciben `403` sin precios) y `apps/web/src/departamentos/catalogo/catalogo.prueba.ts` (cada pestaña y la ficha en escritorio y en teléfono, con sus capturas en `catalogo/`; «Aplicar cambios», descontinuar y reactivar una talla y un producto, agregar y dar de baja una escuela y crear un producto, cada uno con el aviso que regresa su acción; y una cuenta sin Catálogo no entra).
- **Lo que falta y se pidió al capataz:** «Subir foto» (un ayudante en `comun/` para `POST /v1/archivos/subida`), la lectura `catalogo.ve_documento` para abrir la foto, y `general.largo_minimo_motivo` en el armazón para prender el botón del motivo al llegar. Mientras, el botón del motivo se prende con cualquier texto y el servidor dice «Escribe al menos 5 letras.» junto al campo.
