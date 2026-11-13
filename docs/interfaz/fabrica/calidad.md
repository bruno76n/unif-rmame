# Pantallas de Calidad

> **Qué cubre:** las pantallas de Calidad (Pendientes, Por revisar con la revisión de un lote, Defectos y Reclamos con su rastreo) y las ventanas Reclamo nuevo, Resolver reclamo, Defecto nuevo y Revisar devolución, cada una con su consulta, sus textos, sus estados y sus botones.
> **Estado:** Decidido.
> **Se construye en:** [fase 19](../../fases/19-web-principal.md).
> **Se conecta con:** [revisión de lotes](../../modulos/calidad/revision-de-lotes.md) · [reclamos y devoluciones](../../modulos/calidad/reclamos-y-devoluciones.md) · [lotes](../../modulos/produccion/lotes.md) · [operaciones y flujos](../../modulos/produccion/operaciones-y-flujos.md) · [registros de operación](../../modulos/produccion/registros-de-operacion.md) · [recepción del taller](../../modulos/inventario/recepcion-del-taller.md) · [entregas y devoluciones de clientes](../../modulos/inventario/entregas-y-devoluciones-de-clientes.md) · [lo común de las pantallas](../comunes.md)

## Para qué sirve

Ningún lote llega a aduana sin que Calidad lo revise, y cada defecto regresa a quien lo causó. Ejemplo: Tomás abre la revisión del L-2026-121; escoge la talla 10 y toca tres veces «Costura abierta»: el rechazo va a «Costados» y a Lupita, que hizo más piezas de esa operación en esa talla. Aprieta «Aprobar 87 y regresar 3»: Aduana ve las 87 por recibir y las 3 regresan al taller como el reproceso L-2026-121-R1. Un mes después, Zamora reclama 4 pantalones; con el código de la prenda, el reclamo llega al lote, la operación, la persona y la partida de tela.

## Quién entra

- Las cuentas con Calidad. Sin precios, importes, tarifas ni sueldos.
- Cualquiera con Calidad revisa, aprueba reprocesos, registra y resuelve reclamos y revisa devoluciones. La revisión queda a nombre de la cuenta («Revisa: Tomás Ruiz»).
- **Pastilla del menú:** los lotes por revisar, las devoluciones por revisar y los reprocesos que ya se pueden aprobar; roja si hay un lote «Por revisar hoy».
- **Acción principal:** «Revisar lote» (palomita), solo si hay lotes por revisar: abre la revisión del primero de Por revisar.
- **Pestañas:** Pendientes · Por revisar · Defectos · Reclamos.

## Pendientes

**Consulta:** `calidad.pendientes` (`grupo`: `todos`, `lotes`, `devoluciones` o `reclamos`).

| Cifra | Qué dice | Su línea | Lleva a |
|---|---|---|---|
| «Por revisar» | «{n} lotes esperando»; en ámbar si hay alguno | «{n} piezas» · «{m} piezas en reproceso», si hay | Por revisar |
| «Defectos» | «{x.x}% rechazado en {d} días» (`calidad.defectos_periodo_dias`, 30) | Los dos defectos más comunes con su conteo, con la barra de los tres primeros (rojo, naranja, ámbar) | Defectos |
| «Reclamos» | «{n} por resolver»; en rojo si hay alguno | «{n} en el año» | Reclamos |

| Tipo | Referencia | Fecha · Piezas | Estado | Botón |
|---|---|---|---|---|
| «Lote» | «{L} · {prenda}»; abajo para quién | «Entrega {fecha}» · «{listas} pz» | «Por revisar hoy» (rojo) si se entrega en `calidad.por_revisar_hoy_dias` (1) días o menos; si no, «Por revisar» (ámbar) | «Revisar» (negro si es para hoy) → la revisión del lote |
| «Reproceso» | «{L}-R{n} · {prenda}»; abajo «{operación} · {persona}» y, si es de un pedido, «· {PE}, {cliente}» | — · «{n} pz» | «En reproceso» (azul) | «Aprobar», solo si Aduana ya recibió el lote → `calidad.aprobar_reproceso` («{n} piezas de {L} aprobadas: pasan a aduana para {PE}», sin «para…» si no es de un pedido) |
| «Devolución de cliente» | «{folio} · {cliente}»; abajo lo que trae («{n} {prenda} talla {t}: {defecto}») | «Llegó {fecha}» · «{n} pz» | «Por revisar» (ámbar) | «Revisar» → la ventana Revisar devolución |
| «Reclamo» | «{RC} · {cliente}»; abajo lo que reclamó y «{L}, {operación}» | Fecha del reclamo · «{n} pz» | «Por resolver» (rojo) | «Ver reclamo» → Reclamos, con ese reclamo |

