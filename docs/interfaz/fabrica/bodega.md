# Pantallas de Bodega

> **Qué cubre:** las pantallas de Bodega (Pendientes con «Variantes en cero», Existencias, Materiales, Reabasto, Diferencias, Conteos y ajustes y Excepciones), los cajones Variante, Entrega al corte, Llegada de aduana, Nuevo conteo o Conteo de diferencia y Carga inicial, y sus ventanas, cada una con su consulta, sus textos, sus estados y sus botones.
> **Estado:** Decidido.
> **Se construye en:** [fase 19](../../fases/19-web-principal.md).
> **Se conecta con:** [existencias y cuadre](../../modulos/inventario/existencias-y-cuadre.md) · [reservas](../../modulos/inventario/reservas.md) · [traspasos](../../modulos/inventario/traspasos.md) · [surtido y despachos](../../modulos/inventario/surtido-y-despachos.md) · [entregas a corte](../../modulos/inventario/entregas-a-corte.md) · [material en bodega](../../modulos/inventario/material-en-bodega.md) · [mínimos y reabasto](../../modulos/inventario/minimos-y-reabasto.md) · [conteos](../../modulos/inventario/conteos.md) · [diferencias, ajustes y mermas](../../modulos/inventario/diferencias-ajustes-y-mermas.md) · [excepciones](../../modulos/inventario/excepciones.md) · [entregas y devoluciones de clientes](../../modulos/inventario/entregas-y-devoluciones-de-clientes.md) · [recepciones en aduana](../../modulos/inventario/recepciones-en-aduana.md) · [libro de movimientos](../../modulos/inventario/libro-de-movimientos.md) · [recepción del taller](../../modulos/inventario/recepcion-del-taller.md) · [materiales](../../modulos/compras/materiales.md) · [autorizaciones](../../modulos/direccion/autorizaciones.md) · [dispositivos](../../modulos/admin/dispositivos.md) · [pantallas de Aduana](aduana.md) · [pantallas de Tienda en línea](tienda-en-linea.md) · [lo común de las pantallas](../comunes.md) · [órdenes de producción](../../modulos/produccion/ordenes-de-produccion.md) · [etiquetas](../../impresos/etiquetas.md)

## Para qué sirve

Saber dónde está cada pieza y para quién está apartada, y mover la mercancía: surtir a aduana lo de los pedidos, recibir lo que manda Aduana, entregar tela y avíos al corte, recibir lo que regresa del corte, reponer lo que queda bajo su mínimo y aclarar lo que no cuadra. Ejemplo: a las 9 Javier ve en Pendientes «W-1045 · Laura Méndez», «Por surtir · sale hoy». Aprieta «Surtir a aduana» y el pantalón va en camino a aduana. Luego entrega al corte del L-2026-122 los tres rollos sugeridos, y en «Variantes en cero» mueve 16 playeras talla 10 a la Tienda 1.

## Quién entra

