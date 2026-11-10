# Acceso con Google

> **Qué cubre:** entrar al sistema de la fábrica con la cuenta de Google (OpenID con PKCE), la cuenta sin acceso, las sesiones con sus vencimientos, «Confirmar con Google» de 5 minutos, salir y cerrar sesiones, y los intentos que llevan al `429`.
> **Estado:** Decidido.
> **Se construye en:** [fase 5 ●](../../fases/05-acceso-con-google-cuentas-y-permisos.md).
> **Se conecta con:** [acceso y permisos](../../cimientos/ACCESO-Y-PERMISOS.md) · [cuentas](cuentas.md) · [permisos](permisos.md) · [bitácora](bitacora.md) · [pantallas comunes](../../interfaz/comunes.md) · [pantallas de Administración](../../interfaz/fabrica/administracion.md) · [seguridad](../../cimientos/SEGURIDAD.md) · [nómina](../contaduria/nomina.md) · [infraestructura](../../cimientos/INFRAESTRUCTURA.md)

## Para qué sirve

La dueña, la oficina, Aduana y Bodega y el encargado del taller entran con «Entrar con Google». El sistema no tiene contraseñas propias ni códigos de respaldo: eso lo resuelve Google. Ejemplo: Rosa abre el sistema, aprieta «Entrar con Google», escoge su cuenta y regresa a Ventas a externos, donde la saluda «Hola, Rosa». Si alguien entra con una cuenta de Google que la dueña no dio de alta, ve «Esta cuenta no tiene acceso» y la dueña recibe la alerta.

## Reglas

1. **Se entra solo con Google.** Las cuentas son de Google normal (sin Workspace); la dueña y la oficina activan la verificación en dos pasos en su propia cuenta.
2. **Una cuenta se reconoce por su `google_sub`,** el identificador fijo que da Google, no por el correo. La primera vez se busca por el correo (en minúsculas) entre las cuentas activas que todavía no tienen `google_sub`, y se le pone.
3. **Sin cuenta activa no se entra:** tampoco si la cuenta está solicitada, rechazada o sin acceso, ni si el correo es de una cuenta activa que ya tiene otro `google_sub`.
4. **La sesión vive en el servidor.** La cookie solo lleva un identificador al azar; la base guarda su hash. Se puede cortar al instante.
5. **La sesión se cierra sola** por inactividad (`admin.sesion_inactividad_min`) y por duración máxima (`admin.sesion_duracion_max_h`), y también al quitarle el acceso a la cuenta.
6. **«Confirmar con Google» vale `admin.reautenticacion_minutos` (5).** Las acciones delicadas lo piden; el servidor revisa la hora que dice Google, no la de la pantalla.
7. **Una entrada desde un aparato nuevo** para esa cuenta (que no sea su primera entrada) es alerta para la dueña.
8. **Demasiadas entradas fallidas desde la misma IP** (`admin.intentos_entrada_max` en `admin.minutos_ventana_intentos`) responden `429` hasta que pasa la ventana.
9. **Las sesiones de la dueña solo las cierra ella.**

## Cómo se revisa la sesión en cada llamada

En este orden; si algo falla, la sesión se cierra con ese motivo y la llamada responde `401 sin_sesion`:

1. que no esté cerrada;
2. que `vence_en` no haya pasado (`duracion_maxima`);
3. que la última actividad sea de hace menos de `admin.sesion_inactividad_min` (`inactividad`);
4. que la cuenta siga activa (`acceso_quitado`).

`ultima_actividad_en` se escribe a lo más una vez por minuto. Qué se revisa después (departamentos, permisos) está en [acceso y permisos](../../cimientos/ACCESO-Y-PERMISOS.md).

## Las cookies

| Cookie | Qué lleva | Cómo va |
|---|---|---|
| `ua_sesion` | 32 bytes al azar; la base guarda su hash | httpOnly, Secure, SameSite=Lax, ruta `/`, solo para el dominio de la API |
| `ua_aparato` | Un identificador al azar del navegador; la base guarda su hash como `huella_aparato` | httpOnly, Secure, SameSite=Lax, 400 días |
| `ua_google` | El `state`, el `nonce` y el verificador de PKCE, cifrados | httpOnly, Secure, SameSite=Lax, ruta `/`, 10 minutos. Sin tabla |