- **Filtros:** «Todos», «Lotes» (lotes y reprocesos), «Devoluciones» y «Reclamos», con su conteo; solo los que tienen renglones.
- **Orden:** rojo, ámbar y lo demás; dentro de cada color, por fecha. **Vacío:** «Sin pendientes» (verde).

## Por revisar

**Consulta:** `calidad.por_revisar`.

- **La lista:** Lote (la prenda y «{L} · terminado el {fecha}») · Piezas (las listas) · Para (el cliente con «{PE} · para el {fecha}», la tienda con «Reabasto · para el {fecha}», o «Temporada · bodega» con «Para el {fecha}») · «Revisar». Primero los «Por revisar hoy»; luego por entrega. **Vacío:** «Ningún lote espera revisión.»
- **«Revisados hoy»** («Ya pasan a aduana»), si hoy se revisó alguno: Lote · Aprobadas · A reproceso · Revisó, con «Revisó quien cosió» (ámbar) en la revisión marcada.
- **«Reproceso en el taller»** («{n} reprocesos»): Reproceso (la prenda y «{L}-R{n} · {PE} · {fecha}») · Defecto · Talla · Regresó a (la persona y la operación) · Piezas · Estado («En reproceso» azul o «Aprobado» verde) · «Aprobar», la misma acción de Pendientes. Mientras Aduana no recibe el lote, «Aprobar» sale apagado con «Aduana todavía no recibe {L}: el reproceso se aprueba después.»
- El renglón de un lote o su «Revisar» abre la revisión.

### Revisión de un lote

**Consulta:** `calidad.revision_lote` (`lote_id`). Es una página dentro de Por revisar, no un cajón. Se abre con «Revisar lote», con «Revisar» en Pendientes o en la lista, o con el renglón del lote.

- **Arriba:** «‹ Por revisar»; la prenda; «{L} · {para quién} · para el {fecha}»; y tres cifras: «Por revisar» (las listas), «Aprobadas» (verde) y «Rechazadas» (rojo).
- **«Talla»:** un botón por talla con «{t} · {n} listas». Los rechazos van a la talla escogida; al abrir, la primera.
- **«Rechazar por defecto»:** un botón por defecto del catálogo («Costura abierta», «Puntada saltada», «Hilos sin cortar»…). Cada toque rechaza una pieza más de la talla escogida con ese defecto; si ya no quedan listas en esa talla, no hace nada.
- **«Regresan a reproceso»** («A la operación que lo causó»), cuando hay rechazos: un renglón por defecto, talla y operación, con el defecto, «Talla {t}», el selector «Operación que lo causó» (todas las del flujo de la prenda), el selector «Quién la hizo» (la gente del Taller), el contador «−» {n} «+» y una × para quitarlo. El contador no baja de 1 ni pasa de lo que queda en la talla. La operación y la persona que se proponen salen de [revisión de lotes](../../modulos/calidad/revision-de-lotes.md), regla 3: la primera operación del flujo que suele causar ese defecto (o la última) y quien hizo más piezas de esa operación en esa talla (o quien la hace de base).
- **La barra de abajo:** «Revisa: {nombre de la cuenta}»; si su persona tiene registros en el lote, en ámbar «Cosiste en este lote: la revisión queda marcada»; «Al cerrar, las aprobadas pasan a aduana» y «Aprobar {n}» o «Aprobar {n} y regresar {m}» → `calidad.revisar_lote` («{L}: {n} aprobadas pasan a aduana, {m} regresan al taller», sin la segunda parte si no hubo rechazos). Regresa a la lista, con el lote en «Revisados hoy».
- «‹ Por revisar», otra pestaña o el menú, con rechazos capturados, preguntan antes como un cajón con cambios sin guardar.

## Defectos

**Consulta:** `calidad.defectos`.

- **«Últimos {d} días»** (`calidad.defectos_periodo_dias`): «{n} piezas revisadas en {m} lotes · {r} rechazadas ({x.x}%)». Sin revisiones en el periodo: «Sin revisiones en los últimos {d} días».
- **Los defectos del periodo:** una etiqueta por defecto con su conteo, del más común al menos común («25 Pretina o resorte mal puesto»).
- **«Por operación»** («Rechazadas entre piezas revisadas») y **«Por persona»** («Para saber a quién apoyar»): Operación o Persona · Rechazadas · Tasa (el porcentaje y su barra contra la más alta; roja arriba de `calidad.defectos_tasa_roja_porcentaje` (2 %), ámbar si no) · Más común. Solo las que tienen rechazos, de la tasa más alta a la más baja. Cómo se cuenta la tasa está en [revisión de lotes](../../modulos/calidad/revision-de-lotes.md), regla 9.
- **«Catálogo de defectos»,** al final, con «Agregar defecto» → su ventana: Defecto · Operaciones donde pasa.

