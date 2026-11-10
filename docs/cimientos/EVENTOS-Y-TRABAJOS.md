# Eventos y trabajos

> **Qué cubre:** la bandeja de salida de cada acción (la tabla `eventos`) y cómo se reparte; los avisos en vivo a pantallas y aparatos (SSE); el worker con Graphile Worker; los trabajos programados con su horario en parámetros, y la lista de todos los trabajos del sistema.
> **Estado:** Decidido.
> **Se construye en:** [fase 4](../fases/04-servicios-comunes.md).
> **Se conecta con:** [API](API.md) · [módulos](MODULOS.md) · [arquitectura](ARQUITECTURA.md) · [sincronización](SINCRONIZACION.md) · [avisos](../modulos/admin/avisos.md) · [respaldos](../modulos/admin/respaldos.md) · [existencias y cuadre](../modulos/inventario/existencias-y-cuadre.md) · [lotes](../modulos/produccion/lotes.md) · [impresión](../modulos/admin/impresion.md) · [reservas](../modulos/inventario/reservas.md) · [asistencia](../modulos/personal/asistencia.md) · [entregas a corte](../modulos/inventario/entregas-a-corte.md) · [alertas e indicadores](../modulos/direccion/alertas-e-indicadores.md) · [el puente de impresión](../apps/puente-de-impresion.md) · [la tablet del taller](../apps/tablet.md) · [infraestructura](INFRAESTRUCTURA.md)

## Para qué sirve

Una acción no debe esperar a que salga un correo ni a que se avise a diez pantallas, y si el correo falla la acción no se puede deshacer. Por eso cada acción solo **anota** sus eventos en su misma transacción, y el worker los reparte después: avisos en vivo, avisos a personas y lo que tenga que correr fuera de la transacción. Ejemplo: Dirección autoriza la AU-0028; en la misma transacción queda el evento `autorizacion.decidida`; segundos después, la persona que la pidió ve en su campana «AU-0028 autorizada: …» y la pantalla de Dirección se actualiza sola.

## La tabla `eventos`

La bandeja de salida. Es del módulo `admin` y es técnica: solo cambian las columnas del proceso.

| Columna | Tipo | Nulo | Qué es |
|---|---|---|---|
| `id` | uuid | no | Llave (v7) |
| `tipo` | text | no | `{entidad}.{hecho}`: `autorizacion.decidida`. Cada archivo de tema lista los suyos |
| `modulo` | text | no | El módulo que lo guardó |
| `entidad` · `entidad_id` · `entidad_folio` | text · uuid · text | sí | El documento |
| `datos` | jsonb | sí | Ids y claves para armar avisos. Nunca montos, sueldos ni secretos |
| `tablas` | text[] | no | Las tablas que cambió la acción: lo que viaja en el aviso «hay cambios» |
| `ubicacion_ids` | uuid[] | no | default `'{}'`. Las ubicaciones a cuyos aparatos les toca; vacío es a todos los que bajan esas tablas |
| `usuario_id` · `persona_id` · `dispositivo_id` · `comando_id` | uuid | sí | Quién lo provocó |
| `ocurrido_en` | timestamptz | no | El `ocurrido_en` del comando, o la hora de la acción |
| `procesado_en` | timestamptz | sí | Cuándo lo terminó el worker |
| `intentos` | smallint | no | default 0 |
| `siguiente_intento_en` | timestamptz | sí | |
| `ultimo_error` | text | sí | |
| `creado_en` | timestamptz | no | default `now()` |

- Sin `creado_por`, `version` ni `actualizado_en`.
- **Se parte por mes** (llave `id`, `creado_en`) y se depura a los 90 días (abajo).
- **Índices:** (`creado_en`) donde `procesado_en` es nulo; (`entidad`, `entidad_id`).
- `usuario_id`, `persona_id` y `dispositivo_id` llevan su `@llavePendiente` hasta las fases 5, 7 y 6.

## `admin.guardar_evento` · interna

