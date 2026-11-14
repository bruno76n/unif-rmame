# Pantallas de Patronaje

> **Qué cubre:** las pantallas de Patronaje (Pendientes, Recetas con la página de la receta, Rendimiento y Desarrollo de producto), los cajones Rendimiento y del desarrollo, y sus ventanas, cada una con su consulta, sus textos, sus estados y sus botones.
> **Estado:** Decidido.
> **Se construye en:** [fase 19](../../fases/19-web-principal.md).
> **Se conecta con:** [recetas](../../modulos/patronaje/recetas.md) · [cuenta de material](../../modulos/patronaje/cuenta-de-material.md) · [desarrollos](../../modulos/patronaje/desarrollos.md) · [productos](../../modulos/catalogo/productos.md) · [corte y bultos](../../modulos/produccion/corte-y-bultos.md) · [autorizaciones](../../modulos/direccion/autorizaciones.md) · [lo común de las pantallas](../comunes.md) · [pantallas de Producción](produccion.md) · [tallas y tipos de prenda](../../modulos/catalogo/tallas-y-tipos-de-prenda.md) · [lotes](../../modulos/produccion/lotes.md)

## Para qué sirve

Captura y cuida la receta de cada prenda (medidas en centímetros, tela en metros por talla y avíos en su unidad, con versiones), compara la tela del patrón contra lo que se gasta en el corte y lleva cada prenda nueva de la solicitud al catálogo. Ejemplo: el pantalón azul marino de Zamora se corta el 15 de octubre y no tiene receta: sale en rojo «Sin receta · corte próximo». Rosa la captura talla por talla, pega los metros desde su hoja de cálculo y guarda la versión 1; desde ese momento Compras ya proyecta su tela.

## Quién entra

- Las cuentas con Patronaje. Nunca ven precios ni costos.
- **Pastilla del menú:** las prendas sin receta que se cortan en `patronaje.corte_proximo_dias` (14) días o menos, más las sin verificar con corte programado; roja si una sin receta se corta en `patronaje.corte_urgente_dias` (7) o menos.
- **Acción principal:** «Capturar receta» → la ventana para escoger la prenda.
- **Pestañas:** Pendientes · Recetas · Rendimiento · Desarrollo de producto.

## Pendientes

**Consulta:** `patronaje.pendientes` (`grupo`: `todos`, `recetas` o `muestra`).

| Cifra | Qué dice | Su línea | Lleva a |
|---|---|---|---|
| «Recetas» | «{n} prendas» (sin Accesorios y servicios), en rojo si hay alguna sin receta con corte próximo | «{n} sin receta con corte próximo» (rojo) · «{n} sin verificar» (ámbar), con la barra Verificadas · Sin verificar · Sin receta | Recetas |
| «Rendimiento» | «{n} con desperdicio arriba de {pct}%» (`patronaje.desperdicio_alto_pct`), ámbar si hay | «{n} prendas medidas en corte» | Rendimiento |
| «Desarrollo de producto» | «{n} en proceso» | «{n} en aprobación» (ámbar) o «Ninguna en aprobación» | Desarrollo de producto |

| Tipo | Referencia | Fecha | Estado | Botón |
|---|---|---|---|---|
| «Receta» | La prenda; abajo «{escuela o Básico} · corte {lote}» | «Corte {fecha}» | «Sin receta · corte próximo» (rojo) · «Sin receta» (ámbar) · «Sin verificar» (ámbar) | «Capturar receta» o «Verificar» → la página de la receta |
| «Muestra» | «{DS} · {prenda}»; abajo la escuela o «Básico o general» | El último movimiento | «Esperando aprobación del cliente» o «Esperando aprobación de Dirección» (azul) | «Ver desarrollo» |

Orden: rojo, ámbar, azul; dentro, por fecha. «Verificar» solo abre la receta: se verifica al cerrar su corte en Producción.

## Recetas

