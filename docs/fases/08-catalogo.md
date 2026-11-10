# Fase 08: Catálogo

> **Etapa:** Módulos.
> **Estado:** Pendiente.
> **Antes de empezar:** lee la [forma de trabajo](../trabajo/FORMA-DE-TRABAJO.md) y la [revisión de fase](../trabajo/REVISION-DE-FASE.md).
> **Se conecta con:** [fases](FASES.md) · [fase 7](07-autorizaciones-y-personal.md) · [fase 9](09-inventario-libro-existencias-reservas-y-traspasos.md)

## Objetivo

Catálogo decide qué productos existen y cómo se venden: las escuelas, las secciones, las tallas y los tipos de prenda; los productos con su alta, sus canales, su foto y su recargo; una variante por talla con su código de barras para siempre y sus etiquetas; las listas de precios con los porcentajes de cada cliente; y los precios por talla con su historial, el precio sugerido y el cambio en bloque.

## Depende de

- [Fase 7](07-autorizaciones-y-personal.md), terminada y en verde.

## Qué se construye

### Parte 1 · Escuelas, secciones, tallas y tipos de prenda

**Construye:** las tablas `escuelas`, `secciones`, `grupos_talla`, `tallas`, `tipos_prenda` y `tipo_prenda_medidas`, con la siembra de las siete secciones y los cuatro grupos de tallas; `catalogo.agregar_escuela`, `catalogo.editar_escuela`, `catalogo.dar_baja_escuela` (con su candado `escuela_con_modelos`), `catalogo.reactivar_escuela`, `catalogo.agregar_seccion` y la interna `catalogo.crear_escuela_para_cliente`; `catalogo.guardar_grupo_talla` y `catalogo.guardar_tipo_prenda`; la carpeta `modulos/patronaje/` con solo su `index.ts` y su `parametros.ts`, para sembrar `patronaje.medida_cm_min` y `patronaje.medida_cm_max`.

**Leer:**
- [escuelas y secciones](../modulos/catalogo/escuelas-y-secciones.md) — las escuelas, su color, sus candados y las secciones.
- [tallas y tipos de prenda](../modulos/catalogo/tallas-y-tipos-de-prenda.md) — los grupos, las tallas, los tipos de prenda y sus medidas (las acciones de las tallas de un producto van en la parte 3).

### Parte 2 · Listas de precios y categorías de mayoreo

**Construye:** las tablas `listas_precios` y `categorias_mayoreo`, con la siembra de las tres listas generales y las cuatro categorías; `catalogo.cambiar_porcentajes_cliente`; las internas `catalogo.crear_lista_cliente`, `catalogo.sincronizar_nombre_cliente`, `catalogo.dar_baja_lista_cliente` y `catalogo.reactivar_lista_cliente`.

**Leer:**
- [listas de precios](../modulos/catalogo/listas-de-precios.md) — las listas, los porcentajes, las categorías y qué productos salen en cada lista.

### Parte 3 · Productos y sus tallas

**Construye:** las tablas `productos`, `variantes` y `precios`; `catalogo.crear_producto` desde cero, a partir de otro y desde un pedido, con su bloque de códigos seguidos y sus precios base; `catalogo.agregar_talla`, `catalogo.descontinuar_talla`, `catalogo.reactivar_talla` y `catalogo.dar_baja_talla`; `catalogo.subir_foto_producto`, `catalogo.descontinuar_productos` y `catalogo.reactivar_producto`; la versión del producto que sube con cualquier cambio en sus variantes o sus precios; lo que baja a la tablet (productos, variantes y tallas, solo con su nombre).

