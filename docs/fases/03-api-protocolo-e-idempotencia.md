# Fase 03: API: protocolo e idempotencia ●

> **Etapa:** Cimientos.
> **Estado:** Pendiente.
> **Antes de empezar:** lee la [forma de trabajo](../trabajo/FORMA-DE-TRABAJO.md) y la [revisión de fase](../trabajo/REVISION-DE-FASE.md).
> **Se conecta con:** [fases](FASES.md) · [fase 2](02-base-de-datos-y-pruebas.md) · [fase 4](04-servicios-comunes.md)

## Objetivo

La API habla su protocolo completo: acciones y consultas con sus contratos, errores en español, la clave de idempotencia que nunca duplica, el `409` cuando alguien más cambió el registro, el corredor de acciones que usarán todos los módulos, el cliente con tipos y la documentación de la API en local.

## Depende de

- [Fase 2](02-base-de-datos-y-pruebas.md), terminada y en verde.

## Qué se construye

### Parte 1 · El servidor y el protocolo

**Construye:** `apps/api/src/servidor.ts` con Fastify; las rutas `POST /v1/acciones/{modulo}.{accion}` y `GET /v1/consultas/{modulo}.{consulta}` armadas desde los contratos registrados; `GET /v1/salud`; la forma de las respuestas y de los errores con su tabla completa; la revisión del `Origin` en las acciones; `426` por versión de app; los mensajes de Zod en español; helmet y CORS con credenciales para el subdominio de la web; pino con una `referencia` por error `500`.

**Leer:**
- [API](../cimientos/API.md) — el protocolo, las rutas fijas, los errores y sus mensajes.
- [regla de contratos](../../.claude/rules/contratos.md) — cómo se define cada contrato.

### Parte 2 · El corredor de acciones y los módulos

**Construye:** el registro de módulos por carpeta (`nucleo/modulos.ts`); el corredor que corre cada acción en el orden fijo de diez pasos; el contexto de la acción (transacción, quién llama, «ahora», día de negocio, parámetros, internas, lecturas, eventos y bitácora); las acciones internas dentro de la transacción de quien llama; el error de regla que sale como `422`.

