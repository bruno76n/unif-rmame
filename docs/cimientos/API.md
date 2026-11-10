# API

> **Qué cubre:** el protocolo de la API: acciones y consultas, el cuerpo y la respuesta, los avisos, la paginación, el recorte según la cuenta, la versión de la app, los errores con sus mensajes en español, el cliente con tipos y la documentación OpenAPI que sale sola de los contratos.
> **Estado:** Decidido.
> **Se construye en:** [fase 3 ●](../fases/03-api-protocolo-e-idempotencia.md).
> **Se conecta con:** [regla de contratos](../../.claude/rules/contratos.md) · [arquitectura](ARQUITECTURA.md) · [idempotencia y concurrencia](IDEMPOTENCIA-Y-CONCURRENCIA.md) · [módulos](MODULOS.md) · [acceso y permisos](ACCESO-Y-PERMISOS.md) · [sincronización](SINCRONIZACION.md) · [eventos y trabajos](EVENTOS-Y-TRABAJOS.md) · [seguridad](SEGURIDAD.md) · [pruebas](PRUEBAS.md) · [paquete compartido](PAQUETE-COMPARTIDO.md) · [bitácora](../modulos/admin/bitacora.md) · [textos](../interfaz/TEXTOS.md) · [pantallas comunes](../interfaz/comunes.md) · [auditor](../../.claude/agents/auditor.md) · [el puente de impresión](../apps/puente-de-impresion.md) · [la tablet del taller](../apps/tablet.md)

## Una sola API

Todo pasa por aquí: la web de la fábrica, la tablet, el programa puente y, después, la caja de las tiendas y uniformame.mx. No hay otra forma de leer o escribir la base. La API habla JSON sobre HTTPS y todo vive bajo `/v1/`.

## Acciones y consultas

**Una acción cambia algo:** `POST /v1/acciones/{modulo}.{accion}`.

- El nombre va en español, en snake_case y con verbo: `ventas.confirmar_pedido`, `inventario.recibir_traspaso`.
- **Una acción es una sola transacción:** hace todo lo que le toca (sus tablas, los movimientos de inventario, las reservas, las acciones internas de otros módulos, la bitácora y los eventos) o no hace nada. Cómo se escribe está en [módulos](MODULOS.md).
- **El cuerpo:**

  ```json
  { "clave_idempotencia": "0193f1c2-…", "datos": { … }, "version": 41 }
  ```

  `clave_idempotencia` va siempre (ver [idempotencia](IDEMPOTENCIA-Y-CONCURRENCIA.md)); `version` va solo cuando la acción edita algo que ya existe, con la versión que se leyó.
- **La respuesta correcta:**

  ```json
  { "ok": true, "resultado": { "mensaje": "PE-0150 confirmado para Colegio Morelos. El precio quedó congelado", … }, "avisos": [] }
  ```

  `resultado.mensaje` es el texto del aviso verde que muestra la pantalla, tal como lo dice el archivo de la acción. `avisos` son mensajes que no bloquean («Ojo: cambio de más de 30 %»). Si la acción cambió algo que ya existía, `resultado.version` trae su versión nueva (la del agregado, ver [idempotencia](IDEMPOTENCIA-Y-CONCURRENCIA.md)): así la pantalla que sigue abierta guarda lo siguiente sin chocar con su propio cambio.

**Una consulta solo lee:** `GET /v1/consultas/{modulo}.{consulta}?…`.

- Hay una por pantalla, pestaña o cajón, con lo que esa pantalla necesita y nada más.
- **La respuesta:** `{ "ok": true, "resultado": { … }, "recortado": [ … ] }`.
- **Paginación con cursor:** las que traen listas largas reciben `cursor` y `limite`, y regresan dentro de `resultado` sus `renglones`, el `cursor` siguiente y `hay_mas`. El cursor es opaco: el cliente no lo arma ni lo interpreta.

**Las rutas fijas** que no son acciones ni consultas:

| Ruta | Para qué | Dónde se describe |
|---|---|---|
| `GET /v1/acceso/google` · `GET /v1/acceso/google/vuelta` | Entrar con Google y «Confirmar con Google» | [acceso con Google](../modulos/admin/acceso-con-google.md) |
| `POST /v1/sync/subir` · `GET /v1/sync/bajar` · `GET /v1/sync/foto` | La sincronización de los aparatos | [sincronización](SINCRONIZACION.md) |
| `GET /v1/eventos` | Los avisos en vivo | [eventos y trabajos](EVENTOS-Y-TRABAJOS.md) |
| `POST /v1/archivos/subida` · `GET /v1/archivos/{id}` | Subir y abrir archivos | [archivos](../modulos/admin/archivos.md) |
| `GET /v1/etiquetas/{tipo}/{id}?formato=zpl\|pdf` | Etiquetas y hojas | [impresión](../modulos/admin/impresion.md) |
| `GET /v1/salud` | Que la API está viva y llega a la base, sin datos, para el balanceador de Render | Aquí |

