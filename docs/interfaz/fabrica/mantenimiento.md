# Pantallas de Mantenimiento

> **Qué cubre:** las pantallas de Mantenimiento (Pendientes, Máquinas, Fallas, Servicios y Costo por máquina), los cajones Falla y Máquina, y las ventanas Reportar falla, Máquina nueva, Mandar a reparación, Nota de seguimiento, Reparación o Registrar servicio, Cambiar quién la trae y Dar de baja, cada una con su consulta, sus textos, sus estados y sus botones.
> **Estado:** Decidido.
> **Se construye en:** [fase 19](../../fases/19-web-principal.md).
> **Se conecta con:** [máquinas, fallas y servicios](../../modulos/mantenimiento/maquinas-fallas-y-servicios.md) · [lotes](../../modulos/produccion/lotes.md) · [gastos](../../modulos/contaduria/gastos.md) · [configuración](../../modulos/admin/configuracion.md) · [lo común de las pantallas](../comunes.md)

## Para qué sirve

Saber qué máquina está parada, desde cuándo, qué lotes detiene y cuánto ha costado cada una. Ejemplo: a media mañana llega de la tablet «FM-0043 · Recta 7 · No prende»: Pendientes la pone en rojo, «Parada», «detiene L-2026-122». Tomás la manda a reparación con Servicio Industrial del Bajío; dos días después registra la reparación, «cambio de motor», $650 y 13 horas de paro: la máquina vuelve a «Trabajando», el lote deja de estar atorado y Contaduría ve el gasto.

## Quién entra

- Las cuentas con Mantenimiento. Ven el costo de cada reparación y el paro en pesos; nada de eso baja a la tablet.
- **Pastilla del menú:** las fallas abiertas; roja si alguna detuvo su máquina.
- **Acción principal:** «Registrar servicio», para un servicio suelto, sin falla. Junto al título, «Reportar falla».
- **Pestañas:** Pendientes · Máquinas · Fallas · Servicios · Costo por máquina.

**El estado de una máquina** sale de sus fallas abiertas y no se captura: «Trabajando» (verde) sin falla abierta, «Parada» (rojo) con una que la detuvo, «Trabaja con falla» (ámbar) con una que no la detuvo.

## Pendientes

**Consulta:** `mantenimiento.pendientes`.

| Cifra | Qué dice | Su línea | Lleva a |
|---|---|---|---|
| «Máquinas» | «{n} máquinas», las activas; en rojo si hay alguna parada | «{n} paradas» (rojo) o «Todas trabajan», con la barra Trabajando · Trabaja con falla · Parada | Máquinas |
| «Fallas» | «{n} abiertas»; en ámbar si hay | «{n} resueltas en el año» | Fallas |
| «Servicios» | «{n} en el año» | «{monto} este mes» | Servicios |
| «Costo por máquina» | «{n} horas de paro en el año»: las de los servicios más las de las fallas abiertas que detuvieron su máquina | «{monto} por paro» (rojo) · «{monto} en reparaciones», con la gráfica chica «Horas de paro por mes» de los últimos 6 meses | Costo por máquina |

| Tipo | Referencia | Fecha · Paro | Estado | Botón |
|---|---|---|---|---|
| «Falla» | «{máquina} · {quien la trae}»; abajo lo que le pasa y, si aplica, «· detiene {lotes}» | El día del reporte · «{n} h de paro» o «—» | «Parada» (rojo) o «Trabaja con falla» (ámbar) | «Atender» (negro si está parada) → el cajón Falla |

- Un renglón por falla abierta. «Detiene» son los lotes que esa falla tiene atorados: los en proceso con piezas esperando en una operación que hace de base quien trae la máquina ([máquinas, fallas y servicios](../../modulos/mantenimiento/maquinas-fallas-y-servicios.md), regla 11).
- **Orden:** rojo, ámbar; dentro, por fecha. Sin filtros. **Vacío:** «Sin pendientes» (verde).

## Máquinas

**Consulta:** `mantenimiento.maquinas`.

- **Arriba:** «{n} máquinas» y «Nueva máquina» → su ventana.
- **Un grupo por área** («Costura», «Ojal y botón», «Planchado», «Corte»…), plegable, con «{n} máquinas». Columnas: Máquina (nombre y folio) · Tipo y marca (el tipo; la marca y el modelo) · Serie · La trae · Último servicio (fecha y qué se hizo, o «—») · Estado. Cada renglón abre el cajón Máquina.
- **«Dadas de baja»,** abajo y solo para leer: Máquina · Desde · Motivo. No cuentan en las cifras.

