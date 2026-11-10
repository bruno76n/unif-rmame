# Avisos

> **Qué cubre:** los avisos a personas dentro del sistema (la campana) y por correo con Resend: sus tipos, a quién le llegan, cuándo van por correo, leídos y no leídos.
> **Estado:** Decidido.
> **Se construye en:** [fase 4](../../fases/04-servicios-comunes.md).
> **Se conecta con:** [eventos y trabajos](../../cimientos/EVENTOS-Y-TRABAJOS.md) · [bitácora](bitacora.md) · [pantallas comunes](../../interfaz/comunes.md) · [pantallas de Compras](../../interfaz/fabrica/compras.md) · [pantallas de Ventas](../../interfaz/fabrica/ventas.md) · [infraestructura](../../cimientos/INFRAESTRUCTURA.md) · [respaldos](respaldos.md) · [autorizaciones](../direccion/autorizaciones.md) · [contador y cuadres](../contaduria/contador-y-cuadres.md) · [alertas e indicadores](../direccion/alertas-e-indicadores.md)

## Para qué sirve

Hay cosas que una persona tiene que saber aunque no esté viendo esa pantalla: que Dirección decidió su autorización, que una tablet lleva cuatro horas sin sincronizar, que el respaldo de la semana no se hizo. Cada aviso llega a la campana de la barra superior de su cuenta y, si su tipo lo pide, también por correo. Ejemplo: Ventas pide la nota de crédito NC-0012; en cuanto Dirección la autoriza, a quien la pidió le llega «AU-0028 autorizada: Nota de crédito NC-0012».

## Reglas

1. **Un aviso es para una cuenta.** Si va a varias, nace uno por cuenta.
2. **A quién** se dice con una regla que se resuelve con las cuentas activas de ese momento: `duena`, `departamento:{clave}` (las cuentas con ese departamento), `soporte` (las cuentas de soporte técnico), `quien_pidio`, o la lista de cuentas.
3. **No se repite:** no nace otro aviso del mismo tipo, para la misma cuenta y el mismo documento, mientras el anterior no se lea.
4. **Si va por correo lo decide la dueña,** con el parámetro `avisos.correo_{tipo}` de cada tipo. Se decide al crear el aviso.
5. **El correo sale del worker,** nunca dentro de la acción: si el correo falla, la acción ya quedó. Se reintenta igual que los eventos (a 1, 5, 30 y 120 minutos) y a los 10 intentos avisa a soporte con `trabajo_fallido`.
6. **El texto ya va armado** como lo verá la persona, sin montos ni sueldos, con el enlace a la pantalla donde se atiende.
7. **Leerlo es de cada quien:** cada persona marca solo sus avisos.

## Los tipos

Los tipos del núcleo están aquí. Cada módulo agrega los suyos en su archivo, con la misma forma (por ejemplo `lote_atorado` en [lotes](../produccion/lotes.md)), y su migración los suma al CHECK de `avisos.tipo`.

| Tipo | Lo hace nacer | A quién | Texto | Correo al inicio |
|---|---|---|---|---|
| `autorizacion_pedida` | El evento `autorizacion.pedida` | Las cuentas con Dirección (una cuenta nueva: solo la dueña) | «{departamento} pide autorización: {qué se pide}» | Sí |
| `autorizacion_decidida` | El evento `autorizacion.decidida` | Quien la pidió, si tiene cuenta | «{AU} autorizada: {qué se pide}» o «{AU} rechazada: {qué se pide} · {motivo}» | No |
| `alerta_seguridad` | El evento `alerta.registrada` (un renglón de bitácora con alerta) | La dueña | La descripción de la alerta | Sí |
| `dispositivo_sin_sincronizar` | El trabajo de aparatos sin sincronizar | La dueña | «{nombre} sin sincronizar desde hace {tiempo}: {ubicación} · ventas y existencia sin enviar» | Sí |
| `alerta_direccion` | El trabajo de alertas de Dirección | Las cuentas con Dirección | El título de la alerta | No |
| `restauracion_por_probar` | El recordatorio de prueba de restauración | La dueña | «Prueba de restauración: la última fue hace {n} días. La siguiente toca el {fecha}.» | Sí |
| `respaldo_fallido` | El respaldo semanal o su recordatorio | La dueña y soporte | «El respaldo semanal no se hizo: {error}.» | Sí |
| `pin_bloqueado` | El evento `pin.bloqueado` | Las cuentas con Personal | «{persona} se bloqueó en la tablet por {n} PIN equivocados» | No |
| `trabajo_fallido` | Un trabajo o un evento que falló | Soporte | «{trabajo} falló: {error}» | Sí |

