# Pantallas de Compras

> **Qué cubre:** las pantallas de Compras (Pendientes, Por pedir, Órdenes de compra, Materiales, Proveedores y Conciliación de facturas) y sus cajones (Levantar orden, «por qué» de un material, Orden de compra, Material y Proveedor) y ventanas, cada una con su consulta, sus textos, sus estados y sus botones.
> **Estado:** Decidido.
> **Se construye en:** [fase 19](../../fases/19-web-principal.md).
> **Se conecta con:** [materiales](../../modulos/compras/materiales.md) · [proveedores y precios](../../modulos/compras/proveedores-y-precios.md) · [órdenes de compra](../../modulos/compras/ordenes-de-compra.md) · [proyección de material](../../modulos/compras/proyeccion-de-material.md) · [facturas de proveedor](../../modulos/contaduria/facturas-de-proveedor.md) · [precios](../../modulos/catalogo/precios.md) · [conteos](../../modulos/inventario/conteos.md) · [configuración](../../modulos/admin/configuracion.md) · [avisos](../../modulos/admin/avisos.md) · [lo común de las pantallas](../comunes.md) · [pantallas de Contaduría](contaduria.md) · [hojas](../../impresos/hojas.md)

## Para qué sirve

Dice qué material hay que pedir, cuánto y antes de qué fecha para que no se acabe, y lleva cada orden de compra del borrador hasta que Aduana la recibe; guarda los materiales, los proveedores con su plazo real y las facturas que no cuadran. Ejemplo: Rosa abre Compras y ve en rojo «Gabardina azul marino · Faltará material 4 días»; abre su «por qué»: se acaba el 21 oct y Textiles Aurora tarda 14 días. Aprieta «Levantar orden de 1,700 m», revisa el precio y crea la OC-0226 en borrador; al día siguiente la marca enviada.

## Quién entra

- Las cuentas con Compras. Ven costos, precios, importes y totales.
- **Pastilla del menú:** materiales por pedir más órdenes atrasadas; roja si hay un material «Sin tiempo de entrega» o una orden atrasada.
- **Acción principal:** «Levantar orden», en todas las pestañas: abre Levantar orden con lo marcado en Por pedir o, si no hay nada marcado, con todo lo de «Sin tiempo de entrega» y «Pedir esta semana».
- **Pestañas:** Pendientes · Por pedir · Órdenes de compra · Materiales · Proveedores · Conciliación de facturas.
- **Los números de cada material** (consumo, comprometido, libre, día en que se acaba, plazo, fecha límite, estado y pedido sugerido) salen de una sola cuenta, la de [proyección de material](../../modulos/compras/proyeccion-de-material.md); la pantalla nunca los recalcula, salvo «Con {cantidad} alcanza hasta…» mientras se escribe, con la misma función del paquete compartido.

## Pendientes

**Consulta:** `compras.pendientes` (`grupo`: `todos`, `materiales`, `ordenes` o `facturas`). Regresa los indicadores, los renglones con su estado y su botón, los conteos y la pastilla del menú.

| Cifra | Qué dice | Su línea | Lleva a |
|---|---|---|---|
| «Por pedir» | Los materiales sin tiempo de entrega; en rojo si hay, en ámbar si solo hay de esta semana | «{n} por pedir esta semana» o «Existencia suficiente», con la barra Sin tiempo · Esta semana · Suficiente | Por pedir |
| «Órdenes de compra» | Las enviadas o recibidas en parte, «en camino»; en rojo si hay atrasadas | «{n} atrasadas» · «{n} en borrador»; gráfica de las que llegan por semana, las próximas 4 | Órdenes de compra |
| «Materiales» | Todos los activos | «{n} bajo mínimo» o «Todos sobre su mínimo» | Materiales |
| «Proveedores» | Todos los activos | «{n} entregan fuera de plazo» o «Entregas en plazo» | Proveedores |
| «Conciliación de facturas» | Las que no cuadran, «sin conciliar», en ámbar | «Responsable: Contaduría» o «Todas concilian» | Conciliación de facturas |