## Quién llama

| Cliente | Credencial | Encabezados |
|---|---|---|
| Web de la fábrica | Cookie `ua_sesion` | `X-App-Version`; en las acciones, el `Origin` tiene que ser el del sistema |
| Teléfono para escanear | La cookie más la llave del teléfono | Los de la web y `Authorization: Llave {llave_id}.{secreto}` |
| Tablet del taller | Llave del aparato | `Authorization`, `X-App-Version`, `X-Pendientes` (lo que le queda en la cola) |
| Programa puente | Llave del aparato | `Authorization`, `X-App-Version` |
| Caja de tienda (después) | Llave del aparato | Igual que la tablet |
| uniformame.mx (después) | Llave de su credencial de servidor | `Authorization` y `X-Usuario-Panel` |

Cómo se entra, cómo se revisa el permiso en cada llamada y qué puede cada cuenta está en [acceso y permisos](ACCESO-Y-PERMISOS.md). El permiso se revisa siempre en el servidor, antes de abrir la transacción.

## El recorte según la cuenta

- **Lo que una cuenta no debe ver no viaja.** El campo no viene en la respuesta, y `recortado` dice cuáles faltan para que la pantalla ponga «••••». Nunca viaja un valor con la orden de esconderlo.
- Sin el permiso «ven sueldos y tarifas», no viajan el pago por día de una persona, las tarifas por pieza ni los montos de nómina.
- Cada consulta dice en su archivo qué recorta y para quién (por ejemplo, Aduana nunca recibe precios).
- **Un registro que la cuenta no puede ver responde `404`,** como si no existiera.

## La versión de la app

Cada llamada manda `X-App-Version`. Si falta o es menor que la mínima de su cliente (los parámetros `admin.version_minima_web`, `admin.version_minima_tablet` y `admin.version_minima_puente`; el de la caja llega con el POS), la API responde `426 actualizar` con la versión mínima. La web recarga; un aparato se actualiza.

**Cuando cambia un contrato:** la revisión completa compara `openapi.json` con el que está en git y muestra qué contratos cambiaron. Si un cambio rompe un contrato que usa un aparato, se sube la versión mínima de esa app en la misma fase, para que ningún aparato se quede a medias con la versión vieja.

**La mínima que vale** es la mayor entre su parámetro (abajo) y la que pide el código junto a los contratos (`packages/compartido/src/contratos/versiones.ts`). La fase que rompe un contrato sube la del código; la dueña solo puede subirla más, para obligar a actualizar sin esperar un cambio.

## Los errores

Toda respuesta de error trae `{ "ok": false, "error", "codigo", "mensaje", … }`. El `mensaje` va en español, como dice la [guía de textos](../interfaz/TEXTOS.md): qué pasó y qué hacer, sin adornos. Si la muestra trae el texto, se usa el de la muestra.

