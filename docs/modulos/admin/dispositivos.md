# Dispositivos

> **Qué cubre:** los aparatos registrados (la tablet del taller, el teléfono para escanear, el programa puente, después la caja de tienda) y la credencial de uniformame.mx: el código de 10 minutos, la llave que hace el propio aparato, revocar, rotar la llave, su última sincronización y los comandos apartados o retenidos.
> **Estado:** Decidido.
> **Se construye en:** [fase 6 ●](../../fases/06-dispositivos-y-sincronizacion.md).
> **Se conecta con:** [sincronización](../../cimientos/SINCRONIZACION.md) · [acceso y permisos](../../cimientos/ACCESO-Y-PERMISOS.md) · [idempotencia y concurrencia](../../cimientos/IDEMPOTENCIA-Y-CONCURRENCIA.md) · [folios](folios.md) · [excepciones](../inventario/excepciones.md) · [PIN del taller](../personal/pin-del-taller.md) · [lotes](../produccion/lotes.md) · [alertas e indicadores](../direccion/alertas-e-indicadores.md) · [tablet](../../apps/tablet.md) · [pantallas de Administración](../../interfaz/fabrica/administracion.md) · [pantallas de Bodega](../../interfaz/fabrica/bodega.md) · [pedidos en línea](../linea/pedidos-en-linea.md) · [pantallas de Tienda en línea](../../interfaz/fabrica/tienda-en-linea.md) · [el puente de impresión](../../apps/puente-de-impresion.md) · [pantallas de la tablet](../../interfaz/tablet.md) · [seguridad](../../cimientos/SEGURIDAD.md)

## Para qué sirve

Un aparato que trabaja sin internet no puede entrar con Google: entra con su propia llave. La dueña lo registra con un código de 10 minutos que se escribe en el aparato; el aparato hace su llave secreta y la manda al canjear el código. Si el aparato se pierde, la dueña lo revoca y deja de entrar al momento, pero lo que tenía sin subir no se pierde. Ejemplo: la dueña aprieta «Registrar dispositivo», escoge «Taller», le da el código «K7Q-422» a quien tiene la tablet nueva, y la ventana se cierra sola con «Tablet del taller registrada con su propia llave».

## Reglas

