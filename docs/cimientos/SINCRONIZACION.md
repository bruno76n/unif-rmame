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

**El aparato** aplica cada página en una transacción local y revisa sus llaves foráneas solo cuando queda al día (sin `hay_mas` y con la ventana siguiente vacía), no a media página ni al terminar una ventana: si un renglón padre cambia mientras baja la ventana, su nuevo número lo pasa a la ventana siguiente y el hijo llega antes que él (decisión 412).

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

**Fase 6, parte 2 · Subir.**

- **La forma** de la subida está en `packages/compartido/src/contratos/sincronizacion.ts`: `cuerpoDeSubida` (`enviado_en`, `pendientes_por_subir` y los `comandos`, cada uno con su clave, su acción, sus datos, `ocurrido_en`, `persona_id` y `codigo_usado`), `respuestaDeComando` y `respuestaDeSubida`. La tablet y la caja usan la misma.
- **La ruta** (`apps/api/src/nucleo/sincronizacion/subir.ts`, `POST /v1/sync/subir`) identifica solo con la llave del aparato (`identificarConLlave`) y revisa la versión de su app; más de `sync.tanda_max_comandos` comandos es `400 validacion`. Recorre los comandos en orden, cada uno en su transacción, y responde lo hecho; un error del servidor corta la tanda con `detenido`. Al final guarda en `dispositivos_sync` la subida, lo que le queda por subir (`pendientes_por_subir` menos lo que tuvo respuesta) y el desfase de su reloj en segundos. El reloj desfasado no aparta nada: la marca para revisión es `desfase_reloj_seg` contra `sync.minutos_reloj_desfasado` (decisión 391).
- **Cada comando** (`nucleo/sincronizacion/comandos.ts`):
  1. toma un candado de transacción sobre su clave (`pg_advisory_xact_lock`), así que dos tandas con la misma clave a la vez esperan una a la otra;
  2. si la clave ya llegó con la misma huella (el SHA-256 de su acción, sus datos, `ocurrido_en`, `persona_id` y `codigo_usado`) contesta su respuesta guardada como `repetido` (o la del apartado, si sigue apartado); con otra huella, `apartado` con `clave_repetida_con_otros_datos`, sin renglón nuevo y con su renglón de bitácora (`admin.subir`, decisión 394);
  3. `aplicarComando` aparta lo que no está en el alcance de su tipo o es solo en línea (`fuera_de_alcance`: el contrato dice en `permiso.cola` qué suben sus aparatos por la cola, decisión 406; también la acción que no existe) y lo que no cumple la entrada del contrato (`mal_formado`, con sus campos);
  4. corre la acción en un `SAVEPOINT` con `aplicarAccion`, el mismo paso del corredor, con `ahora` = `ocurrido_en` y a nombre del aparato y su persona: la bitácora y los eventos llevan esa hora;
  5. si la acción lanza `FaltaDocumento` (`nucleo/http/errores.ts`) se aparta con `falta_documento` y el documento que espera; un error de regla o un `404` se aparta con su código y su mensaje en los avisos (decisión 392); lo demás es del servidor y corta la tanda;
  6. una acción que no cuadra se aplica y regresa su `excepcion` (`SalidaDeAccion.excepcion`), y el comando contesta `excepcion` (así la cancelación tardía);
  7. `guardarComando` escribe su renglón de `comandos_recibidos` con su resultado, su motivo, lo que espera, lo que tocó, su excepción y su respuesta sin secretos y con el recorte común; la carga solo en los apartados y las excepciones, y sin ningún campo con nombre de secreto (decisión 407). Lo que sube por la cola no puede pedir un secreto en su entrada ni llaves libres (un `record`): `definirAccion` lo revisa en el JSON Schema de la entrada, también dentro de uniones.
