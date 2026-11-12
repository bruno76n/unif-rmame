# Lo común de las pantallas

> **Qué cubre:** lo que comparten todas las pantallas de la fábrica: el armazón (menú, barra superior, cuenta y campana de avisos) y qué ve cada cuenta, la página de un departamento con su Pendientes, los cajones y las ventanas, los estados de una pantalla, la búsqueda «¿Dónde está?» y el hilo del pedido, cada uno con su consulta.
> **Estado:** Decidido.
> **Se construye en:** [fase 19](../fases/19-web-principal.md).
> **Se conecta con:** [diseño](DISENO.md) · [textos](TEXTOS.md) · [API](../cimientos/API.md) · [acceso con Google](../modulos/admin/acceso-con-google.md) · [avisos](../modulos/admin/avisos.md) · [bitácora](../modulos/admin/bitacora.md) · [permisos](../modulos/admin/permisos.md) · [libro de movimientos](../modulos/inventario/libro-de-movimientos.md) · [traspasos](../modulos/inventario/traspasos.md) · [recepciones en aduana](../modulos/inventario/recepciones-en-aduana.md) · [surtido y despachos](../modulos/inventario/surtido-y-despachos.md) · [diferencias, ajustes y mermas](../modulos/inventario/diferencias-ajustes-y-mermas.md) · [excepciones](../modulos/inventario/excepciones.md) · [lotes](../modulos/produccion/lotes.md) · [pantallas de Administración del sistema](fabrica/administracion.md) · [pantallas de Aduana](fabrica/aduana.md) · [pantallas de Bodega](fabrica/bodega.md) · [pantallas de Calidad](fabrica/calidad.md) · [pantallas de Catálogo](fabrica/catalogo.md) · [pantallas de Compras](fabrica/compras.md) · [pantallas de Contaduría](fabrica/contaduria.md) · [pantallas de Dirección](fabrica/direccion.md) · [pantallas de Mantenimiento](fabrica/mantenimiento.md) · [pantallas de Patronaje](fabrica/patronaje.md) · [pantallas de Personal](fabrica/personal.md) · [pantallas de Producción](fabrica/produccion.md) · [pantallas de Tienda en línea](fabrica/tienda-en-linea.md) · [pantallas de Ventas a externos](fabrica/ventas.md) · [revisor de diseño](../../.claude/agents/revisor-diseno.md) · [pantallas de la tablet](tablet.md) · [fase 19](../fases/19-web-principal.md)

## Para qué sirve

Que cualquier persona, en cualquier departamento, encuentre las cosas en el mismo lugar: el menú a la izquierda, lo que le toca hacer en la primera pestaña, el detalle en un cajón a la derecha y la confirmación en una ventana al centro. Ejemplo: Javier, de Aduana y bodega, entra con su Google y solo ve Aduana y Bodega en el menú; Bodega lleva la pastilla roja «9» porque una solicitud de tienda va atrasada; escribe «polo 12» en «¿Dónde está?» y ve cuántas hay en cada ubicación sin salir de su pantalla.

## El armazón

### El menú lateral