| Tipo | Referencia | Fecha · Cantidad | Estado | Botón |
|---|---|---|---|---|
| Material | Nombre y proveedor | Hoy · pedido sugerido | «Faltará material {n} días» (rojo) | «Ver material» → cajón Material |
| Material | Nombre y «{proveedor} · Pedir antes del {fecha}» | La fecha límite · pedido sugerido | «Pedir esta semana» (ámbar) | «Ver material» |
| Orden de compra | «{OC} · {proveedor}» y «{n} materiales» | La prometida, en rojo · total | «Atrasada {n} días» (rojo) | «Ver orden» → cajón Orden de compra |
| Orden de compra | Igual | La prometida · total | «Llega esta semana» (azul) | «Ver orden» |
| Factura | «{FP} · {proveedor}» y «{OC} · {qué no cuadra}» | — | «No cuadra» (ámbar) | «Revisar» → Conciliación de facturas |
| Factura | «Esperando factura · {proveedor}» y la orden recibida sin factura (`contaduria.facturacion_de_orden`) | — | «Esperando factura» (ámbar) | «Revisar» |

## Por pedir

**Consulta:** `compras.por_pedir` (`buscar`, `proveedor_id`, `horizonte`: `corto` o `regreso_clases`).

- **Arriba:** el buscador «Material o proveedor» (todas las palabras), la lista de proveedores, el selector «{n} semanas» (`compras.horizonte_corto_semanas`, 12) / «Hasta {mes}» (hasta el fin del mes de `compras.fecha_regreso_clases`) y «{n} materiales».
- **La leyenda y la línea de tiempo de cada material:** barra azul «Lo libre alcanza» hasta el día en que se acaba (se desvanece si pasa del horizonte), con «Alcanza {n} días», «Ya no alcanza» o «Sin consumo»; tramo rayado rojo «Sin material» hasta que llegaría un pedido de hoy; círculo blanco «Llegaría si se pide hoy»; triángulo verde azulado por cada orden que ya viene. Al pasar el puntero: «Alcanza {n} días, hasta el {fecha}», «Sin material {n} días, del {fecha} al {fecha}», «Llegan {cantidad} el {fecha} ({OC}, atrasada)», «Un pedido de hoy llegaría el {fecha}».
- **El eje:** «Hoy» y una fecha cada 14 días con líneas por semana; en el largo, cada mes con su nombre, la bandera «Regreso a clases · {fecha}» y un fondo ámbar más intenso mientras más se consume ese mes («{mes}: se consume {factor} veces lo de un mes normal»).
- **Grupos** plegables, con su casilla y «{n} materiales»: «Sin tiempo de entrega» (rojo), «Pedir esta semana» (ámbar) y «Alcanza» (verde, plegado al abrir); de lo más urgente a lo menos.
- **Cada renglón:** casilla; color, nombre y «{proveedor} · tarda {n} días»; la línea de tiempo; el estado con su línea («Faltará material {n} días», «Pedir hoy», «Pedir antes del {fecha}», «Pedir en más de 6 meses», «Sin consumo todavía»); el pedido sugerido (en gris si alcanza); y «En borrador» si ya está en uno («Ya está en el borrador {OC}»). Tocarlo abre su «por qué».
- **La barra de selección,** al marcar: «{n} materiales seleccionados de {n} proveedores», «Levantar orden» y la X. La selección vive solo en esta pestaña.
- **Vacío con filtros:** «Ningún material cumple esa búsqueda.», con «Quitar filtros».

## Órdenes de compra

**Consulta:** `compras.ordenes` (`buscar`: folio, proveedor o material).

