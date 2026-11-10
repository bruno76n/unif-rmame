# Sincronización

> **Qué cubre:** cómo trabajan los aparatos sin internet: subir su cola en orden y en tandas (aplicado, repetido, apartado, excepción), bajar sus cambios con cursor sobre `xid_escritura` hasta un tope seguro, la foto completa, el aparato revocado, lo que puede y lo que baja cada aparato, y el reloj de los aparatos.
> **Estado:** Decidido.
> **Se construye en:** [fase 6 ●](../fases/06-dispositivos-y-sincronizacion.md).
> **Se conecta con:** [dispositivos](../modulos/admin/dispositivos.md) · [idempotencia y concurrencia](IDEMPOTENCIA-Y-CONCURRENCIA.md) · [base de datos](BASE-DE-DATOS.md) · [eventos y trabajos](EVENTOS-Y-TRABAJOS.md) · [excepciones](../modulos/inventario/excepciones.md) · [tablet](../apps/tablet.md) · [acceso y permisos](ACCESO-Y-PERMISOS.md) · [API](API.md) · [arquitectura](ARQUITECTURA.md) · [registros de operación](../modulos/produccion/registros-de-operacion.md) · [máquinas, fallas y servicios](../modulos/mantenimiento/maquinas-fallas-y-servicios.md) · [el puente de impresión](../apps/puente-de-impresion.md) · [seguridad](SEGURIDAD.md)

## Para qué sirve

La tablet del taller (y después la caja de cada tienda) tiene que seguir trabajando aunque se caiga el internet. Guarda lo que pasa en su cola, en orden, y lo sube cuando hay red; baja lo que cambió en el servidor y le toca. Nada se duplica, nada se pierde y nada se rechaza por haber llegado tarde. Ejemplo: la tablet se queda sin wifi a media mañana; Lupita registra tres bultos del L-2026-122; a la una vuelve la red, la tablet sube los tres registros en una tanda y el servidor los aplica con la hora en que de verdad pasaron.

## Reglas

1. **El servidor acepta todo lo que ya pasó.** Solo aparta lo repetido con otros datos y lo mal formado. Nunca rechaza por existencia, precio, reserva ni versión: si no cuadra, lo aplica y abre una excepción.
2. **Cada comando es su propia transacción** y lleva su clave de idempotencia. Un reintento contesta lo mismo que la primera vez (ver [idempotencia](IDEMPOTENCIA-Y-CONCURRENCIA.md)).
3. **El día de negocio sale de cuándo pasó** (`ocurrido_en`, la hora del aparato), en hora de México; el servidor guarda además cuándo lo recibió.
4. **Cada aparato baja solo lo suyo**, hasta un tope seguro que nunca se salta un cambio.
5. **Un apartado no detiene la cola:** se ve en Administración del sistema → Dispositivos y la cola sigue.
6. **Un aparato revocado sigue subiendo su cola** hasta vaciarla: nada se pierde (ver abajo).
7. **Los avisos en vivo son pistas:** si no llegan, cada aparato pregunta solo cada `sync.intervalo_segundos`.

## Lo que puede cada aparato

| Tipo | Sube | Baja | Sin internet |
|---|---|---|---|
| `tablet_taller` | Las acciones de la tablet del módulo `produccion` (registros de operación, fallas, consumibles, bloqueos de PIN) | Lotes en proceso, bultos, flujos, operaciones, registros, máquinas, fallas abiertas, motivos de falla, consumibles; las personas del Taller con PIN y sus hashes; sus parámetros; su propio renglón. Nunca precios, costos ni sueldos (las tarifas solo si `produccion.tarifa_visible_tablet` dice que se muestran) | Sí |
| `telefono_escanear` | Las acciones web de Aduana, con la sesión de quien escanea | Nada: lee con las consultas de Aduana | No |
| `puente_impresion` | `admin.confirmar_impresion` | Sus trabajos y las etiquetas en ZPL | No |
| `credencial_servidor` | Las acciones del sitio de Tienda en línea: `linea.recibir_pedido` y `linea.confirmar_pago` (fase 18); lo demás, con uniformame.mx | Nada por sincronización | — |
| `computadora_tienda` (con el POS) | Las acciones de la caja de los módulos `inventario` y `tiendas`, siempre de su tienda | Catálogo con precios de mostrador y mayoreo, lo de su tienda, sus cortes, su gente, sus códigos, sus parámetros y listas, la empresa. Nunca costos ni la otra tienda: lo que hay en las demás ubicaciones lo pregunta en vivo, con internet, con «¿Dónde hay?», que solo regresa las piezas libres de cada ubicación, sin documentos ni folios | Sí |

