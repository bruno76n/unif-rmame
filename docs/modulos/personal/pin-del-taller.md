# PIN del taller

> **Qué cubre:** el PIN de 4 cifras con el que una persona del Taller entra a la tablet: asignarlo, restablecerlo, el bloqueo a los 5 intentos y el desbloqueo, cuándo se anula solo, cómo se guarda y lo que baja a la tablet.
> **Estado:** Decidido.
> **Se construye en:** [fase 7 ●](../../fases/07-autorizaciones-y-personal.md).
> **Se conecta con:** [personas](personas.md) · [cuentas](../admin/cuentas.md) · [dispositivos](../admin/dispositivos.md) · [acceso y permisos](../../cimientos/ACCESO-Y-PERMISOS.md) · [registros de operación](../produccion/registros-de-operacion.md) · [tablet](../../apps/tablet.md) · [pantallas de Personal](../../interfaz/fabrica/personal.md) · [pantallas de la tablet](../../interfaz/tablet.md)

## Para qué sirve

En la tablet del taller nadie entra con Google: cada persona escoge su nombre y mete su PIN de 4 cifras. La tablet revisa el PIN sin internet. Ejemplo: Personal le asigna PIN a Lupita Ramos; la ventana enseña el PIN una sola vez, cifra por cifra, «Se muestra una sola vez: dáselo en persona.». Si Lupita se equivoca 5 veces, la tablet la bloquea y Personal recibe el aviso para desbloquearla.

## Reglas

1. **Solo para personas activas del Taller sin cuenta de Google,** y solo vale en la tablet registrada del Taller.
2. **Primero el nombre, luego el PIN:** por eso el PIN no tiene que ser único.
3. **El PIN son 4 cifras al azar** de un generador criptográfico, y se muestra una sola vez. Nunca se guarda en claro: solo su hash Argon2id con sal. Un reintento de la acción recibe la respuesta sin el PIN.
4. **A los `personal.pin_intentos_bloqueo` (5) intentos equivocados** la tablet bloquea a la persona y lo manda por su cola. Queda bloqueada hasta que Personal la desbloquea.
5. **Se anula solo** cuando la persona se da de baja, recibe cuenta de Google o sale del Taller. Los anulados también bajan a la tablet, para que dejen de entrar en cuanto sincroniza.
6. **Si la tablet se pierde,** la dueña la revoca y escoge anular todos los PIN del Taller: Personal tiene que dar nuevos.
7. **La sesión de la persona en la tablet se cierra sola** a los `personal.tablet_inactividad_seg` sin tocarla.
8. **El riesgo que se acepta:** 4 cifras son pocas combinaciones, y quien sacara los datos de la tablet podría adivinarlas. Lo que se arriesga es registrar piezas a nombre de otro. Por eso los hashes van cifrados en la tablet y la regla 6 existe.

## Cómo se guarda

- **En el servidor:** Argon2id con sal, con `node:crypto`, con los parámetros mínimos que recomienda OWASP (19 MiB de memoria, 2 pasadas, 1 hilo), que la tablet calcula en menos de un segundo. Se miden en la tablet real en la fase 20.
- **En la tablet:** el hash baja y se guarda cifrado con Web Crypto (AES-GCM, con una llave que no se puede exportar). La tablet calcula Argon2id con hash-wasm para revisar el PIN sin internet (ver [tablet](../../apps/tablet.md)).

## Estados

| De | A | Acción | Quién |
|---|---|---|---|
| sin PIN | `activo` | «Asignar PIN» | Personal |
| `activo` o `bloqueado` | `anulado` (`restablecido`) y uno nuevo `activo` | «Restablecer»: «El anterior ya no entra.» | Personal |
| `activo` | `bloqueado` | 5 PIN equivocados en la tablet; llega por la cola y queda como alerta | La tablet |
| `bloqueado` | `activo` | «Desbloquear»; los intentos vuelven a 0 | Personal |
| `activo` o `bloqueado` | `anulado` (`baja_persona`) | Dar de baja a la persona | Personal |
| `activo` o `bloqueado` | `anulado` (`cuenta_google` o `cambio_area`) | La persona recibe cuenta de Google o sale del Taller | El sistema |
| `activo` o `bloqueado` | `anulado` (`restablecido`) | Se revoca la tablet con «anular los PIN» | La dueña |

