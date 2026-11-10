# Cuentas

> **Qué cubre:** las cuentas de Google que entran al sistema: la cuenta nueva que da la dueña, la que pide la oficina, ligadas a su persona por el folio E-; los departamentos de cada cuenta; quitar el acceso; y la cuenta de soporte técnico.
> **Estado:** Decidido.
> **Se construye en:** [fase 5 ●](../../fases/05-acceso-con-google-cuentas-y-permisos.md).
> **Se conecta con:** [acceso con Google](acceso-con-google.md) · [permisos](permisos.md) · [autorizaciones](../direccion/autorizaciones.md) · [personas](../personal/personas.md) · [PIN del taller](../personal/pin-del-taller.md) · [pantallas de Administración](../../interfaz/fabrica/administracion.md) · [migración](../../MIGRACION.md) · [acceso y permisos](../../cimientos/ACCESO-Y-PERMISOS.md)

## Para qué sirve

Una cuenta es la entrada de una persona al sistema con su Google. Solo la dueña da accesos. Ejemplo: la dueña da de alta a Rosa Méndez con su correo de Google y los departamentos de la oficina; Rosa ya puede entrar. Si es la oficina la que quiere una cuenta para alguien, la pide, y la solicitud llega a Dirección como una autorización que solo la dueña decide.

## Reglas

1. **Persona no es cuenta.** La persona (folio E-) es quien trabaja y vive en Personal; la cuenta es su entrada con Google. Se ligan por `persona_id`, nunca por el nombre.
2. **Una persona, una cuenta viva,** y un correo, una cuenta viva: no puede haber dos solicitadas o activas para la misma persona o el mismo correo.
3. **Nadie de tienda entra al sistema de la fábrica:** no se da cuenta a una persona del área de tienda.
4. **Solo la dueña da y quita accesos,** con «Confirmar con Google». La oficina solo pide.
5. **Una cuenta activa siempre tiene al menos un departamento.** Para quitarle todo se usa «Quitar acceso».
6. **La dueña no se quita el acceso ni pierde departamentos;** `es_duena` y `es_soporte` solo cambian con la siembra de la puesta en marcha.
7. **La cuenta de soporte técnico** no tiene persona, nunca tiene Dirección, Contaduría ni «ven sueldos y tarifas», y el servidor le quita los montos en toda respuesta. Todo lo que hace queda en la bitácora.
8. **Dar acceso otra vez** a alguien que lo perdió crea una cuenta nueva: la vieja se queda como estaba.
9. **Una persona del Taller con cuenta no tiene PIN:** al activar la cuenta se anula su PIN; al quitarle el acceso, puede volver a tenerlo.

## Estados de una cuenta

| De | A | Acción | Quién |
|---|---|---|---|
| — | `activa` | «Cuenta nueva» → «Dar de alta» → «Confirmar con Google» | Solo la dueña |
| — | `solicitada` | «Pedir cuenta nueva» → «Mandar solicitud»; nace la autorización AU- de alta de usuario | Administración del sistema, si no es la dueña |
| `solicitada` | `activa` | Autorizar la AU- con «Confirmar con Google», desde Dirección o desde el cajón «Alta de usuario» | Solo la dueña: lo revisa el servidor |
| `solicitada` | `rechazada` | Rechazar la AU- con motivo | Solo la dueña |
| `activa` | `sin_acceso` | «Quitar acceso» → «Confirmar con Google». Cierra sus sesiones | Solo la dueña, nunca sobre su propia cuenta |

## La tabla `usuarios`

| Columna | Tipo | Nulo | Qué es |
|---|---|---|---|
| `id` | uuid | no | Llave |
| `persona_id` | uuid | sí | → `personas.id`. Obligatorio salvo en soporte (CHECK) |
| `correo` | text | no | El de Google, en minúsculas y sin espacios |
| `google_sub` | text | sí | El identificador fijo de Google; se llena en la primera entrada |
| `estado` | text | no | CHECK (`solicitada`, `activa`, `rechazada`, `sin_acceso`) |
| `es_duena` | boolean | no | default false. Único donde es verdadero: una sola dueña |
| `es_soporte` | boolean | no | default false |
| `nombre` | text | sí | Solo en soporte; las demás usan el nombre de su persona |
| `autorizacion_id` | uuid | sí | → `autorizaciones.id`: la AU- si la pidió otra cuenta |
| `activada_en` · `activada_por` | timestamptz · uuid | sí | Cuándo y quién (siempre la dueña) |
| `confirmado_con_google_en` | timestamptz | sí | El «Confirmar con Google» de la dueña al darla de alta. Obligatorio al activar, salvo las cuentas de la siembra |
| `baja_en` · `baja_por` · `motivo_baja` | | sí | «Quitar acceso». El motivo es opcional |
| `baja_confirmado_con_google_en` | timestamptz | sí | Obligatorio con `baja_en` (CHECK) |

- Lleva las columnas comunes; `creado_por` es quien la pidió o la dueña.
- **Únicos parciales:** `persona_id` entre `solicitada` y `activa`; `correo` entre `solicitada` y `activa`; `google_sub` entre `activa`; `es_duena` donde es verdadero.
- `persona_id` lleva su `@llavePendiente` hasta la fase 7, y `autorizacion_id` también.

