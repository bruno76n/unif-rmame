# Pantallas de Producción

> **Qué cubre:** las pantallas de Producción (Pendientes, Lotes, Órdenes de producción, Corte, Operaciones y Producción por persona), el cajón del lote y las ventanas Orden de producción nueva, Flujo nuevo, Operación nueva, Resolver excepción y Cancelar registro, cada una con su consulta, sus textos, sus estados y sus botones.
> **Estado:** Decidido.
> **Se construye en:** [fase 19](../../fases/19-web-principal.md).
> **Se conecta con:** [lotes](../../modulos/produccion/lotes.md) · [corte y bultos](../../modulos/produccion/corte-y-bultos.md) · [órdenes de producción](../../modulos/produccion/ordenes-de-produccion.md) · [operaciones y flujos](../../modulos/produccion/operaciones-y-flujos.md) · [registros de operación](../../modulos/produccion/registros-de-operacion.md) · [cambios a pedido](../../modulos/produccion/cambios-a-pedido.md) · [entregas a corte](../../modulos/inventario/entregas-a-corte.md) · [material en bodega](../../modulos/inventario/material-en-bodega.md) · [mínimos y reabasto](../../modulos/inventario/minimos-y-reabasto.md) · [cuenta de material](../../modulos/patronaje/cuenta-de-material.md) · [tarifas](../../modulos/personal/tarifas.md) · [impresión](../../modulos/admin/impresion.md) · [excepciones](../../modulos/inventario/excepciones.md) · [pantallas de Ventas](ventas.md) · [pantallas de Patronaje](patronaje.md) · [lo común de las pantallas](../comunes.md) · [pantallas de Personal](personal.md) · [revisión de lotes](../../modulos/calidad/revision-de-lotes.md) · [etiquetas](../../impresos/etiquetas.md) · [hojas](../../impresos/hojas.md)

## Para qué sirve

Lleva el taller de la orden al lote terminado: qué hay que cortar y cuándo, la captura del corte, cómo avanza cada lote operación por operación, para quién es cada orden y cuánto produce cada persona. Ejemplo: el lunes Javier, el encargado, ve en Pendientes «L-2026-122 · Pantalón azul marino», «Corte hoy». Aprieta «Capturar corte»: los rollos ya vienen puestos, confirma las 190 piezas, escribe que del último rollo quedaron 8.4 m («Sirve») y que cortó Ramiro. Al cerrar, el lote pasa a en proceso, imprime sus etiquetas de bulto y la tablet empieza a recibir registros.

## Quién entra

- **«Cancelar el registro de {persona}»** (`ventanas/cancelar-registro.tsx`) es la ventana con motivo de lo común, con el choque de versión adentro (decisión 804).
- Las cuentas con Producción: el encargado del taller y la dueña. No hay precios de venta ni importes.
- El precio de la tela y el costo del lote, solo con Compras o Contaduría; la mano de obra del costo y las tarifas, solo con `ven_sueldos_y_tarifas`.
- «Ver pedido» solo sale con Ventas a externos; «Capturar receta» y «Ver receta», con Patronaje.
- **Pastilla del menú:** los renglones de Pendientes en rojo o ámbar; roja si hay un lote atorado o atrasado («Hay algo atrasado»).
- **Acción principal:** «Capturar corte» (tijeras): abre Corte con el último lote que escogió esa cuenta o, si no hay, con el primero por fecha de corte.
- **Pestañas:** Pendientes · Lotes · Órdenes de producción · Corte · Operaciones · Producción por persona.

## Pendientes

**Consulta:** `produccion.pendientes` (`grupo`: `todos`, `cambios`, `lotes`, `corte`, `sugerencias` o `excepciones`).

| Cifra | Qué dice | Su línea | Lleva a |
|---|---|---|---|
| «Lotes» | «{n} en proceso»; en rojo si hay atorados o atrasados, en ámbar si hay en riesgo | «{n} por cortar», con la barra Atorados · En riesgo · En tiempo | Lotes |
| «Corte» | «{n} en los próximos {d} días» (`produccion.cortes_proximos_dias`, 7) | «{n} sin receta» (rojo, de cualquier fecha) o «Todo con receta» | Corte |
| «Órdenes de producción» | «{n} en el taller»: las que tienen lotes que no han llegado a aduana | «{n} de clientes · {m} de reabasto» | Órdenes de producción |
| «Producción» | «{n} prendas terminadas hoy»: las buenas de la última operación de cada flujo | La gráfica chica de los últimos 12 días de trabajo («Prendas terminadas por día») | Producción por persona |

