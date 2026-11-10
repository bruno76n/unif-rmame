# Idempotencia y concurrencia

> **Qué cubre:** la clave de idempotencia de cada acción y la tabla `comandos_recibidos`, el «repetido» con la misma respuesta, `version` y el `409` cuando alguien más cambió el registro, el control por agregado y los reintentos.
> **Estado:** Decidido.
> **Se construye en:** [fase 3 ●](../fases/03-api-protocolo-e-idempotencia.md).
> **Se conecta con:** [API](API.md) · [base de datos](BASE-DE-DATOS.md) · [sincronización](SINCRONIZACION.md) · [módulos](MODULOS.md) · [dispositivos](../modulos/admin/dispositivos.md) · [paquete compartido](PAQUETE-COMPARTIDO.md) · [reservas](../modulos/inventario/reservas.md) · [libro de movimientos](../modulos/inventario/libro-de-movimientos.md)

## Para qué sirve

El internet de la fábrica se cae, una pantalla manda dos veces cuando alguien aprieta rápido, y la respuesta de una acción se puede perder en el camino. Nada de eso puede cobrar dos veces, crear dos pedidos o mover piezas de más. Y si dos personas editan el mismo pedido al mismo tiempo, la segunda no puede pisar sin saberlo lo que guardó la primera.

## La clave de idempotencia