**Consulta:** `patronaje.recetas` (`buscar`, `seccion_id`).

- **Arriba:** buscador «Prenda o escuela», la sección (Accesorios y servicios no lleva receta) y «{n} prendas».
- **Grupos:** «Sin receta» (rojo), «Capturada sin verificar» (ámbar) y «Verificada contra corte» (verde, plegado; al buscar se abre). Dentro, las que tienen corte primero, por fecha de corte, y luego por nombre.
- **Columnas:** Prenda (foto, nombre, escuela) · Tallas (rango y «{n} tallas») · Tela, según el patrón (la principal y «{m} m en talla {t}», la de en medio) · Materiales · Próximo corte («15 oct · en 4 días», en rojo si no está verificada y se corta en `patronaje.corte_urgente_dias` (7) días o menos; abajo «{lote} · {n} pzas»; o «Sin corte») · Desperdicio («+{n}%» en rojo si es alto, «{n} lotes» con «· dato flojo»; o «Sin medir») · Receta.
- **Vacío con búsqueda:** «Ninguna prenda cumple esa búsqueda.» Tocar un renglón abre su receta.

### La página de la receta

**Consulta:** `patronaje.receta` (`producto_id`, `version_numero` para ver una vieja). Es una página dentro de Recetas, no un cajón. Llegan a ella Recetas, Pendientes, la ventana «Capturar receta», Rendimiento, el desarrollo, la ficha y el alta de Catálogo, y Producción.

- **Encabezado:** «‹ Recetas»; foto, nombre, «{escuela o Básico} · tallas {rango}», el estado y «Versión {v} vigente» o «Todavía no hay versión». Datos: «Próximo corte» («{fecha} · {cuándo} · {lote}, {n} piezas» o «Sin corte programado») · «Desperdicio en el tendido» («+{n}% sobre el patrón, {n} lotes» o «+{pct}% estimado, sin medir en corte») · «Desarrollo» («{DS} · {etapa}», abre su cajón).
- **«Con esta receta, el corte {lote} de {n} piezas lleva»:** cada material en su unidad de inventario («214 m», «190 pza», «1 cono»), o «—» mientras falte un dato. Se recalcula mientras se escribe con la función de [cuenta de material](../../modulos/patronaje/cuenta-de-material.md) del paquete compartido.
- **Las tallas:** una columna por talla; las de pedido especial dicen «esp.» y no son obligatorias.
- **«Medidas de la prenda»** («Centímetros, talla por talla»): un renglón por medida con «cm · Llenar desde una talla», una cajita por talla y su botón para quitarla. Sin medidas capturadas, empiezan las del tipo de prenda con su número por talla. «Otra medida, por ejemplo: Bolsa trasera» y «Agregar medida» («{medida} ya está en las medidas» si se repite).
- **«Tela»** («Metros por prenda, talla por talla»): la tela principal (no se quita) con su selector, «{ancho} · m por prenda · Llenar desde una talla» y su cajita por talla; abajo «Para cortar» — «con {n}% de desperdicio» o «…, estimado» — con los metros ya con desperdicio. Las de combinación o forro, con «· combinación» y su botón para quitar; «Agregar tela de combinación o forro…».
- **«Avíos»** («Piezas, centímetros o metros por prenda»): cada uno con su unidad y «Igual en todas las tallas» / «Cambia por talla»; igual en todas, una cajita «{unidad} por prenda» y su conversión («Un cono de 5,000 m alcanza para {n} prendas», «En bodega: {m} m por prenda»); por talla, una cajita por talla. «Agregar avío…» con «{avío} · en {unidad}». Sin avíos: «Sin avíos». Una receta nueva empieza con su tela y «Etiqueta tejida de talla».
- **«Patrón contra corte, por talla»** (si ya tiene cortes): Talla · Patrón · Real · Desperdicio · Respaldo.
- **«Versiones»:** de la más nueva a la más vieja, «Versión {v}» («Vigente»), «{fecha} · {persona}», el motivo y «Cortados con esta versión: {lotes}» o «Ningún lote cortado con esta versión».
- **Las cajitas** aceptan números y un punto (la coma se vuelve punto); se puede pegar desde una hoja de cálculo y lo pegado se reparte por tallas y renglones («Valores pegados desde la hoja de cálculo»).
- **La barra de guardar,** fija abajo: en una receta nueva, «Receta nueva» y «Guardar receta»; con versión, en cuanto hay un cambio, «Motivo del cambio», «Descartar cambios» y «Guardar como versión {v+1}» → `patronaje.guardar_receta`. Lo fuera de lo normal se marca en rojo al escribir; después del primer intento, también lo vacío, y la barra dice el primer error y «y {n} más» (los mensajes, en [recetas](../../modulos/patronaje/recetas.md)). Avisos: «Receta guardada como versión 1. Compras ya puede proyectar su tela» · «Versión {v} guardada. Los lotes ya cortados conservan la versión {v-1}», más «Queda sin verificar hasta que se mida en el próximo corte».
- **Salir con cambios** (por «‹ Recetas», otra pestaña o el menú) abre «Hay cambios sin guardar».

