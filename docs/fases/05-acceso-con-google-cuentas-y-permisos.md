# Fase 05: Acceso con Google, cuentas y permisos ●

> **Etapa:** Módulos.
> **Estado:** Pendiente.
> **Antes de empezar:** lee la [forma de trabajo](../trabajo/FORMA-DE-TRABAJO.md) y la [revisión de fase](../trabajo/REVISION-DE-FASE.md).
> **Se conecta con:** [fases](FASES.md) · [fase 4](04-servicios-comunes.md) · [fase 6](06-dispositivos-y-sincronizacion.md)

## Objetivo

Se entra al sistema con Google, cada llamada sabe quién es y qué puede, y la dueña da y quita cuentas, departamentos y permisos finos con «Confirmar con Google».

## Depende de

- [Fase 4](04-servicios-comunes.md), terminada y en verde.

## Qué se construye

### Parte 1 · Departamentos y permisos finos

**Construye:** las tablas `departamentos` (con su siembra de 15) y `permisos_finos`; `admin.cambiar_permiso_fino`; la lectura `admin.permisos_de` con los departamentos efectivos. Las llaves pendientes hacia `departamentos` (la bitácora) se agregan.

**Leer:**
- [permisos](../modulos/admin/permisos.md) — los departamentos, los permisos finos y qué ve cada quien.

### Parte 2 · Entrar con Google y las sesiones

**Construye:** `GET /v1/acceso/google` y su vuelta con openid-client (código con PKCE, revisión del token, cuenta sin acceso); las cookies `ua_sesion`, `ua_aparato` y `ua_google`; la tabla `sesiones` con sus cierres y vencimientos; `intentos_recientes` y el `429`; «Confirmar con Google» con su `max_age`; `admin.salir`, `admin.cerrar_mi_sesion` y `admin.cerrar_sesiones`; el proveedor OpenID de desarrollo para `pnpm local`.

**Leer:**
- [acceso con Google](../modulos/admin/acceso-con-google.md) — todo lo de esta parte.
- [pruebas](../cimientos/PRUEBAS.md#simuladores-de-los-servicios-de-fuera) — el simulador de Google en las pruebas.

### Parte 3 · Cuentas

**Construye:** las tablas `usuarios` y `usuario_departamentos`; `admin.crear_cuenta`, `admin.quitar_acceso` y `admin.cambiar_departamentos`, con sus reglas; las cuentas de la muestra para local y pruebas; las llaves pendientes hacia `usuarios` y `sesiones` de las fases 3 y 4 (bitácora, avisos, parámetros, comandos recibidos, impresión).

**Leer:**
- [cuentas](../modulos/admin/cuentas.md) — los estados, las tablas y las acciones.

### Parte 4 · La revisión de cada llamada

**Construye:** el paso «quién llama» del corredor con la sesión de Google (el identificador de prueba de la fase 3 se queda solo en las pruebas); la revisión de departamento, permiso fino, `solo_duena` y «Confirmar con Google»; las reglas de la cuenta de soporte; el recorte común con `recortado`; las reglas de destinatarios de los avisos ya con cuentas reales.

**Leer:**
- [acceso y permisos](../cimientos/ACCESO-Y-PERMISOS.md) — el orden de la revisión, lo que solo hace la dueña y el recorte.
- [API](../cimientos/API.md#el-recorte-según-la-cuenta) — cómo viaja el recorte.

## Cómo se construye

- Un solo agente, una parte a la vez.
- Google se prueba con su simulador; nada llama al Google real.
- Las personas llegan en la fase 7 y las llaves de los aparatos en la fase 6: aquí `usuarios.persona_id` lleva su `@llavePendiente` y las pruebas crean cuentas con un `persona_id` de prueba.
- No va en esta fase: las pantallas (fase 19), el armazón con el saludo (fase 19) ni las llaves de los aparatos.

## Excepciones permitidas

- `admin.pedir_cuenta`, `admin.aplicar_decision_alta_usuario` y `admin.cerrar_cuenta_de_persona`, la revisión de la persona en `admin.crear_cuenta` y la anulación del PIN se agregan en la fase 7, con Personal y las autorizaciones.

## Criterios de terminado

| Criterio | Prueba que lo demuestra |
|---|---|
| Una cuenta activa entra con Google y su sesión queda guardada solo como hash; la primera entrada liga su `google_sub`; un token con firma, `nonce`, audiencia o vencimiento malos no entra | `modulos/admin/acciones/entrar-con-google.prueba.ts`, con el simulador |
| Una cuenta sin dar de alta, solicitada, rechazada o sin acceso no entra, ve «Esta cuenta no tiene acceso» y deja una alerta | La misma prueba |
| La entrada desde un aparato nuevo deja una alerta; la primera entrada de la cuenta, no | La misma prueba |
| Después de `admin.intentos_entrada_max` fallas desde una IP responde `429` hasta que pasa la ventana, también con dos instancias de la API | `nucleo/acceso/intentos.prueba.ts` |
| Una sesión cerrada, vencida, inactiva o de una cuenta sin acceso responde `401 sin_sesion` y queda cerrada con su motivo | `nucleo/acceso/sesion.prueba.ts` |
| Una acción que pide «Confirmar con Google» responde `401 reautenticar` sin una confirmación de los últimos 5 minutos, y pasa con ella; la confirmación con otra cuenta de Google no vale | `modulos/admin/acciones/confirmar-con-google.prueba.ts` |
| Cada acción del sistema revisa su departamento, su permiso fino y `solo_duena` en el servidor, y la cuenta de soporte nunca recibe montos | `nucleo/acceso/permisos.prueba.ts`, que recorre todos los contratos registrados |
| Solo la dueña crea cuentas, quita acceso y cambia departamentos y permisos finos; nadie le quita nada a la dueña; ninguna cuenta queda sin departamentos | `modulos/admin/acciones/crear-cuenta.prueba.ts`, `quitar-acceso.prueba.ts`, `cambiar-departamentos.prueba.ts` y `cambiar-permiso-fino.prueba.ts` |
| Quitar el acceso cierra todas las sesiones de la cuenta al momento y les llega `sesion_cerrada`; cambiar departamentos les manda `permisos_cambiados` | Las mismas pruebas, con la conexión de avisos en vivo |
| Las sesiones de la dueña solo las cierra ella | `modulos/admin/acciones/cerrar-sesiones.prueba.ts` |

## Revisión de fase

Delicada ●: dos [auditores](../../.claude/agents/auditor.md), cada uno con su tema, y el [desmentidor](../../.claude/agents/desmentidor.md):

- **permisos y datos personales** (la revisión de cada llamada, el recorte, lo que solo hace la dueña);
- **secretos** (las cookies, los tokens y que ningún secreto quede guardado ni en la bitácora).
