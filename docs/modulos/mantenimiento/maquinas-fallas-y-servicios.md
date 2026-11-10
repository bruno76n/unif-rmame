# Máquinas, fallas y servicios

> **Qué cubre:** todo Mantenimiento: las máquinas con su folio por tipo, quién la trae y su baja; las fallas FM- que llegan de la tablet o de Mantenimiento; mandar a reparación, la nota de seguimiento y el servicio SM- que resuelve la falla o se hace suelto; los técnicos; las horas de paro y lo que cuestan.
> **Estado:** Decidido.
> **Se construye en:** [fase 13](../../fases/13-calidad-y-mantenimiento.md).
> **Se conecta con:** [lotes](../produccion/lotes.md) · [operaciones y flujos](../produccion/operaciones-y-flujos.md) · [personas](../personal/personas.md) · [gastos](../contaduria/gastos.md) · [terceros y deudas](../contaduria/terceros-y-deudas.md) · [configuración](../admin/configuracion.md) · [folios](../admin/folios.md) · [alertas e indicadores](../direccion/alertas-e-indicadores.md) · [sincronización](../../cimientos/SINCRONIZACION.md) · [la tablet](../../apps/tablet.md) · [pantallas de Mantenimiento](../../interfaz/fabrica/mantenimiento.md) · [pantallas de la tablet](../../interfaz/tablet.md) · [flujo 11 · Falla de máquina](../../flujos/fabrica/11-falla-de-maquina.md)

## Para qué sirve

Mantenimiento sabe qué máquina está parada, desde cuándo, qué lotes detiene y cuánto ha costado. Ejemplo: a media mañana, la persona que trae la recta R-07 entra a la tablet con su PIN, toca «Falla de máquina», escoge la R-07 y «No prende». Nace la falla FM-0043, «Reportada», y la máquina queda parada. Producción ve los lotes que se atoran en la operación de esa persona. Mantenimiento la manda a reparación con su técnico; al registrar la reparación (qué se hizo, $650, 13 horas de paro) la falla queda resuelta, nace el servicio SM-0018 y Contaduría ve su gasto.

## Reglas

1. **El estado de la máquina no se captura:** «Trabajando» sin falla abierta; «Parada» con una falla abierta que la detuvo; «Trabaja con falla» con una abierta que no la detuvo.
2. **Cada máquina** tiene su folio por tipo ({prefijo}-{n}: la R-08 va después de la R-07), un nombre único sin importar mayúsculas («cómo le dicen en el taller»), su tipo, su área (lista «Áreas del taller») y quién la trae: una persona activa del Taller. Marca, modelo y serie son opcionales; la serie, si viene, es única.
3. **Un tipo nuevo** («Otro tipo») toma como prefijo las iniciales de su nombre en mayúsculas; si choca, agrega la siguiente letra del nombre hasta que no choque. Un tipo con un nombre que ya existe usa ese.
4. **Una falla abierta por máquina.** Desde Mantenimiento, otra falla en una máquina con falla abierta es un error. Desde la tablet, el reporte se aplica sin crear otra falla, y el resultado lo dice: ya se reportó y no es una excepción.
5. **Qué detiene una máquina:** lo dice el motivo de la falla (al inicio, solo «No prende»). Al mandarla a reparación se dice si se queda parada; una que ya estaba parada sigue así hasta registrar la reparación. El paro cuenta desde que se paró: el reporte, si la detuvo, o el envío a reparación, si ahí se paró.
6. **Las horas de paro:** de una falla abierta que detuvo la máquina, `mantenimiento.paro_horas_por_dia` (9) por cada día de trabajo desde el día en que se paró hasta ayer, más `mantenimiento.paro_horas_hoy` (4) de hoy (una falla reportada hoy lleva 4 h); de una resuelta, las que se escribieron al registrar la reparación, en horas enteras. El paro de una máquina suma las horas de sus servicios y las de su falla abierta, si la detuvo.
7. **El paro en pesos** es horas × `mantenimiento.costo_hora_paro` ($450), una decisión de operación de la dueña, con su responsable, `mantenimiento.responsable_hora_paro` (Mantenimiento), que solo se guarda.
8. **Mandar a reparación** solo una falla reportada, con un técnico de la lista o uno nuevo («Otro técnico»), que se queda en la lista.
9. **La nota de seguimiento** se escribe en una falla abierta y se vacía al resolverla; la bitácora guarda lo que decía.
10. **Un servicio** resuelve una falla («Registrar reparación» → «Marcar resuelta») o es suelto. Lleva qué se hizo (de 4 a 80), su costo (≥ 0, en centavos) y sus horas de paro (enteras; con falla, propone las que lleva). Con costo mayor que 0 nace su gasto en Contaduría; con costo 0, no.
11. **Atorado por máquina:** una falla abierta que detuvo una máquina atora los lotes en proceso con piezas esperando en una operación que hace de base quien trae esa máquina. Resolver la falla quita ese atorado (ver [lotes](../produccion/lotes.md)).
12. **Dar de baja una máquina** pide que no tenga falla abierta y un motivo; sus fallas, servicios y costos se quedan, y sale de la tablet. **Cambiar quién la trae** no toca una falla abierta: la falla guarda quién la traía al fallar.
13. **Un técnico** se puede ligar a su tercero para su factura y su pago. Las refacciones no tocan los materiales.