## Rendimiento

**Consulta:** `patronaje.rendimiento`.

- **Encabezado:** «Tela por pieza: patrón contra lo que se gasta en el tendido» — «Metros del rollo entre piezas cortadas, lote por lote, en la talla de en medio». Leyenda: «Patrón: el piso» · «Lo que se gasta de más» · «Pocos lotes: dato flojo».
- **Grupos:** «Desperdicio arriba de {pct}%» (rojo), «Desperdicio normal» (azul) y «Sin medir en corte» (gris, plegado); de mayor a menor desperdicio.
- **Columnas:** Prenda (foto, nombre, escuela y tela) · Tela por pieza (barra «Patrón {m} m» y «Real {m} m», el real en rojo si es alto) · Desperdicio · Respaldo (seis puntos y «{n} lotes», «dato flojo» bajo `patronaje.dato_flojo_lotes`) · Último corte. Sin medir: «Sin receta: no hay patrón contra qué medir» o «Todavía no se corta con esta receta».
- Un renglón medido abre el cajón Rendimiento; uno sin medir, su receta.

## Desarrollo de producto

**Consulta:** `patronaje.desarrollos`.

- **Encabezado:** «De la solicitud al producto en catálogo» — «{n} diseños en proceso» y «Nueva solicitud».
- **El tablero:** cinco columnas con su color y conteo, «Solicitud» · «Muestra» · «Aprobación» · «Ficha técnica» · «En catálogo». Cada tarjeta: «{DS}» y «desde el {fecha}», la prenda, para quién (la escuela con su color, o «Básico o general») y cómo va la muestra («En costura, talla M», «Talla 6, entregada el 8 oct», «Aprobada el 22 sep», «Con cambios: {motivo}»). Columna vacía: «Nada en esta etapa».
- **«Descartados»,** abajo: Diseño · Para · Desde, con quién · Motivo.

## Cajones

### Rendimiento (ancho)

**Consulta:** `patronaje.rendimiento_prenda` (`producto_id`). «Rendimiento · {tela}» y la prenda; tres cifras: «{m} m · dice el patrón, talla {t}», «{m} m · se gasta en el tendido» (rojo si es alto) y «+{n}% · desperdicio, {n} lotes»; con pocos lotes, «Con {n} lotes el dato todavía es flojo.»; «Por talla»: Talla · Patrón · Real · Desperdicio · Respaldo. Botones: «Cerrar» y «Abrir receta».

### Del desarrollo (ancho)

**Consulta:** `patronaje.desarrollo` (`desarrollo_id`).