## La tabla `usuario_departamentos`

Qué departamentos tiene cada cuenta y en qué ubicación.

| Columna | Tipo | Nulo | Qué es |
|---|---|---|---|
| `id` | uuid | no | Llave |
| `usuario_id` | uuid | no | → `usuarios.id` |
| `departamento_id` | uuid | no | → `departamentos.id` |
| `ubicacion_id` | uuid | sí | → `ubicaciones.id`. Nulo es todas; en la primera versión todos van en nulo |
| `confirmado_con_google_en` | timestamptz | sí | El de «Guardar cambios». Nulo en los que nacen con una solicitud (la confirmación queda en la cuenta) |
| `baja_en` · `baja_por` · `motivo_baja` | | sí | Se lo quitaron. Volver a darlo es un renglón nuevo |

- Lleva las columnas comunes.
- Solo valen si la cuenta está activa. La dueña no lleva renglones.

## Acciones

### `admin.crear_cuenta`

| | |
|---|---|
| **Pantalla** | Administración del sistema · Usuarios y accesos · «Cuenta nueva» → «Dar de alta» → ventana «Dar de alta» · «Confirmar con Google» |
| **Quién** | Administración del sistema · `solo_duena` · «Confirmar con Google» |
| **Recibe** | `persona_id` · uuid · obligatorio: una persona activa de Personal<br>`correo` · texto · obligatorio: la cuenta de Google<br>`departamentos` · lista de claves · obligatoria, al menos una |
| **Reglas y errores** | `400`: «Escoge a la persona.» · «Escribe su correo de Google.» · «Marca al menos un departamento.»<br>`422 persona_no_valida`: dada de baja o de tienda, «Nadie de tienda entra al sistema de fábrica.»<br>`422 persona_con_cuenta`: «{persona} ya tiene cuenta.»<br>`422 correo_con_cuenta`: «Ese correo ya tiene cuenta.» · `422 correo_solicitado`: «Ya hay una solicitud para ese correo.»<br>`422 departamento_no_asignable`: «La Puerta del taller entra con PIN.» |
| **Escribe** | `usuarios` activa, con quién y cuándo, y su `confirmado_con_google_en`. `usuario_departamentos`: uno por departamento |
| **Llama** | Si la persona tiene un PIN vivo: `personal.anular_pin` (motivo `cuenta_google`) |
| **Regresa** | `usuario_id`. «{persona} dada de alta: ya puede entrar con su cuenta de Google». Si tenía PIN, el aviso «Su PIN del taller ya no entra» |
| **Eventos** | `cuenta.activada`: «hay cambios» en `usuarios` para Administración y Personal |
| **Bitácora** | «Dio de alta a {persona} con {departamentos}», con `despues` (correo, departamentos y, si había, el PIN anulado) y su `confirmado_con_google_en` |

### `admin.pedir_cuenta`

| | |
|---|---|
| **Pantalla** | Administración del sistema · Usuarios y accesos · «Pedir cuenta nueva» → «Mandar solicitud» |
| **Quién** | Administración del sistema. La dueña no pide: `422 la_duena_da_de_alta`, «Tú das la cuenta directo con «Cuenta nueva».» |
| **Recibe** | Lo mismo que `admin.crear_cuenta`, y `para_que` · texto · hasta 80 · opcional («para revisar lotes en escritorio») |
| **Reglas y errores** | Las mismas de `admin.crear_cuenta` |
| **Escribe** | `usuarios` solicitada con su AU-; los `usuario_departamentos` pedidos, que valen hasta que la cuenta esté activa |
| **Llama** | `direccion.pedir_autorizacion`: tipo `alta_usuario`, departamento de origen Administración, resumen «Dar cuenta a {persona} con {departamentos}{, para qué}», detalle «{correo} · {departamentos}» |
| **Regresa** | `usuario_id`, la AU-. «Solicitud de cuenta para {persona} enviada a Dirección» |
| **Eventos** | `cuenta.solicitada` (y `autorizacion.pedida`) |
| **Bitácora** | «Pidió cuenta para {persona}», con `despues` (correo, departamentos, AU-) |

### `admin.quitar_acceso`

| | |
|---|---|
| **Pantalla** | Administración del sistema · Usuarios y accesos · «Quitar acceso» → ventana «Quitar acceso a {nombre}» · «Confirmar con Google» |
| **Quién** | Administración del sistema · `solo_duena` · «Confirmar con Google» |
| **Recibe** | `usuario_id` · uuid · obligatorio<br>`motivo` · texto · hasta 80 · opcional<br>`version` · entero · obligatorio |
| **Reglas y errores** | `422 es_la_duena`: «La dueña no se quita el acceso.»<br>`422 cuenta_no_activa`: «{nombre} ya no tiene acceso.» |
| **Escribe** | La cuenta: `sin_acceso` con su baja y su confirmación. Sus departamentos y permisos finos vigentes: baja. Sus sesiones abiertas: cerradas con `acceso_quitado` |
| **Regresa** | «{nombre} ya no entra al sistema» |
| **Eventos** | `cuenta.acceso_quitado`: `sesion_cerrada` a sus pantallas |
| **Bitácora** | «Quitó el acceso a {nombre}», con alerta |

