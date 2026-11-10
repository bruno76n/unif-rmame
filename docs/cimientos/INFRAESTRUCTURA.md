# Infraestructura

> **Qué cubre:** dónde corre el sistema y cuánto cuesta: Render a precio fijo (la API, el worker, Postgres 18 y la web estática, en un Blueprint), el dominio en Cloudflare, los archivos y los respaldos en R2, el correo en Resend y la entrada con Google; las variables de entorno; cómo se despliega; la recuperación y la restauración probada; y la vigilancia que avisa si algo se cae o empieza a fallar.
> **Estado:** Decidido.
> **Se construye en:** [fase 23 ●](../fases/23-puesta-en-marcha.md).
> **Se conecta con:** [respaldos](../modulos/admin/respaldos.md) · [arquitectura](ARQUITECTURA.md) · [seguridad](SEGURIDAD.md) · [base de datos](BASE-DE-DATOS.md) · [avisos](../modulos/admin/avisos.md) · [acceso con Google](../modulos/admin/acceso-con-google.md) · [archivos](../modulos/admin/archivos.md) · [eventos y trabajos](EVENTOS-Y-TRABAJOS.md) · [migración](../MIGRACION.md) · [puente de impresión](../apps/puente-de-impresion.md) · [la tablet](../apps/tablet.md) · [fase 4](../fases/04-servicios-comunes.md) · [fase 23](../fases/23-puesta-en-marcha.md)

## Para qué sirve

Que el sistema esté arriba todos los días por un precio fijo, que nada se pierda si algo falla y que alguien se entere antes que la fábrica. Ejemplo: un martes la base de Render tiene un problema a las 11:40. Soporte regresa la base al momento de las 11:35 en una instancia nueva, la revisa con el cuadre y cambia la API a ella; si el problema fuera Render mismo, el respaldo del domingo está cifrado en R2, fuera de Render.

## Reglas

