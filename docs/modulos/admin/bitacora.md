# Bitácora

> **Qué cubre:** quién hizo qué y cuándo, con lo que había antes y lo que quedó; las consultas sensibles; las alertas de seguridad; y el recorte de los sueldos para quien no los puede ver.
> **Estado:** Decidido.
> **Se construye en:** [fase 4](../../fases/04-servicios-comunes.md).
> **Se conecta con:** [API](../../cimientos/API.md) · [módulos](../../cimientos/MODULOS.md) · [avisos](avisos.md) · [pantallas comunes](../../interfaz/comunes.md) · [pantallas de Administración](../../interfaz/fabrica/administracion.md) · [pantallas de Catálogo](../../interfaz/fabrica/catalogo.md) · [acceso con Google](acceso-con-google.md) · [nómina](../contaduria/nomina.md) · [seguridad](../../cimientos/SEGURIDAD.md)

## Para qué sirve

Todo lo que pasa en el sistema deja su renglón: los cambios, las entradas y los intentos de entrar, y las consultas a datos sensibles. Nadie la edita ni la borra, tampoco la dueña. Ejemplo: «Cambió el parámetro «Lote atorado»: 2 → 3», hecho por la dueña desde Administración del sistema, a las 10:42 del 9 de noviembre.

## Reglas

1. **La escribe la API, no las pantallas:** toda acción escribe **un renglón**, en su transacción, con `admin.escribir_bitacora`. Una acción interna no escribe renglón propio: lo que cambió va en el renglón de la acción que la llamó.
   - **Varios renglones solo cuando el archivo de la acción lo dice:** una acción que cambia varios documentos a la vez (las cuentas de «Guardar cambios», los productos de un cambio de precios en bloque) escribe uno por documento, y una que cambia varias cosas que la bitácora de su departamento muestra por separado (cada precio de «Aplicar cambios» en una ficha) escribe uno por cambio. Así el historial de cada documento y los filtros por tipo de cambio salen sin abrir el `antes` y el `despues`. Todos los renglones de una acción llevan el mismo `comando_id`.
   - **Ninguno solo al guardar un borrador** (de un pedido o de una orden de compra), que todavía no es un documento. Lo dice el archivo de la acción; enviarlo, confirmarlo o descartarlo sí deja su renglón.
2. **Solo crece.** El rol de la app no puede cambiarla ni borrarla. Revisar una alerta deja un renglón nuevo que apunta a ella.
3. **`antes` y `despues` llevan solo lo que cambió.**
4. **Nunca van a la bitácora** PIN, llaves, secretos, códigos de tienda en claro ni hashes. Si una acción los manda, `admin.escribir_bitacora` falla como error del programa.
5. **Los sueldos y las tarifas se recortan.** Si el renglón trae un sueldo o una tarifa, se marca `sensible_sueldos` y se guarda también la descripción sin los montos. A quien no tiene el permiso «ven sueldos y tarifas» le llega esa descripción, sin `antes` ni `despues`.
6. **Las consultas sensibles también se apuntan** (la ficha de una persona, las tarifas, la nómina, el saldo de un cliente): un renglón por cuenta y por documento cada `admin.minutos_consulta_sensible` (10 minutos), para que no se repita cada vez que la pantalla se vuelve a pintar.
7. **Las alertas de seguridad** se marcan `es_alerta` y le llegan a la dueña como aviso: el intento de entrar sin acceso, la entrada desde un aparato nuevo, el PIN bloqueado en la tablet, la apertura forzada de un turno de tienda, el cambio de departamentos o de permisos finos de una cuenta, y lo que llega de un aparato revocado.

## La tabla `bitacora`