## Reclamos

**Consultas:** `calidad.reclamos` (`reclamo_id`, el escogido; `cursor`) y `calidad.buscar` (`texto`).

- **Arriba:** el buscador «Código de la prenda, lote o reclamo» y «Nuevo reclamo» → su ventana. Mientras se escribe:
  - si da con un reclamo (por su folio, su lote o el código de su prenda), lo escoge y muestra su rastreo;
  - si da con una prenda sin reclamo: «{prenda} · talla {t}» y «Código {código}. Se hizo en {n} lotes: {lotes}.» o «Todavía no hay lotes de esta prenda.»;
  - si no da con nada: «No hay ninguna prenda, lote ni reclamo con «{texto}»».
- **La lista,** a la izquierda: el folio, su estado («Por resolver» rojo o «Resuelto» verde), el cliente y «{defecto} · {n} piezas · {fecha}». Primero los por resolver, luego los más nuevos, con «Ver más». El escogido va resaltado; al entrar, el primero. Sin reclamos: «Sin reclamos».
- **El rastreo,** a la derecha: «{RC} · {cliente}» y lo que reclamó; «Marcar resuelto» → su ventana, o la resolución en verde («Resuelto el {fecha}: {resolución}»). Cinco pasos:
  1. **Prenda:** «{prenda} · talla {t}» y «Código {código}».
  2. **Lote:** el lote y «Cortado el {fecha} · revisado el {fecha} por {persona}», y la nota de entrega si se sabe.
  3. **Operación:** la operación y el defecto.
  4. **Persona:** quien la hizo, y «Hizo {operación} en ese lote».
  5. **Partida de tela:** la partida y «{tela} · {proveedor}»; si el lote mezcló partidas, todas.

  El rastreo se calcula, no se guarda (ver [reclamos y devoluciones](../../modulos/calidad/reclamos-y-devoluciones.md), regla 5).

## Ventanas

- **«Reclamo nuevo»,** con `calidad.opciones_reclamo` (`cliente_texto`, `codigo`, `defecto_id`, `lote_id`): Cliente · «Código de la prenda» (6 dígitos; con él se ven la prenda y la talla) · Lote (los revisados de esa prenda, con su fecha de corte; si hay uno, ya puesto) · Nota de entrega (opcional: las entregadas a ese cliente con esa prenda) · Defecto · «Operación que lo causó» (las del flujo del lote que suelen causar ese defecto) · «Quién la hizo» (propone quien más piezas hizo de esa operación en esa talla del lote) · Piezas · «Qué dice el cliente» (`calidad.reclamo_min_letras`, 10 letras o más). «Registrar reclamo» → `calidad.registrar_reclamo` («{RC} registrado. Del código se llega al lote {L}»), y queda escogido con su rastreo.
- **«Resolver {RC}»:** «Cómo se resolvió» (opcional, hasta 200: «Se repusieron las 4 piezas»). «Marcar resuelto» → `calidad.resolver_reclamo` («{RC} queda resuelto»).
- **«Defecto nuevo»:** Defecto (4 letras o más) · «En qué operaciones pasa» (un botón por operación del catálogo; al menos una). «Agregar al catálogo» → `calidad.agregar_defecto` («{defecto} agregado: ya se puede escoger al revisar»).
- **«Revisar devolución {folio}»,** con `calidad.devolucion` (`traspaso_id`): el cliente y, por renglón, la prenda y la talla, el lote, «{n} por decidir», y el defecto y la nota con que llegó. En cada renglón: «Sirven» (pasan a bodega) y «Merma», con «Con qué tiene» (obligatorio en merma) y el defecto (opcional). Se puede decidir solo una parte. «Guardar decisión» → `calidad.revisar_devolucion` («{folio}: {n} a bodega, {m} como merma»).

Los mensajes de error de cada acción están en su archivo del módulo.

## Lo que no se copia de la muestra

- Cada rechazo lleva su talla, y la persona que lo causó se puede cambiar.
- «Revisados hoy» marca la revisión de quien cosió en el lote.
- Salir de una revisión con rechazos pregunta antes; la muestra la descartaba sin aviso.
- «Marcar resuelto» deja escribir cómo se resolvió.
- El reclamo puede decir su nota de entrega. Los reclamos y las devoluciones de las tiendas llegan con el POS; las de los pedidos en línea, con uniformame.mx.
- La devolución se decide por renglón y puede quedar decidida en parte.
- «En reproceso» va en azul y el reproceso aprobado dice «Aprobado», como en el resto del sistema.