| Tipo | Referencia | Fecha · Avance | Estado | Botón |
|---|---|---|---|---|
| «Cambio de pedido» | «{PE} · {cliente}»; abajo «Versión {v} · {prenda}, talla {t}: {n} de más» y lo que va a pasar: «{L} talla {t}: −{n}» (sin cortar), «{L} talla {t}: {n} a Bodega» (ya cortado), «{L} se quita de su orden» | Fecha del cambio · «−{n} pz» | «Por aplicar» (ámbar) | «Aplicar a lotes» → `produccion.aplicar_cambio_pedido` («{PE} versión {v} aplicada en producción» o «Sin ajustes») |
| «Lote» | «{L} · {prenda}»; abajo «{para quién} · {causa}» («la collareta 3 está parada», «sin avance desde el {fecha}») o «{para quién} · se junta en {operación}» | «Entrega {fecha}» (roja si está atorado o atrasado) · «{listas} de {cortadas}» | «Atorado en {operación}» o «Atrasado» (rojo) · «En riesgo de atraso» (ámbar) | «Ver lote» → el cajón (negro si está atorado) |
| «Corte» | «{L} · {prenda}»; abajo «{para quién} · tela entregada», «· tela por entregar» o «· sin receta no se puede cortar» | «Corte {fecha}» · «{n} pz» | Sin receta: «Falta la receta» (rojo). Con receta: «Corte hoy» (rojo; también si ya pasó), «Corte mañana» (ámbar) o «Corte en {n} días» (azul) | Con receta: «Capturar corte» → Corte con ese lote. Sin receta: «Capturar receta» → la receta en [Patronaje](patronaje.md); sin Patronaje, sin botón |
| «Sugerencia de bodega» | La prenda; abajo «Para {ubicación} · {talla}: {piezas} · …» | — · «{n} pz» | «Por decidir» (ámbar) | «Levantar orden» → `produccion.levantar_orden_sugerencia` («{OP} levantada: {L}, {n} piezas por cortar») |
| «Excepción» | Lo que llegó de la tablet y no cuadró («Pasa del tope del bulto», «Registro de un lote ya revisado»); abajo el bulto y la persona | Cuándo se detectó · — | «Por resolver» (rojo) | «Resolver» → la ventana «Resolver excepción» → `inventario.resolver_excepcion` («Excepción resuelta: queda en Resueltas») |