- **Grupos** plegables: «Atrasadas» (rojo, la más atrasada primero), «Llegan esta semana» (azul), «Llegan más adelante» (morado), «Borradores» (gris, la más nueva primero) y «Terminadas» (verde, plegado: recibidas, cerradas, cerradas con faltante y canceladas). Al buscar, todos abiertos.
- **Columnas:** Orden (folio y «Creada el {fecha}») · Proveedor (y su condición de pago) · Material (el primero y «y {n} materiales más») · Pedido contra recibido («Pedirá {cantidad}» en borrador; «{recibido} de {pedido}» o «{completos} de {n} materiales», con barra roja si va atrasada, naranja si va en parte, azul si no) · Llega («Sin enviar», «Llegó el {fecha}» con «{n} días tarde» o «A tiempo», o la prometida con «hace {n} días», «mañana» o «en {n} días») · Estado · Total.
- **Vacío con búsqueda:** «Ninguna orden cumple esa búsqueda.» Tocar un renglón abre su cajón.

## Materiales

**Consulta:** `compras.materiales` (`buscar`, `incluir_bajas`).

- **Arriba:** buscador «Material, proveedor o medida», «{n} materiales», «Nuevo material» y «Dados de baja».
- **Grupos:** «Telas», «Avíos» y «Consumibles del taller».
- **Columnas:** Material (color, nombre y medida) · Proveedor (el habitual, «y {n} más», y «${último precio} · tarda {n} días») · En bodega («{n} libres» con su barra a escala de 3 veces el mínimo: libre en azul, ámbar bajo el mínimo, rojo bajo la mitad o en cero; lo comprometido rayado en gris y el mínimo como raya; abajo «{comprometido} comprometidos de {hay}») · Mínimo · En camino («+{cantidad}», «el {fecha}» o «la primera el {fecha}») · Estado con su línea.
- **«Dados de baja»** muestra los materiales dados de baja con «Reactivar» → `compras.reactivar_material`.

## Proveedores

**Consulta:** `compras.proveedores` (`buscar`, `incluir_bajas`).

- **Arriba:** buscador «Proveedor, ciudad o lo que surte», «{n} proveedores», «Nuevo proveedor» y «Dados de baja».
- **Columnas:** Proveedor (y ciudad) · Surte · Plazo: dice y real (barra del círculo blanco «dice» al punto «tarda», verde si no se pasa, ámbar si se pasa 1 día, rojo si más; abajo «Dice {n} días · Tarda {n}»; sin entregas, en gris «Sin entregas todavía») · Entregas («{a tiempo} de {total} llegaron a tiempo», con barra roja bajo la mitad, ámbar bajo 80 %, verde) · Pago · Teléfono.
- **«Dados de baja»** con «Reactivar» → `compras.reactivar_proveedor`.

## Conciliación de facturas

**Consulta:** `compras.conciliacion_facturas`. Solo consulta: se resuelve en Contaduría (ver [facturas de proveedor](../../modulos/contaduria/facturas-de-proveedor.md)).

- **Arriba:** «Orden, recepción y factura» y «{n} facturas no coinciden en alguno de los tres puntos». Sin nada: «Todas las facturas cuadran con su orden y su recepción.»
- **Columnas:** Factura (FP- o «Sin factura», su orden y «Su folio {folio del proveedor}») · Proveedor · Orden · Recepción · Factura (tres puntos unidos: verde si coincide, rojo con el dato en rojo si no, círculo gris punteado si todavía no existe: «Recepción Sin recibir», «Factura No ha llegado») · Qué no cuadra («Facturaron 520 m y llegaron 500 m», «Ya facturaron y la mercancía no ha llegado a aduana», «Se recibieron 400 m el 2 oct y la factura no ha llegado», y los rollos devueltos que no suman lo rechazado) · Estado («Esperando a Contaduría» morado, «Esperando a Aduana» verde azulado, «Esperando al proveedor» naranja).
- Tocar un renglón abre el cajón de su orden.

## Cajones

### Levantar orden (ancho)

**Consulta:** `compras.levantar_orden_propuesta` (`material_ids`, `cantidades`).