- **El reintento solo:** después de cada comando que creó o tocó un documento (también un `repetido`, para que una tanda cortada no deje esperando a nadie), `reintentarLosQueEsperaban` corre, en el orden en que pasaron y cada uno en su transacción, los apartados de ese aparato que esperaban ese documento; lo que se aplica también puede ser el documento de otros (decisión 393). `reintentarComando` es el mismo camino que usa `admin.reintentar_comando_apartado`. Si el reintento falla, el comando que trajo el documento se contesta igual y la cola sigue; al empezar cada subida, `reintentarLosQueYaTienenSuDocumento` vuelve a intentar, documento por documento en el orden del primer apartado que espera cada uno, los apartados del aparato cuyo documento ya llegó de un comando suyo aplicado (decisión 409; índice `comandos_recibidos_documento`). Un apartado que al reintentarse se vuelve a apartar por otro motivo guarda el motivo nuevo y, si ya no espera un documento, deja de reintentarse solo (decisión 413).
- **La persona** (paso 4, desde la fase 7): una que no existe se aparta con `persona_desconocida` y su renglón queda sin `persona_id` (lo lleva la carga); una dada de baja o de otra área que la del aparato se aplica con el aviso «{persona} ya está dada de baja…» o «… ya no es de esta área: el aparato tenía la lista vieja.» (decisión 423).
- **Lo que llega después:** la excepción de verdad (`inventario.registrar_excepcion`) llega en la fase 9, y hasta entonces su id lo da la acción (decisión 395). `hay_cambios` dice si algo de la tanda se aplicó.
**Fase 6, parte 3 · Bajar y la foto.**