1. **Solo la dueña registra y revoca aparatos,** con «Confirmar con Google»: registrar un aparato es dar acceso.
2. **El registro lo confirma el aparato** al canjear el código, no el clic de la dueña.
3. **La llave la hace el aparato:** un `llave_id` público y un secreto de 32 bytes al azar. El servidor guarda solo el SHA-256 del secreto; ninguna respuesta guardada para reintentos lleva el secreto.
4. **Cada aparato tiene su tipo y su ubicación,** y solo puede lo que su tipo permite (ver [sincronización](../../cimientos/SINCRONIZACION.md#lo-que-puede-cada-aparato)).
5. **Revocar no tira nada.** El aparato revocado deja de entrar en ese momento, pero sigue subiendo su cola: lo que pasó antes de revocarlo queda retenido para que la dueña lo aplique o Bodega lo resuelva; lo que pasó después se aparta.
6. **Un aparato revocado no se reactiva:** se registra otro con llave nueva. Su prefijo queda libre para la caja que lo reemplace, que sigue la numeración.
7. **La llave cambia sola** cada `admin.dias_rotar_llave`, con una gracia de `admin.minutos_gracia_llave` en que valen las dos.
8. **Un aparato que lleva `admin.horas_sin_sincronizar_aviso` sin sincronizar** le avisa a la dueña, una vez por episodio.

## Los tipos

| Tipo | Qué es | Ubicación | Sincroniza |
|---|---|---|---|
| `tablet_taller` | La Puerta del taller | El Taller | Sí |
| `telefono_escanear` | El teléfono de Aduana para escanear, con la sesión de quien lo usa | Aduana o Bodega | No: usa las acciones y consultas de la web |
| `puente_impresion` | El programa puente de una computadora con impresora | Donde está la impresora | No: solo pide sus trabajos |
| `credencial_servidor` | La credencial de uniformame.mx | Ninguna | No |
| `computadora_tienda` | La caja de una tienda (con el POS) | Su tienda | Sí |

## Estados

| Tabla | De | A | Acción | Quién |
|---|---|---|---|---|
| `codigos_registro` | — | `vigente` | «Registrar dispositivo» | Solo la dueña |
| `codigos_registro` | `vigente` | `canjeado` | El aparato escribe el código antes de que venza y recibe su llave; nace el aparato | El aparato |
| `codigos_registro` | `vigente` | `cancelado` | «Volver» sin registrar | La dueña |
| `dispositivos` | registrado | revocado | «Revocar» con motivo y «Confirmar con Google» | Solo la dueña |

«Vencido» (el código) y «sin sincronizar» (el aparato) se calculan, no se guardan.

## La tabla `dispositivos`

| Columna | Tipo | Nulo | Qué es |
|---|---|---|---|
| `id` | uuid | no | Llave |
| `folio` | text | no | DV-, único |
| `nombre` | text | no | Hasta 30. Vacío es «Dispositivo» |
| `tipo` | text | no | CHECK (`computadora_tienda`, `tablet_taller`, `telefono_escanear`, `puente_impresion`, `credencial_servidor`) |
| `ubicacion_id` | uuid | sí | → `ubicaciones.id`. Obligatoria salvo en la credencial (CHECK) |
| `prefijo_folio` | text | sí | El prefijo de los folios que numera sin internet. Obligatorio en la caja: la clave de su tienda (`T1`). Único entre los no revocados |
| `llave_id` | text | no | Público y corto («k1a8f2»; la pantalla lo muestra «k1·a8f2»). Único |
| `llave_hash` | text | no | SHA-256 del secreto |
| `llave_anterior_hash` · `llave_anterior_vence_en` | text · timestamptz | sí | La llave anterior durante la gracia de una rotación |
| `llave_rotada_en` | timestamptz | sí | «rotada el 2 ago» |
| `codigo_registro_id` | uuid | sí | → `codigos_registro.id`. Nulo en la credencial |
| `baja_en` · `baja_por` | timestamptz · uuid | sí | Revocado y por quién (la dueña) |
| `motivo_baja` | text | sí | De 5 a 60 letras. Obligatorio con `baja_en` (CHECK) |
| `baja_confirmado_con_google_en` | timestamptz | sí | Obligatorio con `baja_en` (CHECK) |

Lleva las columnas comunes y, como baja a la tablet (su propio renglón), `xid_escritura`. `creado_en` es «Registrado el…».

## La tabla `codigos_registro`

| Columna | Tipo | Nulo | Qué es |
|---|---|---|---|
| `id` | uuid | no | Llave |
| `codigo_hash` | text | no | SHA-256 del código de 6 caracteres. El código en claro solo sale una vez, en la ventana |
| `nombre` · `tipo` · `ubicacion_id` | | no · no · sí | Lo que se escribió en la ventana; el tipo con el mismo CHECK |
| `vence_en` | timestamptz | no | La hora de creación más `admin.codigo_registro_vigencia_min` |
| `estado` | text | no | CHECK (`vigente`, `canjeado`, `cancelado`) |
| `canjeado_en` · `canje_ip` | timestamptz · inet | sí | |
| `dispositivo_id` | uuid | sí | → `dispositivos.id`. Obligatorio si `canjeado` |
| `cancelado_en` | timestamptz | sí | |

Lleva las columnas comunes; `creado_por` es obligatorio (la dueña).

## La tabla `dispositivos_sync`

El estado de la sincronización de cada aparato. Técnica: sin `creado_por` ni `version`.

| Columna | Tipo | Nulo | Qué es |
|---|---|---|---|
| `id` | uuid | no | Llave |
| `dispositivo_id` | uuid | no | → `dispositivos.id`. Único |
| `cursor_xid` | xid8 | sí | Hasta dónde ya bajó el aparato (ver [sincronización](../../cimientos/SINCRONIZACION.md)) |
| `esquema_sync` | integer | sí | La versión del esquema de sincronización de su app |
| `foto_pedida_en` | timestamptz | sí | El servidor le pidió la foto completa |
| `ultima_sincronizacion_en` | timestamptz | sí | La última vez que subió toda su cola y bajó todo. De aquí sale «sin sincronizar» |
| `ultima_subida_en` · `ultima_bajada_en` · `ultimo_contacto_en` | timestamptz | sí | |
| `pendientes_por_subir` | integer | no | default 0. Lo que el aparato dice tener en su cola («14 movimientos sin subir») |
| `desfase_reloj_seg` | integer | sí | Cuánto se aleja su reloj del servidor |
| `aviso_sin_sincronizar_en` | timestamptz | sí | Cuándo se avisó del episodio sin sincronizar |
| `version_app` · `ip` | text · inet | sí | Del último contacto |
| `creado_en` · `actualizado_en` | timestamptz | no · sí | |

**El contacto:** cada llamada con llave pone `ultimo_contacto_en`, `ip`, `version_app` y `pendientes_por_subir` (del encabezado `X-Pendientes`), a lo más una vez por minuto; subir y bajar siempre. La credencial de servidor solo usa `ultimo_contacto_en`.

## Acciones

### `admin.generar_codigo_registro`

| | |
|---|---|
| **Pantalla** | Administración del sistema · Dispositivos · «Registrar dispositivo» → ventana «Registrar dispositivo» |
| **Quién** | Administración del sistema · `solo_duena` («Solo la dueña registra dispositivos») · «Confirmar con Google» |
| **Recibe** | `nombre` · texto · hasta 30 · opcional<br>`tipo` · `tablet_taller`, `telefono_escanear`, `puente_impresion` (o `computadora_tienda` con el POS) · obligatorio. La pantalla lo deduce de «Dónde se usa»; el puente es «Programa de impresión»<br>`ubicacion_id` · uuid · obligatorio: «Dónde se usa» |
| **Reglas y errores** | `422 ubicacion_no_corresponde`: la tablet va en el Taller; el teléfono, en Aduana o Bodega; la caja, en una tienda; el puente, donde haya impresora. «Una {tipo} no va en {ubicación}.» |
| **Escribe** | `codigos_registro` vigente, con el hash del código y su vencimiento |
| **Regresa** | El código en claro (una sola vez; 6 caracteres sin letras que se confunden, como «K7Q-422») y su vencimiento. La ventana dice «Escribe este código en la pantalla de registro del dispositivo nuevo. Vence en {n} minutos.» y espera el aviso `dispositivo_registrado` |
| **Eventos** | `dispositivo.codigo_generado` |
| **Bitácora** | «Generó un código para registrar {nombre}» |

### `admin.cancelar_codigo_registro`

| | |
|---|---|
| **Pantalla** | Ventana «Registrar dispositivo» · «Volver» |
| **Quién** | Administración del sistema · `solo_duena` |
| **Recibe** | `codigo_registro_id` · uuid · obligatorio |
| **Reglas y errores** | `422 codigo_no_vigente`: ya se canjeó o se canceló (si se canjeó, responde el aparato que nació) |
| **Escribe** | El código, cancelado |
| **Bitácora** | «Canceló el código para registrar {nombre}» |

### `admin.canjear_codigo`

| | |
|---|---|
| **Pantalla** | La pantalla de registro del aparato nuevo: «Escribe el código que te dio la dueña» |
| **Quién** | Sin sesión ni llave: el código es la credencial. Después de `admin.intentos_codigo_max` códigos equivocados desde una IP en `admin.minutos_ventana_intentos`: `429` |
| **Recibe** | `codigo` · texto · 6 caracteres, con o sin guion, sin importar mayúsculas<br>`tipo` · el tipo de su programa<br>`secreto` · la llave secreta que el aparato acaba de hacer: 32 bytes al azar en base64url<br>`aparato` · texto · opcional («Android 14 · Samsung»)<br>`version_app` · texto. Todos obligatorios salvo `aparato` |
| **Reglas y errores** | `422 codigo_no_valido`: «Ese código no existe o ya venció. Pide otro a la dueña.» (no dice cuál de las dos)<br>`422 tipo_no_coincide`: «Este código es para {tipo}: escríbelo en ese aparato.»<br>`422 tienda_con_caja`: «{tienda} ya tiene su caja. Para reponerla, revoca la anterior.» (con el POS: una caja por tienda)<br>`426` si su versión es vieja |
| **Escribe** | El código, canjeado. El aparato nuevo con su folio DV-, el nombre, el tipo y la ubicación del código, su `llave_id` y el hash de su secreto; en la caja, su prefijo: la clave de su tienda si ninguna caja la ha usado, y si no, la siguiente con letra (`T1B`). Un prefijo nunca se vuelve a usar, para que ningún folio se repita. Su renglón de `dispositivos_sync`, sin cursor |
| **Llama** | `admin.tomar_folio` (DV-) |
| **Regresa** | El aparato, su folio, su tipo, su ubicación, su prefijo, su `llave_id` y el intervalo de sincronización. Lo siguiente que hace el aparato es pedir su foto completa |
| **Eventos** | `dispositivo.registrado`: `dispositivo_registrado` a la sesión de la dueña que generó el código |
| **Bitácora** | A nombre de la dueña que generó el código: «Registró el dispositivo {nombre}», con folio, tipo, ubicación, prefijo y `llave_id` (nunca el secreto ni su hash) |
| **Sin internet** | No. Si se corta antes de la respuesta, el aparato repite con la misma clave y el mismo secreto y recibe la misma respuesta |

### `admin.revocar_dispositivo`

| | |
|---|---|
| **Pantalla** | Administración del sistema · Dispositivos · «Revocar» → ventana «Revocar {dispositivo}» · «Confirmar con Google». También la credencial de uniformame.mx |
| **Quién** | Administración del sistema · `solo_duena` («Solo la dueña revoca dispositivos») · «Confirmar con Google» |
| **Recibe** | `dispositivo_id` · uuid · obligatorio<br>`motivo` · texto · de 5 a 60 letras · obligatorio<br>`anular_pines` · booleano · obligatorio en la tablet: «¿Se perdió o la pudo usar alguien más?»<br>`version` · entero · obligatorio |
| **Reglas y errores** | `400`: «Escribe el motivo»<br>`422 ya_revocado`: «{nombre} ya está revocado.» |
| **Escribe** | El aparato, revocado, con su motivo y su confirmación. Nada de su cola se tira |
| **Llama** | Con `anular_pines`: `personal.anular_pines_ubicacion` (el Taller, motivo `restablecido`) |
| **Regresa** | «{nombre} revocado: ya no entra». Avisos que no bloquean: «Tiene {n} movimientos sin subir. Lo que llegue después entra a la bandeja de excepciones de Bodega.» · en una caja: «Si la caja se perdió, cambia los códigos de {tienda}.» · con `anular_pines`: «Los PIN del taller ya no entran: Personal tiene que dar nuevos.» |
| **Eventos** | `dispositivo.revocado`: `dispositivo_revocado` al aparato; «hay cambios» para Administración y Dirección |
| **Bitácora** | «Revocó {nombre}: {motivo}», con `antes`, `despues` y su confirmación |

### `admin.rotar_llave`

| | |
|---|---|
| **Pantalla** | El aparato: ninguna; lo hace solo cuando la bajada (al puente, la respuesta de sus trabajos) le responde `rotar_llave`. La web: Dispositivos · la credencial de uniformame.mx · «Rotar llave» |
| **Quién** | El aparato, con su llave vigente. La web: Administración del sistema · `solo_duena` · «Confirmar con Google», y solo para la credencial |
| **Recibe** | El aparato: `secreto_nuevo` (32 bytes al azar). La web: `dispositivo_id` y `version` |
| **Reglas y errores** | `422 solo_credencial`: desde la web a un aparato, «Los aparatos cambian su llave solos. Aquí solo se rota la credencial de uniformame.mx.»<br>`422 ya_revocado` |
| **Escribe** | La llave actual pasa a anterior, con su gracia; el hash nuevo; `llave_rotada_en`. Durante la gracia valen las dos; la primera llamada con la nueva acaba la gracia |
| **Regresa** | El aparato: `llave_rotada_en`. La web: el secreto nuevo en claro, una sola vez: «Cópiala ahora en uniformame.mx: no se vuelve a mostrar» |
| **Eventos** | `dispositivo.llave_rotada` |
| **Bitácora** | La web: «Rotó la llave de {nombre}». El aparato: «{nombre} cambió su llave». Nunca hashes ni secretos |
| **Sin internet** | No. Si el aparato no supo si se aplicó, prueba primero la llave nueva y luego la vieja, dentro de la gracia |

### `admin.reintentar_comando_apartado`

| | |
|---|---|
| **Pantalla** | Administración del sistema · Dispositivos · «{n} apartados» de un aparato → la lista · «Reintentar» |
| **Quién** | Administración del sistema |
| **Recibe** | `comando_id` · uuid · obligatorio |
| **Reglas y errores** | `422 no_es_apartado`: «Ese comando no quedó apartado.» · `422 ya_descartado` |
| **Escribe** | Vuelve a correr la carga guardada por el mismo camino de la subida, con su hora, su persona y su código de origen, a nombre del mismo aparato. Suma el reintento; si se aplica, el comando pasa a `aplicado` o `excepcion` con su respuesta nueva (si el aparato vuelve a mandar esa clave, recibe esta) |
| **Regresa** | El resultado nuevo |
| **Llama · Eventos** | Los de la acción del comando |
| **Bitácora** | La de la acción del comando, con «reintentado por {nombre}» en `despues` |

El servidor también reintenta solo: un comando apartado por `falta_documento` guarda el documento que esperaba; cuando un comando de ese aparato crea ese documento, se reintentan los que lo esperaban, en el orden en que pasaron.

### `admin.descartar_comando_apartado`

| | |
|---|---|
| **Pantalla** | La misma lista · «Descartar» |
| **Quién** | Administración del sistema · `solo_duena` |
| **Recibe** | `comando_id` · uuid · obligatorio<br>`motivo` · texto · de 5 a 120 · obligatorio |
| **Reglas y errores** | `400`: «Escribe el motivo» · `422 no_es_apartado` · `422 ya_descartado` |
| **Escribe** | El comando, descartado con su motivo. No aplica nada: si era un hecho real, se captura con la acción de su módulo |
| **Bitácora** | «Descartó un comando apartado de {aparato} ({acción}): {motivo}» |

### `admin.aplicar_comando_retenido`

| | |
|---|---|
| **Pantalla** | Bodega · Excepciones · excepción `dispositivo_revocado` · «Aplicar el movimiento»; y Dispositivos · Revocados · «Llegó después de revocar» |
| **Quién** | Bodega o Administración del sistema · `solo_duena` · «Confirmar con Google»: aplica lo que mandó un aparato que pudo estar en otras manos |
| **Recibe** | `comando_id` · uuid · obligatorio: el comando retenido<br>`version` · entero · obligatorio: la de la excepción |
| **Reglas y errores** | `422 no_retenido`: «Ese comando no está retenido.» · `422 ya_aplicado`: «Ese movimiento ya se aplicó.» |
| **Escribe** | Corre la carga guardada por el camino de la subida, con su hora, su persona y su código, a nombre del aparato revocado; el comando guarda quién y cuándo lo aplicó, su resultado y su respuesta; la excepción queda resuelta con «Se aplicó el movimiento retenido» |
| **Llama** | Las de la acción del comando, e `inventario.marcar_excepcion_resuelta` |
| **Regresa** | El resultado y los folios: «Movimiento de {aparato} aplicado: {acción} {folio}» |
| **Bitácora** | La de la acción del comando, con su confirmación y «retenido de {aparato} revocado; aplicado por {nombre}» en `despues` |

Si Bodega no lo quiere aplicar, resuelve la excepción con su propia acción y el comando se queda retenido.

## Lecturas

### `admin.ultima_sincronizacion`

| | |
|---|---|
| **La usan** | Inventario (no ofrecer en línea la existencia de una tienda sin sincronizar), Producción («Sin datos de la tablet») y Dirección |
| **Regresa** | Por ubicación y tipo de aparato: la última sincronización completa del aparato vigente más reciente |

### `admin.aparatos_sin_sincronizar()`

Se construye en la [fase 18](../../fases/18-tienda-en-linea-direccion-y-contador.md), con las alertas de Dirección.

| | |
|---|---|
| **La usa** | Dirección, para la alerta «{ubicación} sin sincronizar desde hace {tiempo}» (ver [alertas e indicadores](../direccion/alertas-e-indicadores.md)) |
| **Regresa** | Las tablets y cajas vigentes que hoy cumplen la regla del trabajo de abajo: su nombre, su ubicación y desde cuándo no sincronizan |

## Trabajos

### Aparatos sin sincronizar

| | |
|---|---|
| **Cuándo** | Cada `admin.minutos_revisar_sincronizacion` |
| **Lee** | Las tablets y cajas vigentes y su sincronización |
| **Regla** | Ahora menos su última sincronización completa (o su registro, si nunca sincronizó) ≥ `admin.horas_sin_sincronizar_aviso` |
| **Escribe** | `aviso_sin_sincronizar_en` al avisar. Lo limpia la bajada cuando el aparato vuelve a sincronizar |
| **Avisa** | Una vez por episodio: el aviso `dispositivo_sin_sincronizar` a la dueña, «{nombre} sin sincronizar desde hace {tiempo}: {ubicación} · ventas y existencia sin enviar»; y el evento `dispositivo.sin_sincronizar`, «hay cambios» para Administración y Dirección |
| **Repetible** | Por `aviso_sin_sincronizar_en` |

## Parámetros

| Parámetro | Valor inicial | Para qué |
|---|---|---|
| `admin.codigo_registro_vigencia_min` | 10 min | Cuánto vale el código para registrar un aparato |
| `admin.horas_sin_sincronizar_aviso` | 4 h | Sin sincronizar en ese tiempo, aviso a la dueña |
| `admin.intentos_codigo_max` | 5 | Códigos equivocados desde una IP antes del `429` |
| `admin.dias_rotar_llave` | 90 días | Cada cuánto cambia su llave un aparato |
| `admin.minutos_gracia_llave` | 10 min | Cuánto vale la llave anterior al rotar |
| `admin.minutos_revisar_sincronizacion` | 15 min | Cada cuánto corre el trabajo de aparatos sin sincronizar |

Los dos primeros van en `parametro`; los demás, en `tecnico`. La ventana de intentos es `admin.minutos_ventana_intentos`, de [acceso con Google](acceso-con-google.md).

## Permisos

- Ver Dispositivos: Administración del sistema.
- Registrar, revocar, rotar la credencial, descartar apartados y aplicar retenidos: solo la dueña.
- Reintentar un apartado: Administración del sistema.

## Eventos

`dispositivo.codigo_generado` · `dispositivo.registrado` · `dispositivo.revocado` · `dispositivo.llave_rotada` · `dispositivo.sin_sincronizar` · `dispositivo.foto_pedida` (a cada aparato al que se le pidió la foto, `resincronizar`).

## Lo que llega después

- **Con el POS:** la caja (`computadora_tienda`), su prefijo y los folios que trae su foto.
- **Con uniformame.mx:** crear la credencial de servidor y los usuarios de su panel.

## Cómo está hecho

**Fase 6, parte 1.**

- **Las tablas** `dispositivos` (con `xid_escritura`: su propio renglón baja al aparato), `codigos_registro` y `dispositivos_sync` están en `apps/api/src/modulos/admin/tablas.ts` (migración `0012_dispositivos.sql`), con sus CHECK. La misma migración agrega las llaves hacia `dispositivos` de las fases anteriores (comandos recibidos, eventos, bitácora, archivos, impresoras, sesiones). De un aparato, la app solo cambia su llave y su baja; de un código, su estado y su canje o su cancelación.
- **Lo común** (`modulos/admin/dominio/dispositivos.ts`): el código de 6 letras sin las que se confunden (`nuevoCodigo`, «K7Q-422», y `codigoNormal`, que quita el guion y pone mayúsculas), la parte pública de la llave (`nuevaLlaveId`: 8 letras), el secreto de la credencial y `revisarUbicacion` (la tablet en el Taller; el teléfono en Aduana o Bodega; la caja en una tienda; el programa de impresión donde haya una impresora sin baja).
- **Las acciones**, con sus contratos en `packages/compartido/src/contratos/admin/dispositivos.ts`:
  - **`admin.generar_codigo_registro`**: guarda el SHA-256 del código; el código es un secreto del contrato, así que la respuesta guardada para los reintentos va sin él.
  - **`admin.cancelar_codigo_registro`**: toma el código con candado.
  - **`admin.revocar_dispositivo`**: edita con la versión del aparato; avisa lo que tenía sin subir. En la tablet, `anular_pines` es obligatorio (`400` «Di si se perdió o la pudo usar alguien más.»); con él, `personal.anular_pines_ubicacion` anula en la misma transacción los PIN vivos de la ubicación del aparato, la bitácora lleva `pines_anulados` y el aviso «Los PIN del taller ya no entran: Personal tiene que dar nuevos.» (fase 7, decisión 429; prueba: `modulos/admin/acciones/revocar-dispositivo.prueba.ts`).
  - **`admin.rotar_llave`**: el aparato manda su secreto nuevo; desde la web solo se rota la credencial, que recibe su secreto una vez. La salida dice `rotada_en`.
- **El canje** (`modulos/admin/rutas/canje.ts`) es una ruta abierta, `POST /v1/dispositivos/canjear`, con el cuerpo de una acción (`clave_idempotencia` y `datos`): el código es la credencial (decisión 387). En una transacción con el código bloqueado nacen el aparato (con su folio DV-, su `llave_id` y el hash de su secreto) y su renglón de sincronización, y se guarda su clave en `comandos_recibidos`; la bitácora va a nombre de la dueña que generó el código (`aNombreDe`). Un código que no existe, venció o ya se usó responde lo mismo y suma un intento de la IP (`codigo:{ip}`).
- **Quién llama con la llave** (`nucleo/acceso/llave.ts`, ver [acceso y permisos](../../cimientos/ACCESO-Y-PERMISOS.md#cómo-está-hecho)) y el contacto de cada llamada (`anotarContacto`, a lo más una vez por minuto).
- **La lectura** `admin.datos_de_aparato` (`lecturas/datos-de-aparato.ts`) da el tipo, si está revocado, el nombre, el último contacto y la versión de un aparato: la usa la impresión.
- **`admin.trabajos_impresion`** le dice al puente `rotar_llave` cuando su llave cumplió `admin.dias_rotar_llave`.
- **`POST /v1/archivos/subida`** deja a la tablet subir archivos de Producción, y al puente, ninguno.
- **`dispositivo.revocado`** manda `dispositivo_revocado` al aparato, y su conexión en vivo se vuelve a revisar y se corta; `dispositivo.registrado` manda `dispositivo_registrado` a la dueña que generó el código.
- **Los parámetros** `admin.codigo_registro_vigencia_min`, `admin.horas_sin_sincronizar_aviso`, `admin.intentos_codigo_max`, `admin.dias_rotar_llave`, `admin.minutos_gracia_llave`, `admin.minutos_revisar_sincronizacion` y los `sync.*` están en `modulos/admin/parametros.ts`.
- **En las pruebas**, la base plantilla trae los aparatos de prueba (la tablet del Taller y los puentes de Aduana y del Taller) registrados, con su llave conocida (`llaveDePrueba`). La prueba identifica como la API cuando la llamada trae `Authorization`.
- **El `429` del canje:** los canjes de una IP van uno tras otro, con un candado de transacción sobre `codigo:{ip}`; el bloqueo se revisa y la falla se cuenta en la misma transacción, así que una ráfaga a la vez tampoco pasa (decisión 408).
- **Las pruebas:** `modulos/admin/acciones/canjear-codigo.prueba.ts` (también la ráfaga de 20 códigos equivocados a la vez: 5 responden 422 y 15, 429) y `nucleo/acceso/llave.prueba.ts`.

**Fase 6, parte 2.**

- **`admin.reintentar_comando_apartado`** (`acciones/reintentar-comando-apartado.ts`): lee el comando con candado (`leerApartado`, en `dominio/dispositivos.ts`: `404` si no llegó de un aparato, `no_es_apartado`, `ya_descartado`) y lo corre con `reintentarComando` de la [sincronización](../../cimientos/SINCRONIZACION.md#cómo-está-hecho), en la misma transacción. Si se aplica, la bitácora es la de la acción del comando con `reintento: «reintentado por {nombre}»` en `despues`, y se reintentan detrás los que esperaban lo que creó; si sigue apartado, su propio renglón lo dice y el mensaje es «Sigue apartado: {motivo}».
- **`admin.descartar_comando_apartado`** (`acciones/descartar-comando-apartado.ts`): solo la dueña; guarda quién, cuándo y por qué, y ya no se reintenta solo.
- **El reintento solo** de lo que esperaba un documento está en la subida (ver [sincronización](../../cimientos/SINCRONIZACION.md#cómo-está-hecho)).
- **Las pruebas:** `nucleo/sincronizacion/subir.prueba.ts` («Administración del sistema reintenta o descarta un comando apartado»).

**Fase 6, parte 3.**

- **Lo que baja de `admin`** a la tablet (`modulos/admin/bajada.ts`): sus parámetros y su propio renglón (`folio`, `nombre`, `tipo`, `ubicacion_id`, `prefijo_folio`, `llave_rotada_en`; nunca la llave).
- **`leTocaRotarLaLlave`** (`dominio/dispositivos.ts`) es la regla de `admin.dias_rotar_llave`: la usan la bajada y los trabajos del puente.
- **`pedirLaFoto`** pone `foto_pedida_en` a los aparatos vigentes de unos tipos (ver [sincronización](../../cimientos/SINCRONIZACION.md#cómo-está-hecho)).

**Fase 6, parte 4.**

- **El trabajo de aparatos sin sincronizar** (`trabajos/aparatos-sin-sincronizar.ts`, `admin.aparatos_sin_sincronizar`) corre cada `admin.minutos_revisar_sincronizacion`: las tablets (y las cajas, con el POS) vigentes cuya última sincronización completa, o su registro, tiene `admin.horas_sin_sincronizar_aviso` o más, y que no tienen su aviso. A cada una le pone `aviso_sin_sincronizar_en`, avisa `dispositivo_sin_sincronizar` a la dueña (con el aparato como documento, «{nombre} sin sincronizar desde hace {tiempo}: {ubicación} · ventas y existencia sin enviar», el tiempo en horas hasta dos días y luego en días) y guarda `dispositivo.sin_sincronizar` («hay cambios» en `dispositivos`, que leen Administración y Dirección). La bajada completa limpia la marca.
- **La lectura `admin.ultima_sincronizacion`** (`lecturas/ultima-sincronizacion.ts`): por ubicación y tipo (los dos opcionales), el aparato vigente registrado más reciente y su última sincronización completa.
- **`dispositivo.foto_pedida`** manda `resincronizar` a cada aparato al que se le pidió la foto.
- **Lo de un aparato revocado** no se reintenta: `leerApartado` dice si llegó de uno revocado o si su aparato se revocó después (ver [sincronización](../../cimientos/SINCRONIZACION.md#cómo-está-hecho)).
- **Las pruebas:** `trabajos/aparatos-sin-sincronizar.prueba.ts` (antes del tiempo, una vez por episodio, la bajada completa acaba el episodio, el siguiente avisa otra vez, el revocado y el puente no avisan; la lectura) y `nucleo/sincronizacion/revocado.prueba.ts`.

**Fase 9, parte 4.** `admin.aplicar_comando_retenido` está en `modulos/admin/acciones/aplicar-comando-retenido.ts`.
- **Cómo corre:** `leerRetenido` y `aplicarRetenido` (`nucleo/sincronizacion/comandos.ts`) bloquean el comando y corren su carga con `aplicarComando`, a nombre del aparato revocado. Guardan quién y cuándo lo aplicó, su resultado y su respuesta nueva. La versión que se pide es la de la excepción, y la toma su dueño con `inventario.tomar_version_excepcion` (decisión 508).
- **Si se aplica:** el mensaje lleva el folio si la acción del comando lo regresó («Movimiento de Tablet del taller aplicado: prueba.abrir_lote L-retenido»); la bitácora de la acción del comando lleva `retenido` en `despues` y `confirmado_con_google_en` de la dueña, y `inventario.marcar_excepcion_resuelta` resuelve la excepción. Si queda apartado, sigue retenido y su excepción abierta (decisión 491).
- **Quién:** pide Bodega, solo la dueña y «Confirmar con Google» (`aplicar_retenido`).
- **Si Bodega ya la resolvió:** el comando sigue retenido y la dueña aún lo puede aplicar; la excepción se queda con la resolución de Bodega, y `comandos_recibidos` guarda quién y cuándo lo aplicó (decisión 510).
- **Prueba:** `aplicar-comando-retenido.prueba.ts` (con Google, la versión vieja, dos a la vez, lo que sigue retenido).

**Fase 18, parte 3.** `admin.aparatos_sin_sincronizar` (`lecturas/aparatos-sin-sincronizar.ts`) usa la misma regla que el trabajo, sin ver si ya se avisó: por aparato, su id, su nombre, su ubicación (su id y su nombre), desde cuándo y ese tiempo para leer, con la misma cuenta del aviso (`tiempoParaLeer`: en horas hasta dos días, luego en días). La alerta de Dirección dice «{aparato} de {ubicación} sin sincronizar desde hace {tiempo}» (decisión 730). Disponibilidad en línea quita las tiendas sin sincronizar por su `ubicacion_id` (decisión 779). La prueba `direccion/trabajos/alertas-direccion.prueba.ts`.

**Fase 18, cierre.** La regla de los sin sincronizar vive en `dominio/dispositivos.ts` (`reglaSinSincronizar`, con `tiposQueSincronizan` y `tiempoParaLeer`): el trabajo y la lectura la comparten, así los dos ven lo mismo.