**Leer:**
- [productos](../modulos/catalogo/productos.md) — el alta, la foto, descontinuar y reactivar.
- [variantes, códigos y etiquetas](../modulos/catalogo/variantes-codigos-y-etiquetas.md) — la tabla `variantes`, los códigos y lo que baja a la tablet.
- [tallas y tipos de prenda](../modulos/catalogo/tallas-y-tipos-de-prenda.md#acciones) — las acciones de las tallas de un producto.
- [precios](../modulos/catalogo/precios.md#la-tabla-precios) — la tabla `precios`, que el alta ya escribe.

### Parte 4 · Precios

**Construye:** `catalogo.aplicar_cambios_producto` (canales, categoría, recargo, tipo de prenda y precios por talla, con las etiquetas por reimprimir); `catalogo.cambiar_precios_en_bloque` con «Confirmar con Google» y la función que comparte con su vista previa; la interna `catalogo.cambiar_precio_en_linea`; las lecturas `catalogo.precio_talla` y `catalogo.precio_sugerido`; los avisos de la ficha como función del paquete compartido; el permiso por columna que solo deja cerrar un precio.

**Leer:**
- [precios](../modulos/catalogo/precios.md) — todo lo de esta parte.
- [productos](../modulos/catalogo/productos.md#catalogoaplicar_cambios_producto) — «Aplicar cambios».
- [paquete compartido](../cimientos/PAQUETE-COMPARTIDO.md#dinero) — `aPesoEntero` y el redondeo.

### Parte 5 · Etiquetas y códigos

**Construye:** `catalogo.imprimir_etiquetas` con su PDF guardado antes de confirmar; el trabajo `catalogo.revisar_codigos_de_barras` con el aviso `codigos_por_acabarse`; los parámetros del catálogo.

**Leer:**
- [variantes, códigos y etiquetas](../modulos/catalogo/variantes-codigos-y-etiquetas.md) — los estados de la etiqueta, la acción, el trabajo y los parámetros.
- [impresión](../modulos/admin/impresion.md) — el registro de tipos de etiqueta y la ruta para reimprimir.

## Cómo se construye

- Un solo agente, una parte a la vez.
- Todo es de la web: ninguna acción de este módulo llega de un aparato.
- Las cuentas de dinero (precio sugerido, cambio en bloque, redondeo) se prueban también con datos al azar.
- Al cerrar la fase, los datos de la muestra del catálogo (sus escuelas, productos, variantes y los precios de las listas generales) se cargan con estas mismas acciones (ver [base de datos](../cimientos/BASE-DE-DATOS.md#siembra-del-sistema-y-datos-de-la-muestra)).
- No va en esta fase: las pantallas, las consultas de las pantallas de Catálogo (fase 19) ni el diseño de la etiqueta (fase 20).

## Excepciones permitidas

- Las internas que llaman otros módulos se prueban directo: las de listas y escuelas de clientes las llama Ventas desde la fase 16, y `catalogo.cambiar_precio_en_linea`, `linea` cuando exista uniformame.mx. `listas_precios.cliente_id` lleva su `@llavePendiente` hasta la fase 16, y `precios.usuario_panel_id`, hasta uniformame.mx.
- El alta desde un pedido (`origen = pedido`) se construye y se prueba aquí con una lista de cliente hecha con `catalogo.crear_lista_cliente`; Ventas la usa desde la fase 16.
- Los candados para dar de baja una talla o una escuela que dependen de otros módulos los agrega la fase de ese módulo: existencia y reservas (9), desarrollos (10), lotes (12), pedidos PE- y cliente activo (16), pedidos W- (18).
- La receta y el desarrollo del alta (`patronaje.iniciar_receta`, `patronaje.ligar_producto_desarrollo` y la copia de la receta con sus medidas) llegan en la fase 10; hasta entonces las medidas del alta se descartan con su aviso.
- El flujo (`productos.flujo_id` y `tipos_prenda.flujo_defecto_id`) entra a los contratos en la fase 12; aquí sus columnas nacen vacías, con su `@llavePendiente`.
- `linea.pausar_publicaciones_producto` la llaman «Aplicar cambios» y «Descontinuar» desde la fase 18.
- Los parámetros `patronaje.medida_cm_min` y `patronaje.medida_cm_max` son de Patronaje, pero se siembran aquí porque los usan los tipos de prenda.
- El tipo de etiqueta `prenda` lo registra la fase 20: `catalogo.imprimir_etiquetas` se prueba con el tipo de etiqueta de prueba de la fase 4.

## Criterios de terminado

| Criterio | Prueba que lo demuestra |
|---|---|
| Un alta con varias tallas toma sus códigos seguidos, también con dos altas al mismo tiempo; sin códigos suficientes no crea nada (`sin_codigos`); un código nunca se repite ni se recicla | `modulos/catalogo/acciones/crear-producto.prueba.ts` |
| El alta resuelve el tipo de prenda, el recargo y el precio en línea como dice su archivo; a partir de otro copia tallas, canales y precios propios de talla; desde un pedido exige «Ventas a externos» y el precio del cliente | La misma prueba |
| En línea solo productos sin escuela y nunca un servicio; un producto activo siempre tiene un canal; las dos reglas también como CHECK de la base | `modulos/catalogo/acciones/aplicar-cambios-producto.prueba.ts` |
| Cambiar un precio cierra el vigente y crea otro en la misma transacción; nunca hay dos vigentes; el rol de la app no puede cambiar un precio más que para cerrarlo | La misma prueba y `modulos/catalogo/tablas.prueba.ts` |
| Cualquier cambio en el producto, sus variantes o sus precios sube su versión: quien tenía la ficha abierta recibe `409`, y la foto regresa la versión nueva | `aplicar-cambios-producto.prueba.ts`, `agregar-talla.prueba.ts` y `subir-foto-producto.prueba.ts` |
| Una talla dada de baja no vuelve: agregarla otra vez crea otra variante con código nuevo; una talla descontinuada se reactiva sin motivo | `modulos/catalogo/acciones/agregar-talla.prueba.ts`, `dar-baja-talla.prueba.ts` y `reactivar-talla.prueba.ts` |
| El precio de una talla es el suyo o el base; en pedido especial, el base más el recargo, y vacío en En línea y en Mayoreo | `modulos/catalogo/lecturas/precio-talla.prueba.ts` |
| El precio sugerido sigue sus cinco pasos, redondea a peso entero y nunca descuenta el recargo | `modulos/catalogo/lecturas/precio-sugerido.prueba.ts`, con datos al azar |
| El cambio en bloque pide «Confirmar con Google», respeta sus dos topes, redondea a $5 y, si un precio saldría del rango, no cambia ninguno | `modulos/catalogo/acciones/cambiar-precios-en-bloque.prueba.ts`, con datos al azar |
| Con `catalogo.etiqueta_lleva_precio`, un cambio de Mostrador pasa a `por_reimprimir` solo las tallas impresas que cobran ese precio; sin él, ninguna | `aplicar-cambios-producto.prueba.ts` y `cambiar-precios-en-bloque.prueba.ts` |
| Imprimir etiquetas pasa a `impresa` las pendientes y no toca las ya impresas; no imprime pedido especial, descontinuadas ni dadas de baja; si el PDF no se guarda, nada queda marcado | `modulos/catalogo/acciones/imprimir-etiquetas.prueba.ts` |
| «Aplicar cambios» deja un renglón de bitácora por cambio; el bloque, descontinuar y las etiquetas, uno por producto; todos con el mismo `comando_id` | Las pruebas de cada acción |
| Una escuela es única por nombre y municipio sin importar acentos ni mayúsculas; con modelos activos no se da de baja; su color sale de la paleta en orden | `modulos/catalogo/acciones/agregar-escuela.prueba.ts` y `dar-baja-escuela.prueba.ts` |
| Una talla en uso no se renombra ni se quita; las medidas de un tipo de prenda respetan su rango; solo la dueña agrega una sección | `guardar-grupo-talla.prueba.ts`, `guardar-tipo-prenda.prueba.ts` y `agregar-seccion.prueba.ts` |
| La lista de un cliente nace vacía y sin porcentajes; renombrar al cliente renombra su lista y, solo si se llamaba igual, su escuela | `modulos/catalogo/internas/crear-lista-cliente.prueba.ts` y `sincronizar-nombre-cliente.prueba.ts` |
| Con menos de `catalogo.codigos_restantes_aviso` códigos, la dueña recibe el aviso una vez por semana, no cada noche | `modulos/catalogo/trabajos/revisar-codigos-de-barras.prueba.ts` |
| A la tablet bajan productos, variantes y tallas solo con lo suyo: nunca un precio, un recargo ni un código de barras | `modulos/catalogo/bajada.prueba.ts` |

## Revisión de fase

Normal: un [auditor](../../.claude/agents/auditor.md) con contexto limpio revisa los seis puntos de la [revisión de fase](../trabajo/REVISION-DE-FASE.md).