## Cómo está hecho

**Fase 19, parte 9.**

- **Al revisar el diseño:** las tablas de Por revisar y de Defectos van en su panel blanco; «Reproceso en el taller» no lleva «0 reprocesos» junto a «Sin reprocesos»; y la cifra de cada defecto del periodo va en rojo, con su separador de miles.

- **Las consultas** están en `apps/api/src/modulos/calidad/consultas/`, con sus contratos en `packages/compartido/src/contratos/calidad/` (`pendientes.ts`, `por-revisar.ts`, `defectos.ts`, `consultas-reclamos.ts` y `devolucion.ts`); todas piden el departamento Calidad y ninguna manda precios, importes, tarifas ni sueldos. Lo que comparten (los lotes por revisar, los reprocesos, las devoluciones que esperan a Calidad, los defectos del periodo y las listas de los selectores) está en `consultas/comun.ts`; «para quién» es un lote lo escriben las consultas de Producción (`escribirParaQuien`).
  - `calidad.pendientes` (`pendientes.ts`) arma las tres cifras y los renglones ya escritos, con su estado y su color; la pastilla (`pastillaCalidad`, en `pastillas` del `index.ts`) cuenta los lotes por revisar, las devoluciones por revisar y los reprocesos con su lote en aduana, y va en rojo con un lote «Por revisar hoy» (`calidad.por_revisar_hoy_dias`).
  - `calidad.por_revisar` y `calidad.revision_lote` (`por-revisar.ts`): «Reproceso en el taller» lleva los que siguen en reproceso y los aprobados hoy. La revisión propone, por defecto, la primera operación del flujo que suele causarlo (o la última), y por operación y talla la persona de `produccion.persona_que_la_hizo` (regla 3).
  - `calidad.defectos` (`defectos.ts`) cuenta la tasa por operación y por persona como dice la regla 9, en los últimos `calidad.defectos_periodo_dias` días con hoy, y la manda en rojo arriba de `calidad.defectos_tasa_roja_porcentaje`, con el largo de su barra.
  - `calidad.reclamos` y `calidad.buscar` (`reclamos.ts`): el rastreo es el mismo `dominio/rastreo.ts` que regresa `calidad.registrar_reclamo`, con `contexto.comoAccion`. La lista se pagina con un cursor de cuántos ya se vieron.
  - `calidad.opciones_reclamo` (`opciones-reclamo.ts`) recibe también `cliente_id`, para las notas entregadas a ese cliente con esa prenda; los lotes son los revisados de esa talla y las operaciones, las del flujo del lote ligadas al defecto, cada una con su persona propuesta.
  - `calidad.devolucion` (`devolucion.ts`) solo da una devolución que sigue esperando a Calidad: lo que regresó de un cliente en aduana, sin repartir, con lo que queda por decidir en cada renglón.
- **La web** está en `apps/web/src/departamentos/calidad/`: `pagina.tsx` (las pestañas, «Revisar lote» arriba solo con lotes por revisar y la ventana de la devolución), `direccion.ts` (el filtro, el lote que se revisa, el reclamo escogido, lo que se busca y la ventana `?cajon=devolucion&id=` van en la dirección), una pestaña por archivo en `pestanas/` (la revisión del lote es `revision-lote.tsx`, una página dentro de Por revisar con `?lote=`) y las cuatro ventanas en `ventanas/`. Las rutas están en `apps/web/src/rutas/calidad/`. La revisión pregunta antes de salir con rechazos capturados (`usePreguntarAntesDeSalir`), y la operación y la persona de cada rechazo son las que propone la consulta.
- **Pruebas:** `consultas/pendientes.prueba.ts`, `por-revisar.prueba.ts`, `defectos.prueba.ts`, `reclamos.prueba.ts`, `opciones-reclamo.prueba.ts` y `devolucion.prueba.ts` (lo que manda cada consulta, sin dinero, y que solo Calidad la pide; lo que comparten está en `consultas/de-prueba.ts`), y `apps/web/src/departamentos/calidad/calidad.prueba.ts` (cada pestaña en escritorio y teléfono con su captura en `.revision/capturas/calidad/`, cada botón con su acción y su aviso, la pregunta antes de salir de la revisión, el choque de versión al resolver un reclamo, el error con «Reintentar» y la cuenta sin Calidad).