El servidor revisa el alcance en cada comando y en cada consulta: fuera de alcance, `403 fuera_de_alcance` o, en la subida, `apartado`. Cada archivo de tema dice en «Lo que baja a la tablet» qué tablas suyas bajan, con su filtro y sus columnas.

## Subir · `POST /v1/sync/subir`

**Lo que manda el aparato:**

| Campo | Tipo | Qué es |
|---|---|---|
| `enviado_en` | momento | La hora del aparato al mandar la tanda, para medir su reloj |
| `pendientes_por_subir` | entero | Lo que le queda en la cola, contando esta tanda |
| `comandos` | lista | De 1 a `sync.tanda_max_comandos`, **en el orden en que pasaron** |
| · `clave_idempotencia` | uuid | La hizo el aparato al guardar el comando |
| · `accion` | texto | `modulo.accion`, de su alcance |
| · `datos` | objeto | Con la forma del contrato de esa acción |
| · `ocurrido_en` | momento | Cuándo pasó, con la hora del aparato |
| · `persona_id` | uuid | Quien registra (o quien cobra, en la caja) |
| · `codigo_usado` | opción | Solo en la caja |

Los comandos de un aparato no llevan `version`: lo que ya pasó no se rechaza por pisadas.

**Cómo lo procesa el servidor:**

1. Revisa la llave (si está revocada, abajo) y la versión de la app (`426`).
2. Recorre los comandos uno por uno, en el orden en que llegan, cada uno en su transacción:
   1. **¿Ya llegó?** Con la misma huella: `repetido`, con la respuesta guardada. Con otro contenido: `apartado` con `clave_repetida_con_otros_datos` (sin renglón nuevo; queda en la bitácora).
   2. **¿Está en su alcance?** Si no: `apartado`, `fuera_de_alcance`.
   3. **¿Cumple su forma?** Si no: `apartado`, `mal_formado`, con sus campos.
   4. **¿Existe la persona?** Si no: `apartado`, `persona_desconocida`. Si es de otra área o ya tiene baja, se aplica con aviso: el aparato tenía la lista vieja.
   5. **¿Existe el documento al que apunta?** Si no y la acción lo pide: `apartado`, `falta_documento`, con el documento que espera. Se reintenta solo cuando llegue (ver [dispositivos](../modulos/admin/dispositivos.md)).
   6. **Aplica la acción** con la regla de lo que ya pasó. Si algo no cuadra, aplica igual, abre la excepción con `inventario.registrar_excepcion` y contesta `excepcion`. Cada acción dice qué más aparta y qué abre excepción.
   7. **Guarda** su renglón de `comandos_recibidos` (con su carga si se apartó), su bitácora y sus eventos, en la misma transacción.
   8. **Si la transacción falla por algo del servidor** (no del comando), corta la tanda y responde lo ya hecho con `detenido`. El aparato vuelve a mandar desde el primero sin respuesta.
3. Guarda en `dispositivos_sync` la subida, lo pendiente y el desfase de su reloj (la hora de recibido menos `enviado_en`).

El aparato no manda la siguiente tanda hasta tener la respuesta de la anterior.

**La respuesta** (`200` siempre que la llave valga, aunque haya apartados):