| Columna | Tipo | Nulo | Qué es |
|---|---|---|---|
| `id` | uuid | no | Llave, junto con `ocurrido_en` (la tabla se parte por mes) |
| `ocurrido_en` | timestamptz | no | default `now()` |
| `tipo` | text | no | CHECK (`cambio`, `acceso`, `consulta_sensible`): los filtros «Cambios», «Accesos» y «Consultas sensibles» |
| `es_alerta` | boolean | no | default false |
| `usuario_id` | uuid | sí | → `usuarios.id` |
| `persona_id` | uuid | sí | → `personas.id`: quien lo hizo en la tablet o en la caja |
| `dispositivo_id` | uuid | sí | → `dispositivos.id` |
| `sesion_id` | uuid | sí | → `sesiones.id` |
| `comando_id` | uuid | sí | → `comandos_recibidos.id`: la acción que lo escribió, de la web o de un aparato. Los renglones de una misma acción comparten este id |
| `correo_intento` | text | sí | Solo en un intento de entrar sin acceso (no hay cuenta) |
| `departamento_id` | uuid | sí | → `departamentos.id`: el departamento de la pantalla de donde salió («autorizado por Dirección») |
| `modulo` | text | no | CHECK con los módulos del sistema y `sistema` |
| `origen` | text | no | CHECK (`fabrica`, `tienda`, `tablet`, `panel_linea`, `servidor_linea`, `sistema`): desde qué lado se hizo |
| `accion` | text | no | Clave estable: el nombre de la acción (`admin.cambiar_parametro`) |
| `descripcion` | text | no | «Qué pasó», ya armado con el texto de la acción |
| `descripcion_recortada` | text | sí | La misma, con «••••» en lugar de los sueldos y las tarifas |
| `entidad` · `entidad_id` · `entidad_folio` | text · uuid · text | sí | El documento, para su historial y para buscar por folio |
| `antes` · `despues` | jsonb | sí | Solo lo que cambió |
| `sensible_sueldos` | boolean | no | default false |
| `misma_persona` | boolean | no | default false. «Pedida y autorizada por la misma persona» |
| `confirmado_con_google_en` | timestamptz | sí | En las acciones que piden «Confirmar con Google» |
| `ip` | inet | sí | |

- Sin `creado_por`, `version` ni `actualizado_en`: nunca cambia.
- **Índices:** (`ocurrido_en` desc); (`entidad`, `entidad_id`, `ocurrido_en` desc); (`usuario_id`, `ocurrido_en` desc); (`persona_id`, `ocurrido_en` desc); (`tipo`, `ocurrido_en` desc); (`ocurrido_en` desc) donde `es_alerta`; y uno de trigramas sobre la descripción sin acentos (con `sin_acentos`, una función inmutable propia sobre `unaccent` que también usan otros índices, como el de las escuelas), para el buscador.
- Las columnas que apuntan a `usuarios`, `sesiones` y `departamentos` (fase 5), `dispositivos` (fase 6) y `personas` (fase 7) nacen con su `@llavePendiente`.

## `admin.escribir_bitacora` · interna