- **Encabezado:** «Compras · {n} materiales con {n} proveedores» y «Levantar orden».
- **Un bloque por proveedor:** nombre con «{condición de pago} · tarda {n} días», «Se suma al borrador {OC}» si ya tiene uno, y la tabla Material (con «Sugerido {cantidad}» y la lista de proveedores: primero los que lo surten, «{proveedor} · ${último precio}», luego «Otro proveedor») · Cantidad · Precio (el último pagado a ese proveedor, hasta 2 decimales; «Sube {n} % · antes ${precio}» o «Baja…», en ámbar desde `compras.umbral_cambio_precio_pct`) · Importe · X; y su «Total». Cambiar de proveedor pasa el material a ese bloque con su último precio.
- **«Agregar material»** con los que no están, de lo más urgente a lo menos («{nombre} · {estado}»). Sin materiales: «No hay materiales en la orden. Agrega uno de la lista.»
- **«Crear la orden»** o **«Crear {n} órdenes»** → `compras.levantar_orden`, una por proveedor. Lleva a Órdenes de compra con «Borradores» abierto y la primera resaltada. Aviso: «{OC} quedó en borrador con {proveedor}» o «{n} órdenes quedaron en borrador: {OC}, {OC} y {OC}».
- Los errores de cantidad y precio, los de la acción (ver [órdenes de compra](../../modulos/compras/ordenes-de-compra.md)), junto a su campo; con uno, el botón se apaga.

### «Por qué» de un material (ancho)

**Consulta:** `compras.material_por_que` (`material_id`, `cantidad`).

- **Encabezado:** «{Tela, Avío o Consumible} · {proveedor}», el estado y el nombre.
- **El resumen,** en el color del estado, armado por la consulta («Se acaba el {fecha}, {en n días}. {Proveedor} tarda {n} días: un pedido de hoy llegaría el {fecha} y quedarían {n} días sin material.»).
- **«La cuenta»:** «Hay en bodega» (y en aduana); «En camino» +{n}, una línea por orden con su folio que abre la orden; «Comprometido con lotes» −{n}, una línea por lote por cortar («L-2026-122 Pantalón azul marino, Distribuidora Escolar Zamora · 214 m»); «Libre».
- **«Existencia libre día por día»:** la gráfica con «Hoy», la raya «Mínimo {n}», la zona «Faltante» bajo cero, las rayas «Se acaba · {fecha}» y «Llega el pedido · {fecha}», y las líneas «Con lo que hay y lo que viene», «Con {cantidad} llegando el {fecha}» y «Si no se pide nada».
- **«Cuánto se gasta · Por día, según el mes»:** el mes actual y los 3 siguientes. **Fuentes:** «Receta» (consumo por prenda y en cuántos lotes se midió), «Ventas» (vacío hasta importar el historial), «Temporada» («Julio es el mes más fuerte: se consume 3.2 veces lo de un mes normal») y «Se usa en».
- **«Pedido sugerido · {proveedor} · {condición}»:** el campo «Cantidad por pedir» con su unidad y abajo «{cantidad} cubren {n} días a partir del {fecha} y dejan el mínimo de {n}.» o, con otra cantidad, «Con {cantidad} alcanza hasta el {fecha}.» / «… más de un año.». Errores: «Escribe cuánto pedir» · «Tiene que ser más de 0» · «Es demasiado: revisa la cantidad» · «Se compra de {n} en {n} {unidad}. Prueba con {cantidad}».
- **Botones:** «Levantar orden de {cantidad}» → cajón Levantar orden; o «Abrir {OC}, ya en borrador»; «Cerrar».

### Orden de compra (ancho)

**Consulta:** `compras.orden` (`orden_compra_id`).