- Las cuentas con Bodega. Nunca ven precios ni costos.
- «Autorizar» y «Rechazar» de un ajuste, solo la dueña, con «Confirmar con Google»; las demás cuentas ven «En autorización de Dirección».
- «en línea sale», en el cajón Variante, solo lleva a algún lado con Tienda en línea.
- **Pastilla del menú:** excepciones por resolver, pedidos externos y en línea y devoluciones a proveedor por surtir, recepciones por confirmar y diferencias por contar; roja si hay un pedido en línea por surtir (ver [lo común](../comunes.md#sus-consultas)).
- **Acción principal:** «Surtir» (ícono de tienda): abre Pendientes con «Surtido».
- **Pestañas:** Pendientes · Existencias · Materiales · Reabasto · Diferencias · Conteos y ajustes · Excepciones (con las que faltan).
- La barra superior lleva «¿Dónde está?» (ver [lo común](../comunes.md#dónde-está)).

## Pendientes

**Consulta:** `inventario.bodega_pendientes` (`grupo`: `todos`, `surtido`, `recepciones`, `materiales`, `diferencias` o `excepciones`).

| Cifra | Qué dice | Su línea | Lleva a |
|---|---|---|---|
| «Existencia total» | «{n} pz» en todas las ubicaciones, en tránsito y en camino a aduana | «Bodega {n} · tiendas {m}», con la barra Bodega · Tiendas · Aduana, taller y en camino | Existencias |
| «Por surtir» | Pedidos externos, pedidos en línea y devoluciones a proveedor por surtir; en rojo si hay un pedido en línea | «{n} pedidos en línea» (rojo) o «Ninguno en línea» | Pendientes, con «Surtido» |
| «Variantes en cero» | Variante y ubicación con mínimo en cero; en rojo si hay | «En alguna ubicación» | Reabasto |
| «Diferencias abiertas» | Las piezas de las diferencias sin resolver | «{n} registros» | Diferencias |
| «Ajustes por autorizar» | Los que esperan a Dirección | «En Dirección» (ámbar) o «Ninguno» | Conteos y ajustes |

| Tipo | Referencia | Fecha · Cantidad | Estado | Botón |
|---|---|---|---|---|
| «Excepción» | Qué pasó; abajo de dónde llegó | Cuándo se detectó · — | «Por resolver» (rojo) | «Resolver» → su ventana |
| «Pedido externo» | «{PE} · {cliente}»; abajo «{prenda} {talla}: {n} · …» | «Entrega {día}» · piezas | «Por surtir» (ámbar) | «Surtir a aduana» → `inventario.surtir_a_aduana` · «No la encuentro» → su ventana |
| «Pedido en línea» | «{W} · {destinatario}»; abajo «{prenda} {talla} · …» | «Pagado {día} {hora}» · las prendas de Bodega | «Por surtir · sale hoy» (rojo) | «Surtir a aduana» (negro) · «No la encuentro» |
| «Devolución a proveedor» | «{A} · {proveedor}»; abajo «{cantidad} {unidad} de {material} · {OC}» | Cuándo la rechazó Dirección · la cantidad | «Por surtir» (ámbar) | «Surtir a aduana»; en tela, abre la ventana para escoger los rollos |
| «Recepción» | «{D} · Aduana»; abajo lo que trae | La salida · piezas o metros | «En tránsito» (ámbar) | «Confirmar llegada» → Llegada de aduana |
| «Entrega a corte» | «{L} · {prenda}»; abajo las telas por entregar («{tela}», «{tela} y {tela}» o «{n} telas») y «{n} avíos» si no se han entregado | «Corte {día}» · «{m} m» de la principal o, sin ella, de la primera por entregar | «Por entregar · corte hoy» o «· corte mañana» (rojo, a `produccion.tela_por_entregar_rojo_dias` (1) día o menos, o si ya pasó) · «Por entregar · corte en {n} días» (ámbar) | «Entregar tela» → Entrega al corte |
| «Entrega a corte» | Sin receta: «{L} · {prenda}»; abajo «{tela} · falta la receta para saber cuánta» | «Corte {día}» · «—» | «Esperando receta» (gris) | Sin botón |
| «Retazo» o «Rollo del corte» | «{RZ o R} · {tela}»; abajo «Lote {L} · partida {P}» | — · «{m} m» | «Por recibir» (ámbar) | «Recibir» → `inventario.recibir_del_corte` («{folio} recibido en bodega: {m} m de {tela}») |
| «Diferencia» | «{DF} · {prenda} · talla {t}»; abajo su texto | Fecha · piezas | «Por contar» (ámbar) | «Contar» → Conteo de diferencia |
| «Diferencia de recepción» o «de material» | «{DF} · {prenda o material}»; abajo qué pasó | Fecha · la cantidad | «Por aclarar» (ámbar) | «Aclarar» → su ventana |

- **Qué sale:** los cortes de `inventario.dias_entrega_corte` (3) días o menos con alguna tela por entregar (con receta o sin ella); lo demás, mientras está por hacer. Un pedido sale con las piezas apartadas en Bodega que no se han surtido.
- **Filtros:** «Todos», «Surtido», «Recepciones», «Materiales» (entregas a corte y lo que regresa del corte), «Diferencias» y «Excepciones», con su conteo; solo los que tienen renglones.
- **Orden:** rojo, ámbar, gris; dentro, por fecha. La pastilla de la pestaña no cuenta los «Esperando receta». **Vacío:** «Sin pendientes» (verde).

**El panel «Variantes en cero»,** con su conteo y, si hay más de 8, «Ver las {n} en reabasto». Muestra 8: primero las que no tienen nada en camino, luego las tallas de mayor venta (`inventario.tallas_mayor_venta`), luego las que tienen más libres en bodega. Columnas: Variante («{prenda} · talla {t}», abajo «{escuela o Básico} · {código}») · Ubicación · Disponible en · el botón. Tocar el renglón abre el cajón Variante. **Vacío:** «Ninguna ubicación en cero» (verde).

| «Disponible en» | Cuándo | Botón |
|---|---|---|
| «{n} en camino» (verde) | Ya viene algo para esa ubicación | Sin botón |
| «Bodega · {n} libres» | Bodega tiene disponible | «Mover {n}», con lo que dice la cuenta del reabasto → `inventario.mover_a_tienda` |
| «Sin existencia» (rojo) | No hay de dónde mover | «Ver reabasto» → Reabasto |

## Existencias

**Consulta:** `inventario.existencias` (`texto`, `seccion_id`, `escuela`, `filtro`, `cursor`).

- **Arriba:** el buscador «Prenda y talla, o código» (cada palabra tiene que coincidir: 4 dígitos o más buscan el código que empieza así, un número corto es la talla, lo demás el nombre o la talla, sin acentos); «Todas las secciones» y cada sección; «Toda escuela o modelo», «Básicos, sin escuela» y cada escuela; «Copiar para Excel».
- **Filtros:** «Todas» · «Bajo mínimo» · «En cero» · «Con comprometido» · «Con diferencia» (con diferencias abiertas). A la derecha, «{n} variantes · {m} piezas».
- **La tabla,** por producto: Prenda y talla · Aduana · Bodega · Tienda 1 · Tienda 2 · Taller · Tránsito · En camino a aduana · Total · Comprometido · Libre.
  - El renglón del producto se pliega, con su nombre, su escuela y la suma de cada columna.
  - Cada variante, con su talla y su código. La celda va en rojo si esa ubicación tiene mínimo y está en cero, en ámbar si está bajo el mínimo, en gris si está en cero sin mínimo; al pasar el puntero, «Mínimo {n}». Abajo del número, «{n} en diferencia» si hay diferencias abiertas ahí. Una existencia negativa se ve tal cual.
  - Total, Comprometido y Libre se calculan como dice [existencias y cuadre](../../modulos/inventario/existencias-y-cuadre.md#reglas): Comprometido es la suma de las reservas activas; «En línea» no es columna, es un apartado.
- **«Copiar para Excel»** copia lo filtrado (pide las páginas que falten), separado por tabuladores: Código, Prenda, Escuela, Talla, las cinco ubicaciones, Tránsito, En camino a aduana, Total, Comprometido, Libre. «{n} filas copiadas: pégalas en Excel», o en ámbar «No se pudo copiar desde aquí».
- **Sin resultados:** «Nada con «{texto}». Prueba con prenda y talla, como «polo 12», o con el código de la etiqueta.» (sin texto, «Nada con este filtro»).
- Cada variante abre su cajón.

## Materiales

**Consulta:** `inventario.materiales`.

1. **«Entregas de material al corte»:** los lotes por cortar de prendas con receta y con alguna tela por entregar, por fecha de corte; un renglón por cada tela por entregar. Columnas: Corte (la fecha y «en {n} días»; roja a `produccion.tela_por_entregar_rojo_dias` día o menos, ámbar a `inventario.dias_entrega_corte` o menos) · Lote (la prenda; «{L} · {n} piezas») · Tela (la tela, con «combinación» o «forro» si no es la principal; «{m} m», y «· {n} avíos» si todavía no se entregan) · Rollos sugeridos («{n} · {m} m» y abajo «partida {P}, {P}», o «No alcanza» en rojo) · «Entregar» → Entrega al corte. Debajo, una etiqueta verde por lote con todas sus telas entregadas: «{L}: {n} rollos entregados». **Vacío:** «Sin entregas pendientes».
2. **«Regresa del corte»:** los retazos y los rollos que regresan del corte y siguen en el Taller hasta que Bodega los confirma. Columnas: Rollo o retazo (folio y «Rollo» o «Retazo») · Tela (y «partida {P}») · Del corte (lote y fecha) · Metros · «Etiqueta», que abre su etiqueta en PDF (la del retazo, con su RZ-) · «Recibir» (la misma acción de Pendientes). **Vacío:** «Nada por recibir del corte».
3. **«Materiales en bodega»,** sin los consumibles:
   - **«Telas»:** Material (su color, nombre y detalle) · En bodega («{n} m»; abajo «{n} en aduana · {n} en el taller» si hay) · Rollos («{n} rollos y {m} retazos»; abajo «{n} en el taller») · Partidas · «Etiquetas», con rollos en bodega: el PDF con una etiqueta por cada rollo y retazo de esa tela que está en Bodega, para la carga inicial o para reponer una que se maltrató. La consulta trae los rollos de cada tela en Bodega para pedirlas (`GET /v1/etiquetas/rollo/{id}?formato=pdf&ids=…`, ver [etiquetas](../../impresos/etiquetas.md#quién-imprime-cada-una-y-desde-dónde)).
   - **«Avíos»:** Material (y su presentación) · Existencia en su unidad · Uso (sus dos primeros usos).
   - Junto al título, **«Carga inicial · {n}»** si hay materiales sin carga inicial → su ventana.

Cuánto pide un corte y qué rollos se sugieren lo calculan [cuenta de material](../../modulos/patronaje/cuenta-de-material.md) y [entregas a corte](../../modulos/inventario/entregas-a-corte.md): la pantalla solo muestra lo que trae la consulta.

## Reabasto

**Consulta:** `inventario.reabasto`. La cuenta es la de [mínimos y reabasto](../../modulos/inventario/minimos-y-reabasto.md#la-cuenta-del-reabasto): la meta es el mínimo por `inventario.factor_meta_reabasto` (2), primero se mueve de Bodega lo que hay y se fabrica solo lo que no hay.

- **Cuatro grupos,** con su color, su número y su descripción; solo salen los que tienen renglones:

  | Grupo | Descripción | Cuándo cae ahí |
  |---|---|---|
  | «Traspaso» (verde) | «existencia en bodega» | Todo lo que falta se mueve de Bodega. Su encabezado trae «Traspasar todo desde bodega · {n}» |
  | «Traspaso y fabricación» (ámbar) | «existencia insuficiente» | Se mueve una parte y el resto se fabrica |
  | «Fabricación» (rojo) | «sin existencia en bodega» | No hay de dónde mover |
  | «Sugerido a producción» (gris) | «en revisión de producción» | Lo que falta ya se pidió a Producción |

- **Columnas:** Variante · Ubicación («hay {n} · mínimo {m}», o «en cero · mínimo {m}» en rojo) · Propuesta, en este orden y separada por «·»: «{n} en camino» (verde) · «Mover {n} desde bodega» · «Fabricar {n}» · «{n} pedidas a producción» (gris) · los botones. Orden: Bodega, Tienda 1, Tienda 2 y por nombre; en Fabricación y Sugerido, por nombre.
- **«Mover {n}»** → `inventario.mover_a_tienda` («Traspaso a {tienda}: {n} {prenda} {talla}, enviado a aduana»; si había menos, «{prenda} talla {t}: solo se movieron {n}»). El renglón queda marcado y se recalcula; la otra tienda también, porque las dos pudieron proponer los mismos libres.
- **«Traspasar todo desde bodega · {n}»** mueve todos los renglones de Traspaso en una sola llamada («{n} piezas pasan a aduana para las tiendas»).
- **«A producción»** → `inventario.sugerir_fabricar`, una sugerencia por ubicación con su cantidad («Sugerencia enviada a producción: {n} {prenda} {talla}»). Producción la ve como «Sugerencia de bodega».
- Lo movido va en camino a aduana con su A- y la referencia RB- del día de esa tienda, hasta que Aduana lo recibe. **Vacío:** «Todas las ubicaciones están sobre su mínimo».

## Diferencias

**Consulta:** `inventario.diferencias` (`cursor`, de las resueltas). Por qué nace cada una y cómo se cierra está en [diferencias, ajustes y mermas](../../modulos/inventario/diferencias-ajustes-y-mermas.md).

1. **«Por contar»:** una tarjeta por diferencia: «{n} piezas» en grande; «{prenda} · talla {t}», su texto y «{DF} · {fecha} · {ubicación}». A la derecha, «Contar» → Conteo de diferencia, o «Contada · en autorización».
2. **«Diferencias de recepción»,** agrupadas por quién recibió («Recibió Bodega», «Recibió Aduana»): Diferencia · Prenda · Qué pasó («Aduana mandó 24 en D-0412 y Bodega recibió 22») · A cargo de (quien lo mandó: Aduana, Bodega o el Taller) · «Aclarar» → su ventana.
3. **«Material»,** si hay: lo que no cuadró al entregar avíos al corte o lo que el cuadre halló en negativo («Se entregaron {n} para {L} y el sistema tenía {m}»), a cargo de Bodega, con «Aclarar».
4. **«Diferencias resueltas»,** con «Ver más»: Diferencia · Prenda · Dónde · Cómo se resolvió (el folio del ajuste o del conteo, o la aclaración con su motivo).

## Conteos y ajustes

**Consulta:** `inventario.conteos_y_ajustes` (`cursor`, de los conteos y de los ajustes resueltos).

- **Arriba:** «Nuevo conteo» y «Carga inicial», cada uno a su cajón.
- **«Ajustes en autorización»:** Ajuste (folio; «{fecha} · {iniciales}») · Ubicación · Cambio (por renglón, «{prenda} · {talla}» y «Al contar: sistema {n}, contado {m}, diferencia {±d}»; uno de recepción o de material dice su DF-) · Motivo · los botones: la dueña ve «Rechazar» y «Autorizar»; las demás cuentas, «En autorización de Dirección». **Vacío:** «Ningún ajuste espera autorización».
- **«Autorizar»** → `direccion.decidir_autorizacion` (`autorizar`, desde Bodega), con «Confirmar con Google» («Autorizado por Dirección: ajuste de inventario»). Se mueve solo la diferencia que se vio al contar; el ajuste baja a Resueltos.
- **«Conteos»,** con «Ver más»: Conteo (folio y fecha) · Ubicación · Sección (o «Carga inicial» y su alcance) · Responsable · Variantes · Resultado («{n} diferencias» ámbar, «Cuadró» verde, o «Carga inicial» gris).
- **«Ajustes resueltos»,** con «Ver más»: Ajuste · Ubicación · Cambio · Motivo · Resultado («Autorizado por Dirección» verde con su fecha, o «Rechazado» rojo con su razón).

## Excepciones

**Consulta:** `inventario.excepciones` (`estado`: `por_revisar` o `resuelta`; `cursor`). Lo que se aplicó y no cuadra; resolverla no mueve nada (ver [excepciones](../../modulos/inventario/excepciones.md)).

- **«Por resolver»:** una tarjeta por excepción, la más vieja arriba: la hora y la fecha · qué pasó · de dónde llegó (el aparato y la persona) · su documento · «Resolver» → su ventana. Una de `dispositivo_revocado` lleva además «Aplicar el movimiento» (solo la dueña) → `admin.aplicar_comando_retenido`, con «Confirmar con Google» («Movimiento de {aparato} aplicado: {acción} {folio}»). La dueña ve también «Lo que llegó», con los datos tal cual.
- **«Resueltas»,** con «Ver más»: qué pasó, quién la resolvió, cuándo y qué se hizo.
- **Vacío:** «Sin excepciones por resolver».

## Cajones

### Variante

**Consulta:** `inventario.detalle_variante` (`variante_id`). Se abre desde Existencias o «Variantes en cero».

- **Encabezado:** «{código} · {escuela o Básico}»; «{prenda} · talla {t}».
- **Botones con cifra:** «{n} en reabasto» → Reabasto · «{n} por aclarar» → Diferencias · «Hoy», «Mañana» o «Agotado» con «en línea sale» → [Tienda en línea](tienda-en-linea.md#disponibilidad).
- **Cifras:** «{n} en total» · «{n} comprometidas» · «{n} libres».
- **La tabla:** Ubicación · Hay · Mínimo («—» sin mínimo) · la etiqueta («{n} en diferencia» ámbar, «En cero» rojo o «Bajo mínimo» ámbar); Aduana, Bodega, Tienda 1, Tienda 2 y Taller, y al final Tránsito y En camino a aduana.
- **«Apartadas»,** si hay: «Apartada para {W, NV o PE} · {dónde}» y las piezas.
- **«Moviéndose»,** si hay: su folio, «En aduana para {destino}», «En camino a aduana desde {quién}» o «En camino a {destino}», y las piezas.
- **El pie:** «Cerrar» · «Ver en reabasto», si alguna ubicación está bajo su mínimo · «Mandar a {tienda}», por cada tienda sin caja, con libres en Bodega → ventana «Mandar a {tienda}»: «{prenda} · talla {t}», «{n} libres en bodega» y «Piezas». «Mandar» → `inventario.mover_a_tienda` («Traspaso a {tienda}: {n} {prenda} {talla}, enviado a aduana»). Mientras una tienda no tiene caja, Reabasto no la cuenta: le llega lo que pide así (ver [mínimos y reabasto](../../modulos/inventario/minimos-y-reabasto.md#reglas), regla 12).

### Entrega al corte (ancho)

**Consulta:** `inventario.detalle_entrega_corte` (`lote_id`). Se abre con «Entregar tela» en Pendientes o con «Entregar» en Materiales.

- **Encabezado:** «{L} · Corte {fecha}» y la prenda.
- **Cifras:** «{m} m» necesita el corte de la tela principal · «{m} m» en {n} rollos marcados (verde si alcanza, rojo si no) · «{n}» piezas.
- **Una sección por cada tela de la receta que falta entregar,** la principal primero: «{tela}» (y «combinación» o «forro» si no es la principal), con «necesita {m} m» y «{n} rollos en bodega»: los rollos de esa tela en Bodega que no están entregados a otro lote, cada uno con su casilla, folio (y «· retazo»), «partida {P}» y «{m} m»; los sugeridos vienen marcados. Sin rollos: «No hay rollos de esta tela: se entrega cuando llegue».
- **Avisos que no detienen:** «Se mezclan las partidas {P} y {P}: el tono puede variar entre piezas.» · «Faltan {m} m de {tela} para el corte completo.»
- **«Avíos»,** si la receta trae y todavía no se entregan: Material · Se entrega (en su unidad) · Hay (rojo si no alcanza).
- **«Quién recibe»** (opcional): la gente del Taller.
- **«Entregar al corte»** (apagado sin rollos marcados) → `inventario.entregar_al_corte` («{L}: {n} rollos pasan al taller» y, si un avío no alcanzó, «. No cuadró {cantidad} de {avío}: queda en diferencias»). La tela se consume al cerrar el corte; los avíos, cuando Aduana recibe el lote.

### Llegada de aduana

**Consulta:** `inventario.detalle_llegada_aduana` (`despacho_id`). Se abre con «Confirmar llegada».

- **Encabezado:** «{D} · De aduana» y lo que trae. **Cifras:** «{n}» mandó aduana · la fecha en que salió.
- **La tabla:** Prenda y talla · Piezas; si es material, Rollo · Partida · Metros.
- **«Llegó completo a bodega»** → `inventario.recibir_despacho` («{D}: {n} piezas recibidas en bodega»; el material, «{D}: el material ya está en bodega»).
- **«Llegó con diferencias»** agrega la columna «Llegaron» (piezas, o metros de cada rollo), con «Cuadra», «Faltan {n}» o «Sobran {n}» al escribir, y «Agregar lo que no venía» (prenda, talla y piezas). «Recibir lo contado» («Escribe cuántas llegaron de cada prenda, aunque sea 0»): «{D}: {n} piezas en bodega. Faltaron {m}: queda por aclarar a cargo de Aduana».

### Nuevo conteo y Conteo de diferencia (ancho)

**Consulta:** `inventario.detalle_conteo` (`ubicacion_id` y `seccion_id`, o `diferencia_id`). Se abre con «Nuevo conteo» o con «Contar».

- **El conteo es ciego:** la pantalla no dice lo que tiene el sistema (ver [conteos](../../modulos/inventario/conteos.md), regla 1).
- **Encabezado:** «Conteo físico» y «Nuevo conteo», o «{DF} · {ubicación}» y «Conteo de diferencia».
- **Solo en el nuevo:** Ubicación (Bodega o Aduana; una cuenta de Aduana, solo Aduana) y Sección («Elige la sección que vas a contar»); cambiar la sección borra lo contado. El de una diferencia trae solo su variante, en la ubicación de la diferencia.
- **«Hora del conteo»:** la hora en que se abrió, y se puede cambiar (no después de ahora). Contra esa hora se calcula lo que decía el sistema.
- **Cifras:** «{n} de {m}» contadas.
- **La tabla:** Prenda y talla (y la escuela) · Contado (vacío, hasta 4 cifras).
- **«Motivo del ajuste, si algo no cuadra»:** la lista «Motivos de ajuste» y un texto opcional. Si al guardar algo no cuadra y no hay motivo, regresa «Todo ajuste necesita motivo» y el campo se marca: se escoge y se guarda otra vez.
- **«Guardar conteo»** (apagado hasta que haya una contada) → `inventario.guardar_conteo`: «{CN}: {n} prendas contadas, todo cuadra», «{DF} aclarada: el conteo cuadra con el sistema», o «{AJ}: {n} diferencias esperan autorización de Dirección». Cierra y abre Conteos y ajustes, o se queda en Diferencias si se abrió desde ahí.

### Carga inicial (ancho)

Con `inventario.detalle_conteo`, sin lo que tiene el sistema. La existencia de arranque de las prendas, solo donde una variante no tiene movimientos.

- **Campos:** Ubicación (Bodega o Aduana) · «Qué cargas» («Una prenda», «Una sección» o «Todo») y la prenda o la sección · «Hora del conteo».
- **La tabla:** Prenda y talla · Piezas. Una variante que ya tiene movimientos ahí sale apagada: «ya tiene movimientos: usa un conteo».
- **«Registrar carga inicial»** → `inventario.registrar_carga_inicial` («{CN}: carga inicial de {n} piezas en {ubicación}»).

## Ventanas

- **«No la encuentro»:** «{prenda} talla {t} · apartada para {PE o W}» y «Nota» (opcional). «No la encuentro» → `inventario.no_la_encuentro` («{DF}: {prenda} talla {t} queda en diferencias. Vuelve a lo que falta mandar de {PE}»; con un W-, «… {W} se surte de {ubicación}» o «… {W} queda sin pieza»).
- **«Regresa a {proveedor}»,** en tela: «{cantidad} m de {material} · {OC}», los rollos de esa orden que están en Bodega con su casilla, y la suma. «Surtir a aduana» → `inventario.surtir_a_aduana` («{cantidad} {unidad} de {material} van a aduana para regresar a {proveedor}»).
- **«Aclarar {DF}»:**
  - De recepción, «¿Qué pasó?»: «Llegó» («Se contó mal al recibir, o llegó después») · «No salió» («El origen mandó otra cantidad») · «Venía en otro» («Se cruzó con otro traspaso o con otro lote»; pide escoger su espejo: las diferencias por aclarar de la misma prenda y talla con las mismas piezas al revés) · «Se perdió» (pide el motivo del ajuste y nace un AJ-). Las que no aplican salen apagadas, según la tabla de [diferencias, ajustes y mermas](../../modulos/inventario/diferencias-ajustes-y-mermas.md#cómo-se-aclara-una-de-recepción).
  - De material: «Ya se cubrió» (solo si ya no está en negativo) · «Ajuste» (con el motivo del ajuste).
  - Siempre, el motivo escrito. «Dar por aclarada» → `inventario.aclarar_diferencia` («{DF} aclarada», «{DF} aclarada: {n} piezas en aduana en {A}», o «{AJ}: 1 diferencia espera autorización de Dirección»).
- **«Resolver excepción»:** qué pasó y «Qué se hizo» (5 letras o más). «Resolver» → `inventario.resolver_excepcion` («Excepción resuelta: queda en Resueltas»).
- **«Carga inicial de material»:** Material (los que no tienen carga ni movimientos) · «Cuánto hay», en su unidad; en tela, «Rollos» (opcional): por rollo, metros y partida, con «Otro rollo», que tienen que sumar lo que hay. «Registrar carga inicial» → `inventario.registrar_carga_inicial_material` («{material}: carga inicial de {cantidad} en bodega»).
- **«Rechazar {AJ}»** (la dueña): las variantes y la ubicación, y «Por qué se rechaza» (5 a 90 letras). «Rechazar ajuste» → `direccion.decidir_autorizacion` (`rechazar`, desde Bodega): la existencia no cambia y, si venía de una diferencia, vuelve a «Por contar».

Los mensajes de error de cada acción están en su archivo del módulo.

## Lo que no se copia de la muestra

- El conteo es ciego y guarda su hora: no muestra lo que dice el sistema ni el resultado por renglón.
- «Carga inicial» de prendas, «No la encuentro», «Devolución a proveedor» y «Aplicar el movimiento» son pantallas nuevas.
- «Etiqueta» y «Etiquetas» de los rollos y retazos son nuevas: los de la carga inicial y los retazos no pasan por Aduana, donde se etiqueta lo que llega de un proveedor.
- «Mandar a {tienda}» es nuevo: mientras una tienda no tiene caja, Bodega le manda lo que pide desde el cajón de la variante.
- Aclarar una diferencia de recepción dice qué pasó (llegó, no salió, venía en otro o se perdió), no solo un motivo.
- La entrega al corte puede decir quién la recibe, y lleva una sección por cada tela de la receta: la de combinación y el forro también van por rollo completo.
- La pestaña Solicitudes, «Pedir a una tienda», «Pedir conteo», la demanda sin atender y los envíos SE- llegan con el POS; mientras tanto, Reabasto solo mueve de Bodega o manda a fabricar.
- «Con diferencia» filtra las diferencias abiertas de cualquier ubicación.
- Los colores de los cortes salen de los parámetros de Producción e Inventario, no de días fijos.
- Las listas largas se paginan.

## Cómo está hecho

**Fase 19, parte 12.**

- **Las consultas** están en `apps/api/src/modulos/inventario/consultas/`, con sus contratos en `packages/compartido/src/contratos/inventario/bodega.ts` (las pestañas) y `bodega-cajones.ts` (los cajones): `bodega-pendientes.ts`, `existencias.ts`, `materiales.ts`, `reabasto.ts`, `diferencias.ts`, `conteos-y-ajustes.ts`, `excepciones.ts`, `detalle-variante.ts`, `detalle-entrega-corte.ts`, `detalle-llegada-aduana.ts` y `detalle-conteo.ts`. Todas piden el departamento Bodega (`inventario.detalle_conteo`, también Aduana) y ninguna salida lleva precios ni costos. Los estados y los textos con datos los escribe la consulta; la pantalla solo los pinta.
- **Lo que comparten** está en `consultas/bodega-comun.ts`: `leerReabasto` lee los mínimos, los libres (existencia − reservas), lo que viene en camino y lo ya sugerido, y hace la cuenta con `cuentaDelReabasto` (`dominio/`): Bodega con las prendas activas y las tiendas con las de mostrador; una tienda sin caja no entra. La usan Pendientes («Variantes en cero»), Existencias (el color de cada celda), Reabasto y el cajón Variante. `cortesPorEntregar` arma cada lote por cortar con lo que pide su receta (`produccion.lotes_por_cortar` y `patronaje.calcular_material`) y lo que ya recibió; los rollos sugeridos son los apartados `sugerido` que deja `inventario.recalcular_rollos_sugeridos`. Lo por surtir de Pendientes es lo mismo que cuenta la pastilla: las piezas apartadas en Bodega que no van en un traspaso.
- **El conteo es ciego:** `inventario.detalle_conteo` nunca manda lo que tiene el sistema; en la carga inicial dice qué variantes ya tienen movimientos en la ubicación.
- **La web** está en `apps/web/src/rutas/bodega/` (una ruta por pestaña; Conteos y ajustes es `/bodega/conteos`) y `apps/web/src/departamentos/bodega/`: `pagina.tsx` (las pestañas, con el conteo y el rojo de Pendientes, y «Surtir», que abre Pendientes con «Surtido»), `direccion.ts` (el cajón —`variante`, `entrega`, `llegada`, `conteo` y `carga`—, el filtro de Pendientes, la búsqueda y los filtros de Existencias, y la diferencia por aclarar o la excepción por resolver van en la dirección), `comun.tsx` (las consultas que vuelve a leer cada acción y la variante en dos renglones; «Ver más» es `usePaginas` y el cierre de un cajón con captura es `useCierreDelCajon`, de lo común, y la cifra de un cajón es `CifraDeCajon` del sistema de diseño), `pestanas/`, `cajones/` y `ventanas/`. «Aclarar» y «Resolver» de Pendientes abren su ventana en Diferencias y en Excepciones por la dirección (`?aclarar=…`, `?resolver=…`).
- **Pruebas:** una por consulta en `consultas/*.prueba.ts` (el departamento, sin precios ni costos, y lo que trae con la muestra; lo que la muestra no trae —una pieza apartada, una diferencia, una excepción— lo pone y lo quita `bodega-de-prueba.ts`), y `apps/web/src/departamentos/bodega/bodega.prueba.ts`: cada pestaña en escritorio y en teléfono con su captura en `.revision/capturas/bodega/`, los cajones por su dirección y cada botón con su acción y su aviso de abajo.
