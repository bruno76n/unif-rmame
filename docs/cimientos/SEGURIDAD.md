# Seguridad

> **Qué cubre:** lo que protege a todo el sistema: la base que nunca se expone, los secretos y las variables de entorno, las cookies, el origen y CORS, los encabezados de seguridad, los límites de peticiones e intentos, lo que se guarda cifrado o como hash, lo que nunca se registra, lo que llega de los aparatos y de fuera, y cómo se revisa todo en la fase 22.
> **Estado:** Decidido.
> **Se construye en:** [fase 22 ●](../fases/22-seguridad-completa.md).
> **Se conecta con:** [acceso y permisos](ACCESO-Y-PERMISOS.md) · [API](API.md) · [auditor](../../.claude/agents/auditor.md) · [arquitectura](ARQUITECTURA.md) · [infraestructura](INFRAESTRUCTURA.md) · [base de datos](BASE-DE-DATOS.md) · [acceso con Google](../modulos/admin/acceso-con-google.md) · [archivos](../modulos/admin/archivos.md) · [bitácora](../modulos/admin/bitacora.md) · [dispositivos](../modulos/admin/dispositivos.md) · [respaldos](../modulos/admin/respaldos.md) · [sincronización](SINCRONIZACION.md) · [fase 22](../fases/22-seguridad-completa.md)

## Para qué sirve

El sistema guarda el dinero, los sueldos y el inventario de la fábrica, así que nadie de fuera tiene que poder entrar y nadie de dentro tiene que ver más de lo suyo. Ejemplo: alguien copia la dirección de la API y prueba desde su casa. Sin sesión le responde `401`; con una cookie robada de otro sitio, el navegador no la manda; si insiste con códigos de registro al azar, a los pocos intentos recibe `429`; y aunque lograra ver una respuesta, nunca trae un secreto, un hash ni un sueldo que esa cuenta no deba ver.

## Reglas

1. **Todo se decide en el servidor.** Lo que una pantalla esconde no cuenta como permiso (ver [acceso y permisos](ACCESO-Y-PERMISOS.md)).
2. **Lo mínimo:** cada cuenta, cada aparato y cada servicio puede y ve lo justo para su trabajo, y nada más.
3. **Ningún secreto fuera de su lugar:** ni en el código, ni en git, ni en la bitácora, ni en los eventos, ni en las respuestas guardadas para reintentos, ni en el registro técnico.
4. **Todo viaja cifrado** (HTTPS). Lo que guarda la base de una llave, una sesión o un PIN es su hash, nunca el valor.
5. **Lo que no se necesita no se guarda.** De las personas, solo lo que usa el sistema; de los clientes en línea, solo lo del pedido.
6. **Cada regla dice quién la vigila:** una prueba, la revisión completa o la auditoría de la [fase 22](../fases/22-seguridad-completa.md).

## La base no se expone

- **Solo la API y el worker la tocan,** por la red privada de Render y con TLS. No tiene acceso desde internet: su lista de direcciones permitidas está vacía (ver [infraestructura](INFRAESTRUCTURA.md)).
- **Dos roles:** el dueño, solo para las migraciones; la app, que no puede borrar en las tablas de negocio ni cambiar las que solo crecen (ver [base de datos](BASE-DE-DATOS.md)).
- **Nadie entra a mano a producción.** Lo que haga falta se hace con una acción del sistema, con su bitácora; una revisión de emergencia la hace soporte con un acceso de solo lectura que se quita al terminar, y queda anotada en `REGISTROS.md`.
- **Las consultas siempre van con parámetros** (Drizzle): ningún texto de una persona se pega dentro de un SQL.

## Secretos y variables de entorno