## La tabla `sesiones`

Cada entrada al sistema de la fábrica. La tablet no abre sesiones aquí: sus personas viajan en cada comando.

| Columna | Tipo | Nulo | Qué es |
|---|---|---|---|
| `id` | uuid | no | Llave |
| `usuario_id` | uuid | no | → `usuarios.id` |
| `token_hash` | text | no | El hash del identificador de la cookie. Único |
| `ultima_actividad_en` | timestamptz | no | |
| `vence_en` | timestamptz | no | La entrada más `admin.sesion_duracion_max_h` |
| `ip` | inet | sí | |
| `ciudad_aproximada` | text | sí | La que manda Cloudflare en su encabezado de ubicación, si la API está detrás de su proxy; si no llega, vacía |
| `agente` | text | sí | El agente del navegador, tal cual |
| `aparato` | text | sí | Corto: «iPhone · Safari» |
| `huella_aparato` | text | sí | El hash de `ua_aparato` |
| `es_aparato_nuevo` | boolean | no | default false |
| `dispositivo_id` | uuid | sí | → `dispositivos.id`, si se abrió en un aparato registrado (el teléfono para escanear de Aduana) |
| `google_confirmado_en` | timestamptz | sí | La última vez que la persona volvió a pasar por Google en esta sesión |
| `cerrada_en` | timestamptz | sí | |
| `cerrada_por` | uuid | sí | → `usuarios.id`. Nulo si la cerró el sistema |
| `motivo_cierre` | text | sí | CHECK (`salio`, `inactividad`, `duracion_maxima`, `cerrada_por_otra_cuenta`, `acceso_quitado`). Obligatorio con `cerrada_en` |
| `creado_en` | timestamptz | no | default `now()`: el momento de la entrada |
| `actualizado_en` | timestamptz | sí | |

- Técnica: sin `creado_por` (es `usuario_id`) ni `version`.
- **Índices:** único (`token_hash`); (`usuario_id`) donde `cerrada_en` es nulo; (`usuario_id`, `huella_aparato`).
- `dispositivo_id` lleva su `@llavePendiente` hasta la fase 6.

| De | A | Motivo | Quién |
|---|---|---|---|
| abierta | cerrada | `salio` | La persona |
| abierta | cerrada | `inactividad` · `duracion_maxima` | El sistema |
| abierta | cerrada | `cerrada_por_otra_cuenta`: «Cerrar» en Usuarios y accesos | La dueña cualquiera; Administración del sistema, todas menos las de la dueña |
| abierta | cerrada | `acceso_quitado` | Al quitar el acceso a la cuenta |

## La tabla `intentos_recientes`

Cuenta los intentos que llevan al `429`, para todas las instancias de la API. Es `UNLOGGED`: si se pierde al reiniciar la base, no pasa nada.

| Columna | Tipo | Nulo | Qué es |
|---|---|---|---|
| `clave` | text | no | Llave: «entrada:{ip}» o «codigo:{ip}» |
| `ventana_inicio` | timestamptz | no | |
| `intentos` | integer | no | |
| `bloqueado_hasta` | timestamptz | sí | |

La usan también los códigos de registro de [dispositivos](dispositivos.md).

## Acciones

### `admin.entrar_con_google` · `GET /v1/acceso/google` y `GET /v1/acceso/google/vuelta`

