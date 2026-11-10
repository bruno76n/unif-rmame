# Acceso y permisos

> **Qué cubre:** las formas de entrar (Google, la llave de un aparato, el PIN de la tablet y, después, la credencial de uniformame.mx), cómo se revisa cada llamada (departamento, permiso fino, solo la dueña, «Confirmar con Google», alcance del aparato), el recorte común y de dónde sale la matriz de permisos.
> **Estado:** Decidido.
> **Se construye en:** [fase 5 ●](../fases/05-acceso-con-google-cuentas-y-permisos.md).
> **Se conecta con:** [API](API.md) · [seguridad](SEGURIDAD.md) · [acceso con Google](../modulos/admin/acceso-con-google.md) · [permisos](../modulos/admin/permisos.md) · [cuentas](../modulos/admin/cuentas.md) · [dispositivos](../modulos/admin/dispositivos.md) · [PIN del taller](../modulos/personal/pin-del-taller.md) · [auditor](../../.claude/agents/auditor.md) · [sincronización](SINCRONIZACION.md) · [pedidos en línea](../modulos/linea/pedidos-en-linea.md)

## Para qué sirve

Cada llamada a la API dice quién la hace, y el servidor decide si puede. Nada de eso depende de la pantalla: lo que una pantalla esconde no cuenta como permiso. Bruno: «por ninguna circunstancia el de la tienda tiene que tener entrada» y «los de las máquinas no pueden entrar al CRM de contaduría».

## Las formas de entrar

| Quién | Cómo entra | Qué queda registrado | Dónde está el detalle |
|---|---|---|---|
| La dueña, la oficina, Aduana y bodega, el encargado del taller | «Entrar con Google»; la sesión va en una cookie | La cuenta de la sesión | [acceso con Google](../modulos/admin/acceso-con-google.md) |
| El teléfono para escanear de Aduana | La sesión de Google de quien escanea, más la llave del teléfono | La cuenta y el aparato | [dispositivos](../modulos/admin/dispositivos.md) |
| La tablet, el programa puente (y después la caja) | La llave del aparato, registrada con un código de 10 minutos | El aparato | [dispositivos](../modulos/admin/dispositivos.md) |
| La costurera en la tablet | Escoge su nombre y mete su PIN; lo revisa la tablet, sin internet | El aparato y la persona en cada comando | [PIN del taller](../modulos/personal/pin-del-taller.md) |
| uniformame.mx (después) | La llave de su credencial de servidor | La credencial y el usuario del panel | [pedidos en línea](../modulos/linea/pedidos-en-linea.md) |

**La llave de un aparato** es un `llave_id` público más un secreto de 32 bytes al azar que hace el propio aparato. El servidor guarda solo el SHA-256 del secreto y lo compara en tiempo constante. Va en cada llamada como `Authorization: Llave {llave_id}.{secreto}`.

## Cómo se revisa cada llamada