- **Viven en variables de entorno:** en producción, en Render; en local, en `.env`, que nunca entra a git. `.env.ejemplo` dice cuáles hay, sin valores. La lista está en [infraestructura](INFRAESTRUCTURA.md#las-variables-de-entorno).
- **Se leen una sola vez,** al arrancar, en `nucleo/entorno.ts`, que las valida con Zod; si falta una o está mal, el proceso no arranca y dice cuál, sin enseñar su valor.
- **Cada servicio con su propia credencial y lo mínimo:** la del cubo de respaldos solo escribe; la de archivos solo su cubo; la de Resend solo manda correo.
- **Los secretos de los aparatos** no los conoce nadie: los hace el propio aparato y el servidor guarda su SHA-256 (ver [dispositivos](../modulos/admin/dispositivos.md)).
- **La llave privada de los respaldos** la guarda Bruno fuera del sistema (ver [respaldos](../modulos/admin/respaldos.md)).
- **Si un secreto se filtra,** se cambia en su servicio y en Render y se vuelve a desplegar; se anota en `REGISTROS.md`. Las sesiones se cierran con «Cerrar sesiones» y un aparato se revoca.
- **La búsqueda de secretos** de la revisión completa es un script de `scripts/` que busca, en lo que se va a guardar, los secretos que este sistema usa: llaves privadas, direcciones de Postgres con contraseña, los formatos de las llaves de Google, Resend y R2, un `.env` fuera de `.gitignore` y cualquier variable de la lista con un valor escrito.

## Las cookies

La sesión de la web va en la cookie `ua_sesion`: httpOnly, Secure y SameSite=Lax, solo para el dominio de la API; lleva un identificador al azar y la base guarda su hash. Las demás y sus vencimientos están en [acceso con Google](../modulos/admin/acceso-con-google.md#las-cookies). Ninguna cookie lleva datos de la cuenta.

## El origen y CORS

- **La API solo acepta del navegador** a sus dos sitios: la web de la fábrica, con credenciales (la cookie), y la tablet, sin credenciales (va con su llave). CORS con esos dos orígenes; ningún comodín.
- **Cada acción de la web revisa `Origin`:** si no es el de la web, `403 origen_no_valido` (ver [API](API.md#quién-llama)). Con SameSite=Lax y esta revisión no hace falta un token contra CSRF.
- **Los aparatos y la credencial de servidor** no usan cookie: van con su llave en `Authorization`, y CORS no les aplica.

## Los encabezados de seguridad

- **La API** (con @fastify/helmet): `Strict-Transport-Security` de un año con subdominios, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `Cross-Origin-Resource-Policy: same-site`, y sin `X-Powered-By`. Sus respuestas de datos llevan `Cache-Control: no-store`.
- **La web y la tablet** (sitio estático, encabezados de Render): `Content-Security-Policy` con `default-src 'self'`, `connect-src` solo la API y R2, `img-src 'self' data: blob:` y R2, `frame-ancestors 'none'`, sin `unsafe-eval`; y los mismos `Strict-Transport-Security`, `nosniff` y `Referrer-Policy`.
- **Nada se puede meter en un marco** de otro sitio.

## Los límites

| Qué | Cuánto | Al pasarse |
|---|---|---|
| Peticiones por sesión o por llave | `admin.peticiones_por_minuto` (600) | `429`, con `reintentar_en` |
| Peticiones sin sesión ni llave, por dirección IP | `admin.peticiones_anonimas_por_minuto` (60) | `429` |
| Entradas fallidas con Google, por IP | Las de [acceso con Google](../modulos/admin/acceso-con-google.md#parámetros) | `429` |
| Códigos de registro equivocados | Los de [dispositivos](../modulos/admin/dispositivos.md) | `429` |
| PIN equivocados en la tablet | `personal.pin_intentos_bloqueo` (5) | La persona queda bloqueada |
| Tamaño del cuerpo de una petición | 1 MB; los archivos van directo a R2 | `413` |
| Comandos por tanda de un aparato | `sync.tanda_max_comandos` (200) | `400` |

Los límites por sesión son generosos a propósito: toda la fábrica sale a internet por la misma dirección. Se cuentan en la base (la tabla `intentos_recientes` de [acceso con Google](../modulos/admin/acceso-con-google.md#la-tabla-intentos_recientes)), así valen para todas las instancias de la API.

## Lo que se guarda como hash o cifrado

| Qué | Cómo | Dónde está el detalle |
|---|---|---|
| El identificador de cada sesión | SHA-256 | [acceso con Google](../modulos/admin/acceso-con-google.md) |
| El secreto de cada aparato y de la credencial | SHA-256, comparado en tiempo constante | [dispositivos](../modulos/admin/dispositivos.md) |
| El PIN de la tablet | Argon2id con sal; en la tablet, además cifrado con AES-GCM | [PIN del taller](../modulos/personal/pin-del-taller.md) |
| El `state`, el `nonce` y el verificador de Google | Cifrados en su cookie de 10 minutos | [acceso con Google](../modulos/admin/acceso-con-google.md#las-cookies) |
| El respaldo semanal | Cifrado con una llave pública mientras sale | [respaldos](../modulos/admin/respaldos.md) |
| Los archivos | Cubo privado, con direcciones firmadas que vencen | [archivos](../modulos/admin/archivos.md) |
| La base y los cubos en reposo | Cifrados por Render y por R2 | [infraestructura](INFRAESTRUCTURA.md) |

## Lo que nunca se registra

- **En la bitácora:** PIN, llaves, secretos, códigos en claro ni hashes; si una acción los manda, falla como error del programa (ver [bitácora](../modulos/admin/bitacora.md)). Los sueldos y las tarifas van marcados y recortados.
- **En el registro técnico** (pino): se tachan `authorization`, `cookie`, `set-cookie` y cualquier campo que se llame `secreto`, `pin`, `token`, `llave`, `codigo` o `contrasena`; no se registra ningún cuerpo de petición ni de respuesta, solo su ruta, su resultado, cuánto tardó, quién llamó y la referencia de un `500`.
- **En los eventos en vivo:** nunca montos ni sueldos, solo tablas, ids y textos de aviso (ver [eventos y trabajos](EVENTOS-Y-TRABAJOS.md)).
- **En las respuestas guardadas para reintentos:** nunca un secreto ni un PIN; un reintento recibe la respuesta sin ellos.

## Lo que llega de los aparatos y de fuera

- **Todo pasa por su contrato Zod** antes de tocar la base; lo que no cumple, `400` (o `apartado`, si sube de un aparato).
- **Cada aparato solo puede lo de su tipo** y solo en sus ubicaciones (ver [sincronización](SINCRONIZACION.md#lo-que-puede-cada-aparato)).
- **Lo que manda un aparato** trae su persona y su hora, pero el permiso es el del aparato: una persona del taller nunca hace desde la tablet algo que no sea de la tablet.
- **Lo que sube una persona** (fotos, comprobantes) se revisa contra lo declarado: tipo, tamaño y suma (ver [archivos](../modulos/admin/archivos.md)). Nunca se ejecuta ni se abre en el servidor.
- **La credencial de uniformame.mx** solo recibe pedidos y pagos; nunca lee la base ni otra cosa (ver [pedidos en línea](../modulos/linea/pedidos-en-linea.md)).
- **Google:** se revisan la firma, `iss`, `aud`, `exp`, `nonce` y el correo verificado (ver [acceso con Google](../modulos/admin/acceso-con-google.md)).

## Las dependencias

- Versiones fijas, sin `^`, y el `pnpm-lock.yaml` en git (ver [arquitectura](ARQUITECTURA.md)).
- La revisión completa corre `pnpm audit`: una vulnerabilidad alta o crítica en algo que llega a producción la detiene.
- Una dependencia nueva es una decisión anotada.

## Parámetros

Los cambia solo la dueña, en Configuración · Técnicos.

| Parámetro | Valor inicial | Para qué |
|---|---|---|
| `admin.peticiones_por_minuto` | 600 | Peticiones por minuto de una sesión o de un aparato antes del `429` |
| `admin.peticiones_anonimas_por_minuto` | 60 | Peticiones por minuto sin sesión ni llave, por dirección IP |

## Cómo se prueba

- **Cada límite** responde `429` al pasarse y deja pasar al volver a su ventana, también entre dos instancias.
- **Las cookies** salen con sus banderas; una petición con un `Origin` ajeno responde `403 origen_no_valido`; CORS no responde a otro origen.
- **Los encabezados** están en cada respuesta de la API y en el sitio estático.
- **El registro técnico** de una prueba que manda una llave, una cookie y un PIN no los trae.
- **La bitácora** falla si una acción le manda un secreto.
- **El arranque** falla con una variable faltante y no enseña el valor de ninguna.
- **La búsqueda de secretos** encuentra uno de cada formato puesto a propósito en un repositorio temporal.

## Cómo está hecho

*Lo escribe Claude Code al terminar la fase 22.*