## La tabla `avisos`

| Columna | Tipo | Nulo | Qué es |
|---|---|---|---|
| `id` | uuid | no | Llave |
| `usuario_id` | uuid | no | → `usuarios.id`: el destinatario |
| `tipo` | text | no | CHECK con los tipos registrados |
| `texto` | text | no | Ya armado |
| `enlace` | text | sí | Ruta interna: `direccion/autorizaciones/{id}` |
| `entidad` · `entidad_id` | text · uuid | sí | El documento |
| `evento_id` | uuid | sí | El evento que lo hizo nacer, sin llave foránea (los eventos se depuran) |
| `leido_en` | timestamptz | sí | |
| `por_correo` | boolean | no | Lo decidió el parámetro de su tipo al crearlo |
| `correo_enviado_en` | timestamptz | sí | |
| `correo_intentos` | smallint | no | default 0 |
| `correo_error` | text | sí | |
| `creado_en` | timestamptz | no | default `now()` |
| `actualizado_en` | timestamptz | sí | |

- Técnica: sin `version`; no baja a aparatos; se guarda siempre (no se depura).
- **Índices:** (`usuario_id`, `creado_en` desc) donde `leido_en` es nulo; (`creado_en`) donde `por_correo` y `correo_enviado_en` es nulo.
- `usuario_id` lleva su `@llavePendiente` hasta la fase 5.

## `admin.crear_aviso` · interna