- «{DS} · {escuela o Básico o general}» y la prenda; la barra de pasos Solicitud · Muestra · Aprobación · Ficha técnica · En catálogo.
- **Datos:** «Cliente» (o «Para») · «Solicitó» · «Muestra» (o «Todavía no») · «En catálogo» (el producto, que abre su receta, o «Todavía no»). **«Ficha técnica básica»:** «Qué pidieron» · «Tela» · «Tallas» · «Receta». Sin escuela, en Aprobación, su autorización: «{AU} · Esperando aprobación de Dirección». **«Historial»,** lo más nuevo arriba.
- **Los botones de cada etapa** (las acciones y sus avisos, en [desarrollos](../../modulos/patronaje/desarrollos.md)):

| Etapa | Botones |
|---|---|
| Solicitud | «Descartar con motivo» · «Empezar muestra» → `patronaje.empezar_muestra` |
| Muestra | «Descartar con motivo» · «Muestra entregada al cliente» (con escuela) o «Muestra lista para aprobar» (sin escuela: pide la autorización a Dirección) → `patronaje.entregar_muestra` |
| Aprobación, con escuela | «Descartar con motivo» · «Pidió cambios» → ventana · «El cliente aprobó» → `patronaje.registrar_aprobacion_cliente` |
| Aprobación, sin escuela | «Descartar con motivo». Lo decide Dirección en Autorizaciones; si pide cambios, regresa a Muestra |
| Ficha técnica | «Descartar con motivo» · «Dar de alta en catálogo» → el alta de Catálogo con el nombre, la escuela y la tela de la solicitud; al crear, el desarrollo pasa a En catálogo |
| En catálogo | «Abrir receta» |

## Ventanas

- **«Capturar receta»:** «Prenda», en tres grupos («Sin receta», «Sin verificar», «Verificadas»), cada opción «{prenda} · {escuela} · se corta el {fecha}», por fecha de corte y luego por nombre; al abrir, la primera sin receta. «Abrir receta».
- **«Llenar {medida o material}»:** «Talla de base» (la de en medio) · «Medida en esa talla» o «Cantidad en esa talla» · «Cuánto sube por talla»; abajo la vista previa talla por talla (medidas a medio centímetro, lo demás a centésimos). «Llenar {n} tallas». Aviso: «{medida o material}: {n} tallas llenas».
- **«Hay cambios sin guardar»:** el nombre de la prenda; «Seguir editando» y «Descartar cambios» (rojo).
- **«Nueva solicitud de diseño»** (ancha): «Para quién» («Ninguna escuela: básico o general» y cada escuela) · «Prenda» · «Tela» · «Tallas» («6 a 14») · «Qué pidieron (opcional)». «Registrar solicitud» → `patronaje.registrar_solicitud`; abre el tablero con la tarjeta marcada. Aviso: «{DS} registrada en Solicitud».
- **«Cambios a la muestra de {prenda}»:** «{escuela} · {DS}» y el motivo. «Regresar a muestra» → `patronaje.pedir_cambios_muestra`. Aviso: «{DS} regresa a muestra».
- **«Descartar {prenda}»:** «{escuela} · {DS}» y el motivo. «Descartar» → `patronaje.descartar_desarrollo`. Aviso: «{DS} descartada. Queda en el historial con su motivo».

## Lo que no se copia de la muestra

- «Dirección aprobó» no es un botón de Patronaje: la muestra sin escuela pide la autorización `aprobar_desarrollo` y Dirección la decide.
- Rendimiento no son cifras de ejemplo: sale de los cortes cerrados.
- En Pendientes, los azules no salen antes que los rojos.
- Salir de la receta por el menú también pregunta si hay cambios sin guardar.

## Cómo está hecho

**Fase 19, parte 5.**

- **Al revisar el diseño:** en Rendimiento lo que se gasta de más va en ámbar (rojo si el desperdicio es alto), el mismo color de su muestra en la leyenda, con el patrón en gris.