En este orden. El contrato de cada acción y consulta dice qué pide (ver [API](API.md#los-contratos)).

1. **Quién llama:** la sesión (revisada como dice [acceso con Google](../modulos/admin/acceso-con-google.md#cómo-se-revisa-la-sesión-en-cada-llamada)) o la llave del aparato (vigente, no revocada). Si no hay: `401 sin_sesion`.
2. **Sus departamentos efectivos:** la dueña, todos; las demás cuentas, sus departamentos sin baja, si la cuenta está activa. Un departamento sin ubicación vale para todas.
3. **El departamento:** el que pide el contrato, y la ubicación si la pide. Si no: `403 sin_departamento`.
4. **El permiso fino** (`ven_sueldos_y_tarifas`, `imprime_guias`): la dueña los tiene siempre. Si no: `403 sin_permiso_fino`.
5. **`solo_duena`:** revisa que la cuenta sea la dueña, no el departamento. Si no: `403 solo_duena`.
6. **«Confirmar con Google»:** la última confirmación de la sesión tiene que ser de hace menos de `admin.reautenticacion_minutos` (5). Si no: `401 reautenticar`, con su propósito. La acción guarda ese momento en su `confirmado_con_google_en` y en la bitácora.
7. **El alcance del aparato:** la acción o consulta tiene que estar en el alcance de su tipo (ver [sincronización](SINCRONIZACION.md)). Si no: `403 fuera_de_alcance`.
8. **La cuenta de soporte técnico:** sus departamentos son explícitos y nunca incluyen Dirección ni Contaduría, ni «ven sueldos y tarifas». El servidor le quita los montos en toda respuesta.

Todo esto pasa antes de abrir la transacción, en el corredor de acciones (ver [módulos](MODULOS.md#cómo-corre-una-acción)).

## Lo que solo hace la dueña

Dar y quitar accesos, cambiar departamentos y permisos finos, registrar y revocar aparatos, cerrar las sesiones de la dueña, cambiar parámetros, agregar a las listas que lo piden, editar la empresa y las impresoras, y registrar restauraciones. Cualquier cuenta con Dirección decide las autorizaciones, menos el alta de usuario, que solo decide la dueña.

## Lo que pide «Confirmar con Google»

Dar de alta una cuenta, cambiar departamentos o permisos finos, quitar un acceso, registrar o revocar un aparato, decidir una autorización, pagar la nómina y cambiar precios en bloque. Cada acción lo dice en su archivo.

## El recorte común

- **Lo que una cuenta no debe ver no viaja:** el campo no viene, y la respuesta dice en `recortado` cuáles faltan. Un registro que no puede ver responde `404`.
- **Sin «ven sueldos y tarifas»** no viajan el pago por día de las personas, las tarifas por pieza ni los montos de nómina; un renglón de bitácora con sueldos llega con su descripción recortada y sin su antes y su después.
- **Lo demás lo dice cada consulta:** qué no ve cada departamento está resumido en [permisos](../modulos/admin/permisos.md#qué-ve-cada-departamento).

## La matriz de permisos

No se escribe a mano. Cada acción y cada consulta declara en su contrato quién puede llamarla, y cada archivo de tema lo dice en su tabla. De los contratos salen la revisión del servidor y la documentación de la API, donde cada acción muestra su permiso. Así la matriz nunca se queda atrás del código.

## Cómo se prueba

- Cada acción y cada consulta se prueba con una cuenta que sí puede y con una que no (sin departamento, sin permiso fino, sin ser la dueña, sin «Confirmar con Google» reciente) y con un aparato fuera de alcance.
- La cuenta de soporte nunca recibe un monto.
- Un registro que la cuenta no debe ver responde `404`, igual que uno que no existe.
- Ninguna llamada pasa con una sesión cerrada, vencida o de una cuenta sin acceso, ni con una llave revocada.

## Cómo está hecho

**Fase 5, parte 4.**

- **Quién llama** (`apps/api/src/nucleo/acceso/identificar.ts`): `identificarConSesion` revisa la cookie `ua_sesion` (`revisarSesion`, ver [acceso con Google](../modulos/admin/acceso-con-google.md#cómo-está-hecho)) y arma la cuenta con `cuentaDeLaSesion`: sus departamentos efectivos y sus permisos finos de `admin.permisos_de`, si es la dueña o soporte (`esSoporte`) y su última confirmación con Google. A la cuenta de soporte nunca le valen Dirección, Contaduría ni «ven sueldos y tarifas», aunque tuviera esos renglones. La llave de los aparatos llega en la fase 6.
- **El permiso** (`nucleo/acceso/permisos.ts`): `revisionDePermisos(base)` revisa en el orden de arriba, con los minutos de `admin.reautenticacion_minutos`. Un contrato que nombra aparatos sin pedir departamento ni a la dueña es solo de aparatos: una cuenta recibe `403 fuera_de_alcance` (decisión 382). El servidor de prueba usa esta misma revisión.
- **El recorte común** (`nucleo/acceso/recorte.ts`): `recorteComun` le quita a la cuenta de soporte todo campo `_centavos` y a quien no tiene «ven sueldos y tarifas» (sin ser la dueña) los `camposDeSueldo` de los módulos, a cualquier profundidad. El servidor lo pasa por el resultado de cada consulta (y suma lo quitado a `recortado`), de cada acción y por los `datos` de un `409` (decisión 383). Para que se pueda quitar, todo monto o sueldo de un resultado es opcional en su contrato.
- **La API de verdad** (`apps/api/src/api.ts`) arma el servidor con esta identificación, esta revisión, los avisos en vivo, el almacén y la entrada con Google, y escucha en `PORT` (Render) o en el puerto de `DOMINIO_API`; `pnpm local` la arranca (decisión 384).
- **La ubicación:** en la primera versión todos los departamentos van sin ubicación y ningún contrato la pide; la revisión por ubicación llega con el primer contrato que la pida.
- **El registro técnico** tacha además `set-cookie` y todo campo `secreto`, `pin`, `token`, `llave`, `codigo` o `contrasena` (`servidor.ts`), como pide [seguridad](SEGURIDAD.md#lo-que-nunca-se-registra); el código de un error de la base va como `sqlstate`.
- **Los avisos y sus correos** solo van a cuentas activas: `admin.crear_aviso` filtra también la lista de cuentas, `admin.correo_de_cuenta` no da el correo de una cuenta sin acceso, y un correo pendiente de una cuenta que perdió el acceso queda anotado y no se manda. `admin.cuentas_por_regla` no cuenta a soporte en Dirección ni en Contaduría.
- **En las pruebas** se identifica con `x-prueba-quien` (y `x-prueba-google`), o con la sesión de verdad (`sesionReal`).
- **Las pruebas:** `nucleo/acceso/permisos.prueba.ts` recorre todos los contratos registrados: con datos que arma de la entrada de cada contrato, una cuenta sin su departamento, sin su permiso fino o que no es la dueña recibe su `403`; la dueña sin confirmación reciente, `401 reautenticar` con su propósito; y la cuenta de soporte no recibe montos ni en una consulta que no los recorta ni en un `409`. `nucleo/acceso/sesion.prueba.ts` y `modulos/admin/acciones/confirmar-con-google.prueba.ts` lo prueban con la sesión de verdad.