1. **Cada acción trae su `clave_idempotencia`** (uuid v7). La hace el cliente cuando la persona aprieta el botón, y la misma intención reusa la misma clave en cada reintento (ver [el cliente](PAQUETE-COMPARTIDO.md#el-cliente-de-la-api)).
2. **La clave se guarda en `comandos_recibidos` en la misma transacción que la acción.** Si la acción falla, no queda nada guardado y un reintento la vuelve a intentar.
3. **Si la misma clave llega otra vez con el mismo contenido,** la API contesta exactamente lo que contestó la primera vez y no escribe nada más.
4. **Si la misma clave llega con otro contenido:** `422 regla`, `codigo: clave_usada`, «Esa operación ya se mandó con otros datos. Recarga la pantalla.»
5. **Si llegan dos a la vez con la misma clave,** la segunda espera a que termine la primera y contesta lo mismo. La transacción empieza apartando la clave (`INSERT … ON CONFLICT DO NOTHING`): si ya estaba, espera a que la otra transacción termine y lee su respuesta.
6. **«El mismo contenido»** se compara con `carga_hash`: el SHA-256 de la acción y sus datos, con las llaves del JSON en orden.
7. **Una respuesta con un secreto** (un PIN, la llave de una credencial) se guarda sin él. El reintento recibe la misma respuesta sin el secreto y con `secreto_entregado: true`. Ninguna respuesta guardada lleva PIN, llaves ni códigos.

Los aparatos usan la misma tabla, comando por comando; lo propio de ellos (apartados, excepciones, retenidos) está en la [sincronización](SINCRONIZACION.md).

## La tabla `comandos_recibidos`

Cada acción que llegó, de la web, de un aparato o de uniformame.mx. Hace que un reintento nunca duplique. Es del módulo `admin`.

| Columna | Tipo | Nulo | Qué es |
|---|---|---|---|
| `id` | uuid | no | Llave (v7) |
| `clave_idempotencia` | uuid | no | La que trajo la acción. Única en toda la tabla, no por aparato: un aparato reinstalado con su cola vieja tampoco duplica |
| `origen` | text | no | CHECK (`web`, `aparato`, `linea`) |
| `dispositivo_id` | uuid | sí | → `dispositivos.id`. Obligatorio con `aparato` y `linea` |
| `usuario_id` | uuid | sí | → `usuarios.id`: la cuenta, en la web |
| `sesion_id` | uuid | sí | → `sesiones.id`: la sesión, en la web |
| `persona_id` | uuid | sí | → `personas.id`: quien lo hizo en el aparato (la costurera, la cajera) |
| `tipo_comando` | text | no | El nombre de la acción: `produccion.registrar_operacion` |
| `ocurrido_en` | timestamptz | no | Cuándo pasó: la hora del aparato, o la del servidor en la web |
| `recibido_en` | timestamptz | no | default `now()` |
| `carga_hash` | text | no | Huella del contenido |
| `carga` | jsonb | sí | El comando como llegó. Se guarda en los apartados y en las excepciones, para revisarlos |
| `resultado` | text | no | CHECK (`aplicado`, `excepcion`, `apartado`) |
| `motivo_apartado` | text | sí | Obligatorio con `apartado` |
| `espera_entidad_id` | uuid | sí | Con el motivo `falta_documento`: el documento que espera |
| `dispositivo_revocado` | boolean | no | default false. Llegó de un aparato ya revocado |
| `excepcion_id` | uuid | sí | → `excepciones.id`, cuando se aplicó pero no cuadra |
| `entidad` · `entidad_id` | text · uuid | sí | El documento que creó o tocó |
| `respuesta` | jsonb | sí | Lo que se contestó, sin secretos |
| `reintentos` · `ultimo_reintento_en` | integer · timestamptz | no · sí | default 0. Los reintentos de un apartado |
| `descartado_en` · `descartado_por` · `motivo_descarte` | timestamptz · uuid · text | sí | Un apartado que se descartó |
| `retenido_aplicado_en` · `retenido_aplicado_por` | timestamptz · uuid | sí | Un comando de un aparato revocado que la dueña aplicó |
| `actualizado_en` | timestamptz | sí | |

- **CHECK:** `dispositivo_id` no nulo si `origen` es `aparato` o `linea`; `usuario_id` y `sesion_id` no nulos si es `web`; `motivo_apartado` no nulo si `resultado` es `apartado`.
- **Lo que nunca cambia:** quién la mandó, la clave, el origen, la acción, la carga, su huella y sus dos horas. El rol de la app solo puede cambiar el resultado, la respuesta, el documento, la excepción y las columnas de reintento, descarte y retenido.
- **Índices:** único (`clave_idempotencia`); (`dispositivo_id`, `recibido_en` desc); (`recibido_en`) donde `resultado = 'apartado'` y `descartado_en` es nulo; (`espera_entidad_id`) donde no es nulo.
- **No se parte por mes** ni se depura: su llave única tiene que cubrir todos los meses, o un reintento que cruza de mes duplicaría.
- `usuarios`, `sesiones`, `dispositivos`, `personas` y `excepciones` llegan en fases posteriores: esas columnas nacen con su marca `@llavePendiente` (ver [base de datos](BASE-DE-DATOS.md#llaves-que-apuntan-a-una-fase-posterior)).

Cómo se reintenta, se descarta o se aplica un comando apartado o retenido está en [dispositivos](../modulos/admin/dispositivos.md).

## Que nadie pise a nadie

1. **Toda acción que edita algo que ya existe trae la `version` que leyó.** La escritura solo pasa si la versión sigue igual: `UPDATE … WHERE id = $1 AND version = $2`.
2. **Si alguien cambió el registro mientras tanto:** `409 conflicto_version`, con la versión actual y sus datos (recortados según la cuenta). La pantalla los muestra y la persona decide: «Alguien más cambió esto mientras lo veías. Revisa y vuelve a guardar.» Nunca se reintenta sola.
3. **Por agregado:** producto, receta, pedido, orden de compra, material (con sus proveedores) y lote (con sus tallas) llevan su versión en el encabezado, y cualquier cambio en sus renglones la sube. Así dos personas que editan renglones distintos del mismo pedido también chocan, y ninguna guarda un pedido que ya no vio completo.
4. **Lo que llega de un aparato no lleva `version`:** lo que ya pasó no se rechaza por pisadas; si no cuadra, se aplica igual y abre una excepción (ver [sincronización](SINCRONIZACION.md)).

## Los reintentos

| Quién | Cuándo reintenta | Cómo |
|---|---|---|
| **El cliente** (web y tablet) | Sin red, sin respuesta, `500` o `503` | Con la misma clave, con espera creciente. Nunca ante un `4xx` |
| **El cliente**, ante `401 reautenticar` | Después de «Confirmar con Google» | Con la misma clave, una vez |
| **El núcleo de la API** | Si Postgres corta la transacción por bloqueo o serialización (`40P01`, `40001`) | La transacción completa, hasta tres veces, con la misma clave (ver [base de datos](BASE-DE-DATOS.md#candados)) |
| **Nadie** | Ante `409 conflicto_version` | Decide la persona |

## Cómo se prueba

- La misma acción dos veces con la misma clave escribe una sola vez y contesta lo mismo; dos a la vez, también.
- La misma clave con otros datos responde `clave_usada`.
- Una acción que falla no deja su clave guardada, y el reintento la aplica.
- Una respuesta con secreto se repite sin el secreto.
- Dos ediciones con la misma versión: la primera pasa y la segunda recibe `409` con los datos nuevos; un cambio en un renglón sube la versión del pedido.
- La prueba con datos al azar de la [regla de pruebas](../../.claude/rules/pruebas.md): cualquier serie de reintentos, respuestas perdidas y llamadas al mismo tiempo deja la base igual que sin fallas.

## Lo que llega después

- `usuario_panel_id` (quien lo hizo en el panel de uniformame.mx) se agrega cuando se construya uniformame.mx.

## Cómo está hecho

**Fase 3.**

- **La tabla** `comandos_recibidos` es de `admin` (`apps/api/src/modulos/admin/tablas.ts`, migración `0002_comandos_recibidos.sql`), con sus CHECK, sus índices y sus `@llavePendiente`. La migración le quita a la app el `UPDATE` de la tabla y le da solo el de `resultado`, `respuesta`, `entidad`, `entidad_id`, `excepcion_id`, las columnas de reintento, descarte y retenido, y `actualizado_en`.
- **Apartar la clave** (`apps/api/src/nucleo/idempotencia/claves.ts`, `apartarClave`): `INSERT … ON CONFLICT (clave_idempotencia) DO NOTHING RETURNING id` dentro de la transacción de la acción. Si otra transacción la apartó y no terminó, Postgres espera en el índice único; cuando confirma, esta lee su `carga_hash` y su `respuesta`.
- **La huella** (`huellaDeCarga`): SHA-256 del JSON de `{ accion, datos, version }` con las llaves de cada objeto en orden. La misma huella contesta la respuesta guardada; otra, `422 clave_usada`.
- **Los secretos:** el contrato los declara en `secretos` y su campo tiene que ser opcional (`definirAccion` lo revisa). `sinSecretos` los quita de la respuesta que se guarda y le pone `secreto_entregado: true`, que llega así en el reintento (decisión 341).
- **El `409`** lo arma `tomarVersion` (ver [módulos](MODULOS.md#cómo-está-hecho)).
- **El cliente** reintenta con la misma clave (ver [paquete compartido](PAQUETE-COMPARTIDO.md#cómo-está-hecho)).
- **Las pruebas:** `nucleo/idempotencia/idempotencia.prueba.ts` (dos veces, dos a la vez, `clave_usada`, el reintento después de fallar), `secretos.prueba.ts`, `azar.prueba.ts` (fast-check: intenciones mandadas de una a tres veces, al mismo tiempo o una tras otra, después de una falla pasajera; al final una nota por intención y la misma respuesta a cada envío) y `apps/api/src/modulos/admin/comandos-recibidos.prueba.ts` (lo que la app cambia y lo que no, sus CHECK y la clave única).