1. **Precio fijo:** cada pieza en un plan de precio mensual conocido; nada que cobre por uso sin tope (decisión 160).
2. **Todo se declara en el Blueprint** (`render.yaml`), en git: los servicios, sus planes, sus comandos y sus variables sin valor. Nada se configura a mano en el tablero de Render que no esté ahí, salvo los valores de los secretos.
3. **Un solo lugar para cada secreto:** su servicio de origen y la variable de Render. Nunca en git (ver [seguridad](SEGURIDAD.md#secretos-y-variables-de-entorno)).
4. **Todo en local hasta lanzar:** lo de este archivo se usa de verdad solo en la [fase 23](../fases/23-puesta-en-marcha.md), con la autorización de Bruno.

## Las piezas y su costo

| Pieza | Dónde | Plan | Costo al mes |
|---|---|---|---|
| El espacio de trabajo | Render | Pro: recuperación de la base a un momento de los últimos 7 días | $25 |
| La API | Render, servicio web, imagen de Docker | Starter, 512 MB | $7 |
| El worker | Render, servicio en segundo plano, la misma imagen | Starter, 512 MB | $7 |
| La base | Render, PostgreSQL 18 | Basic-1gb, más su disco | $19 + $0.30 por GB |
| La web y la tablet | Render, sitios estáticos | Gratis | $0 |
| El dominio | Cloudflare, solo DNS | Gratis, más el registro del dominio | Lo del registro |
| Archivos y respaldos | Cloudflare R2 | Gratis hasta 10 GB | Casi $0 |
| El correo | Resend | El plan gratis mientras alcance | $0 |
| Entrar con Google | Google Cloud | Gratis | $0 |

Unos $61 al mes más el disco de la base. Los cambios de plan son decisiones que se anotan.

## Render

- **Una imagen de Docker** para la API y el worker: Node 26.13.0, con `postgresql-client` 18 (para `pg_dump`) y age (para cifrar el respaldo). Cada uno arranca con su comando.
- **La región:** la misma para todo, la de Estados Unidos con menos latencia medida desde la fábrica en la verificación real; al inicio, Ohio.
- **La base no tiene acceso desde internet:** su lista de direcciones permitidas está vacía; la API y el worker la alcanzan por la red privada de Render.
- **Las migraciones corren antes de que arranque la API nueva,** como su comando previo al despliegue (`pnpm base:migrar`, con el rol dueño). Si fallan, la versión vieja sigue (ver [base de datos](BASE-DE-DATOS.md#migraciones)).
- **La revisión de salud** de la API es `GET /v1/salud`: Render no le manda tráfico a una instancia que no responde.
- **Los sitios estáticos** sirven la web y la tablet con los encabezados de [seguridad](SEGURIDAD.md#los-encabezados-de-seguridad) y, en la web, toda ruta regresa `index.html`.
- **Se despliega al juntar en la rama principal,** que solo recibe una fase con su revisión completa en verde.

## El dominio

En Cloudflare, solo DNS (sin su proxy), y el certificado lo da Render:

| Nombre | Apunta a |
|---|---|
| `fabrica.uniformame.mx` | La web |
| `taller.uniformame.mx` | La tablet |
| `api.uniformame.mx` | La API |

La raíz `uniformame.mx` queda para la tienda en línea, después. Si el dominio cambia, solo cambian las variables `DOMINIO_*` y estos registros. La cookie de la sesión es solo del dominio de la API, y la web y la API son del mismo sitio (ver [acceso con Google](../modulos/admin/acceso-con-google.md#las-cookies)).

## R2

- **Dos cubos privados:** `uniformame-archivos` (fotos, comprobantes, facturas, evidencias) y `uniformame-respaldos` (el respaldo semanal).
- **Cada uno con su credencial:** la de archivos lee y escribe solo su cubo; la de respaldos solo escribe en el suyo.
- **El cubo de archivos** acepta subidas del navegador solo desde la web, con CORS a su origen y solo con direcciones firmadas (ver [archivos](../modulos/admin/archivos.md)).
- **El cubo de respaldos** guarda cada respaldo 52 semanas; una regla del cubo quita los más viejos.

## Resend

- **El remitente:** `avisos@uniformame.mx`, con el dominio verificado (SPF y DKIM en Cloudflare).
- **Solo manda los avisos** que dicen ir por correo (ver [avisos](../modulos/admin/avisos.md)); nada de publicidad.

## Google

- **Bruno crea el cliente** en Google Cloud: tipo aplicación web, pantalla de consentimiento externa y publicada, con solo `openid`, `email` y `profile`, que no necesitan revisión de Google.
- **La dirección de vuelta:** `https://api.uniformame.mx/v1/acceso/google/vuelta`.

## Las variables de entorno

| Variable | Qué es | La usan |
|---|---|---|
| `ENTORNO` | `local`, `pruebas` o `produccion` | API, worker |
| `DOMINIO_WEB` · `DOMINIO_TALLER` · `DOMINIO_API` | Las direcciones de la web, de la tablet y de la API | API, worker, web y tablet al construirse |
| `BASE_DATOS_URL` | La conexión de la app a Postgres, con TLS | API, worker |
| `BASE_DATOS_URL_DUENO` | La conexión del rol dueño, solo para las migraciones | El comando previo al despliegue |
| `GOOGLE_EMISOR` · `GOOGLE_CLIENTE_ID` · `GOOGLE_CLIENTE_SECRETO` | El proveedor de OpenID y el cliente | API |
| `COOKIE_SECRETO` | La llave que cifra la cookie de la entrada con Google | API |
| `R2_CUENTA` · `R2_ARCHIVOS_LLAVE_ID` · `R2_ARCHIVOS_SECRETO` | La credencial del cubo de archivos | API, worker |
| `R2_RESPALDOS_LLAVE_ID` · `R2_RESPALDOS_SECRETO` | La credencial del cubo de respaldos, solo escribe | Worker |
| `R2_DIRECCION` | Solo en local: la dirección del almacén compatible con S3 de `compose.yaml` (`http://127.0.0.1:7070`) | `pnpm local` |
| `RESPALDO_LLAVE_PUBLICA` | La llave pública de age con que se cifra el respaldo | Worker |
| `RESEND_LLAVE` | La llave de Resend | Worker |
| `CORREO_DUENA` · `CORREO_SOPORTE` | Los correos de las dos cuentas que nacen con la siembra de la puesta en marcha | El comando de la migración, al terminar la base |

`nucleo/entorno.ts` las valida al arrancar; `.env.ejemplo` las lista sin valores.

## La recuperación

Dos defensas, como dice [respaldos](../modulos/admin/respaldos.md):

1. **Regresar la base a un momento** de los últimos 7 días, con la recuperación de Render, en una instancia nueva. Se revisa con los conteos y el cuadre; si está bien, se cambia `BASE_DATOS_URL` a ella y se vuelve a desplegar.
2. **El respaldo semanal** cifrado en R2, por si el problema es Render: se baja, se descifra con la llave privada que guarda Bruno (`age -d`) y se restaura con `pg_restore` en una base nueva, donde sea.

## La restauración probada

Cada `admin.restauracion_cada_dias`, la dueña (con soporte) prueba las dos defensas en un ambiente de pruebas, nunca sobre producción:

1. Restaurar: el respaldo semanal más reciente en una base local de Docker, o un momento del pasado en una instancia nueva de Render.
2. Correr sobre ella los conteos de cada tabla y el cuadre de inventario, y compararlos con los de producción a esa hora. La instancia de prueba se puede abrir a la dirección de soporte mientras dura la prueba; producción, nunca.
3. Registrar la prueba con su evidencia en Respaldos · «Registrar restauración probada» (`admin.registrar_restauracion`).
4. Quitar la instancia de prueba.

## La vigilancia

| Qué falla | Quién se entera | Cómo |
|---|---|---|
| La API no responde | Soporte | Render reinicia la instancia y manda su aviso de servicio caído |
| Un despliegue falla | Soporte | El aviso de Render; la versión vieja sigue |
| Un trabajo falla 10 veces | Soporte | `trabajo_fallido` (ver [eventos y trabajos](EVENTOS-Y-TRABAJOS.md)) |
| El tope de la sincronización no avanza | Soporte | `trabajo_fallido`, del trabajo que lo revisa cada minuto |
| El respaldo semanal falla | La dueña y soporte | `respaldo_fallido` |
| La restauración probada se atrasa | La dueña | El pendiente «Respaldo» en Administración |
| Un aparato no sincroniza | La dueña | El aviso de [dispositivos](../modulos/admin/dispositivos.md) |
| Una impresora deja de dar señales | Quien pide imprimir | «La impresora de {ubicación} no está conectada. Usa el PDF.» |
| La base se llena | Soporte | El aviso de disco de Render al 80 % |

Los avisos de Render van al correo de soporte; los del sistema, por sus [avisos](../modulos/admin/avisos.md).

## Cómo se prueba

- **El Blueprint** se revisa contra este archivo en la revisión de la fase 23: cada servicio con su plan, su comando y sus variables.
- **La imagen se prueba en local:** se construye, arranca la API y el worker con los simuladores, y el worker hace un respaldo de prueba con `pg_dump` y age que se vuelve a restaurar.
- **De verdad,** con la autorización de Bruno y con tope de gasto: desplegar con el Blueprint, regresar la base a un momento del pasado en una instancia nueva, restaurar el respaldo semanal fuera de Render y comprobar el dominio con su certificado (la [verificación real](../registros/REGISTROS.md#verificación-real-pendiente)).

## Cómo está hecho

*Lo escribe Claude Code al terminar la fase 23.*