Blanco, a la izquierda, de alto completo. El menú y la barra superior se quedan quietos: se desplazan solo el menú, si no cabe, y el panel de contenido, cada uno por su cuenta (ver [diseño](DISENO.md#reglas), regla 9). Arriba la marca «Uniformes Alameda · Sistema de fábrica»; los departamentos van en grupos:

| Grupo | Departamentos |
|---|---|
| (sin grupo) | Dirección |
| Operación | Compras · Catálogo · Patronaje · Ventas a externos · Tienda en línea |
| Taller | Producción · Calidad · Mantenimiento |
| Almacén | Aduana · Bodega |
| Administración | Contaduría · Personal · Administración del sistema |

1. **El menú es de la cuenta:** un departamento que la cuenta no tiene no aparece, ni en gris ni con candado. Lo deciden sus departamentos en [permisos](../modulos/admin/permisos.md). La Puerta del taller no sale en el menú de nadie, tampoco de la dueña: vive solo en la tablet registrada (ver [pantallas de la tablet](tablet.md)).
2. **Cada departamento** lleva su ícono, su nombre y, si tiene algo, su **pastilla** con el conteo; roja si algo está atrasado («Hay algo atrasado» al pasar el puntero). El activo va resaltado en el color de la marca.
3. **La pastilla cuenta lo que esa área tiene que hacer ya;** la pestaña Pendientes cuenta todo lo pendiente. Cada archivo de departamento dice qué cuenta su pastilla y cuándo se pone roja.
4. **Tocar un departamento** lo abre en su primera pestaña, arriba de la página.
5. **Abajo, la cuenta:** avatar con iniciales, nombre y puesto (el departamento si tiene uno, «Varios» si tiene más, «Administradora principal» la dueña). Al tocarla: «Mis sesiones» y «Salir».

### La barra superior

- **Migas:** «{Grupo} › {Departamento}».
- **«¿Dónde está? Prenda y talla, o código»** (atajo: la tecla /), solo para Aduana, Bodega y Dirección (abajo).
- **La campana** con los avisos sin leer de la cuenta (ver [avisos](../modulos/admin/avisos.md)): tocar uno lo marca leído y abre su enlace; «Marcar todos como leídos» (`admin.marcar_aviso_leido`).
- **La acción principal** del departamento, arriba a la derecha; cada archivo de departamento dice cuál es. Tienda en línea no tiene.

### «Mis sesiones»

Ventana con las sesiones abiertas de la cuenta: aparato, ciudad, dirección IP, cuándo entró y su última actividad, y cuál es esta. «Cerrar» en una o «Cerrar las demás» (`admin.cerrar_mi_sesion`); «Salir» cierra esta (`admin.salir`), ver [acceso con Google](../modulos/admin/acceso-con-google.md).

### Sus consultas

#### `admin.armazon`

| | |
|---|---|
| **Pantalla** | El menú, la cuenta y las pastillas |
| **Quién** | Cualquier sesión abierta |
| **Regresa** | La cuenta: nombre, iniciales, correo, puesto, si es la dueña o soporte. Sus departamentos, sin la Puerta del taller, con su clave, nombre, grupo, orden, conteo y si va en rojo. Sus permisos finos, sus avisos sin leer, hasta cuándo vale su «Confirmar con Google», la versión mínima de la web y la hora del servidor |
| **Recorte** | Lo que no tiene no viaja. Cada conteo lo calcula el módulo de ese departamento |

#### `inventario.pastillas_menu`

| | |
|---|---|
| **Pantalla** | Las pastillas de Aduana y Bodega |
| **Quién** | Aduana o Bodega |
| **Regresa** | **Aduana:** lo que lleva más de `inventario.horas_aduana_parado` en aduana más los despachos con más de `inventario.dias_sin_confirmar_pastilla` (1) día sin confirmar; roja si algo en aduana sale hoy o mañana. **Bodega:** excepciones por resolver + pedidos externos, pedidos en línea y devoluciones a proveedor por surtir + recepciones por confirmar + diferencias por contar; roja si hay un pedido en línea por surtir. Con el POS suma las solicitudes de las tiendas por surtir, y también se pone roja si una va atrasada |
| **Recorte** | Solo la de los departamentos de la cuenta |

#### `admin.mis_sesiones`

| | |
|---|---|
| **Pantalla** | «Mis sesiones» |
| **Quién** | Cualquier sesión abierta |
| **Regresa** | Sus sesiones abiertas: aparato, ciudad, IP, cuándo entró, su última actividad y si es esta |

#### `admin.mis_avisos`

| | |
|---|---|
| **Pantalla** | La campana |
| **Quién** | Cualquier sesión abierta |
| **Recibe** | `solo_sin_leer` · `cursor` · `limite` |
| **Regresa** | Por aviso: tipo, texto, enlace, cuándo nació y si se leyó; y cuántos van sin leer. Solo los suyos |

## La página de un departamento

1. **Título grande y, abajo, sus pestañas.** La primera es siempre «Pendientes», con su conteo, roja si algo urge. Aduana abre en su andén y Personal en Asistencia, cada una con sus pendientes. La Puerta del taller es la pantalla de la tablet (ver [tablet](tablet.md)).
2. **Las pestañas y los filtros van en la dirección:** un enlace abre la pantalla tal como estaba.
3. **Pendientes tiene dos partes:**
   - **La barra de indicadores:** una franja con varias cifras; cada una con su ícono y su nombre, el número con su unidad, una línea de contexto (lo rojo y lo ámbar primero, separado por «·»), una gráfica chica si hay al menos 3 datos y cabe, y la barra repartida por estado si sus colores son estados. Toda la cifra lleva a su pestaña; no lleva botones.
   - **El panel «Pendientes»,** con su conteo y sus filtros por grupo («Todos» y cada grupo con el suyo), y la tabla: **Tipo** (ícono de color y el tipo) · **Referencia** (qué es y, abajo, su detalle) · **Fecha** (la que importa) · **Importe o Cantidad** · **Estado** · y el botón que resuelve ese pendiente.
4. **El orden de Pendientes:** primero rojo, luego ámbar, luego sin color, luego verde; dentro de cada color, por fecha. Sin pendientes: «Sin pendientes», en verde.
5. **En el teléfono** las pestañas se desplazan de lado con la activa al centro, y la barra pone dos cifras por renglón.

## Cajones y ventanas

### El cajón

1. Entra por la derecha sobre la página, que se oscurece detrás. **Encabezado:** arriba en chico el folio y su contexto, abajo el nombre grande y el botón para cerrar. **Cuerpo:** el detalle o la captura. **Pie:** a la izquierda cerrar, regresar o descartar; a la derecha la acción principal, en negro.
2. **Los botones con cifra,** arriba del cuerpo, llevan a lo relacionado en otro departamento («3 lotes en producción», «2 solicitudes que la piden»). Si la cuenta no tiene ese departamento, muestran la cifra sin llevar a ningún lado.
3. **Su historial,** cuando lo muestra, sale de `admin.historial_entidad` (abajo), con el recorte de quien lo ve.
4. **Con cambios sin guardar,** cerrarlo, cambiar de pestaña o salir por el menú pregunta antes: «Tienes cambios sin guardar. ¿Salir sin guardar?», con «Volver» y «Salir sin guardar».

### La ventana

1. Recuadro al centro para confirmar algo con motivo, capturar un dato corto o escoger algo. «Volver» a la izquierda y la acción a la derecha.
2. **«Confirmar con Google»:** las acciones delicadas abren la ventana de Google; al volver, la acción sigue sola. Vale `admin.reautenticacion_minutos` (5) minutos (ver [acceso con Google](../modulos/admin/acceso-con-google.md)).
3. **El motivo** lleva al menos `general.largo_minimo_motivo` (5) letras; el botón se prende al llegar.

### El aviso de abajo

Al centro, por unos 3 segundos: verde con palomita cuando algo se hizo y ámbar con «!» cuando no se pudo. El texto es el que regresa la acción (ver [textos](TEXTOS.md#los-avisos-de-abajo)).

#### `admin.historial_entidad`

| | |
|---|---|
| **Pantalla** | El historial de cualquier cajón que lo muestre |
| **Quién** | Quien puede ver ese documento: lo responde su módulo |
| **Recibe** | `entidad` · `entidad_id` · `cursor` |
| **Regresa** | Por renglón de [bitácora](../modulos/admin/bitacora.md): cuándo, quién, departamento, qué pasó, y su antes y después |
| **Recorte** | El del módulo dueño sobre el antes y el después (Aduana nunca ve precios ahí) y el de sueldos |

## Los estados de una pantalla

Ninguna pantalla se queda en blanco:

| Estado | Qué se ve |
|---|---|
| **Cargando** | La forma de la pantalla en gris (esqueleto), sin girar nada |
| **Vacío** | El texto de su archivo («Sin pendientes», «Sin pedidos en línea»), y la acción para crear si la hay |
| **Error** | «No se pudo cargar. Intenta otra vez», con «Reintentar»; el detalle va a la bitácora del servidor, no a la pantalla |
| **Sin permiso** | El departamento no aparece; una dirección escrita a mano lleva a «No tienes acceso a esta pantalla» |
| **Sin conexión** | Una franja arriba, «Sin conexión: los cambios no se guardan hasta que vuelva». Los botones que escriben se apagan; nada se pierde de lo capturado |
| **Choque de versión** | «{documento} cambió mientras lo veías. Revisa los cambios y vuelve a guardar», con lo nuevo cargado y lo capturado conservado (ver [API](../cimientos/API.md)) |
| **Versión vieja** | Si la web es más vieja que la mínima del servidor: «Hay una versión nueva del sistema», con «Actualizar» |

## «¿Dónde está?»

La búsqueda de la barra superior, para Aduana, Bodega y Dirección. La caja de una tienda tendrá la suya, «¿Dónde hay?», solo con las piezas libres de cada ubicación (con el POS, ver [sincronización](../cimientos/SINCRONIZACION.md#lo-que-puede-cada-aparato)). Al escribir (un código de 4 dígitos o más, o prenda y talla), salen hasta 5 variantes: «{prenda}, talla {t}» y su código; las piezas en Aduana, Bodega, Tienda 1, Tienda 2, Tránsito y En camino a aduana (en cero, en gris); abajo «Total», «Comprometidas» y «Libres», y lo que se está moviendo con su folio. Sin texto, ejemplos para tocar («polo 12», «pants marino», «102041»); sin resultados, «No encontré «{texto}»».

#### `inventario.donde_esta`

| | |
|---|---|
| **Pantalla** | «¿Dónde está?» |
| **Quién** | Aduana, Bodega o Dirección |
| **Recibe** | `texto` · `limite` |
| **Regresa** | Por variante: sus piezas en cada ubicación ([existencias](../modulos/inventario/existencias-y-cuadre.md)), lo apartado con su documento y dónde, y lo que va de camino con su folio ([traspasos](../modulos/inventario/traspasos.md)) |

## El hilo del pedido

Las seis paradas de una prenda de un pedido: **Pedido · Corte · Costura · Calidad · Aduana · Entrega**, cada una con sus piezas y su línea corta abajo (los textos, en [textos](TEXTOS.md#el-hilo)). Sale en el cajón del pedido de Ventas a externos y en el botón «{n} lotes en producción».

#### `produccion.hilo_pedido`

| | |
|---|---|
| **Pantalla** | El hilo del cajón del pedido |
| **Quién** | Producción o Ventas a externos |
| **Recibe** | `pedido_id` · `producto_id`, opcional |
| **Regresa** | Por prenda: las seis paradas con sus piezas y su línea, sus lotes con su estado y su salud (ver [lotes](../modulos/produccion/lotes.md)), y lo de más por talla si hay un cambio por aplicar |
| **Recorte** | Nada de dinero |

## Cómo está hecho

*Lo escribe Claude Code al terminar la fase 19.*