## La tabla `pines`

| Columna | Tipo | Nulo | Qué es |
|---|---|---|---|
| `id` | uuid | no | Llave |
| `persona_id` | uuid | no | → `personas.id` |
| `ubicacion_id` | uuid | no | → `ubicaciones.id`: dónde vale. Hoy siempre el Taller |
| `pin_hash` | text | no | Argon2id con sal |
| `estado` | text | no | CHECK (`activo`, `bloqueado`, `anulado`) |
| `intentos_fallidos` | smallint | no | default 0. Lo reporta la tablet |
| `bloqueado_en` | timestamptz | sí | |
| `desbloqueado_en` · `desbloqueado_por` | timestamptz · uuid | sí | |
| `anulado_en` · `anulado_por` | timestamptz · uuid | sí | `anulado_por` vacío si lo anuló el sistema |
| `motivo_anulacion` | text | sí | CHECK (`restablecido`, `baja_persona`, `cuenta_google`, `cambio_area`). Obligatorio con `anulado` |

- Lleva las columnas comunes (`creado_en` es cuando se emitió) y, como baja a la tablet, `xid_escritura`.
- **Único:** (`persona_id`, `ubicacion_id`) donde `estado` es `activo` o `bloqueado`: un PIN vivo por persona.

## Acciones

### `personal.asignar_pin`

| | |
|---|---|
| **Pantalla** | Personal · PIN del taller · «Asignar PIN»; Asistencia · Pendientes · PIN · «Asignar PIN» → ventana «PIN de {persona}» |
| **Quién** | Personal |
| **Recibe** | `persona_id` · uuid · obligatorio |
| **Reglas y errores** | `422 pin_no_aplica`: la persona no está activa, no es del Taller o tiene cuenta, «El PIN solo es para personas activas del Taller sin cuenta de Google.»<br>`422 ya_tiene_pin`: «{persona} ya tiene PIN. Usa «Restablecer».» |
| **Escribe** | El PIN activo en el Taller, solo su hash. Toca el renglón de la persona para que baje a la tablet |
| **Regresa** | El PIN en claro, una sola vez: la ventana lo enseña cifra por cifra con «Se muestra una sola vez: dáselo en persona.» Un reintento recibe `secreto_entregado` sin el PIN, y la ventana dice «El PIN ya se generó. Si no lo viste, usa «Restablecer».» |
| **Eventos** | `pin.asignado`: «hay cambios» en `personas` y `pines` para la tablet |
| **Bitácora** | «Asignó el PIN del taller de {persona}», con el estado (nunca el PIN ni el hash) |

### `personal.restablecer_pin`

| | |
|---|---|
| **Pantalla** | Personal · PIN del taller · «Restablecer» → ventana «PIN de {persona}» con «El anterior ya no entra.» |
| **Quién** | Personal |
| **Recibe** | `persona_id` · `version` (la del PIN vivo) |
| **Reglas y errores** | `422 sin_pin`: «{persona} no tiene PIN. Usa «Asignar PIN».» · `422 pin_no_aplica` |
| **Escribe** | El vivo pasa a anulado (`restablecido`) y nace uno nuevo activo |
| **Regresa** | El PIN nuevo en claro, una sola vez, con «El anterior ya no entra.» |
| **Eventos** | `pin.restablecido`: «hay cambios» en `pines` para la tablet |
| **Bitácora** | «Restableció el PIN del taller de {persona}» |

### `personal.desbloquear_pin`

| | |
|---|---|
| **Pantalla** | Personal · PIN del taller · renglón «Bloqueado» · «Desbloquear»; también desde Pendientes |
| **Quién** | Personal |
| **Recibe** | `persona_id` · `version` |
| **Reglas y errores** | `422 no_esta_bloqueado`: «{persona} no está bloqueada.» |
| **Escribe** | El PIN activo, con sus intentos en 0 y quién y cuándo lo desbloqueó |
| **Regresa** | «{nombre} ya puede entrar con su PIN» |
| **Eventos** | `pin.desbloqueado`: «hay cambios» en `pines` para la tablet |
| **Bitácora** | «Desbloqueó el PIN del taller de {persona}» |

