# Pantallas de Personal

> **Qué cubre:** las pantallas de Personal (Asistencia con sus pendientes, Personas, PIN del taller y Tarifas), el cajón de la persona y el de «Nueva persona», y las ventanas PIN, Dar de baja y Reabrir semana, cada una con su consulta, sus textos, sus estados y sus botones.
> **Estado:** Decidido.
> **Se construye en:** [fase 19](../../fases/19-web-principal.md).
> **Se conecta con:** [personas](../../modulos/personal/personas.md) · [asistencia](../../modulos/personal/asistencia.md) · [PIN del taller](../../modulos/personal/pin-del-taller.md) · [tarifas](../../modulos/personal/tarifas.md) · [operaciones y flujos](../../modulos/produccion/operaciones-y-flujos.md) · [nómina](../../modulos/contaduria/nomina.md) · [libro de movimientos](../../modulos/inventario/libro-de-movimientos.md) · [pantallas de Producción](produccion.md) · [lo común de las pantallas](../comunes.md)

## Para qué sirve

Llevar a todas las personas que trabajan en la fábrica y en las tiendas, tengan o no cuenta: su área, su puesto, cómo se les paga y desde cuándo. Captura la asistencia de la semana y la cierra para que Contaduría pague, da el PIN con que la gente del taller entra a la tablet y pone la tarifa de cada operación. Ejemplo: el sábado la oficina marca los días de Sergio («½» el jueves), cierra la semana y Contaduría ya puede pagar. Una operación nueva de Producción llega «Sin tarifa»; con el permiso de sueldos, la oficina le pone $1.20 y los registros que esperaban la toman.

## Quién entra

- Las cuentas con Personal. El pago por día y las tarifas solo con `ven_sueldos_y_tarifas` (la dueña siempre); sin él, esos campos no viajan y la pestaña Tarifas no aparece.
- Abrir la ficha de una persona y ver las tarifas quedan en la bitácora como consultas sensibles.
- «Reabrir semana», solo la dueña.
- **Pastilla del menú:** 1 si la semana no está cerrada, más las personas del Taller sin PIN y las bloqueadas (y, con el permiso, las operaciones sin tarifa); roja si alguien está bloqueado.
- **Acción principal:** «Nueva persona»: abre el cajón del alta.
- **Pestañas:** Asistencia (abre aquí, con los indicadores y los pendientes; su conteo son los días sin capturar, o 1 si solo falta cerrar) · Personas · PIN del taller (las que faltan) · Tarifas (con el permiso; las que faltan).

## Asistencia

**Consulta:** `personal.asistencia` (`asistencia_semana_id`: al abrir, la semana que corre; también la pasada mientras siga abierta).

| Cifra | Qué dice | Su línea | Lleva a |
|---|---|---|---|
| «Asistencia de la semana» | «{n} días sin capturar» (ámbar); completa, «Lista para cerrar»; cerrada, «Cerrada» | «Por cerrar para nómina» (ámbar) o «Cerrada y enviada a Contaduría» (verde) · «{n} cobran por tiempo», con la barra Completos · Medios · Faltas · Sin capturar | Asistencia |
| «Personas» | «{n} activas» | «{n} sin cuenta de Google» | Personas |
| «PIN del taller» | «{n} sin PIN» (ámbar si hay) | «{n} PIN activos» y, si hay, «{n} bloqueados» (rojo) | PIN del taller |

| Tipo | Referencia | Fecha | Estado | Botón |
|---|---|---|---|---|
| «Asistencia» | «Semana del {semana}»; abajo «{n} personas por tiempo» y «· {n} días sin capturar» | «Nómina {día de pago}» | «Por capturar» (ámbar) · «Por cerrar» (ámbar) · «Cerrada» (verde); el renglón se queda | «Cerrar asistencia» (negro sin días por capturar) → `personal.cerrar_semana_asistencia`; cerrada, sin botón |
| «PIN» | El nombre; abajo «{puesto} · sin acceso a la tablet del taller» | — | «Sin PIN» (ámbar) | «Asignar PIN» → `personal.asignar_pin` y su ventana |
| «PIN» | El nombre; abajo «Se bloqueó por {n} PIN equivocados» | Desde cuándo | «Bloqueado» (rojo) | «Desbloquear» → `personal.desbloquear_pin` («{nombre} ya puede entrar con su PIN») |
| «Tarifa» | «{operación} · {flujo}»; abajo «{n} registros esperan su tarifa» (solo con el permiso) | — | «Sin tarifa» (ámbar) | «Poner tarifa» → Tarifas, en esa operación |