## Fallas

**Consulta:** `mantenimiento.fallas` (`grupo`: `abiertas` o `resueltas`; `cursor`, en las resueltas).

- **Dos grupos:** «Abiertas» (rojo, desplegado) y «Resueltas» (verde, plegado, con «Ver más»), cada uno con «{n} fallas»; el que no tiene fallas no sale.
- **Columnas:** Falla (folio y fecha) · Máquina (nombre y folio) · Qué le pasa (y abajo «La detuvo» o «Siguió trabajando») · Reportó · Paro (las horas o «—») · Estado: «Reportada» (ámbar), «En reparación» (rojo) o «Resuelta» (verde).
- **El paro:** de una resuelta, las horas de su servicio; de una abierta que detuvo la máquina, las que lleva (regla 6 de [máquinas, fallas y servicios](../../modulos/mantenimiento/maquinas-fallas-y-servicios.md)); si no, «—».
- Cada renglón abre el cajón Falla.

## Servicios

**Consulta:** `mantenimiento.servicios` (`anio`, el actual al abrir; `cursor`).

- **Arriba:** «Servicios de técnicos externos», el año (se puede cambiar), «{n} en el año · {total} · {h} horas de paro» y «Registrar servicio» → su ventana.
- **Tabla,** del más reciente al más viejo, con «Ver más»: Servicio (folio y fecha) · Máquina (nombre y folio) · Técnico · Qué se hizo · Costo · Paro («{n} h»). Los renglones no abren nada; el recién registrado queda marcado un momento. **Vacío:** «Sin servicios en {año}».

## Costo por máquina

**Consulta:** `mantenimiento.costo_por_maquina` (`costo_hora_centavos`, opcional).

- **Arriba:** «Reparaciones en el año» ({total}) · «Horas de paro · {n} h», con «≈ {pesos}» en rojo · la casilla «Una hora de máquina parada cuesta», que abre en `mantenimiento.costo_hora_paro` ($450).
- **La casilla** acepta solo números. Con uno mayor que 0, vuelve a calcular los pesos de paro de esta pestaña; vacía o en 0, regresa al de Configuración. No se guarda ni va a la bitácora: el valor de verdad lo cambia la dueña en [configuración](../../modulos/admin/configuracion.md).
- **Leyenda** «Reparación» · «Paro», y **tabla** de las máquinas con gasto o paro, de la que más cuesta (reparaciones más paro en pesos) a la que menos: Máquina («{n} servicios · {quien la trae}») · Reparaciones · Paro («{n} h») · Paro en pesos (rojo) · «Lo gastado contra lo parado» (barra de dos partes, a escala de la que más cuesta). Cada renglón abre el cajón Máquina.
- El paro de una máquina suma las horas de sus servicios y las de su falla abierta, si la detuvo; en pesos, por el costo de la hora.

## Cajones

### Falla

**Consulta:** `mantenimiento.falla` (`falla_id`). Se abre con «Atender» o con un renglón de Fallas.

- **Encabezado:** «{FM} · {fecha}» y el estado; «{máquina}: {lo que le pasa, en minúsculas}» («Recta 7: no prende»).
- **Cifras:** «{n} h» de paro · «Sí» o «No» la detuvo · «{costo}» o «—» de reparación.
- **Datos:** Reportó («{persona}, desde la tablet», o la cuenta) · La trae (quien la traía al fallar) · Máquina («{tipo} {marca} {modelo} · {serie}») · Técnico (el de la reparación, o «Sin asignar»).
- **La nota de seguimiento,** si hay, con su reloj («Revisaron el motor el 9 oct; esperan la refacción para el 13 oct»), y en una falla abierta «Nota de seguimiento» → su ventana.
- **«Lo que está deteniendo»,** si está abierta y atora lotes: «{L} · {prenda} para {destino}», con su entrega.
- **«Servicio»,** si está resuelta: «{SM} · {fecha}», qué se hizo, costo y paro («{n} horas, ≈ {pesos}»).
- **El pie:** «Cerrar» · «Mandar a reparación» (solo reportada) · «Registrar reparación» (si no está resuelta) → la ventana Reparación.

### Máquina