- **Las consultas** están en `apps/api/src/modulos/patronaje/consultas/`, con sus contratos en `packages/compartido/src/contratos/patronaje/`: `patronaje.pendientes` (con la pastilla del menú, `pastillaPatronaje`), `patronaje.recetas`, `patronaje.receta`, `patronaje.rendimiento`, `patronaje.rendimiento_prenda`, `patronaje.desarrollos` y `patronaje.desarrollo`, todas de Patronaje y sin dinero. Lo común (`consultas/comun.ts`) lee las prendas que llevan receta con su estado, sus tallas vivas, su tela principal y su próximo corte (de `produccion.lotes_por_cortar`), y su desperdicio medido (de `patronaje.desperdicio_prenda`); la talla de en medio es la de en medio de las tallas normales, y el rango de tallas es `rangoDeTallas` de `calculos/textos.ts` (por grupo, el mismo de Catálogo y Ventas). Cada renglón, estado y texto llega escrito: la pantalla no calcula estados.
- **La página de la receta** lee su versión con `contenidoDeVersion` del dominio, en una transacción que solo lee. Los materiales llegan con la unidad en que se capturan y su conversión (con `dominio/unidades.ts`, la misma regla con que `patronaje.guardar_receta` la congela); una receta nueva empieza con la tela de su desarrollo (o la principal que más llevan las recetas de su sección) y el avío que más llevan las recetas vigentes, sin cantidad. Sin medidas propias, trae las de su tipo de prenda.
- **La cuenta mientras se escribe** está en `apps/web/src/departamentos/patronaje/receta-en-pantalla.ts`: «Con esta receta, el corte… lleva» es `cuentaDeMaterial`, «Para cortar» y la conversión de un avío son `pideLaReceta`, con el desperdicio de la prenda que da la consulta; una cajita que no es número (el mismo `cantidad` del contrato) se marca en rojo, y después del primer intento también lo vacío. Los errores de la acción llegan por renglón (`medidas.{i}`, `lineas.{i}`) y la barra dice el primero y «y {n} más».
- **La dirección:** las pestañas son rutas (`/patronaje`, `/patronaje/recetas`, `/patronaje/rendimiento`, `/patronaje/desarrollo`); la receta se abre con `?cajon=receta&id={producto}` (y `&version={n}` para una vieja), el rendimiento con `?cajon=rendimiento&id=` y el desarrollo con `?cajon=desarrollo&id=`; el filtro, la búsqueda, la sección y la tarjeta marcada también van ahí. «Dar de alta en catálogo» lleva al alta de Catálogo, `/catalogo/productos?cajon=nuevo_producto&origen=desarrollo&desarrollo={desarrollo}`.
- **Pruebas:** `consultas/pendientes.prueba.ts` (las cifras, la cola, el filtro, la pastilla y `403`), `consultas/recetas.prueba.ts` (la lista, la búsqueda, la receta con sus materiales y su corte, la verificada, la nueva y una versión vieja), `consultas/rendimiento.prueba.ts` y `consultas/desarrollos.prueba.ts` (el tablero, los botones de cada etapa y el desarrollo sin escuela); en el navegador, `departamentos/patronaje/patronaje.prueba.ts` (cada pestaña en escritorio y teléfono con sus capturas en `.revision/capturas/patronaje/`, cada botón con su acción y su aviso, salir con cambios, pegar de la hoja, llenar desde una talla, el choque y los estados) y `departamentos/patronaje/receta.prueba.ts` (lo que se ve mientras se escribe es lo que da `patronaje.calcular_material` con lo guardado).
- **Lo que falta del sistema de diseño o de lo común** (pedido al capataz): la ventana «Hay cambios sin guardar» con el nombre de la prenda, «Seguir editando» y «Descartar cambios» usa por ahora la pregunta común; la ventana «Capturar receta» no agrupa sus opciones (cada una empieza con su grupo); la cajita de captura es un `input` de la página; lo fuera de lo normal no se marca al escribir sino al guardar; y el panel de Pendientes muestra su columna de cantidad vacía.