## Acciones internas

### `personal.anular_pin`

| | |
|---|---|
| **La llaman** | `admin.crear_cuenta` y `admin.aplicar_decision_alta_usuario` (`cuenta_google`), `personal.editar_persona` (`cambio_area`), `personal.dar_baja_persona` (`baja_persona`) |
| **Recibe** | `persona_id` · `motivo` · `anulado_por` (vacío si es el sistema) |
| **Reglas** | Sin PIN vivo, no hace nada |
| **Escribe** | El vivo, anulado con su motivo. Toca el renglón de la persona |
| **Regresa** | Si anuló |
| **Eventos** | `pin.anulado`: «hay cambios» en `pines` para la tablet |

### `personal.anular_pines_ubicacion`

| | |
|---|---|
| **La llama** | `admin.revocar_dispositivo` con «anular los PIN» (la tablet perdida) |
| **Recibe** | `ubicacion_id` · `anulado_por` |
| **Escribe** | Todos los PIN vivos de esa ubicación, anulados con `restablecido`. Las personas quedan «Sin PIN» |
| **Regresa** | Cuántos anuló |
| **Eventos** | Un `pin.anulado` con la cuenta |

### `personal.bloquear_pin`

| | |
|---|---|
| **La llama** | `produccion.registrar_bloqueo_pin`, el comando que manda la tablet |
| **Recibe** | `pin_id` · `persona_id` · `intentos` · `ocurrido_en` · `dispositivo_id` |
| **Reglas** | No cambia nada si el PIN ya no está activo, o si Personal lo desbloqueó después de `ocurrido_en` |
| **Escribe** | El PIN bloqueado, con `bloqueado_en` = `ocurrido_en` y sus intentos |
| **Regresa** | El estado del PIN |
| **Eventos** | `pin.bloqueado`: el aviso `pin_bloqueado` a las cuentas con Personal y el pendiente «Tablet · Se bloqueó por 5 PIN equivocados» |

La bitácora, con alerta, la escribe el comando de la tablet.

## Lecturas

### `personal.resumen_pin`

| | |
|---|---|
| **La usa** | La consulta de Asistencia de Personal (los indicadores «Personas» y «PIN del taller» y sus pendientes) |
| **Regresa** | Las personas activas; cuántas no tienen cuenta de Google; las que no tienen PIN (nombre y puesto); los PIN activos; los bloqueados (nombre y desde cuándo) |

## Lo que baja a la tablet

| Tabla | Filtro | Columnas |
|---|---|---|
| `pines` | Ubicación Taller, en todos sus estados | `id`, `persona_id`, `pin_hash`, `estado`, `intentos_fallidos`, `desbloqueado_en` |

## Parámetros

| Parámetro | Valor inicial | Baja a | Para qué |
|---|---|---|---|
| `personal.pin_intentos_bloqueo` | 5 | Tablet | PIN equivocados que bloquean a la persona |
| `personal.tablet_inactividad_seg` | 90 s | Tablet | Sin tocar la tablet en ese tiempo, se cierra la sesión de la persona |

## Permisos

- Asignar, restablecer y desbloquear: Personal.
- Anular todos los PIN del Taller: la dueña, al revocar la tablet.

## Eventos

`pin.asignado` · `pin.restablecido` · `pin.desbloqueado` · `pin.anulado` · `pin.bloqueado`.

## Lo que llega después

- **Fase 12:** el comando `produccion.registrar_bloqueo_pin` de la tablet, que llama a `personal.bloquear_pin`.
- **Fase 20:** la pantalla de la tablet que pide el nombre y el PIN, y la medida de Argon2id en la tablet real.

## Cómo está hecho

*Lo escribe Claude Code al terminar la fase 7.*