**Consulta:** `mantenimiento.maquina` (`maquina_id`). Se abre con un renglón de Máquinas o de Costo por máquina.

- **Encabezado:** «{folio} · {área}» y el estado; el nombre de la máquina.
- **Cifras:** «{total}» en reparaciones · «{n} h» de paro, «≈ {pesos}» (rojo) · «{n}» fallas en el año.
- **Datos:** Tipo · Marca y modelo · Serie · La trae, con «Cambiar quién la trae» → su ventana.
- **«Historial»,** del más reciente al más viejo: las fallas («Falla: {lo que le pasa}, reportó {persona}») y los servicios («{qué se hizo} · {técnico} · {costo}, {n} h de paro»). Vacío: «Sin fallas ni servicios».
- **El pie:** «Cerrar» · «Dar de baja» (rojo) → su ventana. Con una falla abierta, apagado: «{máquina} tiene una falla abierta: resuélvela antes de darla de baja».

## Ventanas

Las listas de las ventanas (tipos, áreas, gente del Taller, técnicos, motivos de falla y máquinas) salen de `mantenimiento.opciones`.

- **«Reportar falla»:** Máquina (las activas sin falla abierta) · «Qué tiene» (los motivos de falla) · «Nota» (opcional, hasta 200). Con un motivo que detiene la máquina: «La máquina queda parada.» «Reportar falla» → `mantenimiento.reportar_falla` («{FM}: {máquina} parada» o «{FM}: {máquina} trabaja con falla»).
- **«Máquina nueva»:** Nombre («cómo le dicen en el taller») · Tipo (los que hay, u «Otro tipo» con «¿Qué tipo?») · Área · Marca, Modelo y Serie (opcionales) · «La trae». «Dar de alta» → `mantenimiento.alta_maquina` («{máquina} ({folio}) dada de alta en {área}»); el folio sigue el de su tipo y sale en la tablet.
- **«Mandar {máquina} a reparación»:** Técnico (la lista, u «Otro técnico» con «Técnico o taller», que se queda en la lista) · «¿La máquina se queda parada?» («Sí, se para» marcado si su motivo la detiene; si ya está parada, no se pregunta: sigue así hasta la reparación). «Mandar a reparación» → `mantenimiento.mandar_a_reparacion` («{FM} en reparación con {técnico}»); el cajón se queda abierto con lo nuevo.
- **«Nota de seguimiento de {FM}»:** la nota (hasta 200; vacía, la borra). «Guardar nota» → `mantenimiento.guardar_nota_seguimiento` («Nota guardada en {FM}»).
- **«Reparación de {máquina}» o «Registrar servicio»,** la misma ventana en dos formas. La reparación dice abajo «{FM} · {lo que le pasa}» y su botón es «Marcar resuelta»; el servicio suelto suma el campo Máquina (las activas) y su botón es «Registrar servicio». Campos: Técnico (de la lista; empieza en el de la falla) · «Qué se hizo» (de 4 a 80) · Costo (pesos, puede ser 0) · «Horas de paro» (enteras; propone las que lleva la falla si detuvo la máquina, si no 0). → `mantenimiento.registrar_servicio`: la reparación avisa «{máquina} vuelve a trabajar. {n} horas de paro quedan registradas»; el suelto, «{SM} registrado». Con costo mayor que 0 nace su gasto en Contaduría (ver [gastos](../../modulos/contaduria/gastos.md)). Se cierran la ventana y el cajón, y el renglón queda marcado.
- **«{máquina}: ¿quién la trae?»:** la gente activa del Taller y «Una falla abierta guarda quién la traía al fallar.» «Guardar» → `mantenimiento.cambiar_asignacion_maquina` («{máquina} ahora la trae {persona}»).
- **«Dar de baja {máquina}»:** «Motivo» («Por ejemplo: se vendió, ya no tiene arreglo») y «Sale de la tablet y de la lista de máquinas. Sus fallas, servicios y costos se conservan.» «Dar de baja» (rojo) → `mantenimiento.baja_maquina` («{máquina} dada de baja»).

Los mensajes de error de cada acción están en [máquinas, fallas y servicios](../../modulos/mantenimiento/maquinas-fallas-y-servicios.md).

## Lo que no se copia de la muestra