- **Encabezado:** «Orden de compra · {proveedor}», su estado («Atrasada» si lo está) y el folio. **Avisos:** «Debía llegar el {fecha}. Lleva {n} días de atraso.» · «Cancelada el {fecha} por {persona}. {motivo}» · «Cerrada con faltante el {fecha} por {persona}. Faltó {…}. {motivo}».
- **Datos:** Proveedor (abre su cajón) · Condición de pago · Levantó · Creada · Enviada («Todavía no») · Promete llegar (o Llegó).
- **«Lo que se pidió · {n} materiales»:** Material · Pedido · Recibido · Falta («Nada», o en rojo si va atrasada) · Precio («La orden decía ${precio}» si la nota cobró otro) · Importe; y el Total.
- **«Historial»:** levantó, la mandó a {proveedor}, cada recepción de Aduana, la canceló o la cerró con faltante.
- **En borrador:** cantidades, precios y «Promete llegar» son campos (la fecha propuesta es hoy más lo que dice tardar, «{proveedor} dice que tarda {n} días»). Botones: «Guardar» → `compras.guardar_borrador_orden` · «Marcar enviada» → `compras.marcar_orden_enviada` (aviso «{OC} enviada a {proveedor}. Promete llegar el {fecha}», más «. Precio nuevo: {material} a ${precio}») · «Descartar borrador» → ventana · «Cerrar».
- **Enviada o atrasada:** «Cancelar con motivo» → ventana. **Recibida en parte:** «Cerrar con faltante» → ventana. **Con algo recibido,** si la cuenta tiene Contaduría: «Capturar nota o factura» → la ventana de Contaduría con la orden ya escogida (ver [Contaduría](contaduria.md)). En cualquier otro estado: «Listo». Con su PDF: «Ver PDF».

### Material

**Consulta:** `compras.material` (`material_id`).

- **Encabezado:** «{tipo} · {medida}», el estado y el nombre. **Cifras:** «{n} libres», «{n} comprometidos», «{n} de mínimo», con la barra y «{hay} en bodega».
- **Secciones:** «Comprometido con lotes» y «En camino» (como en el «por qué»); **«Proveedores»** con «Agregar proveedor»: Proveedor («Tarda {n} días · última compra {fecha}» o «sin compras registradas») · Último precio · «Habitual» o «Hacer habitual» → `compras.hacer_habitual` (aviso «{proveedor} es el proveedor habitual de {material}. El pedido sugerido usa su tiempo de entrega») · «Ya no lo surte» → `compras.quitar_proveedor_material`; **«Precios · Los últimos {n}»** (hasta 8: «${precio} · {proveedor} · {OC} · en la orden / según la nota / al agregar al proveedor», con «Sube {n} %…» y la fecha); **«Cómo se pide»:** «Mínimo que debe quedar», «Se compra de … en …», «Cada pedido cubre (días)» y, en un consumible, su unidad de la tablet y su factor.
- **Botones:** «Guardar cambios» → `compras.guardar_material` (aviso «Cambios guardados en {material}. El pedido sugerido ya los usa») · «Ver por qué se pide» · «Dar de baja» → ventana con motivo → `compras.dar_baja_material` · «Cerrar».

### Proveedor

**Consulta:** `compras.proveedor` (`proveedor_id`).

- **Encabezado:** «Proveedor · {ciudad}» y el nombre. **Cifras:** «{n} días · dice que tarda», «{n} días · tarda en realidad» (verde, ámbar o rojo; «—» sin entregas), «{a tiempo} de {total} · llegaron a tiempo».
- **Secciones:** «Últimas entregas · Días que tardó cada una» (barras verdes o rojas con la raya «Dice {n}»); los datos que se editan: nombre, RFC, teléfono, ciudad, condición de pago en días (0 es contado), días que dice tardar (de 1 a 90) y lo que surte; «Materiales que surte · {n}» (último precio, «no es el habitual», estado; el nombre abre su «por qué»; «Todavía no surte ningún material.»); «Órdenes · Las últimas {n}» (hasta 6; «Todavía no hay órdenes con este proveedor.»).
- **Botones:** «Guardar» → `compras.guardar_proveedor` · «Dar de baja» → ventana con motivo → `compras.dar_baja_proveedor` · «Cerrar».