- **Filtros:** «Todos», «Asistencia», «PIN» y «Tarifas», con su conteo. **Orden:** rojo, ámbar, verde; dentro, por fecha.
- Con dos semanas abiertas, cada una da su renglón y la cuadrícula tiene su selector de semana.

**«Asistencia del {semana}»,** una fila por persona que cobra por tiempo o mixta y está activa en la semana (o se dio de baja dentro de ella). Columnas: Persona (nombre; abajo «{área} · {forma de pago}») · un día por cada día de trabajo de `general.dias_de_trabajo` («lun 2» … «sáb 7») · Días.

- **Cada día es un botón:** «✓» completo (verde) · «½» medio (ámbar) · «F» falta (rojo) · vacío sin capturar (blanco con borde rojo). Cambia en este orden: ✓ → ½ → F → ✓; uno vacío pasa a ✓. Cada toque → `personal.cambiar_dia_asistencia` con el valor que queda, y el foco se queda en ese día. Un día fuera de su ingreso o su baja sale gris, sin botón.
- **«Días»** suma la semana: completo 1, medio 0.5, falta y sin capturar 0.
- **Abajo:** la leyenda; «{n} días sin capturar» en ámbar; y «Cerrar semana» → `personal.cerrar_semana_asistencia` («Semana cerrada: contaduría ya puede pagar la nómina»). Con días sin capturar, no cierra: pone el foco en el primero y avisa «Faltan {n} días por capturar». Cerrada, los días no se tocan y en lugar del botón dice «Cerrada · la tiene contaduría» (verde).

**«Semanas cerradas»,** las últimas cuatro: Semana · La cerró · Cuándo · Faltas · y, para la dueña, «Reabrir semana» → su ventana, mientras su nómina no esté pagada.

## Personas

**Consulta:** `personal.personas` (`area`: `taller`, `oficina`, `aduana_bodega`, una tienda o `baja`; `ver_tarifas`).

- **Arriba:** el selector «Área» («Todas las áreas», «Taller», «Oficina», «Aduana y bodega», cada tienda, «Dadas de baja»), «Ver tarifas» (con el permiso; cambia a «Ocultar tarifas») y «Nueva persona». Con las tarifas a la vista: «Quedó registrado en la bitácora que consultaste las tarifas».
- **Un grupo por área,** con su conteo, y al final «Dadas de baja» en gris. Columnas: Persona (nombre y su E-) · Puesto · Forma de pago («Por tiempo», «Por pieza» o «Mixta») · Tarifa («••••» oculta; a la vista, «{monto} al día», «{monto} al día + piezas», «Por operación · {monto} en promedio» o «Por operación · —») · Ingreso · Entra al sistema («Cuenta de Google · {rol}», «Sistema de su tienda», «PIN del taller», «Sin PIN» en ámbar, «Baja {fecha}»).
- Al pie: «Una persona no necesita cuenta: su producción y su pago le corresponden igual».
- El renglón abre el cajón de la persona.

## PIN del taller

**Consulta:** `personal.pines`. Las personas activas del Taller sin cuenta de Google, las únicas que pueden tener PIN. El PIN nunca viaja a esta lista.

- **Columnas:** Persona · Puesto · PIN («••••» si tiene, nunca se vuelve a mostrar; «Sin PIN» en ámbar; «Bloqueado» en rojo, con desde cuándo) · el botón: «Asignar PIN» (negro), «Restablecer» (gris) o «Desbloquear».
- **«Asignar PIN»** → `personal.asignar_pin` y **«Restablecer»** → `personal.restablecer_pin`, cada uno con su ventana. **«Desbloquear»** → `personal.desbloquear_pin`.
- Al pie: «El PIN solo sirve en la tablet registrada del taller».

## Tarifas

**Consulta:** `personal.tarifas` (`flujo_id`, `historial`). Solo con `ven_sueldos_y_tarifas`, y la consulta deja en la bitácora «Consultó las tarifas del personal».