- La casilla «Una hora de máquina parada cuesta» solo recalcula Costo por máquina, no los demás pesos de Mantenimiento.
- «Cambiar quién la trae» y «Nota de seguimiento» son pantallas nuevas.
- «Detiene» son los lotes atorados por esa falla, como los calcula Producción.
- Las fallas resueltas y los servicios se paginan, y los servicios se ven por año.
- «Este mes» es el mes en curso, no una fecha fija.
- Los pesos van enteros o con sus dos centavos, como en todo el sistema.

## Cómo está hecho

**Fase 19, parte 10.**

- **Las consultas** están en `apps/api/src/modulos/mantenimiento/consultas/`, con sus contratos en `packages/compartido/src/contratos/mantenimiento/consultas-pestanas.ts` (`mantenimiento.pendientes`, `maquinas`, `fallas`, `servicios` y `costo_por_maquina`) y `consultas-cajones.ts` (`falla`, `maquina` y `opciones`); se registran en el `index.ts` del módulo, que también declara la pastilla del menú (`pastillaMantenimiento`, en `pendientes.ts`). Todas piden el departamento Mantenimiento y leen con `contexto.comoAccion(…)`; todo monto va en `*_centavos` opcional, para que el servidor lo recorte.
- **Lo que comparten** está en `consultas/comun.ts`: el estado de la máquina sale de su falla abierta (`estadoDeMaquina`, regla 1) y el de la falla de su estado (`estadoDeFalla`), con el color de la guía; las horas de paro de una falla abierta son las de `fallasQueDetienen`, la lectura que usan Producción y Dirección (regla 6); el costo de la hora es `mantenimiento.costo_hora_paro` (regla 7); y «detiene» son los lotes que `produccion.lotes_atorados` da por esa falla («{máquina} parada ({FM})», regla 11). La prenda y para quién de esos lotes se escriben con las columnas de «para quién» de Producción.
- **Las fallas resueltas y los servicios** se paginan con el cursor común (`paginar`, por fecha y folio, del más reciente). «En el año» y «este mes» son los del día de negocio. La casilla de Costo por máquina viaja como `costo_hora_centavos` y no se guarda; en 0 o vacía, la consulta usa el de Configuración.
- **La web** está en `apps/web/src/rutas/mantenimiento/` (una ruta por pestaña, con la búsqueda de `direccion.ts`) y `apps/web/src/departamentos/mantenimiento/`: `pagina.tsx` (las pestañas, «Reportar falla» y «Registrar servicio» en la barra), `pestanas/`, `cajones/` (Falla y Máquina, por `?cajon=falla|maquina&id=…`), `ventanas/` (Reportar falla, Máquina nueva, Mandar a reparación, Nota de seguimiento, Reparación o Registrar servicio, y quién la trae; «Dar de baja» es la ventana con motivo común), `envio.ts` (la acción con su choque de versión) y `comun.tsx` (la celda de dos líneas, la cifra del cajón, la lista con su día; «Ver más» es `usePaginas` de lo común). Los formularios validan con el esquema del contrato de su acción.
- **Pruebas:** cada consulta con su `*.prueba.ts` en `consultas/` (lo que trae con los datos de la muestra, el paro y sus pesos, la paginación, y el `403` sin Mantenimiento), y `departamentos/mantenimiento/mantenimiento.prueba.ts` en el navegador: las cinco pestañas en escritorio y en teléfono con sus capturas, los dos cajones por su dirección, cada botón con su acción y su aviso, la casilla del costo, el choque de versión y «No tienes acceso a esta pantalla».
- **Con el revisor de diseño:** cada tabla de una pestaña va en su `Panel` blanco (Máquinas por área, Fallas, Costo por máquina); en Costo por máquina, «≈ {pesos}» va en cifra grande en rojo y la casilla lleva su «$» delante. Lo prueba `mantenimiento.prueba.ts` (la casilla con su «$» y la tabla en su panel).
- **Lo que corrigió la auditoría (cierre de la fase 19):** `mantenimiento.maquina` manda `puede` (`dar_de_baja` y su `razon`, con el texto de `mantenimiento.baja_maquina`): el cajón apaga «Dar de baja» y dice por qué sin decidirlo. La casilla de Costo por máquina pasa de centavos a pesos con `centavosACampo` y `aPesoEntero`, y de pesos a centavos con `pesosACentavos`. Las fechas en hora de México de las consultas salen de `zonaDelNegocio`. Lo prueba `consultas/maquina.prueba.ts`.