## Ventanas

- **«Otro proveedor para {material}»:** Proveedor (los que no lo surten, «{nombre} · {lo que surte}») y «Precio por {unidad}» («La última compra fue a ${precio}»). «Agregar» → `compras.agregar_proveedor_material`. Aviso: «{proveedor} ya surte {material}».
- **«Nuevo material»:** Nombre · Tipo (Tela, Avío o Consumible del taller) · Se mide en (la lista de unidades de Configuración) · Medida o presentación (opcional) · Color (opcional) · la unidad de la receta y cuántas trae cada unidad, si es otra · Proveedor · Costo por unidad · Mínimo · Se compra de … en … (1) · Cada pedido cubre (días) (propone `compras.dias_cubre_inicial`, 60) · Consumo por día mientras no se mide (opcional) · y, en un consumible, su unidad de la tablet con su factor. Nace en 0: lo que haya lo registra Bodega como carga inicial. «Agregar material» → `compras.crear_material`; lleva a Materiales con el material resaltado. Aviso: «{material} ya está en Materiales. Lo que haya hoy lo registra Bodega como carga inicial».
- **«Nuevo proveedor»:** Nombre · RFC (opcional) · Ciudad · Teléfono (10 dígitos) · Condición de pago (días de crédito; 0 es contado) · Días que dice tardar · Qué surte (opcional). «Agregar proveedor» → `compras.crear_proveedor`; lleva a Proveedores con el proveedor resaltado. Aviso: «{nombre} ya está en Proveedores».
- **«Cancelar {OC}» / «Descartar {OC}»:** «{proveedor}, {n} materiales, ${total}.» y el motivo («Escribe al menos 5 letras.», que cambia a «Listo.»). «Cancelar orden» o «Descartar orden» → `compras.cancelar_orden`. Avisos: «{OC} cancelada. Lo que faltaba ya no cuenta como en camino» · «{OC} descartada. Queda en el historial con su motivo».
- **«Cerrar {OC} con faltante»:** «Falta: {cantidad} de {material}», el motivo y «Lo que faltó deja de contar como en camino y Por pedir lo vuelve a sugerir si hace falta. Se paga lo recibido.» «Cerrar orden» → `compras.cerrar_orden_con_faltante`. Aviso: «{OC} cerrada con faltante. {Lo que faltó} ya no cuenta como en camino».
- Cada ventana valida igual que su acción; los mensajes están en el archivo de cada acción.

## Lo que no se copia de la muestra

- Cerrar un cajón con cambios sin guardar pregunta antes (en la muestra se perdían).
- Una recepción con materiales de distinta unidad no se suma como una sola.
- «Capturar nota o factura» no vuelve a quedar sobre la misma orden ni deja repetir folios: lo cuida la acción de Contaduría.
- «Cerrada» llega sola cuando se pagan todas sus facturas, no solo en los datos de ejemplo.

## Cómo está hecho

**Fase 19, parte 3.**

- **Al revisar el diseño:** «Por pedir» va en rojo con algo sin tiempo de entrega y «sin conciliar» en ámbar (el `tono` de su cifra); en Materiales lo comprometido lleva su unidad; «Precios · El último» con uno; los folios van en negritas tabulares; y en el teléfono cada renglón de Por pedir se apila: la línea de tiempo, el estado y el pedido sugerido abajo, a todo lo ancho, y el eje solo con sus fechas.