| | |
|---|---|
| **Pantalla** | Pantalla de acceso · «Entrar con Google». No va por `/v1/acciones` porque es una redirección de OpenID |
| **Quién** | Cualquiera: es la entrada |
| **Recibe** | `regresar` · ruta interna opcional (otra que no sea del sistema se ignora). De Google, en la vuelta: `code` y `state` |
| **Reglas y errores** | 1. Flujo de código con PKCE, `scope=openid email profile`, con openid-client.<br>2. Del token de Google se revisan la firma, `iss`, `aud`, `exp`, `nonce` y `email_verified`. Si algo falla: `google_fallo`, «No se pudo entrar con Google. Vuelve a intentar.»<br>3. Busca la cuenta como dice la regla 2.<br>4. `sin_acceso`: la pantalla «Esta cuenta no tiene acceso» · «{correo} no está dada de alta. Solo la dueña da acceso al sistema.» con el botón «Usar otra cuenta».<br>5. `429` después de `admin.intentos_entrada_max` fallas desde esa IP en `admin.minutos_ventana_intentos` |
| **Escribe** | Una sesión nueva; `usuarios.google_sub` en la primera entrada; las cookies `ua_sesion` y `ua_aparato` |
| **Regresa** | Redirección a `regresar`, o a la primera pestaña de su primer departamento. La pantalla saluda con el armazón: «Hola, {nombre de pila}» · «{puesto} · {n} departamentos. La sesión se cierra sola tras {minutos} min sin actividad.» |
| **Eventos** | `sesion.abierta` · `acceso.sin_acceso` · `sesion.aparato_nuevo` |
| **Bitácora** | Accesos, departamento Administración: «Entró al sistema». Aparato nuevo: «Entró desde un dispositivo nuevo: {aparato}, {ciudad}», con alerta. Sin acceso: «Intentó entrar una cuenta de Google sin acceso: {correo}», con `correo_intento` y alerta |

### `admin.confirmar_con_google` · las mismas rutas, con `proposito=confirmar`

| | |
|---|---|
| **Pantalla** | Toda ventana con «Confirmar con Google»: dar de alta, cambiar departamentos, quitar acceso, revocar, decidir una autorización, pagar la nómina, cambiar precios en bloque |
| **Quién** | Una sesión abierta |
| **Recibe** | `proposito = confirmar` · `regresar` (opcional) |
| **Reglas y errores** | Google se abre con `login_hint` (el correo de la cuenta) y `max_age` de `admin.reautenticacion_minutos` × 60.<br>`otra_cuenta`: el `sub` que regresa no es el de la sesión, «Confirma con tu propia cuenta de Google: {correo}.»<br>`google_fallo`: `auth_time` es de hace más de `admin.reautenticacion_minutos` |
| **Escribe** | `sesiones.google_confirmado_en` = el `auth_time` de Google |
| **Regresa** | Cierra la ventana aparte y avisa a la pantalla, que repite la acción pendiente con su misma clave |
| **Bitácora** | Sin renglón propio: cada acción delicada guarda su `confirmado_con_google_en` |

### `admin.salir`

| | |
|---|---|
| **Pantalla** | Menú de la cuenta · «Salir» |
| **Quién** | Una sesión abierta |
| **Escribe** | La sesión: cerrada, por la misma cuenta, con `salio`. Borra la cookie `ua_sesion` |
| **Eventos** | `sesion.cerrada`: `sesion_cerrada` a las otras pestañas de esa sesión |
| **Bitácora** | Accesos: «Salió del sistema» |

### `admin.cerrar_mi_sesion`

| | |
|---|---|
| **Pantalla** | Menú de la cuenta · «Mis sesiones» · «Cerrar» en una, o «Cerrar las demás» |
| **Quién** | Una sesión abierta; solo sesiones de la propia cuenta |
| **Recibe** | `sesion_id` · uuid · opcional<br>`todas_las_demas` · booleano · opcional. Una de las dos es obligatoria |
| **Reglas y errores** | `404` si la sesión es de otra cuenta |
| **Escribe** | Esas sesiones: cerradas por la misma cuenta, con `salio` |
| **Regresa** | `cerradas`. «{n} sesiones cerradas» |
| **Eventos** | `sesion.cerrada` |
| **Bitácora** | Accesos: «Cerró {n} de sus sesiones» |

### `admin.cerrar_sesiones`

| | |
|---|---|
| **Pantalla** | Administración del sistema · Usuarios y accesos · columna Sesiones · «Cerrar» |
| **Quién** | Administración del sistema. Las de la dueña, solo ella |
| **Recibe** | `usuario_id` · uuid · obligatorio |
| **Reglas y errores** | `403 solo_duena`: la cuenta es de la dueña y quien llama no, «Las sesiones de la dueña solo las cierra ella.»<br>`422 sin_sesiones_abiertas`: «{nombre} no tiene sesiones abiertas.» |
| **Escribe** | Las sesiones abiertas de esa cuenta: cerradas con `cerrada_por_otra_cuenta` |
| **Regresa** | `cerradas`. «Sesiones de {nombre} cerradas» |
| **Eventos** | `sesion.cerrada`: `sesion_cerrada` a esas pantallas |
| **Bitácora** | Accesos: «Cerró 1 sesión de {nombre}» o «Cerró {n} sesiones de {nombre}» |