La cuenta de soporte no sale en la matriz de departamentos, pero la dueña sí le puede quitar el acceso y cerrarle sesiones.

### `admin.cambiar_departamentos`

| | |
|---|---|
| **Pantalla** | Administración del sistema · Usuarios y accesos · «Departamentos de cada quien» · «Guardar cambios» → ventana «Cambiar departamentos» · «Confirmar con Google» |
| **Quién** | Administración del sistema · `solo_duena` · «Confirmar con Google» |
| **Recibe** | `cambios` · lista, al menos uno: por cuenta, `usuario_id`, la `version` que se leyó, `recibe` (claves) y `deja` (claves) |
| **Reglas y errores** | `422 sin_cambios`: «No hay cambios por guardar.»<br>`422 es_la_duena`: «La dueña tiene todos los departamentos»<br>`422 cuenta_no_activa`<br>`422 sin_departamentos`: «{nombre} se quedaría sin departamentos. Para quitarle todo, usa «Quitar acceso»»<br>`422 soporte_sin_dinero`: Dirección o Contaduría a la cuenta de soporte, «La cuenta de soporte no ve dinero ni nómina.»<br>`409` por cuenta |
| **Escribe** | `usuario_departamentos`: baja a lo que deja; renglón nuevo a lo que recibe, con su confirmación. Sube la versión de cada cuenta |
| **Regresa** | «Departamentos guardados. Los menús ya cambiaron» |
| **Eventos** | `cuenta.departamentos_cambiados`: `permisos_cambiados` a las sesiones de esas cuentas, que cambian su menú al momento |
| **Bitácora** | Un renglón por cuenta, porque cambia varias cuentas a la vez (ver [bitácora](bitacora.md)): «Departamentos de {nombre}: recibe {…} deja {…}», con `antes`, `despues`, su confirmación y alerta |

## Acciones internas

### `admin.aplicar_decision_alta_usuario`

| | |
|---|---|
| **La llama** | `direccion.decidir_autorizacion`, cuando se decide una AU- de tipo `alta_usuario` |
| **Recibe** | La decisión (autorizada o rechazada), la AU- y quién decidió |
| **Reglas y errores** | La cuenta está solicitada con esa AU-. Al autorizar: `422 persona_dada_de_baja`, «{persona} ya está dada de baja: rechaza la solicitud.»; y otra vez `correo_con_cuenta` y `persona_con_cuenta`, porque pudo cambiar mientras esperaba |
| **Escribe** | Autorizada: la cuenta activa, con quién, cuándo y su confirmación; valen sus departamentos. Rechazada: la cuenta `rechazada` |
| **Llama** | Autorizada y con PIN vivo: `personal.anular_pin` (`cuenta_google`) |
| **Regresa** | `usuario_id` y el mensaje |
| **Eventos** | `cuenta.activada` o `cuenta.rechazada` |

### `admin.cerrar_cuenta_de_persona`

| | |
|---|---|
| **La llama** | `personal.dar_baja_persona`: la baja de una persona le quita el acceso en la misma transacción |
| **Recibe** | `persona_id` |
| **Reglas** | No pide Google: quita acceso, no lo da. Sin cuenta viva, no hace nada |
| **Escribe** | Cuenta activa: `sin_acceso` con el motivo «Baja de la persona», sus departamentos y permisos con baja, y sus sesiones cerradas con `acceso_quitado`. Cuenta solicitada: `rechazada` |
| **Llama** | Con solicitud: `direccion.cancelar_autorizacion` (motivo «La persona se dio de baja») |
| **Eventos** | `cuenta.acceso_quitado`: `sesion_cerrada` |

## Las primeras cuentas

La cuenta de la dueña y la de soporte técnico nacen con la siembra de la puesta en marcha, ligadas a sus datos de la [migración](../../MIGRACION.md); sus correos se dan como variables de entorno al sembrar. En local y en las pruebas, las cuentas son las de la muestra: la dueña, la oficina, Aduana y bodega y el encargado del taller.

## Permisos

- Ver Usuarios y accesos: Administración del sistema.
- Crear cuentas, quitar acceso y cambiar departamentos: solo la dueña, con «Confirmar con Google».
- Pedir una cuenta: Administración del sistema, si no es la dueña.

## Eventos

`cuenta.solicitada` · `cuenta.activada` · `cuenta.rechazada` · `cuenta.departamentos_cambiados` · `cuenta.acceso_quitado`.

## Lo que llega después

- **En la fase 7,** con Personal y las autorizaciones: la revisión de la persona (activa, no de tienda, sin otra cuenta), las llamadas a `personal.anular_pin`, `admin.pedir_cuenta`, `admin.aplicar_decision_alta_usuario` y `admin.cerrar_cuenta_de_persona`. Hasta entonces, `persona_id` y `autorizacion_id` llevan su `@llavePendiente`.

## Cómo está hecho

*Lo escribe Claude Code al terminar las fases 5 y 7.*