- **Las consultas** están en `apps/api/src/modulos/compras/consultas/`, una por archivo, con sus contratos en `packages/compartido/src/contratos/compras/consultas-pestanas.ts` (las seis pestañas) y `consultas-cajones.ts` (los cinco cajones). Todas piden el departamento Compras: Aduana, Bodega y las demás cuentas reciben `403` y nunca un precio. Leen con `contexto.comoAccion` (del núcleo): una transacción de solo lectura con el contexto de una acción, así usan las mismas reglas del módulo sin repetirlas: `compras.cuenta_material` para cada número de un material, `plazosReales` para el plazo y las entregas, `inventario.recibido_de_ordenes` para lo recibido y `contaduria.facturacion_de_orden` para la orden que espera su factura. Las tablas de otros módulos (terceros, lotes, facturas de proveedor) se leen sin escribir.
- **La pastilla** de Compras (`pastillaCompras` en `consultas/pendientes.ts`, declarada en `pastillas` del módulo) cuenta los materiales sin tiempo de entrega o por pedir esta semana más las órdenes atrasadas; va en rojo con un material sin tiempo o una orden atrasada. La misma cuenta da `pastilla` en `compras.pendientes`.
- **La conciliación** (`consultas/conciliacion-facturas.ts`) junta las facturas detenidas o esperando autorización, con a cargo de quién y su motivo, y las órdenes recibidas sin factura no cancelada, «Esperando al proveedor». Pendientes usa los mismos renglones («No cuadra» y «Esperando factura»).
- **El «por qué»** trae los insumos de la proyección; la pantalla corre `proyectarMaterial` del paquete compartido mientras se escribe la cantidad («Con {cantidad} alcanza hasta…» y la gráfica). La consulta no recibe la cantidad: la cuenta es la misma en los dos lados.
- **Los textos con datos** (`contratos/compras/textos.ts`): las cantidades con su unidad, los pesos, la condición de pago, el teléfono, «Sube {n} % · antes ${precio}» con su ámbar desde `compras.umbral_cambio_precio_pct`, y los errores de la cantidad por pedir, que son los de `compras.levantar_orden`.
- **Los parámetros de la línea de tiempo** `compras.horizonte_corto_semanas` (12) y `compras.fecha_regreso_clases` (17 ago 2027, en texto ISO porque los parámetros no tienen fecha) están en `parametros.ts` del módulo, con los demás de Compras.
- **La web** está en `apps/web/src/rutas/compras/` (una ruta por pestaña: lee la dirección, pide su consulta y la entrega) y `apps/web/src/departamentos/compras/`: `pagina-de-compras.tsx` (las pestañas, Pendientes con el conteo de todo lo pendiente y «Levantar orden» en la barra), `direccion.ts` (la búsqueda de la dirección: `cajon`, `id`, `materiales`, `cantidades`, `grupo`, `buscar`, `proveedor`, `horizonte`, `bajas`, `abiertos`), `pestanas/`, `cajones/` (el cajón abierto lo decide la dirección, así `/compras/ordenes?cajon=orden&id=…` abre la orden desde cualquier lado) y `ventanas/` (las del motivo usan la ventana común `comun/ventana-con-motivo.tsx`). Los formularios validan con el esquema de la entrada de su acción (`validadorDelContrato`) y los errores de la acción van junto a su campo. Un cajón con captura pregunta antes de cerrarse, de cambiar de pestaña o de salir por el menú; con choque de versión vuelve a leer y conserva lo capturado.
- **«Capturar nota o factura»** lleva a `/contaduria/cuentas-por-pagar?ventana=capturar_factura&orden_compra_id={orden}`, la ventana de Contaduría con la orden ya puesta.
- **Pruebas:** cada consulta con su `consultas/<consulta>.prueba.ts` (el departamento, lo que regresa con la muestra; la del «por qué» corre la proyección con sus insumos y da el mismo estado, la misma línea y el mismo pedido sugerido que el servidor), y `departamentos/compras/compras.prueba.ts` en el navegador: cada pestaña en escritorio y en teléfono con su captura en `.revision/capturas/compras/`, los cajones por su dirección, «Levantar orden», «Guardar», «Descartar borrador» y «Nuevo proveedor» con su aviso de abajo, el choque de versión, la pregunta antes de cerrar con cambios y la dirección de una cuenta sin Compras.