| Campo | Qué es |
|---|---|
| `respuestas` | Una por comando, en el mismo orden: su clave, `resultado` (`aplicado`, `repetido`, `apartado` o `excepcion`), lo que creó o tocó (con su folio si lo dio el servidor), las excepciones que abrió, el motivo si se apartó, los campos si estaba mal formado y los avisos |
| `detenido` | La tanda se cortó por un error del servidor |
| `revocado` | La llave está revocada |
| `hay_cambios` | Hay algo nuevo que bajar |

**Una cancelación que llega tarde** (la de algo que el otro lado ya atendió) responde `excepcion` con `cancelacion_tardia`, no `apartado`: la cola sigue, el aparato baja el estado real y Bodega lo resuelve.

## Bajar · `GET /v1/sync/bajar?desde={cursor}&limite={n}`

**El tope seguro.** Toda tabla que baja a un aparato lleva `xid_escritura`, el número de la transacción que escribió el renglón (ver [base de datos](BASE-DE-DATOS.md#columnas-comunes)). El tope es `pg_snapshot_xmin(pg_current_snapshot())`: toda transacción con un número menor ya terminó, así que lo escrito por debajo es final. Una ventana entrega los renglones desde el cursor del aparato y por debajo del tope.

**Por qué no con `version`:** la versión se toma dentro de la transacción. Una que toma una versión baja y termina después que otra con versión alta quedaría detrás del cursor, y ese renglón nunca bajaría. Con el número de transacción y el tope eso no pasa. Un renglón que cambia otra vez toma un número nuevo y vuelve a bajar.

**Cómo procesa:**

1. Revisa el cursor: va firmado por el servidor con el aparato, la ventana, la posición y la versión del esquema de sincronización. Si no sirve, responde solo `requiere_foto`.
2. Si el cursor no trae una ventana a medias, abre una nueva: de su `desde` al tope de este momento.
3. Recorre las tablas de ese tipo de aparato en el orden de dependencias que fija el servidor (el catálogo antes que lo que lo usa; las personas antes que sus PIN), por (`xid_escritura`, `id`):
   - el renglón que cumple el filtro del aparato baja como `cambio`, con las columnas que le tocan;
   - el que cambió y ya no lo cumple baja como `quitar`, solo con su id. El aparato ignora el `quitar` de lo que no tiene.
4. Regresa hasta `limite` renglones (a lo más `sync.pagina_max_renglones`).
5. Guarda en `dispositivos_sync` el cursor que mandó el aparato (lo que ya aplicó) y la bajada. Si ya no hay más y el aparato dijo `X-Pendientes: 0`, pone la sincronización completa y limpia el aviso de sin sincronizar.

**La respuesta:** `cambios` (`{ tabla, op: cambio | quitar, id, datos }`), el `cursor` opaco, `hay_mas`, `requiere_foto`, `rotar_llave` (ya le toca cambiar su llave) y `servidor_en`.

**Pide foto** (`requiere_foto`) cuando no hay cursor, el cursor está mal o es de otro aparato, es de hace más de `sync.dias_cursor_viejo`, la app trae otro esquema de sincronización, o el servidor la pidió.

**El aparato** aplica cada página en una transacción local y revisa sus llaves foráneas al terminar la ventana, no a media página.

**Las transacciones cortas importan:** una transacción abierta frena el tope para todos los aparatos. Por eso la base lleva `idle_in_transaction_session_timeout` y los trabajos van por tramos.

## Filtros que cambian sin tocar el renglón

Un renglón puede entrar o salir del alcance de un aparato por algo que vive en otra tabla (una persona baja a la tablet porque recibió PIN) o por un parámetro (`produccion.tarifa_visible_tablet`). Como ese renglón no cambió, la bajada no lo vería. La regla para todos los módulos:

- **si la condición vive en otra tabla,** la acción que la cambia toca también los renglones afectados (les sube su `version` y su `xid_escritura`), para que bajen o se quiten;
- **si la condición es un parámetro,** el servidor pone `foto_pedida_en` a esos aparatos y les manda `resincronizar`.

Cada archivo de tema revisa sus filtros con esta regla.

## Foto · `GET /v1/sync/foto?parte={cursor}&limite={n}`

1. La primera llamada toma el tope de ese momento como inicio.
2. Entrega todos los renglones vigentes que cumplen el filtro del aparato, tabla por tabla en el orden de dependencias, por id, en páginas. No manda `quitar`.
3. En la caja, la primera página trae, por cada folio que pone el aparato, el siguiente número, para que una caja que se repone siga la numeración.
4. Al terminar regresa `cursor_bajar` = el inicio: el aparato sigue bajando desde ahí, y lo que cambió durante la foto vuelve a bajar.
5. El aparato reemplaza el contenido de esas tablas con la foto, pero **no toca** su cola sin subir ni lo que nació en él y todavía no regresa del servidor.

## El aparato revocado

- **Al subir:** lo que pasó antes de revocarlo (`ocurrido_en` anterior a la revocación) no se aplica: queda retenido en `comandos_recibidos` con `dispositivo_revocado`, abre la excepción `dispositivo_revocado` con su carga y se contesta `excepcion`. Lo que pasó después se contesta `apartado`, con `despues_de_revocar`. Lo que ya había llegado antes de revocar sigue siendo `repetido`. La respuesta trae `revocado`. Una bitácora por tanda, con alerta: «Llegaron {n} movimientos de {nombre} después de revocarlo».
- **Todo lo demás** (bajar, foto, avisos en vivo, consultas): `401 sin_sesion`, `llave_revocada`, «Este aparato fue revocado: ya no entra.»
- **El aparato** deja de bajar, muestra el aviso y sigue subiendo su cola hasta vaciarla.
- **Después,** la dueña aplica cada movimiento retenido o Bodega resuelve la excepción sin aplicarlo (ver [dispositivos](../modulos/admin/dispositivos.md)).

## El reloj de los aparatos

Si la hora de un aparato se aleja más de `sync.minutos_reloj_desfasado` de la del servidor, el comando se aplica igual y queda marcado para revisión en Dispositivos. La misma cifra sirve para la tablet y para la caja.

## El tope detenido

Un trabajo revisa cada minuto si el tope seguro avanzó. Si no avanza en `sync.minutos_tope_detenido`, avisa `trabajo_fallido` a soporte: hay una transacción abierta que frena a todos los aparatos.

## Parámetros

| Parámetro | Valor inicial | Baja a | Para qué |
|---|---|---|---|
| `sync.intervalo_segundos` | 60 s | Tablet y caja | Cada cuánto pregunta un aparato si no le llegó un aviso en vivo |
| `sync.tanda_max_comandos` | 200 | Tablet y caja | Comandos por tanda al subir |
| `sync.pagina_max_renglones` | 2000 | — | Renglones por página al bajar y en la foto |
| `sync.dias_cursor_viejo` | 30 días | — | Un cursor más viejo pide foto |
| `sync.minutos_reloj_desfasado` | 10 min | — | Desfase del reloj que se marca para revisión |
| `sync.minutos_tope_detenido` | 10 min | — | Tope sin avanzar: aviso a soporte |

Todos van en la sección `tecnico`.

## Cómo se prueba

- Con datos al azar (fast-check): cualquier orden de tandas, respuestas perdidas, tandas cortadas y reintentos deja la base igual que sin fallas, sin duplicados ni pérdidas.
- Una transacción que toma su número antes y confirma después que otra no se salta: su renglón baja en la siguiente ventana.
- Un renglón que sale del filtro baja como `quitar`; un parámetro que cambia el filtro pide foto.
- Un aparato revocado no baja nada y lo que sube queda retenido o apartado, según cuándo pasó.
- La foto no toca la cola sin subir.

## Cómo está hecho

*Lo escribe Claude Code al terminar la fase 6.*