**Leer:**
- [módulos](../cimientos/MODULOS.md) — las reglas de un módulo y cómo corre una acción.
- [estructura](../cimientos/ESTRUCTURA.md#un-módulo-por-dentro) — las carpetas de un módulo.

### Parte 3 · Idempotencia y pisadas

**Construye:** la tabla `comandos_recibidos` del módulo `admin`, con sus permisos por columna; apartar la clave al empezar la transacción; el repetido con la misma respuesta, también cuando llegan dos a la vez; `clave_usada`; las respuestas guardadas sin secretos; el control de `version` con el `409` y sus datos; el control por agregado (un cambio en un renglón sube la versión del encabezado).

**Leer:**
- [idempotencia y concurrencia](../cimientos/IDEMPOTENCIA-Y-CONCURRENCIA.md) — la clave, la tabla, el `409` y los reintentos.
- [base de datos](../cimientos/BASE-DE-DATOS.md#candados) — el reintento ante bloqueos, que ya existe desde la fase 2.

### Parte 4 · Consultas y recorte

**Construye:** las consultas con paginación por cursor opaco; el recorte según la cuenta con la lista `recortado`; el `404` para lo que la cuenta no puede ver.

**Leer:**
- [API](../cimientos/API.md#el-recorte-según-la-cuenta) — el recorte y la paginación.

### Parte 5 · Contratos, cliente y documentación de la API

**Construye:** la forma de definir un contrato de acción y de consulta en `packages/compartido` (nombre, entrada, salida, permiso y errores); el cliente con tipos que sale de los contratos, con la clave que se reusa en los reintentos y las respuestas `401 reautenticar`, `426` y `409` atendidas; `openapi.json` con @fastify/swagger y `pnpm api:documentar`; Scalar en `/v1/documentacion` solo en local; el paso de la revisión completa que falla si `openapi.json` no está al día.

**Leer:**
- [paquete compartido](../cimientos/PAQUETE-COMPARTIDO.md#el-cliente-de-la-api) — el cliente.
- [API](../cimientos/API.md#la-documentación-de-la-api) — la documentación y cuándo cambia un contrato.

## Cómo se construye

- Un solo agente, una parte a la vez.
- Todavía no hay módulos del negocio: las pruebas usan un módulo de prueba (`modulos/prueba/`, solo en la base y el registro de las pruebas) con una acción que crea, una que edita, una interna y una consulta.
- Cómo se identifica quien llama llega en las fases 5 (sesión) y 6 (llave del aparato). Aquí el paso existe y las pruebas le dan quién llama con un identificador de prueba que solo se registra en las pruebas.
- No va en esta fase: la sesión de Google, las llaves de los aparatos, la sincronización ni ningún módulo del negocio.

## Excepciones permitidas

- `admin.escribir_bitacora` y `admin.guardar_evento` llegan en la fase 4. Aquí el corredor ya los pide en su paso, y las pruebas revisan que los pide una sola vez por acción.
- La versión mínima de cada app se lee de los parámetros desde la fase 4; aquí la prueba le da el valor.
- La tabla `comandos_recibidos` es del módulo `admin`, pero nace aquí porque la idempotencia la necesita. Sus columnas que apuntan a tablas de fases posteriores llevan su `@llavePendiente`.

## Criterios de terminado

| Criterio | Prueba que lo demuestra |
|---|---|
| Una acción válida responde `{ ok, resultado, avisos }` con su `resultado.mensaje`; una inválida, `400` con cada campo y su mensaje en español | `nucleo/http/acciones.prueba.ts` |
| Cada error de la tabla de la API sale con su forma y su mensaje; un `500` no enseña la causa y su `referencia` está en el registro técnico | `nucleo/http/errores.prueba.ts` |
| Una acción con un `Origin` ajeno responde `403 origen_no_valido`; una llamada sin versión o con versión vieja, `426` | `nucleo/http/encabezados.prueba.ts` |
| Una acción que falla en cualquier paso no deja nada: ni sus escrituras, ni su clave, ni lo que hicieron sus internas | `nucleo/acciones/atomica.prueba.ts` |
| La misma clave dos veces escribe una vez y contesta lo mismo; dos a la vez, también; con otros datos, `clave_usada`; después de fallar, el reintento sí aplica | `nucleo/idempotencia/idempotencia.prueba.ts`, con llamadas al mismo tiempo |
| Una respuesta con un secreto se repite sin el secreto y con `secreto_entregado` | `nucleo/idempotencia/secretos.prueba.ts` |
| Con cualquier serie de reintentos, respuestas perdidas y llamadas al mismo tiempo, la base queda igual que sin fallas | `nucleo/idempotencia/azar.prueba.ts`, con fast-check |
| Una edición con versión vieja recibe `409` con la versión actual y sus datos recortados; un cambio en un renglón sube la versión del encabezado | `nucleo/acciones/pisadas.prueba.ts` |
| Una carpeta nueva en `modulos/` registra sus acciones, consultas, internas y lecturas sin tocar ningún otro archivo | `nucleo/modulos.prueba.ts` |
| Una consulta pagina con cursor, no regresa un campo recortado y lo dice en `recortado`; un registro que la cuenta no puede ver responde `404` | `nucleo/http/consultas.prueba.ts` |
| El cliente solo compila con nombres y datos que existen en los contratos, reusa la clave al reintentar y atiende `401 reautenticar`, `426` y `409` | `packages/compartido/src/cliente/cliente.prueba.ts`, con pruebas de tipos |
| `openapi.json` coincide con los contratos; `/v1/documentacion` existe en local y en producción responde `404` | `nucleo/http/documentacion.prueba.ts` y el paso de la revisión completa |

## Revisión de fase

Delicada ●: tres [auditores](../../.claude/agents/auditor.md), cada uno con su tema, y el [desmentidor](../../.claude/agents/desmentidor.md):

- **sincronización** (aquí, la idempotencia y las pisadas: nada se duplica ni se pisa);
- **permisos y datos personales** (el recorte y el `404`);
- **secretos** (respuestas guardadas sin secretos, errores que no enseñan la causa).