- **Lo que baja** lo declara cada módulo en su `bajada.ts` (`TablaQueBaja`, en `nucleo/modulos.ts`): la tabla, los tipos de aparato, su orden de dependencias, sus columnas (además de `id`), los campos que calcula el servidor (`calculadas`, en SQL sobre el renglón: bajan con las columnas y entran en el esquema, decisión 424), su filtro en SQL sobre el alias `t` (con el aparato, su tipo y su ubicación) y los parámetros que deciden su filtro. `registrarModulos` las junta por tipo de aparato y las ordena (`registro.bajada`). Hoy bajan a la tablet de `admin` sus parámetros (los de su `baja_a`, generales o de su ubicación) y su propio renglón, sin su llave (`modulos/admin/bajada.ts`); de `personal`, las personas con PIN vivo y los PIN de su ubicación (`modulos/personal/bajada.ts`, ver [PIN del taller](../modulos/personal/pin-del-taller.md#cómo-está-hecho)); el módulo de prueba agrega sus lotes y sus bultos.
- **El cursor** (`nucleo/sincronizacion/cursor.ts`) es JSON en base64url con su HMAC-SHA256; la llave sale de `COOKIE_SECRETO` con HKDF (`llaveDelCursor`, decisión 397), y sin ella la bajada y la foto no existen. Lleva el aparato, la versión del esquema de su tipo (`esquemaDe`: un entero que sale de sus tablas, su orden, sus columnas, el SQL de su filtro y sus parámetros, así que cambia solo cuando un módulo cambia lo que baja, decisiones 398 y 411), cuándo se emitió, el `foto_pedida_en` que vio, la ventana (`desde` y `tope`) y la posición (la tabla y el último `xid_escritura` e `id`).
- **La bajada** (`nucleo/sincronizacion/bajar.ts`, `GET /v1/sync/bajar`) identifica con la llave (`nucleo/sincronizacion/aparato.ts`, lo mismo que la subida). Un cursor que falta, que no pasa la firma, de otro aparato o de otro esquema, más viejo que `sync.dias_cursor_viejo` o con otro `foto_pedida_en` que el de ahora responde solo `requiere_foto` (decisión 399). Si no trae una ventana a medias, abre una de `desde` a `pg_snapshot_xmin(pg_current_snapshot())` (nunca hacia atrás) y recorre sus tablas en orden por (`xid_escritura`, `id`), con `to_jsonb` del renglón y su filtro: lo que cumple baja como `cambio` con sus columnas, lo demás como `quitar`, solo con su id. Regresa hasta `limite` renglones (a lo más `sync.pagina_max_renglones`), `hay_mas`, `rotar_llave` (`leTocaRotarLaLlave`, la misma regla que le dice al puente) y `servidor_en`. Al acabar la ventana, el cursor siguiente empieza en su tope. Guarda en `dispositivos_sync` el `desde` del cursor que mandó el aparato (`cursor_xid`), su esquema y la bajada; sin más que bajar y con `X-Pendientes: 0`, la sincronización completa y limpia el aviso de sin sincronizar.
- **La foto** (`GET /v1/sync/foto`) toma el tope de su primera llamada como inicio y entrega lo vigente que cumple el filtro, tabla por tabla y por id, sin `quitar`. Su `parte` es un cursor firmado; una que no sirve es `400` con «Empieza la foto otra vez.». Al terminar regresa `cursor_bajar`, con `desde` = el inicio y el `foto_pedida_en` que vio al empezar: lo que cambió durante la foto vuelve a bajar, y si se pidió otra foto mientras, la bajada la vuelve a pedir.
- **Los filtros que cambian sin tocar el renglón:** cerrar un lote de prueba toca sus bultos; `admin.cambiar_parametro` pide la foto a los tipos de aparato cuyas tablas nombran ese parámetro (`pedirLaFoto`, en `modulos/admin/dominio/dispositivos.ts`). El aviso en vivo `resincronizar` llega en la parte 4.
- **Los avisos en vivo** de un aparato llevan solo las tablas que le bajan y su ubicación (`alcanceDeLaBajada`, en `api.ts`).
- **Las pruebas:** `bajar.prueba.ts` (el cursor que no sirve: cambiado, ajeno, viejo, de otro esquema; `cambio` con sus columnas y nada más; `quitar` de otra ubicación; `quitar` del que sale del filtro y del que depende de otra tabla, el lote antes que sus bultos; las páginas; el renglón que cambia dos veces baja una; el parámetro que pide la foto; `dispositivos_sync`; `rotar_llave`; el puente sin tablas), `cursor.prueba.ts` (la versión del esquema cambia con las columnas, el orden, el filtro o sus parámetros, también con un filtro que escoge según la ubicación o el tipo del aparato, y se calcula una vez por lista y tipo), `tope.prueba.ts` (dos conexiones: la que tomó su número antes y confirmó después baja en la ventana siguiente; con el tope en `xmax` la prueba se pone en rojo) y `foto.prueba.ts` (lo vigente en orden, sin `quitar` ni llaves; lo que cambia entre páginas baja después; la parte cambiada). El tope es de todo el servidor de Postgres, así que con las demás pruebas en paralelo una ventana puede quedarse corta un momento: las pruebas vuelven a bajar hasta tener lo esperado y miran solo sus renglones (`bajarHasta`, `bajarHastaTener`), como la tablet; por eso el renglón que cambia dos veces puede bajar una vez por cada ventana, siempre con lo último al final.

**Fase 6, parte 4 · El aparato revocado y lo que vigila.**

- **La subida de un aparato revocado** identifica con `permitirRevocado` (solo la subida): lo que ya había llegado sigue siendo `repetido`; lo nuevo no se aplica (`deUnRevocado`, en `comandos.ts`): si pasó antes de revocarlo queda retenido (`resultado` `excepcion`, `dispositivo_revocado`, con su carga, y se contesta `excepcion` con el motivo `dispositivo_revocado`; su excepción en la bandeja de Bodega llega en la fase 9, decisión 402), y si pasó después se aparta con `despues_de_revocar`. La respuesta trae `revocado` y `hay_cambios` en falso. Una tanda con algo nuevo deja una bitácora con alerta (`admin.subir`): «Llegaron {n} movimientos de {nombre} después de revocarlo». La alerta va en la transacción del último comando de la tanda (si la tanda se corta antes, se intenta aparte) y cuenta todo lo llegado del aparato revocado menos lo que ya sumaron las alertas anteriores (cada una guarda sus `movimientos`), con un candado por aparato: tandas a la vez suman exacto, y lo que una alerta no alcanzó a contar lo cuenta la siguiente (decisión 410).
- **Nada de un aparato revocado se reintenta:** ni solo ni a mano (`admin.reintentar_comando_apartado` responde `422 dispositivo_revocado`, decisión 403); el descarte sí.
- **Todo lo demás** (la bajada, la foto, las acciones, las consultas y los avisos en vivo) responde `401 llave_revocada`.
- **`resincronizar`:** `pedirLaFoto` guarda `dispositivo.foto_pedida` con los aparatos, y `admin` les manda `resincronizar` en vivo (decisión 404).
- **El tope detenido** (`nucleo/trabajos/tope-detenido.ts`) corre con el reloj, cada minuto: el tope lleva detenido lo que lleva abierta la transacción más vieja que ya escribió en esta base (`pg_stat_activity`, la de número más viejo); con `sync.minutos_tope_detenido` o más avisa `trabajo_fallido` a soporte, una vez por episodio (la transacción, anotada como vuelta `sync.tope_detenido` en `trabajos_vueltas`, decisión 405).
- **Los avisos en vivo del aparato:** `aparato-en-vivo.prueba.ts` conecta la tablet con su llave y el alcance de su bajada: le llegan los cambios de lo que le baja y no los de lo demás; al revocarla recibe `dispositivo_revocado`, se le corta, y volver a conectarse responde `401 llave_revocada`. La prueba usa un latido largo para que el corte venga del evento: el latido también corta una llave revocada, pero sin el aviso (el aparato lo sabe al reconectarse).
- **Las pruebas:** `revocado.prueba.ts` (retenido, apartado y repetido; la tanda cortada que intenta su alerta aparte y el reenvío que cuenta lo que faltaba; cinco tandas a la vez, cuyas alertas suman exacto; nada se aplica; la tanda repetida no duplica ni vuelve a alertar; el reintento a mano; `401` en la bajada y la foto) y `nucleo/trabajos/tope-detenido.prueba.ts` (sin transacciones, antes del límite, al llegar y una sola vez).

**Las pruebas de la parte 2:** `nucleo/sincronizacion/subir.prueba.ts` (el reintento solo que falla: la cola sigue, el apartado se destraba al empezar la siguiente subida y lo que viene detrás entra; el apartado que se vuelve a apartar por otro motivo guarda el nuevo y deja de reintentarse solo; aplicado con su hora y su persona; `repetido`; `clave_repetida_con_otros_datos`; `fuera_de_alcance`; `mal_formado`; la regla; `excepcion` y `cancelacion_tardia`; `falta_documento` y su reintento solo; `detenido` y el reenvío sin duplicar; el desfase; el `401` y el `400`; el reintento y el descarte a mano) y `azar.prueba.ts` (fast-check, 60 series: tandas de 1 a 4 comandos, respuestas perdidas, tandas cortadas, la misma tanda dos veces a la vez y bultos que llegan antes que su lote; al final cada lote, cada bulto y cada comando una sola vez y ninguno apartado). Las dos usan el módulo de prueba (`prueba_lotes` y `prueba_bultos`, que bajan a la tablet).

**Fase 9, parte 4.** Lo retenido de un aparato revocado abre ya la excepción `dispositivo_revocado`, con `inventario.registrar_excepcion` (`conSuExcepcion`, en `nucleo/sincronizacion/subir.ts`). Su id va en `comandos_recibidos.excepcion_id` y en la respuesta guardada. La dueña lo aplica con `admin.aplicar_comando_retenido`.