- **Qué sale:** los cambios de pedido por aplicar, con lo que el cambio va a restar y a mandar a Bodega calculado como lo hará la acción ([cambios a pedido](../../modulos/produccion/cambios-a-pedido.md), reglas 3 a 6); los lotes atorados, atrasados o en riesgo (la salud de [lotes](../../modulos/produccion/lotes.md#reglas), regla 7); los cortes de `inventario.dias_entrega_corte` (3) días o menos, y los atrasados; las sugerencias de Bodega por decidir, una por prenda y ubicación; y las excepciones del taller por resolver (`pasa_tope_bulto` y `lote_no_en_proceso`, ver [excepciones](../../modulos/inventario/excepciones.md)), que también ve Bodega.
- **Filtros:** «Todos», «Cambios de pedido», «Lotes», «Corte», «Sugerencias» y «Excepciones», con su conteo; solo los que tienen renglones.
- **Orden:** rojo, ámbar y lo demás; dentro de cada color, por fecha. **Vacío:** «Sin pendientes» (verde).

## Lotes

**Consulta:** `produccion.lotes`.

- **Arriba,** la leyenda: «Piezas que lleva cada operación» · «Se junta trabajo» · «Atorado» · «Ninguna operación reporta más piezas que la anterior».
- **Cuatro grupos plegables,** cada uno con «{n} lotes · {m} piezas»; el que no tiene lotes no sale:
  - **Atorados** (rojo): los atorados y los atrasados, en tarjetas.
  - **En proceso** (azul): los demás en proceso, en tarjetas; primero los en riesgo, luego por entrega. Aquí van los de «Sin datos de la tablet».
  - **Por cortar** (gris), en tabla por fecha de corte: Lote · Prenda (y su modelo) · Piezas · Corte (la fecha, ámbar a `inventario.dias_entrega_corte` días o menos, y «en {n} días») · Para · Receta («Verificada» verde, «Sin verificar» ámbar, «Sin receta» rojo) · «Capturar» → Corte con ese lote.
  - **Terminados** (verde), los que esperan a Calidad: Lote · Prenda · Listas («{listas} de {cortadas}») · Merma · Para · «Esperando a Calidad».
- **La tarjeta del lote:** la prenda; «{L} · {n} piezas»; para quién (el cliente con su color y «{PE} · para el {fecha}»; la tienda y «Reabasto · para el {fecha}»; o «Temporada · bodega» y «Para el {fecha}»); la tira de operaciones; y su estado con su línea.
- **La tira de operaciones:** una casilla por operación del flujo, con su nombre, sus piezas y su barra. Al pasar el puntero: «{operación}: {hechas} de {cortadas} · puede reportar hasta {n}». La del cuello de botella dice «Se junta»; la atorada, «Atorado» en rojo.
- Cada tarjeta o renglón abre el cajón del lote. Al cerrar un corte, esta pestaña abre con el lote recién cortado marcado un momento.

**Los estados del lote,** los mismos en la tarjeta, en el cajón y en las tablas. Los de en proceso son su salud ([lotes](../../modulos/produccion/lotes.md#reglas), regla 7), que se calcula y nunca se guarda:

| Estado | Color | Su línea |
|---|---|---|
| Atorado en {operación} | Rojo | «Desde el {fecha}»; por máquina, «{máquina} parada» |
| Sin datos de la tablet | Gris | «Desde el {fecha}»: la última sincronización de las tablets |
| Atrasado | Rojo | «Faltan {n}» |
| En riesgo de atraso | Ámbar | «Faltan {n} · entrega {en n días}», a `produccion.riesgo_atraso_dias` (4) días o menos |
| En tiempo | Azul | «{listas} de {cortadas} listas» |
| Por cortar | Gris | «{fecha de corte} · {en n días}» |
| Terminado | Verde | «{n} listas · esperando a Calidad» |
| Revisado | Verde | «{n} aprobadas · esperando a Aduana» |
| En aduana | Verde | «{n} recibidas el {fecha}» |
| Cancelado | Gris | «Se quitó de su orden: cambio de {PE} versión {v}» |

## Órdenes de producción

**Consulta:** `produccion.ordenes` (`filtro`: `todas`, `clientes`, `reabasto` o `temporada`; `pedido_id`, para marcar su tarjeta; `cursor`, para «Ya salieron del taller»).

- **«Bodega sugiere fabricar»,** arriba y solo si hay sugerencias por decidir: una tarjeta por prenda y ubicación, con «Para {ubicación} · {talla}: {piezas} · …», «{n} piezas» y «Levantar orden» (la misma acción de Pendientes). La sugerencia se queda hasta que se levanta: no hay «Descartar».
- **Filtros:** «Todas», «Pedidos de clientes», «Reabasto» y «Temporada», con su conteo. A la derecha, «Nueva orden de producción» → su ventana.
- **Tarjetas:** una por pedido (junta sus órdenes) y una por cada orden de reabasto o de temporada. Primero las que siguen en el taller, por entrega; las que ya salieron, abajo en «Ya salieron del taller», con «Ver más». Si ninguna sigue en el taller: «Nada en el taller.»
- **El encabezado:** el color del cliente (o el ícono de la tienda o de la caja de temporada); el nombre (cliente, tienda o «Temporada · bodega»); «{PE} · entrega {fecha}» o la referencia de la orden («Bodega sugirió: Tienda 1 sin talla 10 y 12», «Plan de regreso a clases 2027, primera tanda») y, mientras sigue en el taller, «hace {n} días» (rojo) o «en {n} días» (ámbar a `ventas.dias_en_riesgo` días o menos en un pedido, a `produccion.riesgo_atraso_dias` en las demás). A la derecha, chico: los folios de las órdenes, «{motivo} · {quién la levantó}», el estado y «Ver pedido» (con Ventas a externos) → [el cajón del pedido](ventas.md#pedido-ancho).
- **El estado de la tarjeta:** en un pedido, su etapa y su alerta, como en [Ventas](ventas.md#pedidos); en reabasto y temporada, la peor salud de sus lotes: «Atorado en {operación}», «Atrasado», «En riesgo de atraso», «Por cortar» (todos por cortar), «En tiempo» o «En aduana» (todos llegaron).
- **Los renglones:** uno por prenda (en un pedido, cada prenda del pedido vigente; en reabasto y temporada, cada lote), con «{n} piezas · {lotes}» y el hilo chico ([el hilo](../comunes.md#el-hilo-del-pedido)). Cada renglón abre el cajón de su primer lote que no ha llegado a aduana.
- Desde el cajón del pedido, «{n} lotes» trae aquí con «Todas» y la tarjeta del pedido marcada y centrada un momento.

## Corte

**Consulta:** `produccion.corte` (`lote_id`, opcional). La captura corre mientras se escribe las funciones del [paquete compartido](../../cimientos/PAQUETE-COMPARTIDO.md) con la cuenta de [cuenta de material](../../modulos/patronaje/cuenta-de-material.md): lo que pide la receta, el piso del patrón, «La tela alcanza», los rollos automáticos y lo que queda según la receta; la acción las repite al cerrar. Nadie mide tela: lo que quedó viene calculado y solo se cambia si fue distinto.

- **A la izquierda, «Lotes por cortar»,** por fecha de corte: el lote, la fecha (ámbar a `inventario.dias_entrega_corte` días o menos), la prenda, «{n} piezas · {para quién}» y sus etiquetas: «Tela entregada» (verde, cuando ya están todas las telas de la receta) o «Tela por entregar» (roja a `produccion.tela_por_entregar_rojo_dias` (1) día o menos del corte, ámbar desde `inventario.dias_entrega_corte`; más lejos no sale), y «Sin verificar» (ámbar) o «Sin receta» (rojo). La escogida va resaltada. Escoger otra empieza la captura de nuevo. Vacío: «No hay lotes por cortar.»
- **El encabezado de la captura:** «{L} · {OP}», la prenda, «{para quién} · {PE} · para el {fecha}» (o «Reabasto · para el {fecha}», «Para el {fecha}»), la etiqueta de la tela (aquí siempre sale; gris si falta más) y la de la receta («Receta verificada», «Sin verificar», «Sin receta»).
- **Sin receta no se corta:** solo el panel «Falta la receta»: «Sin receta no se puede cortar: el sistema no sabe cuánta tela lleva cada talla. Se corta el {fecha}.» y «Capturar receta» → la receta en Patronaje. Sin Patronaje, sin botón, y el texto termina «Se corta el {fecha}; Patronaje ya lo tiene en sus pendientes.»
- **Avisos de arriba:** receta sin verificar, azul «Con este corte queda verificada la receta.»; si Bodega entregó con otra versión de la receta, ámbar «Bodega entregó tela para la versión {v} de la receta y se corta con la {w}».
- **«Rollos», una sección por tela de la receta:** la principal primero y luego la de combinación y el forro, cada una con su nombre (y «combinación» o «forro» al lado):
  - **La línea de la tela** (no sale con cero piezas): verde «La tela alcanza · {piezas} piezas llevan {m} m según la receta · el rollo tiene {m} m» («los {n} rollos tienen {m} m»); roja «Faltan {m} m de {tela} · …» con «Agregar {rollo} · {m} m», o «· no hay más rollos de esta tela en bodega».
  - **Los rollos vienen puestos** en el orden en que se usan (los que entregó Bodega o los sugeridos). Cada renglón: el selector «Rollo…» («{rollo} · partida {p} · {m} m», y «· entregado» en los de este corte, que van primero; un rollo ya puesto no se ofrece otra vez); «Completo · {m} m» o, en el último, «Se usan {m} m · quedan {m} m según la receta»; y × (solo con más de uno).
  - **«Quedó del rollo {rollo}»,** abajo del último: viene lleno con lo que queda según la receta, con «Según la receta» al lado. Solo se cambia si de verdad quedó otra cosa; cambiado, dice «Cambiado · según la receta, {m} m» con «Volver a lo calculado». Con más de 0 y menos de `inventario.metros_frontera_rollo` (15 m): «Sirve» (como viene) · «Ya no sirve».
  - **«Agregar rollo»** pone el siguiente que conviene como último; se apaga cuando ya están todos los de esa tela.
  - Partidas mezcladas: ámbar «Se mezclan las partidas {P} y {P}: el tono puede variar entre piezas.»
  - Cambiar, quitar o agregar un rollo apaga los rollos automáticos de esa tela; cambiar el último regresa lo que quedó a lo calculado.
- **«Piezas cortadas por talla»** («Planeado: {n}»): una casilla por talla, llena con lo planeado, hasta 4 cifras, con «de {planeado}» abajo.
- **«Cortó»:** «¿Quién cortó?», con las personas activas del Taller; primero quien hace de base el corte en el flujo de la prenda.
- **Cifras,** de la tela principal: Piezas · Metros usados · Por pieza · Patrón, y «+{n}%» o «−{n}%» contra el patrón, en rojo arriba de `produccion.rendimiento_rojo_porcentaje` (10 %). Con cero piezas dicen «—».
- **El pie:** lo que pasa con lo que quedó de cada tela («{rollo} regresa a bodega con {m} m», «Retazo de {m} m a la bodega de tela», «{m} m se registran como merma de tela», «El rollo {rollo} se usó completo») y «Cerrar corte» → `produccion.cerrar_corte`.
- **Al cerrar:** «{L} cortado: {n} piezas a {m} m por pieza» o «{L} cortado. La receta de {prenda} queda verificada»; abre Lotes con el lote marcado. Con errores, cada campo lleva el suyo y el primero sale en el aviso ámbar; los mensajes y lo que cambia al cerrar están en [corte y bultos](../../modulos/produccion/corte-y-bultos.md).

## Operaciones

**Consulta:** `produccion.operaciones`.

- **Arriba:** «Nuevo flujo» → su ventana.
- **Una tarjeta por flujo:** el nombre, «{n} operaciones», las prendas que lo usan («Playera polo blanca lisa, Playera polo blanca con escudo y 2 más») y la tabla # · Operación · La hace (avatar y nombre). Una operación sin tarifa lleva «Sin tarifa» (ámbar): la pone Personal. Con `ven_sueldos_y_tarifas`, la tabla suma la columna Tarifa.
- **Al pie de cada tarjeta,** «Agregar operación» → su ventana, y una × en cada operación menos el corte → `produccion.quitar_operacion_flujo` («{operación} quitada de {flujo}»).
- **El candado:** un flujo con lotes en proceso o terminados sin revisar lleva «{n} lotes en proceso» y su «Agregar operación» y sus × apagados, con «{n} lotes en proceso usan este flujo: cámbialo cuando terminen o haz un flujo nuevo».

## Producción por persona

**Consulta:** `produccion.produccion_por_persona`.

- **Tabla** de la gente del Taller, de quien lleva más piezas hoy a quien lleva menos: Persona (avatar, nombre y puesto) · Operaciones (las que hace) · Hoy («{n} piezas», con su barra contra quien lleva más) · Esta semana (desde el primer día de trabajo de la semana) · Lotes donde trabaja (los en proceso cuyo flujo tiene una operación suya, o «—»).
- Solo las piezas buenas de sus registros vigentes, también las del corte. Sin tarifas ni importes. No tiene botones.

## Cajones

### Lote (ancho)

**Consultas:** `produccion.lote` (`lote_id`; `cursor` para más registros) y `produccion.costo_lote` (`lote_id`; con Compras o Contaduría). Se abre desde Pendientes, Lotes, Órdenes de producción y las alertas de Dirección.

- **Encabezado:** «{L} · {OP}» y el estado; abajo, la prenda.
- **Avisos:** atorado por máquina, en rojo el porqué («La collareta 3 está parada. Mantenimiento la está revisando.»); por cortar sin receta, «Falta la receta: no se puede cortar hasta que Patronaje la capture».
- **El hilo,** grande: el de esa prenda en todo el pedido si es de un pedido; si no, el del lote.
- **Cifras:** planeadas · cortadas · listas · merma («—» sin cortar). **Datos:** Para · Entrega («{fecha} · {en n días}») · Corte (la fecha, y «· programado» sin cortar) · Receta («Versión {n} · verificada contra corte» o «sin verificar», o «Sin receta»).
- **«Operación por operación»** («Ninguna puede reportar más que la anterior»), ya cortado: Operación · Hechas (cifra y barra) · Puede reportar hasta · Merma · Quién (cada persona con sus piezas, o «—»). La atorada dice «Atorado desde el {fecha}»; la del cuello de botella, «Se junta trabajo: {n} esperando». Sin cortar: «Se corta el {fecha}. {n} piezas en {m} tallas.»
- **«Registros de la tablet»** («Los últimos {n}», con «Ver más»): Cuándo (fecha, hora y bulto) · Quién · Operación · Piezas (buenas, y «{n} dañadas») · «Cancelar registro» → su ventana. Los del corte dicen «Corte» y no se cancelan; un cancelado sale tachado con su motivo. Con `ven_sueldos_y_tarifas`, la tarifa de cada uno. Desde que Calidad lo revisa, ninguno se cancela.
- **«Bultos»,** ya cortado: Bulto · Talla · Piezas, con «Imprimir etiquetas de bulto» → `produccion.imprimir_etiquetas_bulto` («{n} etiquetas de bulto a la impresora del taller: {primero} a {último}») y «PDF», que baja las mismas etiquetas (ver [impresión](../../modulos/admin/impresion.md)). Sin impresora conectada: «No hay impresora del taller: descarga el PDF de las etiquetas.»
- **«Rollos usados»,** ya cortado: «Partida {P}» o «{n} partidas» (ámbar). Rollo · Partida · Tela · Metros (y Precio por metro, con Compras o Contaduría). Abajo: Por pieza · Patrón · Rendimiento («+{n}% sobre el patrón», rojo arriba de `produccion.rendimiento_rojo_porcentaje`).
- **«Costo del lote · {n} piezas cortadas»,** ya cortado y con Compras o Contaduría: Concepto · De dónde sale · Importe. «Tela» («{m} m, cada rollo al precio en que se compró») · «Avíos» («a su última compra») · «Mano de obra» («{n} operaciones · {suma de tarifas} por pieza», estimada mientras está en proceso y real ya terminado) · «Total», con «{costo} por pieza». Sin `ven_sueldos_y_tarifas`, la mano de obra y el total no salen. La cuenta está en [lotes](../../modulos/produccion/lotes.md#reglas), regla 10.
- **Botones,** según el lote: por cortar con receta, «Capturar corte» (negro) → Corte con ese lote; por cortar sin receta, «Capturar receta» (con Patronaje); ya cortado, «Hoja del lote» → su PDF (`GET /v1/etiquetas/lote/{id}?formato=pdf`, ver [hojas](../../impresos/hojas.md#la-hoja-del-lote)) y «Ver receta» (con Patronaje). Siempre, «Cerrar».

## Ventanas

- **«Orden de producción nueva»** (ancha), con `produccion.opciones_orden_nueva` (`texto`): Para («Temporada · bodega» o una tienda activa) · Prenda (las activas que pasan por el taller; sin receta, el aviso «Sin receta: no se corta hasta que Patronaje la capture») · piezas por talla (una casilla por talla vigente, «especial» donde aplica, y el total; una talla descontinuada sale apagada, «ya no se fabrica») · «Para cuándo» (propone hoy + `produccion.orden_entrega_temporada_dias`, 21) · Motivo (opcional, hasta 120). «Levantar orden» → `produccion.crear_orden` («{OP} levantada: {L}, {n} piezas por cortar», y sin receta «. Falta la receta: no se corta hasta que Patronaje la capture»).
- **«Flujo nuevo»:** Nombre · «Parte de» (un flujo vigente, que se copia con sus operaciones, personas y tarifas, o «Una sola operación: la prenda completa la hace una persona»); con una sola operación, «¿Quién corta?» y «¿Quién la hace?». «Crear flujo» → `produccion.crear_flujo` («Flujo «{nombre}» creado con {n} operaciones. Se escoge al dar de alta un producto»).
- **«Operación nueva en {flujo}»:** Operación (propone los nombres del catálogo) · «La hace» · «Va antes de» (propone `produccion.operacion_antes_por_omision`, Planchado, o la última). «Agregar operación» → `produccion.agregar_operacion_flujo` («{operación} agregada a {flujo}. La tarifa la pone Personal»).
- **«Resolver excepción»:** qué pasó y «Qué se hizo» (5 letras o más); resolverla no mueve nada: si hace falta, primero se cancela el registro.
- **«Cancelar el registro de {persona}»:** «{n} {operación} en {bulto}, del {fecha}» y el motivo. «Cancelar registro» → `produccion.cancelar_registro` («Registro cancelado: {n} piezas menos para {nombre} en la nómina»).

Los mensajes de error de cada acción están en su archivo del módulo.

## Lo que no se copia de la muestra

- Cualquier cuenta con Producción hace todo lo de Producción: no hay cuenta «del taller» con menos botones. «Nueva orden de producción», «Nuevo flujo», las operaciones y «Cancelar registro» son para todas.
- El corte pide quién cortó, y sus piezas cuentan para la nómina por pieza.
- En el corte nadie mide tela: «Quedó del rollo» viene lleno con lo que queda según la receta, no vacío para escribirlo, y cierra sin tocarlo. La tela de combinación y el forro llevan sus propios rollos, como la principal.
- Las tarifas y la mano de obra solo salen con `ven_sueldos_y_tarifas`.
- «Empacadas hoy» es «Terminadas hoy»: la última operación de cada flujo, se llame como se llame.
- «Terminados hoy» es «Terminados»: todos los que esperan a Calidad.
- Atorado y sin datos de la tablet los calcula el sistema; no vienen en los datos.
- El cambio de pedido dice antes de aplicarse qué va a restar y qué manda a Bodega.
- El cajón lleva sus bultos, con «Imprimir etiquetas de bulto» y su PDF, no solo recién cortado, y «Hoja del lote», que la muestra no tiene.
- Las órdenes que ya salieron del taller se paginan.

## Cómo está hecho

**Fase 19, parte 8.**

- **Al revisar el diseño:** los grupos de Lotes dicen sus piezas con separador de miles; en el cajón del lote el estado no se estira a todo el ancho.

- **Las consultas** están en `apps/api/src/modulos/produccion/consultas/`, con sus contratos en `packages/compartido/src/contratos/produccion/` (`pendientes.ts`, `lotes.ts`, `ordenes-de-produccion.ts`, `captura-corte.ts`, `operaciones.ts` y lo común en `pantallas.ts`); todas piden el departamento Producción, salvo `produccion.costo_lote`, que pide Compras o Contaduría. Llegan con sus textos ya escritos (el estado con su color y su línea, «para quién», los plazos), así que la pantalla no calcula estados.
  - **Lo común** (`consultas/comun.ts`): los lotes con su prenda, «para quién», sus piezas, su receta y su último avance (`leerLotes`); el estado de cada lote según la tabla de arriba (`estadoDelLote`); la tira de operaciones con el cuello de botella; y el hilo de un lote de reabasto o de temporada. La salud de un lote en proceso no se calcula aquí: sale de las lecturas `produccion.salud_de_lotes` y `produccion.lotes_atorados`, la regla 7 de [lotes](../../modulos/produccion/lotes.md#reglas).
  - **`produccion.pendientes`** (`pendientes.ts`) arma las cuatro cifras y los renglones de cada grupo con lo que su botón necesita; el filtro va en `grupo`. Lo que va a hacer un cambio de pedido lo calcula `repartirPiezasDeMas` (`dominio/reparto-de-cambio.ts`), las reglas 4 y 5 de [cambios a pedido](../../modulos/produccion/cambios-a-pedido.md#reglas): la misma función con la que `produccion.aplicar_cambio_pedido` lo aplica, con lo de más de `ventas.avance_pedido`. La misma cuenta da **la pastilla** (`pastillaProduccion`, en el `index.ts` del módulo).
  - **`produccion.lotes`**, **`produccion.lote`** y **`produccion.costo_lote`**: los cuatro grupos (en «Sin datos de la tablet», «Desde el {fecha}» de la última sincronización o, si las tablets nunca han subido nada, del último avance del lote); el cajón con sus registros por páginas (diez por página, con cursor; su fecha como «10 nov 16:03 · {bulto}», en hora de México), sus bultos, sus rollos y su rendimiento contra el piso del patrón (`patronaje.calcular_material` con la versión que se cortó); y el costo (tela a su costo por metro, avíos con `compras.costo_material`, mano de obra con las tarifas). El precio por metro se recorta sin Compras ni Contaduría; la tarifa de cada registro y de cada operación viaja como `tarifa_centavos`, que el recorte común quita sin «ven sueldos y tarifas»; la mano de obra, el total y el costo por pieza, igual.
  - **`produccion.ordenes`** junta las órdenes de un pedido en una tarjeta con el hilo de `produccion.hilo_pedido`; la etapa del pedido y su alerta salen de `ventas.avance_pedido`. Las que ya salieron del taller van por páginas de diez. La tarjeta marcada del pedido (`?pedido=`) la pone la pantalla, no la consulta.
  - **`produccion.corte`** manda, del lote escogido, lo que la pantalla necesita para correr las cuentas del paquete compartido con los mismos insumos que `produccion.cerrar_corte`: la receta vigente de cada tela, el desperdicio de la prenda, los rollos que se pueden usar (los entregados al lote y los libres en Bodega, primero los sugeridos) con lo que tiene cada uno, las tallas y las personas del Taller (primero quien corta de base).
  - **`produccion.operaciones`**, **`produccion.produccion_por_persona`** y **`produccion.opciones_orden_nueva`**, como dicen sus secciones.
- **Las pantallas** están en `apps/web/src/departamentos/produccion/`, una pestaña por archivo en `pestanas/`, el cajón del lote en `cajones/lote.tsx` y las cinco ventanas en `ventanas/`; cada pestaña es una ruta de `apps/web/src/rutas/produccion/` (`/produccion`, `/produccion/lotes`, `/produccion/ordenes`, `/produccion/corte`, `/produccion/operaciones` y `/produccion/por-persona`). La dirección lleva el filtro (`grupo`, `filtro`), el lote del corte (`cortar`), el cajón del lote (`lote`, en cualquier pestaña) y lo marcado (`marcado`, `pedido`): otro departamento abre el cajón con `/produccion/lotes?cajon=lote&id={id}`. «Capturar corte» abre Corte con el último lote que escogió esa cuenta en ese navegador, o con el primero.
- **La captura del corte** (`pestanas/corte.tsx`) corre mientras se escribe `pideLaReceta`, `rollosAutomaticos`, `laTelaAlcanza`, `usoDeLaTela`, `destinoDeLoQueQuedo` y `porcentajeSobreElPatron` del paquete compartido, las mismas que usa `produccion.cerrar_corte`; `corte-en-pantalla.ts` solo los junta con lo capturado y escribe sus textos. Los metros se leen con un decimal a lo más («213.5 m»; los de por pieza, con dos) y «Quedó del rollo» viene lleno igual; la cuenta sigue en milésimos y lo exacto de cada rollo va en sus atributos `data-metros-*`, con los que la prueba compara contra lo que guarda la acción. Con cambios sin guardar pregunta antes de salir.
- **Pruebas:** en la API, `consultas/pendientes.prueba.ts` (las cifras, el filtro, lo que dice el cambio antes de aplicarse contra lo que hace la acción, la sugerencia, la excepción y la pastilla), `lotes.prueba.ts`, `lote.prueba.ts` (los registros por páginas y el recorte del precio, la tarifa y el costo), `ordenes.prueba.ts`, `corte.prueba.ts` (con lo que manda, la cuenta da lo que guarda la acción) y `operaciones.prueba.ts`. En el navegador, `departamentos/produccion/produccion.prueba.ts` (cada pestaña en escritorio y teléfono con su captura en `.revision/capturas/produccion/`, cada botón con su acción y su aviso, el error, el choque de versión y la cuenta sin Producción) y `corte.prueba.ts` (lo que se mostró al escribir es lo que guardó el cierre, y lo que quedó escrito a mano llega con su destino).