| | |
|---|---|
| **La llaman** | El corredor de acciones, con el renglón (o los renglones, regla 1) de cada acción (ver [módulos](../../cimientos/MODULOS.md#cómo-corre-una-acción)); las consultas sensibles; la entrada con Google |
| **Recibe** | Quién (`usuario_id`, `persona_id`, `dispositivo_id`, `sesion_id`, `comando_id`), `departamento_id`, `modulo`, `origen`, `accion`, la descripción como plantilla con sus valores (marcando los que son sueldo o tarifa), `entidad`, `entidad_id`, `entidad_folio`, `antes`, `despues`, `es_alerta`, `misma_persona`, `confirmado_con_google_en`, `ip` |
| **Reglas** | Falla como error del programa (`500`) si `antes` o `despues` traen un campo marcado como secreto. Si trae sueldos o tarifas: `sensible_sueldos` y arma las dos descripciones. En una consulta sensible, no escribe si ya hay un renglón de esa cuenta y ese documento en los últimos `admin.minutos_consulta_sensible` |
| **Escribe** | `bitacora` |
| **Eventos** | Con `es_alerta`: `alerta.registrada`, que se vuelve el aviso `alerta_seguridad` a la dueña (ver [avisos](avisos.md)) |
| **Regresa** | `bitacora_id` |

## `admin.marcar_alerta_revisada`

| | |
|---|---|
| **Pantalla** | Administración del sistema · Pendientes · «Alerta de seguridad» · «Marcar revisada», y Bitácora · el renglón con punto rojo |
| **Quién** | Administración del sistema · `solo_duena` |
| **Recibe** | `bitacora_id` · uuid · obligatorio: el renglón de la alerta<br>`nota` · texto · opcional · hasta 120 |
| **Reglas y errores** | `422 no_es_alerta`: el renglón no es una alerta<br>`422 ya_revisada`: «Esa alerta ya se revisó.» |
| **Escribe** | Solo su propio renglón de bitácora, que apunta a la alerta |
| **Regresa** | «Alerta revisada» |
| **Eventos** | `alerta.revisada` |
| **Bitácora** | Cambios: «Revisó la alerta: {descripción de la alerta}{ · nota}», con `entidad = bitacora` y `entidad_id` = la alerta |

Una alerta está revisada si existe un renglón de `admin.marcar_alerta_revisada` que apunta a ella.

## Parámetros

| Parámetro | Valor inicial | Para qué |
|---|---|---|
| `admin.minutos_consulta_sensible` | 10 min | Cada cuánto se vuelve a apuntar la misma consulta sensible de la misma cuenta |

## Permisos

- La pestaña Bitácora la ven las cuentas con Administración del sistema. Sin «ven sueldos y tarifas», los renglones sensibles llegan con su descripción recortada y sin `antes` ni `despues`.
- Marcar una alerta como revisada: solo la dueña.

La pantalla, sus filtros y su buscador están en [pantallas de Administración](../../interfaz/fabrica/administracion.md); el historial de un documento que sale en los cajones, en [pantallas comunes](../../interfaz/comunes.md).

## Eventos

`alerta.registrada` · `alerta.revisada`.

## Lo que llega después

- `codigo_tienda_id` (qué código compartido se usó en una tienda) llega con el POS, y `usuario_panel_id` (quién lo hizo en el panel) con uniformame.mx.

## Cómo está hecho

**Fase 4, parte 3.**

- **La tabla** `bitacora` está en `apps/api/src/modulos/admin/tablas.ts` (migración `0005_bitacora.sql`).
  - Se parte por mes de `ocurrido_en`, como `eventos`: `asegurar_particiones`, que el reloj llama en cada vuelta. La app entra solo por la tabla madre, nunca directo a una partición (decisión 357).
  - Lleva sus índices, el de trigramas sobre `sin_acentos(descripcion)` y los CHECK de `tipo`, `modulo` y `origen`.
  - Es una tabla que solo crece (`marcar_solo_crece`).
- **`admin.escribir_bitacora`** está en `modulos/admin/internas/escribir-bitacora.ts`.
  - Escribe un renglón; quién, el comando, el módulo, el origen y la acción salen del contexto.
  - Falla si `antes` o `despues` traen un campo de secreto, a cualquier profundidad.
  - Una descripción con sueldos llega como plantilla, con los sueldos marcados `{ sueldo }` (`DescripcionConSueldos`; decisión 356). Se guardan la completa y la recortada con «••••», y el renglón queda `sensible_sueldos`.
  - Un campo de sueldo o de tarifa en `antes` o `despues` también marca el renglón sensible. Los campos los declara cada módulo en su `permisos.ts` (`camposDeSueldo`: `pago_dia_centavos` con Personal, `tarifa_centavos` con Producción; decisión 370). Si su descripción viene en texto suelto, falla como error del programa, porque no se podría tapar.
  - Una consulta sensible toma un candado por cuenta y documento y no se repite dentro de `admin.minutos_consulta_sensible`.
  - Una alerta guarda `alerta.registrada`; el aviso a la dueña llega con la parte 4.
- **El corredor** llama a la interna una vez por renglón (`escribirBitacoraConAdmin`): todos llevan el mismo `comando_id`. No guarda una acción que no dejó renglón, salvo la que lo dice con `sinBitacora` (decisión 355). Hoy lo dice `admin.cambiar_parametro` cuando recibe lo mismo que ya había.
- **Una consulta** apunta su consulta sensible con `contexto.apuntarConsultaSensible`, en una transacción corta propia.
- **`admin.marcar_alerta_revisada`** está en `acciones/marcar-alerta-revisada.ts`, con un candado por alerta, y su contrato en `contratos/admin/bitacora.ts`.
- **Lo que llega después:**
  - `ip`, `sesion_id` de verdad y `departamento_id`, con la sesión de la fase 5;
  - `persona_id`, con el PIN de la fase 7.
- **Las pruebas** están en `modulos/admin/internas/escribir-bitacora.prueba.ts`. La de prueba es la consulta `prueba.ficha`.