| HTTP | `error` | `codigo` generales | Cuándo | Qué trae y mensaje |
|---|---|---|---|---|
| 400 | `validacion` | — | Un dato no cumple su forma | `campos: { campo: mensaje }`, con el mensaje que la muestra pone debajo del campo («Escribe el motivo») |
| 401 | `sin_sesion` | `sin_sesion` · `sesion_vencida` · `sesion_cerrada` · `llave_invalida` · `llave_revocada` · `usuario_panel_inactivo` | No hay sesión, venció, la cerraron, o la llave no existe o fue revocada | «Tu sesión se cerró. Vuelve a entrar.» · «Este aparato fue revocado: ya no entra.» |
| 401 | `reautenticar` | — | Falta «Confirmar con Google» reciente | `proposito`, `minutos`. «Confirma con Google para seguir.» |
| 403 | `sin_permiso` | `sin_departamento` · `sin_permiso_fino` · `solo_duena` · `fuera_de_alcance` · `origen_no_valido` | La cuenta no tiene el departamento o el permiso fino, no es la dueña, o el aparato no puede eso | El texto de la muestra si lo hay: «Solo la dueña registra dispositivos» · «Esta cuenta no tiene acceso a sueldos. Lo decide la dueña en Administración del sistema.» |
| 404 | `no_existe` | — | No existe, o existe pero la cuenta no lo puede ver | — |
| 409 | `conflicto_version` | — | Alguien cambió el registro desde que se leyó | La `version` actual y sus datos, recortados. «Alguien más cambió esto mientras lo veías. Revisa y vuelve a guardar.» |
| 422 | `regla` | El de cada acción · `clave_usada` | Una regla del negocio lo impide | `codigo` y `mensaje`. Ejemplo: `rollo_sin_usar`, «Del rollo R-0433 no se usó nada: quítalo de la lista» |
| 413 | `demasiado_grande` | — | El cuerpo pasa del límite (ver [seguridad](SEGURIDAD.md#los-límites)) | «Lo que se mandó es demasiado grande.» |
| 426 | `actualizar` | — | App vieja | `version_minima`. «Hay una versión nueva. Actualiza para seguir.» |
| 429 | `demasiados_intentos` | — | Demasiadas entradas fallidas, códigos de registro equivocados o peticiones de más (ver [seguridad](SEGURIDAD.md#los-límites)) | `reintentar_en`. «Demasiados intentos. Vuelve a intentar a las {hora}.» |
| 500 | `error_interno` | — | Falla del servidor | `referencia` para encontrarla en el registro técnico. «Algo falló de nuestro lado. Ya quedó registrado; vuelve a intentar.» |
| 503 | `no_disponible` | — | Mantenimiento o restauración | `reintentar_en`. Los aparatos lo tratan como «sin internet» |

- **Los códigos de `422`** son de cada acción: los dice su archivo, con su mensaje. Están en snake_case y son estables, porque las pantallas y las pruebas los usan.
- **Los mensajes genéricos de validación** salen en español del idioma de Zod; los de cada campo, del contrato.
- **Un `500` nunca enseña** la causa, la consulta ni el error de la base: eso va al registro técnico con la `referencia`.

## Los contratos

Cada acción y cada consulta tiene su contrato Zod en `packages/compartido/src/contratos/<modulo>/`: su nombre, su entrada, su salida, quién puede llamarla y qué errores puede dar. De ese mismo contrato salen:

1. la validación de la API (fastify-type-provider-zod), antes de tocar la base;
2. la validación de los formularios de la web y la tablet;
3. el cliente con tipos (ver [paquete compartido](PAQUETE-COMPARTIDO.md#el-cliente-de-la-api));
4. la documentación OpenAPI.

Cómo se escribe cada uno está en la [regla de contratos](../../.claude/rules/contratos.md).

## La documentación de la API

- **Sale sola de los contratos:** `pnpm api:documentar` genera `apps/api/openapi.json` con @fastify/swagger. Cada campo lleva su descripción en español (`.describe()`).
- **Se navega en local:** con la API corriendo en local, Scalar muestra la documentación en `/v1/documentacion`, para probar cada acción con sus ejemplos. En producción esa ruta no existe: la API no es pública.
- `openapi.json` entra a git, y la revisión completa falla si no está al día con los contratos.

## Parámetros

Los cambia solo la dueña, en Configuración · Técnicos (ver [configuración](../modulos/admin/configuracion.md)).

| Parámetro | Valor inicial | Para qué |
|---|---|---|
| `admin.version_minima_web` | 1.0.0 | La versión más vieja de la web que se acepta |
| `admin.version_minima_tablet` | 1.0.0 | La de la tablet del taller |
| `admin.version_minima_puente` | 1.0.0 | La del programa puente |

Los tres van en la sección `tecnico`. El de la caja llega con el POS.

## Cómo se prueba

- Cada error de la tabla sale con su forma y su mensaje (`inject()` de Fastify).
- Una acción con un `Origin` ajeno responde `403 origen_no_valido`; una app vieja, `426`, contra la mayor de las dos mínimas.
- Una consulta no regresa un campo recortado y lo dice en `recortado`.
- Un `500` no deja ver la causa y regresa una `referencia` que está en el registro técnico.
- `openapi.json` coincide con los contratos.

## Cómo está hecho

**Fase 3.**

- **El servidor** (`apps/api/src/servidor.ts`): `crearServidor({ entorno, base, registro, servicios, registroTecnico, reloj })` arma Fastify 5 con `fastify-type-provider-zod`. Por cada acción registrada, `POST /v1/acciones/{nombre}` con su cuerpo (`cuerpoDeAccion`: `clave_idempotencia`, `datos` y, si edita, `version`) y su respuesta (`respuestaDeAccion`) como esquema; por cada consulta, `GET /v1/consultas/{nombre}` con sus parámetros como `querystring`. `GET /v1/salud` hace `SELECT 1` y responde `503` si la base no contesta.
- **El orden:** `preValidation` identifica a quien llama (`401 sin_sesion`), revisa la versión de su app contra la mayor entre la del código (`packages/compartido/src/contratos/versiones.ts`) y la del parámetro (`426`) y, en las acciones, el `Origin` (la web solo con el suyo; un aparato sin `Origin` o con el de la tablet; si no, `403 origen_no_valido`); luego se valida la forma contra el contrato (`400`; `nucleo/http/validacion.ts`, `validarSinTransformar`, que revisa y deja pasar los datos como llegaron: la acción los transforma una sola vez y la huella se calcula sobre el JSON que llegó); `preHandler` revisa el permiso del contrato; el manejador corre el corredor (ver [módulos](MODULOS.md#cómo-está-hecho)) o la consulta. Quién llama, el permiso y la versión del parámetro llegan como servicios (`identificar`, `revisarPermiso`, `versionMinimaDelParametro`) que construyen las fases 4, 5 y 6.
- **Los errores** (`apps/api/src/nucleo/http/errores.ts`): `ErrorDeApi(error, codigo, mensaje, extra)` con `errorDeRegla`, `noExiste` y `conflictoDeVersion`; `responderError` arma la respuesta: la validación sale como `400` con `campos` (el nombre del campo sin el `datos/` de adelante; los campos de más, por su nombre), un cuerpo de más de 1 MB como `413`, cualquier otro `4xx` de Fastify (un cuerpo que no es JSON, de otro tipo o vacío) como `400`, y cualquier otro error como `500` con una `referencia` (uuid) que queda en el registro técnico con la causa (`errorParaElRegistro`: de un error de la base, su consulta y su código, nunca sus valores ni su `detail`). La tabla con el estado y el mensaje de cada error está en `packages/compartido/src/contratos/protocolo.ts`, y los mensajes de Zod salen en español (`z.config(z.locales.es())`).
- **Lo demás:** CORS con `delegator`: la web con credenciales, la tablet sin ellas, nadie más; helmet con HSTS de un año, `no-referrer`, `same-site` y sin CSP (la CSP es de los sitios estáticos; decisión 339); `Cache-Control: no-store` en las respuestas de datos y de error, también en el `404` de una ruta que no existe. El registro técnico lo arma el servidor con pino: de cada petición, el método y la ruta sin sus parámetros (`?…`), y nunca la autorización ni la cookie (decisión 342).
- **Las consultas** (`apps/api/src/nucleo/http/consultas.ts`): `cursorDe` y `leerCursor` (base64url de la posición del último renglón; uno que no dio la API sale como `400` en el campo `cursor`), `paginar` (se piden `limite + 1` para saber si hay más) y `recortar` (quita los campos y dice cuáles en `recortado`). La posición del cursor solo lleva campos que nunca se recortan (el `id`, una fecha): el cursor viaja en claro. Antes de responder, el servidor revisa que cada campo de `recortado` esté entre los `recortables` del contrato y no venga en el resultado; si viene, sale `500` sin el dato (decisión 342). Los contratos de las consultas que paginan usan `parametrosDePagina(maximo)` y `paginaDe(renglon)`.
- **La documentación:** `pnpm api:documentar` (`apps/api/src/documentar.ts`) arma el servidor con los módulos de `apps/api/src/modulos/`, sin tocar la base, y escribe `apps/api/openapi.json` con `@fastify/swagger` y `jsonSchemaTransform`; con `--revisar` (el último paso de `pnpm revision`) falla si no está al día y dice qué rutas cambiaron. La descripción de cada acción y consulta dice su permiso y lo que se le puede recortar (decisión 342). Scalar sirve la documentación en `/v1/documentacion/` solo con `ENTORNO=local`.
- **Las pruebas** usan un módulo de prueba (`apps/api/src/nucleo/pruebas/modulos/prueba/`) y `crearServidorDePrueba` (`apps/api/src/nucleo/pruebas/servidor-de-prueba.ts`), que identifica con el encabezado `x-prueba-quien` y revisa el permiso como lo hará la fase 5: `nucleo/http/acciones.prueba.ts`, `errores.prueba.ts`, `encabezados.prueba.ts`, `orden.prueba.ts` (ningún rechazo antes del permiso toma la base), `consultas.prueba.ts` y `documentacion.prueba.ts`, en el proyecto `api` de Vitest.