## Estados de la falla

| De | A | Qué pasa | Quién |
|---|---|---|---|
| — | `reportada` | «Falla de máquina» en la tablet o «Reportar falla» | La persona con su PIN; Mantenimiento |
| `reportada` | `en_reparacion` | «Mandar a reparación», con su técnico | Mantenimiento |
| `reportada` o `en_reparacion` | `resuelta` | «Registrar reparación» → «Marcar resuelta»: nace el SM- | Mantenimiento |

## La tabla `tipos_maquina`

| Columna | Tipo | Nulo | Qué es |
|---|---|---|---|
| `id` | uuid | no | Llave |
| `nombre` | text | no | Único sin importar mayúsculas |
| `prefijo` | text | no | Único. El de los folios de sus máquinas: R, O, C, OJ. Su consecutivo vive en los folios (tipo `maquina`, con el prefijo como alcance) |
| `baja_en` · `baja_por` · `motivo_baja` · `reactivado_en` | | sí | |

Lleva las columnas comunes (ver [base de datos](../../cimientos/BASE-DE-DATOS.md#columnas-comunes)). No tiene siembra: los datos de la muestra traen sus tipos.

## La tabla `maquinas`

| Columna | Tipo | Nulo | Qué es |
|---|---|---|---|
| `id` | uuid | no | Llave (v7) |
| `folio` | text | no | R-07. Único |
| `nombre` | text | no | Hasta 40. Único sin importar mayúsculas |
| `tipo_maquina_id` | uuid | no | → `tipos_maquina.id` |
| `area_id` | uuid | no | → `lista_valores.id`, de la lista «Áreas del taller» |
| `marca` · `modelo` · `serie` | text | sí | La serie, única si viene |
| `persona_id` | uuid | sí | → `personas.id`: «La trae». Obligatoria al darla de alta; queda vacía si esa persona se da de baja |
| `baja_en` · `baja_por` · `motivo_baja` · `reactivado_en` | | sí | Motivo de 5 letras o más |

Lleva las columnas comunes y, como baja a la tablet, `xid_escritura`. **Índices:** único (`folio`) · único (`lower(nombre)`) · único (`serie`) donde no es vacía · (`persona_id`).

## La tabla `motivos_falla`

Los botones de «¿Qué le pasa?» en la tablet y de «Reportar falla».

| Columna | Tipo | Nulo | Qué es |
|---|---|---|---|
| `id` | uuid | no | Llave |
| `nombre` | text | no | Único sin importar mayúsculas |
| `detiene_maquina` | boolean | no | Verdadero deja la falla como «la detuvo» |
| `orden` | smallint | no | El orden de los botones |
| `baja_en` · `baja_por` · `motivo_baja` · `reactivado_en` | | sí | |

Lleva las columnas comunes y `xid_escritura`. **La siembra:** «No prende» (la detiene), «Rompe el hilo», «Salta puntada», «Hace ruido», «Tira aceite» y «Otra cosa», en ese orden; existen en toda base.

## La tabla `fallas`

| Columna | Tipo | Nulo | Qué es |
|---|---|---|---|
| `id` | uuid | no | Llave. Si viene de la tablet, el que trajo |
| `folio` | text | no | FM-0043. Único. Lo pone el servidor al recibirla |
| `maquina_id` | uuid | no | → `maquinas.id` |
| `motivo_falla_id` | uuid | no | → `motivos_falla.id` |
| `nota` | text | sí | «Nota (opcional)», hasta 200 |
| `origen` | text | no | CHECK (`tablet`, `mantenimiento`) |
| `reporto_persona_id` | uuid | sí | → `personas.id`: en la tablet, quien entró con su PIN (CHECK: lleno con `tablet`); en Mantenimiento, la persona de la cuenta, si está ligada |
| `persona_asignada_id` | uuid | sí | → `personas.id`: quien traía la máquina al reportarse |
| `dispositivo_id` · `clave_idempotencia` | uuid | sí | CHECK: llenos con `tablet`. La clave, única si viene |
| `hecho_en` | timestamptz | no | La hora del reporte en el aparato, o en el servidor |
| `fecha` | date | no | El día del reporte |
| `sin_internet` | boolean | no | default false |
| `detuvo_maquina` | boolean | no | Al inicio, el del motivo; cambia al mandar a reparación |
| `parada_desde` | timestamptz | sí | Desde cuándo cuenta el paro. CHECK: lleno si la detuvo |
| `estado` | text | no | CHECK (`reportada`, `en_reparacion`, `resuelta`). default `reportada` |
| `tecnico_id` | uuid | sí | → `tecnicos.id`. CHECK: lleno en `en_reparacion` |
| `mandada_a_reparacion_en` · `mandada_por` | timestamptz · uuid | sí | |
| `nota_seguimiento` | text | sí | Hasta 200 |
| `resuelta_en` · `resuelta_por` | timestamptz · uuid | sí | CHECK: llenos en `resuelta` |

Lleva las columnas comunes y `xid_escritura`. **Índices:** único (`folio`) · único (`maquina_id`) donde no está resuelta · único (`clave_idempotencia`) donde no es vacía · (`estado`).

## La tabla `servicios`

| Columna | Tipo | Nulo | Qué es |
|---|---|---|---|
| `id` | uuid | no | Llave |
| `folio` | text | no | SM-0018. Único |
| `maquina_id` | uuid | no | → `maquinas.id`; con falla, la de la falla |
| `falla_id` | uuid | sí | → `fallas.id`. Único si viene; vacío es un servicio suelto |
| `tecnico_id` | uuid | no | → `tecnicos.id` |
| `fecha` | date | no | El día en que se guardó |
| `que_se_hizo` | text | no | De 4 a 80 |
| `costo_centavos` | bigint | no | CHECK ≥ 0 |
| `horas_paro` | integer | no | CHECK ≥ 0 |
| `gasto_id` | uuid | sí | → `gastos.id`: el gasto que pidió. Lleva su `@llavePendiente` hasta la fase 17 |

Lleva las columnas comunes; `creado_por` es la cuenta con Mantenimiento y nunca va vacía. **Índices:** único (`folio`) · único (`falla_id`) donde no es vacía · (`maquina_id`).

## La tabla `tecnicos`

| Columna | Tipo | Nulo | Qué es |
|---|---|---|---|
| `id` | uuid | no | Llave |
| `nombre` | text | no | «Técnico o taller». Único sin importar mayúsculas |
| `tercero_id` | uuid | sí | → `terceros.id`: para ligar su factura y su pago |
| `baja_en` · `baja_por` · `motivo_baja` · `reactivado_en` | | sí | |

Lleva las columnas comunes. **Índice:** único (`lower(nombre)`).

## La lista «Áreas del taller»

Este archivo siembra la lista `areas_taller` de [configuración](../admin/configuracion.md): Costura, Ojal y botón, Planchado y Corte. La dueña puede agregar más.

## Acciones

Todas son de la web, con el departamento Mantenimiento, menos el reporte de falla que también llega de la tablet.

### `mantenimiento.alta_maquina`

| | |
|---|---|
| **Pantalla** | Mantenimiento · Máquinas · «Nueva máquina» → ventana · «Dar de alta» |
| **Recibe** | `nombre` (hasta 40) · `tipo_maquina_id`, o `tipo_nuevo` con «Otro tipo» · `area_id` · `marca`, `modelo` y `serie`, opcionales · `persona_id` («La trae») |
| **Reglas y errores** | `400`: «Escribe cómo le dicen en el taller.» · «Escoge el tipo.» · «Escribe el tipo.» · «Escoge el área.» · «¿Quién la trae?»<br>`422 maquina_repetida`: «Ya hay una máquina con ese nombre.»<br>`422 serie_repetida`: «Ya hay una máquina con esa serie.»<br>`422 persona_no_valida`: «¿Quién la trae?» (no es del Taller o está dada de baja)<br>Un tipo nuevo que ya existe usa ese, sin error |
| **Escribe** | El tipo, si es nuevo (regla 3). La máquina con su folio |
| **Llama** | `admin.tomar_folio`, tipo `maquina`, con el prefijo de su tipo |
| **Regresa** | «{máquina} ({folio}) dada de alta en {área}» |
| **Eventos** | `maquina.creada`: baja a la tablet |
| **Bitácora** | «Dio de alta la máquina {nombre} ({folio}) en {área}» |

### `mantenimiento.baja_maquina`

| | |
|---|---|
| **Pantalla** | Mantenimiento · cajón Máquina · «Dar de baja» → ventana «Dar de baja {máquina}» · «Dar de baja» |
| **Recibe** | `maquina_id` · `version` · `motivo` (al menos `general.largo_minimo_motivo`, 5 letras, hasta 120) |
| **Reglas y errores** | `400`: «Escribe el motivo.»<br>`422 maquina_con_falla_abierta`: «{máquina} tiene una falla abierta: resuélvela antes de darla de baja»<br>`422 maquina_ya_de_baja`: «{máquina} ya está dada de baja.» |
| **Escribe** | La baja, con quién y el motivo |
| **Regresa** | «{máquina} dada de baja» |
| **Eventos** | `maquina.dada_de_baja`: sale de la tablet |
| **Bitácora** | «Dio de baja la máquina {nombre} ({folio}): {motivo}» |

### `mantenimiento.cambiar_asignacion_maquina`

| | |
|---|---|
| **Pantalla** | Mantenimiento · cajón Máquina · «Cambiar quién la trae» (pantalla nueva) |
| **Recibe** | `maquina_id` · `version` · `persona_id` |
| **Reglas y errores** | `422 maquina_ya_de_baja`<br>`422 persona_no_valida`: «¿Quién la trae?» |
| **Escribe** | Quién la trae. Una falla abierta conserva a quien la traía al fallar |
| **Regresa** | «{máquina} ahora la trae {persona}» |
| **Eventos** | `maquina.reasignada`: cambia «La tuya» en la tablet y el atorado por máquina |
| **Bitácora** | «Cambió quién trae {máquina}: {antes} → {después}» |

### `mantenimiento.reportar_falla`

| | |
|---|---|
| **Pantalla** | Mantenimiento · «Reportar falla» → ventana Reportar falla. En la tablet, Puerta del taller · «Falla de máquina» → la máquina → qué le pasa |
| **Quién** | En la web, Mantenimiento. En la tablet, la persona que entró con su PIN, por la cola |
| **Recibe** | `maquina_id` · `motivo_falla_id` · `nota`, opcional, hasta 200 (solo en la web). En la tablet, además: `id` (de la tablet) · `sin_internet`; y del sobre, la persona y `ocurrido_en` |
| **Reglas y errores** | Web: `400`: «Escoge la máquina» · «Escoge qué tiene»; `422 maquina_con_falla_abierta`: «{máquina} ya tiene una falla abierta en Mantenimiento»; `422 maquina_ya_de_baja`: «{máquina} está dada de baja.»<br>Tablet: `apartado` si la máquina o el motivo no existen. Si la máquina ya tiene falla abierta o está de baja, se aplica sin crear la falla y el resultado lo dice. Un motivo dado de baja después de bajar a la tablet se acepta |
| **Escribe** | La falla, `reportada`, con su folio, su origen, quién la reportó, quién traía la máquina, la tablet y la clave (si viene de la tablet), su hora y su fecha, si la detuvo (y desde cuándo) y la nota |
| **Llama** | `admin.tomar_folio`, tipo `falla` |
| **Regresa** | La falla, su folio y si la detuvo. En la web: «{FM}: {máquina} parada» o «{FM}: {máquina} trabaja con falla» |
| **Eventos** | `falla.reportada`: Pendientes de Mantenimiento, la salud de los lotes, Dirección y la tablet |
| **Bitácora** | «{persona} reportó falla en {máquina}: {motivo}», con origen `tablet` o `fabrica` |
| **Sin internet** | Sí, en la tablet: si lo último que bajó ya muestra una falla abierta de esa máquina, no crea el comando y dice «Ya está reportada: {lo que le pasa}, {reportada o en reparación} desde el {fecha}»; si no, lo guarda y avisa «Falla de {máquina} guardada en la tablet; llega a Mantenimiento al volver el internet». El folio se ve cuando llega |

### `mantenimiento.mandar_a_reparacion`

| | |
|---|---|
| **Pantalla** | Mantenimiento · cajón Falla · «Mandar a reparación» → ventana «Mandar {máquina} a reparación» |
| **Recibe** | `falla_id` · `version` · `tecnico_id`, o `tecnico_nombre` con «Otro técnico» · `se_queda_parada` |
| **Reglas y errores** | `400`: «Escoge el técnico.» · «Escribe el nombre del técnico o taller.»<br>`422 falla_no_reportada`: «{FM} ya está {en reparación o resuelta}.»<br>`422 tecnico_de_baja`: «Escoge el técnico.»<br>`422 ya_estaba_parada`: «{máquina} ya está parada: sigue así hasta registrar la reparación.» |
| **Escribe** | El técnico, si es nuevo (si ya existe sin importar mayúsculas, se usa ese). La falla: `en_reparacion`, con su técnico, cuándo, quién y si la detuvo; si ahí se para, el paro cuenta desde ahora |
| **Regresa** | «{FM} en reparación con {técnico}» |
| **Eventos** | `falla.en_reparacion` |
| **Bitácora** | «Mandó {FM} a reparación con {técnico}», y «, la máquina queda parada» si aplica |

### `mantenimiento.guardar_nota_seguimiento`

| | |
|---|---|
| **Pantalla** | Mantenimiento · cajón Falla · «Nota de seguimiento» (pantalla nueva) |
| **Recibe** | `falla_id` · `version` · `nota`, hasta 200 (vacía la borra) |
| **Reglas y errores** | `422 falla_resuelta`: «Esa falla ya está resuelta.» |
| **Escribe** | La nota de seguimiento |
| **Regresa** | «Nota guardada en {FM}» |
| **Eventos** | `falla.nota_cambiada` |
| **Bitácora** | «Cambió la nota de seguimiento de {FM}», con la nota en `antes` y `despues` |

### `mantenimiento.registrar_servicio`

| | |
|---|---|
| **Pantalla** | Mantenimiento · cajón Falla · «Registrar reparación» → ventana Reparación · «Marcar resuelta»; y «Registrar servicio» → ventana Registrar servicio |
| **Recibe** | `falla_id` y su `version`, si es una reparación · `maquina_id`, si es suelto · `tecnico_id` · `que_se_hizo` · `costo_centavos` (≥ 0) · `horas_paro` (entero ≥ 0) |
| **Reglas y errores** | `400`: «Escribe qué se hizo» (menos de 4 o más de 80) · «Escribe el costo, puede ser 0» · «Horas enteras, puede ser 0»<br>`422 falla_resuelta`: «Esa falla ya está resuelta.»<br>`422 maquina_ya_de_baja` (suelto) · `422 tecnico_de_baja` |
| **Escribe** | El servicio con su folio, la fecha de hoy, la máquina, el técnico, qué se hizo, el costo y las horas de paro. Con falla: la falla resuelta, con quién y cuándo, y sin nota de seguimiento |
| **Llama** | `admin.tomar_folio`, tipo `servicio` |
| **Regresa** | El servicio y su folio. Reparación: «{máquina} vuelve a trabajar. {n} horas de paro quedan registradas»; suelto: «{SM} registrado» |
| **Eventos** | `servicio.registrado` · `falla.resuelta`, con falla: se quita el atorado por esa máquina; Dirección y la tablet |
| **Bitácora** | Reparación: «Registró la reparación de {máquina} ({FM}): {qué se hizo}, ${costo}, {n} h de paro». Suelto: «Registró el servicio {SM} a {máquina}». Con costo (fase 17), otro renglón con la misma clave: «Registró el gasto {G}: Reparación de máquinas, {monto} ({máquina}, {SM})» |

## Lecturas

### `mantenimiento.fallas_que_detienen()`

| | |
|---|---|
| **La usan** | Producción (el atorado por máquina en la salud de los lotes y en su trabajo de vigilar) y Dirección (sus alertas) |
| **Regresa** | Las fallas abiertas que detuvieron una máquina: su folio, la máquina, quién la trae, qué le pasa, desde cuándo está parada y sus horas de paro |

## Lo que baja a la tablet

| Tabla | Filtro | Columnas |
|---|---|---|
| `maquinas` | Las activas. La que se da de baja baja como `quitar` | `id`, `folio`, `nombre`, `persona_id` |
| `fallas` | Las abiertas | `id`, `maquina_id`, `motivo_falla_id`, `estado`, `hecho_en`, `mandada_a_reparacion_en` |
| `motivos_falla` | Los vigentes | `id`, `nombre`, `detiene_maquina`, `orden` |

Nunca bajan costos, técnicos ni horas de paro.

## Parámetros

Los cambia solo la dueña, en Configuración (ver [configuración](../admin/configuracion.md)).

| Parámetro | Valor inicial | Sección | Para qué |
|---|---|---|---|
| `mantenimiento.costo_hora_paro` | $450 | Decisiones de operación | Lo que cuesta una hora de máquina parada |
| `mantenimiento.responsable_hora_paro` | Mantenimiento (de Mantenimiento, Producción o Dirección) | Decisiones de operación | Quién responde por ese costo. Solo se guarda |
| `mantenimiento.paro_horas_por_dia` | 9 h | Parámetros | Horas de paro por cada día de trabajo |
| `mantenimiento.paro_horas_hoy` | 4 h | Parámetros | Horas de paro que cuenta el día de hoy |
| `mantenimiento.servicio_categoria_gasto` | «Reparación de máquinas» | Parámetros | La categoría del gasto de un servicio. Se siembra en la fase 17, con los gastos |
| `mantenimiento.servicio_ubicacion_gasto` | Taller | Parámetros | La ubicación del gasto de un servicio. Se siembra en la fase 17 |

Usa también `general.dias_de_trabajo` y `general.largo_minimo_motivo`. El campo «Una hora de máquina parada cuesta» de Costo por máquina solo cambia esa pantalla: no se guarda.

## Permisos

- Todo lo de este archivo: Mantenimiento. Reportar una falla, también la tablet.
- Los costos y el paro en pesos no bajan a la tablet.

## Eventos

`maquina.creada` · `maquina.dada_de_baja` · `maquina.reasignada` · `falla.reportada` · `falla.en_reparacion` · `falla.nota_cambiada` · `falla.resuelta` · `servicio.registrado`.

## Lo que llega después

- **Fase 17:** con costo, el servicio pide su gasto con `contaduria.registrar_gasto_mantenimiento` (su categoría, su ubicación, su monto, su fecha, el servicio y la máquina, «máquina {folio}, de mantenimiento») y guarda su `gasto_id` (ver [gastos](../contaduria/gastos.md)).
- **Fase 18:** las alertas de Dirección con el lote que detiene una máquina parada: «{lote} detenido en {operación} desde hace {n} días · {máquina} parada» (ver [alertas e indicadores](../direccion/alertas-e-indicadores.md)).
- **Fase 20:** «Falla de máquina» en la tablet (ver [la tablet](../../apps/tablet.md)).

## Cómo está hecho

*Lo escribe Claude Code al terminar la fase 13.*