## En local y en las pruebas

- **En las pruebas,** MSW simula a Google: el documento de descubrimiento, el intercambio del código, el `id_token` firmado con una llave de prueba y sus llaves públicas (ver [pruebas](../../cimientos/PRUEBAS.md)).
- **En local,** `pnpm local` levanta un proveedor OpenID de desarrollo con `oidc-provider`, que muestra una pantalla para escoger una cuenta de los datos de la muestra. La API lo usa igual que a Google: solo cambia la dirección del emisor en las variables de entorno.
- Entrar con el Google de verdad se comprueba en «Verificación real pendiente» de `REGISTROS.md`, con el cliente que Bruno crea en Google Cloud.

## Parámetros

| Parámetro | Valor inicial | Para qué |
|---|---|---|
| `admin.sesion_inactividad_min` | 30 min · por decidir | Sin actividad en ese tiempo, la sesión se cierra |
| `admin.sesion_duracion_max_h` | 12 h · por decidir | La duración máxima de una sesión |
| `admin.reautenticacion_minutos` | 5 min | Cuánto vale «Confirmar con Google» |
| `admin.intentos_entrada_max` | 10 | Entradas fallidas desde una IP antes del `429` |
| `admin.minutos_ventana_intentos` | 15 min | La ventana en que se cuentan esos intentos |

Los dos primeros van en `parametro` (salen «Por decidir» hasta que la dueña los cambie); los demás, en `tecnico`.

## Permisos

- Entrar: cualquiera; solo las cuentas activas pasan.
- Salir y cerrar sus propias sesiones: cada quien.
- Cerrar las sesiones de otra cuenta: Administración del sistema; las de la dueña, solo ella.

## Eventos

`sesion.abierta` · `sesion.cerrada` · `sesion.aparato_nuevo` · `acceso.sin_acceso`.

## Cómo está hecho

**Fase 5, parte 2.**

- **Las tablas** `sesiones` e `intentos_recientes` están en `apps/api/src/modulos/admin/tablas.ts` (migración `0011_cuentas.sql`). `intentos_recientes` es `UNLOGGED` y la app la puede depurar; de una sesión, la app solo cambia su actividad, su confirmación con Google y su cierre.
- **Google** (`apps/api/src/nucleo/acceso/google.ts`): `crearAccesoConGoogle` lee el documento de descubrimiento una vez, con `enableNonRepudiationChecks` para que openid-client revise la firma del `id_token` con las llaves públicas; él revisa también `iss`, `aud`, `exp`, `nonce`, `state`, el verificador de PKCE y, con `max_age`, el `auth_time`. Aquí se pide además `email_verified`. El correo se guarda en minúsculas.
- **Las cookies** (`nucleo/acceso/cookies.ts`): `ua_sesion` y `ua_aparato` llevan 32 bytes al azar y la base guarda su SHA-256. `ua_google` lleva el `state`, el `nonce`, el verificador, el propósito y la ruta de regreso cifrados con AES-256-GCM, con una llave que sale de `COOKIE_SECRETO` por HKDF; vence a los 10 minutos.
- **La ida y la vuelta** (`nucleo/acceso/entrada.ts`) son un plugin de Fastify que el servidor registra si tiene `entradaConGoogle`; no van por `/v1/acciones` (decisión 376).
  - Las fallas regresan a la pantalla de acceso de la web con su error (`/acceso?error=google_fallo` o `sin_acceso`); el correo de la cuenta sin acceso va en el fragmento (`#correo=…`), que no llega a ningún servidor.
  - La ruta de regreso solo puede ser de la web: `rutaInterna` descarta la que trae un carácter de control (`/\t/otro.com` se volvería `//otro.com`) y la resuelve contra la web; si queda en otro sitio, regresa a `/`.
  - Buscar la cuenta, ponerle su `google_sub` (solo si no tenía), abrir la sesión y escribir su bitácora van en una transacción, con la cuenta bloqueada: si le quitan el acceso a la vez, una de las dos espera. Si el navegador traía otra sesión abierta, se cierra con `salio`.
  - `ua_google` vale para una sola vuelta en el navegador, que la borra; el servidor no guarda que ya se usó: con la cookie httpOnly y el código de Google que sirve una vez, repetirla pide otro código emitido para la misma ida (decisión 385).
  - La cuenta sin acceso se anota como el sistema, sin cuenta, con `correo_intento` y alerta (decisión 381).
  - Al entrar, la sesión no queda confirmada con Google: eso lo hace «Confirmar con Google» (decisión 377).
