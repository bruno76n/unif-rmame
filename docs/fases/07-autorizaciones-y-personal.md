# Fase 07: Autorizaciones y Personal ●

> **Etapa:** Módulos.
> **Estado:** Terminada.
> **Antes de empezar:** lee la [forma de trabajo](../trabajo/FORMA-DE-TRABAJO.md) y la [revisión de fase](../trabajo/REVISION-DE-FASE.md).
> **Se conecta con:** [fases](FASES.md) · [fase 6](06-dispositivos-y-sincronizacion.md) · [fase 8](08-catalogo.md)

## Objetivo

Dirección decide las autorizaciones una sola vez, con el efecto que registra cada módulo; Personal lleva a las personas, su PIN del taller, su asistencia y las tarifas por operación; y las cuentas quedan completas con la persona de verdad detrás.

## Depende de

- [Fase 6](06-dispositivos-y-sincronizacion.md), terminada y en verde.

## Qué se construye

### Parte 1 · Autorizaciones

**Construye:** la tabla `autorizaciones` con sus únicos parciales; `direccion.pedir_autorizacion` y `direccion.cancelar_autorizacion`; `direccion.decidir_autorizacion` con «Confirmar con Google», sus tres pantallas de origen y «Pedida por ti»; el registro de efectos por tipo, con el del alta de usuario conectado.

**Leer:**
- [autorizaciones](../modulos/direccion/autorizaciones.md) — los tipos, la tabla y las acciones.
- [módulos](../cimientos/MODULOS.md#puntos-de-extensión) — cómo cada módulo registra el efecto de su tipo.

### Parte 2 · Personas

**Construye:** la tabla `personas`; `personal.dar_alta_persona`, `personal.editar_persona`, `personal.dar_baja_persona` y `personal.reactivar_persona`, con el recorte del pago por día; la lectura `personal.entra_al_sistema`; lo que baja a la tablet. Las llaves pendientes hacia `personas` de las fases anteriores se agregan.

**Leer:**
- [personas](../modulos/personal/personas.md) — las reglas, la tabla y las acciones.

### Parte 3 · El PIN del taller

**Construye:** la tabla `pines`; `personal.asignar_pin`, `personal.restablecer_pin` y `personal.desbloquear_pin`, con el PIN que se muestra una sola vez; las internas `personal.anular_pin`, `personal.anular_pines_ubicacion` y `personal.bloquear_pin`; la lectura `personal.resumen_pin`; Argon2id con `node:crypto`; lo que baja a la tablet.

**Leer:**
- [PIN del taller](../modulos/personal/pin-del-taller.md) — las reglas, cómo se guarda y lo que baja.

### Parte 4 · Lo que faltaba de las cuentas y los aparatos

**Construye:** `admin.pedir_cuenta`, `admin.aplicar_decision_alta_usuario` y `admin.cerrar_cuenta_de_persona`; la revisión de la persona en `admin.crear_cuenta` y la anulación de su PIN; la anulación de los PIN al revocar la tablet.

**Leer:**
- [cuentas](../modulos/admin/cuentas.md) — las acciones y la sección «Lo que llega después».
- [dispositivos](../modulos/admin/dispositivos.md#adminrevocar_dispositivo) — revocar la tablet con «anular los PIN».

### Parte 5 · Asistencia y tarifas

**Construye:** las tablas `asistencia_semanas` y `asistencia_dias`; `personal.cambiar_dia_asistencia`, `personal.cerrar_semana_asistencia` y `personal.reabrir_semana_asistencia`; la lectura `personal.dias_de_semana`; el trabajo que abre la semana. La tabla `tarifas_operacion`, `personal.poner_tarifa_operacion`, la interna `personal.copiar_tarifas_flujo` y la lectura `personal.tarifa_vigente`.

**Leer:**
- [asistencia](../modulos/personal/asistencia.md) — los días, el cierre y el trabajo.
- [tarifas](../modulos/personal/tarifas.md) — la tarifa vigente y su historia.

## Cómo se construye

- Un solo agente, una parte a la vez.
- Cada acción que maneja sueldos o tarifas se prueba con y sin «ven sueldos y tarifas».
- No va en esta fase: los efectos de las demás autorizaciones (cada uno llega con su módulo), las pantallas ni la tablet.

## Excepciones permitidas

- Las tarifas apuntan a `flujo_operaciones`, que llega en la fase 12: `flujo_operacion_id` lleva su `@llavePendiente`, y las llamadas con Producción (validar la operación, poner la tarifa a los registros, copiar al crear un flujo) las agrega la fase 12.
- Cerrar la semana de asistencia llama a `contaduria.crear_nomina_semana` desde la fase 17.
- El bloqueo de PIN que manda la tablet (`produccion.registrar_bloqueo_pin`) llega en la fase 12; aquí `personal.bloquear_pin` se prueba directo.

## Criterios de terminado

| Criterio | Prueba que lo demuestra |
|---|---|
| Una autorización se decide una sola vez, con «Confirmar con Google»; rechazar pide motivo; el alta de usuario solo la decide la dueña; desde Bodega y Administración, solo lo que les toca | `modulos/direccion/acciones/decidir-autorizacion.prueba.ts` |
| Si el efecto del módulo de origen falla, no se decide nada; si pasa, la decisión y el efecto quedan en la misma transacción, con un solo renglón de bitácora | La misma prueba, con un efecto de prueba |
| Un documento no puede tener dos autorizaciones esperando; uno que se cancela cancela la suya | `modulos/direccion/internas/pedir-autorizacion.prueba.ts` |
| Quien pide y decide la misma autorización ve «Pedida por ti» y la bitácora lo dice | La prueba de decidir |
| El pago por día no viaja ni se cambia sin «ven sueldos y tarifas», y abrir la ficha queda como consulta sensible | `modulos/personal/acciones/editar-persona.prueba.ts` y su consulta |
| Dar de baja a una persona anula su PIN y le quita la cuenta (o cancela su solicitud) en la misma transacción; la persona de la dueña no se da de baja | `modulos/personal/acciones/dar-baja-persona.prueba.ts` |
| Nadie de tienda recibe cuenta, y no se pasa a tienda a alguien con cuenta | `modulos/admin/acciones/crear-cuenta.prueba.ts` y la de editar persona |
| El PIN se muestra una sola vez, se guarda solo como hash Argon2id, el reintento no lo repite, y nunca aparece en la bitácora ni en un evento | `modulos/personal/acciones/asignar-pin.prueba.ts` |
| Un bloqueo que llega después de que Personal desbloqueó no vuelve a bloquear | `modulos/personal/internas/bloquear-pin.prueba.ts` |
| Revocar la tablet con «anular los PIN» deja a todo el Taller sin PIN, y los anulados bajan a la tablet | `modulos/admin/acciones/revocar-dispositivo.prueba.ts` |
| Una semana no se cierra con días exigidos sin capturar; cerrada no se cambia; solo la dueña la reabre y nunca con la nómina pagada | `modulos/personal/acciones/cerrar-semana-asistencia.prueba.ts` y `reabrir-semana-asistencia.prueba.ts` |
| La tarifa nueva cierra la vigente; una tarifa en cero no se acepta; una tarifa no viaja sin el permiso | `modulos/personal/acciones/poner-tarifa-operacion.prueba.ts` |

## Revisión de fase

Delicada ●: tres [auditores](../../.claude/agents/auditor.md), cada uno con su tema, y el [desmentidor](../../.claude/agents/desmentidor.md):

- **permisos y datos personales** (las autorizaciones, las personas, el recorte de sueldos);
- **secretos** (el PIN y su hash);
- **dinero** (el pago por día y las tarifas).
