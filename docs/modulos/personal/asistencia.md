# Asistencia

> **Qué cubre:** la asistencia de las personas que cobran por tiempo: la semana de lunes a sábado, los días completo, medio y falta, cerrar la semana para que Contaduría pague, reabrirla, y el trabajo que la abre cada semana.
> **Estado:** Decidido.
> **Se construye en:** [fase 7 ●](../../fases/07-autorizaciones-y-personal.md).
> **Se conecta con:** [personas](personas.md) · [nómina](../contaduria/nomina.md) · [configuración](../admin/configuracion.md) · [paquete compartido](../../cimientos/PAQUETE-COMPARTIDO.md) · [eventos y trabajos](../../cimientos/EVENTOS-Y-TRABAJOS.md) · [pantallas de Personal](../../interfaz/fabrica/personal.md) · [flujo de asistencia y nómina](../../flujos/fabrica/10-asistencia-y-nomina.md)

## Para qué sirve

Quien cobra por tiempo (o mixto) cobra por los días que vino. Personal marca cada día en una cuadrícula y, al terminar la semana, la cierra para que Contaduría pague la nómina el día de pago. Ejemplo: el lunes, Personal marca a Sergio Gómez con ✓; el miércoles salió temprano y queda ½; el sábado la semana está completa y Personal aprieta «Cerrar semana»: «Semana cerrada: contaduría ya puede pagar la nómina».

## Reglas

1. **Solo llevan asistencia** las personas que cobran por tiempo o mixto. Quien cobra por pieza no la lleva.
2. **La semana son los días de trabajo** de `general.dias_de_trabajo` (lunes a sábado al inicio). Un día fuera de ellos no se captura.
3. **Cada día es completo (1), medio (0.5) o falta (0).** Un día sin renglón está «sin capturar» y cuenta 0.
4. **Para cerrar, todos los días exigidos tienen que estar capturados:** por cada persona que cobra por tiempo o mixto, activa en la semana o dada de baja dentro de ella, cada día de trabajo entre su ingreso y su baja.
5. **Una semana cerrada no se cambia.** Solo la dueña la reabre, con motivo, y solo si su nómina no se ha pagado; una pagada se corrige en la siguiente.
6. **Puede haber dos semanas abiertas:** la pasada, hasta que Personal la cierre antes del día de pago, y la que corre.
7. **Cambiar un día ya capturado deja su bitácora,** con el antes y el después. La primera captura no.

## La tabla `asistencia_semanas`

| Columna | Tipo | Nulo | Qué es |
|---|---|---|---|
| `id` | uuid | no | Llave |
| `fecha_inicio` | date | no | El primer día de trabajo. Único |
| `fecha_fin` | date | no | El último día de trabajo, según `general.dias_de_trabajo` |
| `estado` | text | no | CHECK (`abierta`, `cerrada`). default `abierta` |
| `cerrada_en` · `cerrada_por` | timestamptz · uuid | sí | |
| `reabierta_en` · `reabierta_por` · `motivo_reapertura` | | sí | La última reapertura |

Lleva las columnas comunes.

## La tabla `asistencia_dias`

Un día capturado de una persona.

| Columna | Tipo | Nulo | Qué es |
|---|---|---|---|
| `id` | uuid | no | Llave |
| `asistencia_semana_id` | uuid | no | → `asistencia_semanas.id` |
| `persona_id` | uuid | no | → `personas.id` |
| `fecha` | date | no | Dentro de la semana. Único con `persona_id` |
| `valor` | text | no | CHECK (`completo`, `medio`, `falta`) |
| `origen` | text | no | CHECK (`personal`, `tienda`) |
| `capturado_por` | uuid | sí | → `usuarios.id`. Vacío si vino de la tienda |
| `valor_tienda` | text | sí | CHECK (`completo`, `medio`, `falta`): lo que dio la tienda, aunque Personal lo cambie |
| `cambiado_en_personal` | boolean | no | default false. Verdadero si Personal cambió un día que venía de la tienda |
| `entrada_en` · `salida_en` | timestamptz | sí | La entrada y la salida que anotó la tienda |

Lleva las columnas comunes.

## Acciones

### `personal.cambiar_dia_asistencia`

| | |
|---|---|
| **Pantalla** | Personal · Asistencia · cuadrícula · un día (✓ → ½ → F → ✓; uno vacío pasa a ✓). La pantalla manda el valor que queda |
| **Quién** | Personal |
| **Recibe** | `persona_id` · `fecha` · `valor` (`completo`, `medio` o `falta`). Todos obligatorios. `version`: la del día, si ya existía |
| **Reglas y errores** | `422 semana_cerrada`: «La semana del {semana} ya está cerrada: la tiene contaduría»<br>`422 dia_no_laboral`: «{día} no es día laboral»<br>`422 persona_sin_asistencia`: «{persona} cobra por pieza: no lleva asistencia»<br>`422 antes_de_ingreso`: «{persona} entró el {fecha}»<br>`422 despues_de_baja`: «{persona} se dio de baja el {fecha}» |
| **Escribe** | El día: lo crea con origen `personal` o cambia su valor. Si venía de la tienda, `cambiado_en_personal`; `valor_tienda` no cambia. Crea la semana si el trabajo todavía no la abrió |
| **Eventos** | `asistencia.cambiada`: el indicador y el pendiente de Personal, y la nómina de Contaduría, en vivo |
| **Bitácora** | Si el día ya estaba capturado: «Cambió la asistencia de {persona} del {día}: {antes} → {después}», más «(venía del turno del POS)» si venía de la tienda |