| | |
|---|---|
| **La llaman** | Todas las acciones, una vez por cada evento de dominio (ver [módulos](MODULOS.md#eventos)) |
| **Recibe** | `tipo` · `modulo` · `entidad`, `entidad_id`, `entidad_folio` · `datos` (ids y claves, nunca montos) · `tablas` · `ubicacion_ids` · quién (`usuario_id`, `persona_id`, `dispositivo_id`, `comando_id`) |
| **Reglas** | Rechaza como error del programa (`500`) unos `datos` con montos o campos marcados como secretos |
| **Escribe** | `eventos`, en la misma transacción, y encola en Graphile Worker la tarea `procesar_eventos` con clave fija, también en la misma transacción: así una sola tarea pendiente procesa todo lo nuevo en cuanto la acción confirma |
| **Regresa** | `evento_id` |

## El worker

Un proceso aparte (`apps/api/src/trabajos.ts`), con Graphile Worker sobre la misma base. Corre en Render como servicio en segundo plano; en local lo levanta `pnpm local`.

### El proceso de la bandeja

La tarea `procesar_eventos` no tiene horario: corre en cuanto hay eventos nuevos.

1. Toma los `eventos` sin `procesado_en` y con `siguiente_intento_en` vencido (o vacío), de 100 en 100, con `FOR UPDATE SKIP LOCKED`.
2. Por cada uno:
   - **avisos en vivo:** `NOTIFY ua_eventos` con su id;
   - **avisos a personas:** si el tipo de evento tiene un tipo de aviso, llama a `admin.crear_aviso` (ver [avisos](../modulos/admin/avisos.md));
   - **trabajo después del evento:** si un módulo registró una tarea para ese tipo (por ejemplo, armar el ZIP del paquete del contador al llegar `paquete_contador.enviado`), la encola. Nunca algo que debía quedar en la misma transacción que la acción.
3. Marca `procesado_en`. Si algo falla: `intentos` + 1 y `siguiente_intento_en` a 1, 5, 30 y 120 minutos, y de ahí cada 120. A los 10 intentos, el aviso `trabajo_fallido` a las cuentas de soporte.

El reloj (abajo) vuelve a encolar `procesar_eventos` cada minuto si hay eventos con reintento vencido. Ningún consumidor depende del orden entre eventos de transacciones distintas.

### Los trabajos programados

1. **Un reloj cada minuto.** Graphile Worker corre la tarea `reloj` cada minuto. El reloj lee el horario de cada trabajo, en hora de México, y encola el que ya toca con una clave de periodo (`cuadre_nocturno:2026-11-09`). El horario sale de sus parámetros cuando lo decide el negocio (el cuadre, el respaldo), y cambiarlo en Configuración vale desde la siguiente vuelta, sin reiniciar nada; un horario que solo es mecánica (abrir la semana a las 00:10) lo dice el archivo del trabajo.
2. **Uno a la vez.** Cada trabajo va en su propia cola de Graphile Worker, así que nunca corren dos vueltas del mismo trabajo al mismo tiempo, aunque haya dos workers.
3. **Repetibles.** Correr dos veces en el mismo periodo no duplica nada. La clave de periodo evita encolarlo dos veces, y cada trabajo dice además cómo sabe que ya corrió.
4. **Transacciones cortas, por tramos.** Una transacción larga frena el tope seguro de la [sincronización](SINCRONIZACION.md) para todos los aparatos.
5. **Si falla,** se reintenta en la siguiente vuelta y manda el aviso `trabajo_fallido` a las cuentas de soporte.
6. **Cada trabajo vive en la carpeta `trabajos/` de su módulo** y se registra con el módulo; su archivo de creación dice su horario, qué lee, qué escribe, qué avisa y cómo es repetible.

### Todos los trabajos

| Trabajo | Cuándo | Su archivo | Fase |
|---|---|---|---|
| Procesar la bandeja de eventos | En cuanto hay eventos | Este archivo | 4 |
| Depurar eventos | Al terminar el cuadre nocturno | Este archivo | 4 (se encola desde la 9) |
| Respaldo semanal | `admin.dia_respaldo_semanal` a `admin.hora_respaldo_semanal` | [respaldos](../modulos/admin/respaldos.md) | 4 |
| Recordatorio de prueba de restauración | Cada día a `admin.hora_recordatorio_respaldo` | [respaldos](../modulos/admin/respaldos.md) | 4 |
| Aparatos sin sincronizar | Cada `admin.minutos_revisar_sincronizacion` | [dispositivos](../modulos/admin/dispositivos.md) | 6 |
| Tope detenido | Cada minuto | [sincronización](SINCRONIZACION.md) | 6 |
| Abrir la semana de asistencia | El primer día laboral de cada semana | [asistencia](../modulos/personal/asistencia.md) | 7 |
| Revisar los códigos de barras que quedan | Cada noche, con los trabajos de la noche | [variantes, códigos y etiquetas](../modulos/catalogo/variantes-codigos-y-etiquetas.md) | 8 |
| Cuadre nocturno | Cada día a `inventario.hora_cuadre` | [existencias y cuadre](../modulos/inventario/existencias-y-cuadre.md) | 9 |
| Rollos sugeridos | Al terminar el cuadre | [entregas a corte](../modulos/inventario/entregas-a-corte.md) | 12 |
| Recalcular proyecciones de Producción | Cada noche a `inventario.hora_cuadre`, antes del cuadre | [lotes](../modulos/produccion/lotes.md) | 12 |
| Vigilar lotes atorados | Cada hora, en días de trabajo | [lotes](../modulos/produccion/lotes.md) | 12 |
| Cuadre de saldos | Cada noche, con el cuadre de inventario | [contador y cuadres](../modulos/contaduria/contador-y-cuadres.md) | 18 |
| Crear el paquete del mes · armar su archivo | El día 1 de cada mes · al llegar `paquete_contador.enviado` | [contador y cuadres](../modulos/contaduria/contador-y-cuadres.md) | 18 |
| Alertas de Dirección | Cada `direccion.minutos_revisar_alertas` y al terminar el cuadre | [alertas e indicadores](../modulos/direccion/alertas-e-indicadores.md) | 18 |
| Vencer reservas | Cada `inventario.minutos_vencer_reservas` | [reservas](../modulos/inventario/reservas.md) | 18 |

El horario exacto y las reglas de cada uno están en su archivo; esta tabla solo los junta para que ninguno se olvide.

### Depurar eventos

| | |
|---|---|
| **Cuándo** | Lo encola el cuadre nocturno al terminar (lo agrega la fase 9) |
| **Qué hace** | Quita los `eventos` procesados de hace más de `admin.dias_guardar_eventos` (90 días), soltando las particiones de los meses viejos |
| **No toca** | `avisos`, `bitacora` ni `comandos_recibidos`: esos se guardan siempre |
| **Repetible** | Quitar lo que ya no está no hace nada |

## Avisos en vivo · `GET /v1/eventos`

- **La conexión:** eventos del servidor (SSE), de una sola vía, con la cookie de la sesión o con la llave del aparato. Un comentario de latido cada 25 segundos y `retry: 5000`.
- **Entre instancias:** cada instancia de la API escucha `LISTEN ua_eventos` y reparte a sus conexiones lo que les toca. El worker es quien hace `NOTIFY`.
- **Son pistas, no datos.** Ningún evento en vivo lleva precios, montos ni sueldos: solo nombres de tablas, ids y textos de aviso. Al conectarse o reconectarse, el cliente no espera que le repitan lo perdido: el aparato baja sus cambios y la pantalla vuelve a pedir su consulta. Si no llega nada, cada aparato pregunta solo cada `sync.intervalo_segundos`.
- **Recorte:** a una sesión solo le llegan las tablas que lee alguno de sus departamentos (lo declara el `permisos.ts` de cada módulo); a un aparato, solo las de su alcance y de sus ubicaciones (`ubicacion_ids`).

| Evento en vivo | Le llega a | Datos | Qué hace el cliente |
|---|---|---|---|
| `hola` | Todos, al conectar | `servidor_en`, `intervalo_segundos`, `version_minima` | Ajusta su intervalo; con versión vieja, actúa como con `426` |
| `cambios` | Pantallas y aparatos a los que toca | `tablas`; opcional `entidad`, `entidad_id` | Aparato: baja sus cambios. Pantalla: vuelve a pedir su consulta si lee esas tablas |
| `aviso` | Las sesiones de la cuenta destinataria | `aviso_id`, `tipo`, `texto`, `enlace` | Lo muestra y sube el conteo de la campana |
| `sesion_cerrada` | Las pantallas de esa sesión | `motivo` | Va a la pantalla de acceso |
| `permisos_cambiados` | Las sesiones de esa cuenta | — | Vuelve a pedir el armazón: el menú cambia al momento |
| `dispositivo_registrado` | La sesión de la dueña que dio el código | `codigo_registro_id`, `dispositivo_id`, `nombre` | Cierra la ventana: «{nombre} registrado con su propia llave» |
| `dispositivo_revocado` | El aparato | — | Deja de bajar, sube su cola y muestra «Este aparato fue revocado» |
| `resincronizar` | El aparato | `motivo` | Pide la foto completa |
| `actualizar` | Pantallas y aparatos | `version_minima` | La web recarga; un aparato se actualiza |
| `impresion` | El programa puente | `trabajo_id` | Pide sus trabajos e imprime |
| `impresion_terminada` | La sesión que pidió imprimir | `trabajo_id`, `resultado`, `texto` | Muestra el aviso |

Este archivo es dueño del mecanismo; cada evento lo produce el archivo de su tema (por ejemplo, `dispositivo_revocado` sale de [dispositivos](../modulos/admin/dispositivos.md)).

## Parámetros

| Parámetro | Valor inicial | Para qué |
|---|---|---|
| `admin.dias_guardar_eventos` | 90 días | Cuánto se guardan los eventos ya procesados |

## Cómo se prueba

- Una acción que falla no deja eventos ni tarea encolada; una que confirma deja los dos.
- El worker procesa un evento una sola vez aunque corran dos workers; uno que falla se reintenta con su espera y a los 10 intentos avisa a soporte.
- Un trabajo con su horario en un parámetro corre a la hora de México que dice el parámetro, una sola vez por periodo, y el cambio de horario vale sin reiniciar.
- Una sesión recibe `cambios` solo de las tablas que leen sus departamentos; ningún evento en vivo lleva montos.

## Cómo está hecho

*Lo escribe Claude Code al terminar la fase 4: dónde quedaron el worker, el reloj, el proceso de la bandeja, el reparto de los avisos en vivo y sus pruebas.*