| | |
|---|---|
| **La llaman** | El proceso de la bandeja de eventos, los trabajos y cualquier módulo que quiera avisar a una persona |
| **Recibe** | `tipo` · los destinatarios (lista de cuentas o una regla) · `texto` · `enlace` · `entidad`, `entidad_id` · `evento_id` |
| **Reglas** | Resuelve la regla con las cuentas activas. No crea uno igual a otro sin leer. `por_correo` sale del parámetro `avisos.correo_{tipo}` |
| **Escribe** | `avisos`, uno por cuenta |
| **Regresa** | Los ids. Cada uno sale en vivo como `aviso` a las sesiones de su cuenta (ver [eventos y trabajos](../../cimientos/EVENTOS-Y-TRABAJOS.md#avisos-en-vivo--get-v1eventos)) |

## `admin.marcar_aviso_leido`

| | |
|---|---|
| **Pantalla** | La campana de la barra superior: tocar un aviso, o «Marcar todos como leídos» |
| **Quién** | Cualquier sesión abierta, solo sobre sus avisos |
| **Recibe** | `aviso_ids` · lista de uuid · opcional<br>`todos` · booleano · opcional. Uno de los dos es obligatorio |
| **Reglas** | Los ids que no son de la cuenta se ignoran |
| **Escribe** | `avisos.leido_en` |
| **Eventos** | Ninguno |
| **Bitácora** | Ninguna: leer un aviso no cambia datos del negocio |

## El correo

- **Lo manda la tarea `enviar_correos` del worker,** con Resend: los avisos con `por_correo` y sin `correo_enviado_en`. Si Resend falla, sube `correo_intentos`, guarda `correo_error` y reintenta con la misma espera de los eventos.
- **La plantilla** es una sola, con React Email: el texto del aviso, el botón al enlace (con la dirección completa de la web) y la marca de la empresa. Nunca lleva montos ni sueldos.
- **A dónde:** al correo de la cuenta (el de Google).
- **En local y en las pruebas** el correo no sale: el simulador de Resend lo guarda, y en local se ve en el registro del worker. El envío de verdad se comprueba en «Verificación real pendiente» de `REGISTROS.md`, con el dominio verificado en Resend (ver [infraestructura](../../cimientos/INFRAESTRUCTURA.md)).

## Parámetros

| Parámetro | Valor inicial | Para qué |
|---|---|---|
| `avisos.correo_autorizacion_pedida` | Sí | Si ese tipo de aviso va también por correo |
| `avisos.correo_autorizacion_decidida` | No | Ídem |
| `avisos.correo_alerta_seguridad` | Sí | Ídem |
| `avisos.correo_dispositivo_sin_sincronizar` | Sí | Ídem |
| `avisos.correo_alerta_direccion` | No | Ídem |
| `avisos.correo_restauracion_por_probar` | Sí | Ídem |
| `avisos.correo_respaldo_fallido` | Sí | Ídem |
| `avisos.correo_pin_bloqueado` | No | Ídem |
| `avisos.correo_trabajo_fallido` | Sí | Ídem |

Van en la sección `parametro`. Cada tipo que agregue otro módulo trae su propio `avisos.correo_{tipo}`.

## Permisos

- Cada cuenta ve y marca solo sus avisos.
- Los parámetros de correo, solo la dueña (ver [configuración](configuracion.md)).

## Lo que llega después

- Los avisos al celular quedan para después.

## Cómo está hecho

**Fase 4, parte 4.**

- **La tabla** `avisos` está en `apps/api/src/modulos/admin/tablas.ts` (migración `0006_avisos.sql`).
  - Su CHECK lleva los tipos del núcleo (`tiposDeAvisoDelNucleo`).
  - La app solo cambia `leido_en`, las columnas del correo y `actualizado_en`.
- **Los parámetros** `avisos.correo_{tipo}` están en `modulos/admin/parametros.ts`.
- **`admin.crear_aviso`** está en `modulos/admin/internas/crear-aviso.ts`.
  - Resuelve la regla con la lectura `admin.cuentas_por_regla`, o recibe la lista de cuentas.
  - Escribe uno por cuenta, con un candado por cuenta, tipo y documento, y no repite uno sin leer.
  - Decide `por_correo` con su parámetro (`sinCorreo` lo apaga para el aviso de un correo que falló).
  - Hace `pg_notify('ua_avisos', id)` y encola `admin.enviar_correos` si alguno va por correo.
- **Las dos lecturas de cuentas** (`admin.cuentas_por_regla` y `admin.correo_de_cuenta`) las da `usuarios` desde la fase 5 (ver [cuentas](cuentas.md#cómo-está-hecho)).
- **La alerta.** `alerta.registrada` se vuelve `alerta_seguridad` a la dueña en `modulos/admin/al-evento.ts`: lo que hace un módulo al llegar un tipo de evento (`alEvento`), dentro del proceso de la bandeja.
- **`trabajo_fallido`** a soporte lo crea el worker con `admin.crear_aviso`, «{trabajo} falló: {error}» (`nucleo/trabajos/trabajador.ts`).
- **`admin.marcar_aviso_leido`** está en `acciones/marcar-aviso-leido.ts`.
  - Solo toca los avisos de quien llama.
  - Sin `aviso_ids` ni `todos`, responde `400`.
  - No deja bitácora (`sinBitacora`).
  - Su contrato está en `contratos/admin/avisos.ts`.
- **El correo:**
  - **El trabajo** `admin.enviar_correos` (`trabajos/enviar-correos.ts`) toma los avisos de uno en uno, cada uno en su transacción corta, con `FOR UPDATE SKIP LOCKED`, manda al correo de la cuenta con la clave de idempotencia `aviso:{id}` y espera como los eventos. Al décimo intento avisa a soporte sin correo y deja de reintentar. Al terminar, se encola para el siguiente reintento que toque (decisión 360).
  - **La plantilla** (`dominio/plantilla-de-correo.ts`) se arma con los componentes de React Email y `renderToStaticMarkup`, sin JSX (decisión 358).
  - **El envío** (`apps/api/src/nucleo/correo.ts`) va con Resend en producción (`RESEND_LLAVE`, remitente `avisos@uniformame.mx`). En local, el correo queda en el registro del worker.
- **En vivo:** cada instancia escucha `ua_avisos` y manda `aviso` a las sesiones de la cuenta.
- **Las pruebas:**
  - `internas/crear-aviso.prueba.ts` (también el mismo aviso pedido a la vez);
  - `trabajos/enviar-correos.prueba.ts` (con el simulador de Resend y el SDK de verdad);
  - el caso de `aviso` en `nucleo/sincronizacion/eventos-en-vivo.prueba.ts`.