### `personal.cerrar_semana_asistencia`

| | |
|---|---|
| **Pantalla** | Asistencia · «Cerrar semana»; Pendientes · Asistencia · «Cerrar asistencia» |
| **Quién** | Personal |
| **Recibe** | `asistencia_semana_id` · `version` |
| **Reglas y errores** | `422 dias_sin_capturar`: «Falta 1 día por capturar» o «Faltan {n} días por capturar», con la persona y la fecha del primer día vacío, para poner ahí el foco<br>`422 semana_ya_cerrada`: «La semana del {semana} ya está cerrada»<br>`422 semana_sin_terminar`: «La semana del {semana} termina el {fecha}: ciérrala desde ese día» |
| **Escribe** | La semana cerrada, con quién y cuándo. Sus días quedan bloqueados |
| **Llama** | `contaduria.crear_nomina_semana` |
| **Regresa** | «Semana cerrada: contaduría ya puede pagar la nómina» |
| **Eventos** | `asistencia_semana.cerrada`: el pendiente de Contaduría pasa a «Por pagar» |
| **Bitácora** | «Cerró la asistencia del {semana}» |

### `personal.reabrir_semana_asistencia`

| | |
|---|---|
| **Pantalla** | Asistencia · «Semanas cerradas» · «Reabrir semana», solo para la dueña |
| **Quién** | Personal · `solo_duena` |
| **Recibe** | `asistencia_semana_id` · `motivo` · `version`. Todos obligatorios |
| **Reglas y errores** | `400`: «Escribe el motivo»<br>`422 nomina_pagada`: «La nómina del {semana} ya se pagó: la semana ya no se reabre. Corrige en la siguiente»<br>`422 semana_abierta`: «La semana del {semana} está abierta» |
| **Escribe** | La semana abierta otra vez, con quién, cuándo y su motivo. Su nómina sigue por pagar, pero no se paga hasta que se vuelva a cerrar |
| **Llama** | `contaduria.estado_nomina_semana` (fase 17) |
| **Regresa** | «Semana del {semana} reabierta» |
| **Eventos** | `asistencia_semana.reabierta` |
| **Bitácora** | «Reabrió la asistencia del {semana}: {motivo}» |

## Lecturas

### `personal.dias_de_semana`

| | |
|---|---|
| **La usa** | La ficha de la persona en Personal |
| **Regresa** | Sus días de la semana que corre |

### `personal.asistencia_para_nomina(semana)`

Se construye en la [fase 17](../../fases/17-contaduria-por-pagar-facturas-gastos-y-nomina.md), con la nómina.

| | |
|---|---|
| **La usa** | Contaduría, para la cuenta de la nómina y al pagarla (ver [nómina](../contaduria/nomina.md)) |
| **Regresa** | La semana: su inicio, su fin y si está cerrada; las semanas anteriores que siguen abiertas; y cada persona que lleva asistencia en ella (regla 4) con sus días contados (regla 3), solo entre su ingreso y su baja |

## Trabajos

### Abrir la semana

| | |
|---|---|
| **Cuándo** | El primer día de trabajo de cada semana, a las 00:10, hora de México |
| **Lee** | `general.dias_de_trabajo` |
| **Escribe** | La semana nueva, con su inicio y su fin |
| **Repetible** | Si la semana ya existe, no hace nada |

## Parámetros

Los días de trabajo son `general.dias_de_trabajo`, de [configuración](../admin/configuracion.md). Este archivo no tiene parámetros propios.

## Permisos

- Capturar y cerrar: Personal.
- Reabrir: solo la dueña.

## Eventos

`asistencia.cambiada` · `asistencia_semana.cerrada` · `asistencia_semana.reabierta`.

## Lo que llega después

- **Fase 17:** cerrar la semana llama a `contaduria.crear_nomina_semana`, y reabrirla revisa con `contaduria.estado_nomina_semana` que su nómina no esté pagada; hasta entonces, cerrar solo deja la semana cerrada y su evento. Con la nómina llega también la lectura `personal.asistencia_para_nomina`.
- **Con el POS:** los días que da la tienda al abrir y cerrar turno y con «Registrar salida» (con sus ligas al turno y al reporte del día), y el parámetro `personal.horas_dia_completo` (vacío al inicio), que propone medio día cuando las horas del turno no llegan a esa cifra.

## Cómo está hecho

*Lo escribe Claude Code al terminar la fase 7.*