- **Las sesiones** (`nucleo/acceso/sesion.ts`): `abrirSesion` dice si es la primera entrada de la cuenta y si el aparato es nuevo (ninguna sesión suya con esa huella). `revisarSesion` revisa en el orden de arriba, cierra con su motivo y escribe la actividad a lo más una vez por minuto (con `sinActividad`, no la escribe). `describirAparato` arma «iPhone · Safari».
- **La conexión en vivo no vale más que su sesión** (`nucleo/sincronizacion/eventos-en-vivo.ts`): con cada latido, y en cuanto llega un evento `sesion.*` o `cuenta.*` de su cuenta, vuelve a identificar con su cookie, sin contar como actividad. Si la sesión ya no vale (cerrada, vencida, inactiva o la cuenta sin acceso), el servidor le manda `sesion_cerrada` con el motivo con que se cerró y corta la conexión; si cambiaron sus departamentos, rearma lo que le toca (decisión 386). Solo vale la revisión más nueva: la de un evento pasa por encima de la que estaba en curso, y el latido no empieza otra mientras haya una.
- **Los intentos** (`nucleo/acceso/intentos.ts`): `anotarFalla` cuenta en una sola sentencia (dos instancias a la vez cuentan las dos) y bloquea hasta que pasa la ventana; `bloqueadaHasta` también quita lo que ya no cuenta.
- **Las acciones** `admin.salir`, `admin.cerrar_mi_sesion` y `admin.cerrar_sesiones` (`modulos/admin/acciones/`), con sus contratos en `contratos/admin/cuentas.ts`. `admin.salir` dice en su contrato que cierra la sesión (`cierraLaSesion`), y el servidor borra `ua_sesion` al responder (decisión 378). `sesion.cerrada` manda `sesion_cerrada` a cada sesión cerrada.
- **Los accesos en la bitácora** van con `tipo: "acceso"`, el departamento `admin` y la IP: el renglón acepta `tipo`, `departamento`, `correoIntento` e `ip` (decisión 379).
- **Los parámetros** `admin.sesion_*`, `admin.reautenticacion_minutos`, `admin.intentos_entrada_max` y `admin.minutos_ventana_intentos` están en `modulos/admin/parametros.ts`.
- **En local**, `nucleo/acceso/google-local.ts` (que se niega a correr fuera de `ENTORNO=local`) es el Google de desarrollo con oidc-provider (`GOOGLE_EMISOR=http://localhost:4000`), que `pnpm local` arranca: su pantalla pide un correo, el `sub` es el correo, pide PKCE y pone el correo en el `id_token`. La API lo usa con `permitirHttp`.
- **Las pruebas:** `modulos/admin/acciones/entrar-con-google.prueba.ts` (firma, `nonce`, audiencia, vencimiento, emisor y correo sin verificar malos; ida cambiada, `state` ajeno y otro reto de PKCE; el registro técnico sin códigos ni tokens; las rutas de regreso con caracteres escondidos), `confirmar-con-google.prueba.ts` y `cerrar-sesiones.prueba.ts`; `nucleo/acceso/intentos.prueba.ts` (con dos instancias), `sesion.prueba.ts` y `cookies.prueba.ts` (la ida vence a los 10 minutos); `nucleo/sincronizacion/conexion-y-sesion.prueba.ts` (quitar el acceso corta la conexión, cambiar departamentos cambia lo que le llega, la inactividad la corta con el latido). El simulador de Google pone `auth_time` y da tokens dañados.