- **Una tarjeta por flujo,** con sus operaciones en orden: Operación · La hace · «Tarifa por pieza» (una casilla en pesos, marcada si está «Sin tarifa») · «Desde {fecha}». «Ver historial» suma sus tarifas anteriores con sus fechas.
- **Al salir de una casilla que cambió** → `personal.poner_tarifa_operacion` («{operación}: {tarifa} por pieza desde ahora» y, si aplica, «{n} registros sin tarifa ya la tomaron. Los de semanas pagadas entran en la siguiente nómina»). No acepta 0 ni texto: «Escribe la tarifa en pesos, por ejemplo 1.50».
- Cada pieza guarda la tarifa del momento en que se registró: el cambio vale para lo que se registre desde ahora, y para los registros que esperaban sin tarifa (ver [tarifas](../../modulos/personal/tarifas.md)).
- Arriba, «{n} operaciones sin tarifa» (ámbar) si hay: mientras no tengan, sus piezas no suman a la nómina.

## Cajones

### La persona y «Nueva persona»

**Consulta:** `personal.persona` (`persona_id`; sin él, los valores del alta). La de una persona deja en la bitácora «Consultó la ficha de {persona}». Se abre desde Personas, o desde la acción principal para el alta.

- **Encabezado:** «{E-} · {área}» y el nombre; en el alta, «Personal» y «Nueva persona».
- **Botones con cifra,** en una persona que existe: «{n} días esta semana» → Asistencia · «{n} piezas esta semana» → [Producción por persona](produccion.md#producción-por-persona) (con Producción) · «Sí» o «No» PIN del taller → PIN del taller (si puede tener) · la forma de pago → Contaduría · Nómina (con Contaduría y el permiso).
- **Dada de baja:** «Dada de baja el {fecha}: {motivo}».
- **Campos:** «Nombre completo» (de 5 a 40) · «Área» (Taller, Oficina, Aduana y bodega o una tienda; en el alta, Taller) y, en una tienda, cuál y su rol («Cajera» o «Encargada») · «Puesto» (de 3 a 30) · «Forma de pago» («Por tiempo», «Por pieza» o «Mixta»; en el alta, Por pieza) · «Por día» o «Base por día» (pesos, hasta $99,999; no sale por pieza; solo con el permiso) · «Fecha de ingreso» (en el alta, hoy; nunca futura).
- Si no es por tiempo: «Las piezas llegan de la puerta del taller con la tarifa de cada operación.»
- En una persona que existe: «Entra al sistema» y «Esta semana» («{n} días», «{n} piezas» o «—»).
- Al pie: «Ver tarifas y sueldos queda en la bitácora».
- **Botones:** en el alta, «Dar de alta» → `personal.dar_alta_persona` («{persona} dada de alta», y «. Falta asignarle PIN del taller» si es del Taller): abre Personas con ella marcada; si cobra por tiempo o mixta y la semana está abierta, entra a la cuadrícula. En una que existe, «Guardar» → `personal.editar_persona` («{persona} actualizada», y «. Su PIN ya no entra» si salió del Taller) y «Dar de baja» → su ventana; dada de baja, «Reactivar» → `personal.reactivar_persona` («{persona} reactivada»), con la fecha de ingreso si vuelve con otra.

## Ventanas

- **«PIN de {persona}»:** el PIN en grande, cifra por cifra («4 1 8 9»), y «Se muestra una sola vez: dáselo en persona.»; al restablecer, antes «El anterior ya no entra.». «Listo» cierra. Si el PIN ya se había generado y no se vio: «El PIN ya se generó. Si no lo viste, usa «Restablecer».»
- **«Dar de baja a {persona}»:** «No se borra: su producción y sus pagos se conservan.» y «Motivo» (de 5 a 80). «Dar de baja» → `personal.dar_baja_persona` («{persona} dada de baja», «. Su PIN ya no entra», «. Su cuenta de Google ya no entra»).
- **«Reabrir la semana del {semana}»** (la dueña): «Contaduría no la puede pagar mientras esté abierta.» y el motivo. «Reabrir semana» → `personal.reabrir_semana_asistencia` («Semana del {semana} reabierta»).

Los mensajes de error de cada acción están en su archivo del módulo.

## Lo que no se copia de la muestra

- «Ver tarifas», el pago por día y la pestaña Tarifas piden el permiso de sueldos; la muestra no lo revisaba.
- «Reabrir semana», «Reactivar», «Desbloquear» y el rol de tienda son pantallas nuevas.
- La semana y sus días salen de los días de trabajo; puede haber dos semanas abiertas.
- La gente de las tiendas se captura a mano: sus días del turno llegan con el POS.
- Cerrar el cajón con cambios pregunta antes, como todo cajón.
- La pastilla se pone roja si alguien quedó bloqueado en la tablet.
- «Próximamente» (vacaciones, contratos, IMSS, incidencias) no se construye.

## Cómo está hecho

*Lo escribe Claude Code al terminar la fase 19.*
