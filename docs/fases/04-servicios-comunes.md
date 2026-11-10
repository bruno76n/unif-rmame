# Fase 04: Servicios comunes

> **Etapa:** Cimientos.
> **Estado:** Pendiente.
> **Antes de empezar:** lee la [forma de trabajo](../trabajo/FORMA-DE-TRABAJO.md) y la [revisión de fase](../trabajo/REVISION-DE-FASE.md).
> **Se conecta con:** [fases](FASES.md) · [fase 3](03-api-protocolo-e-idempotencia.md) · [fase 5](05-acceso-con-google-cuentas-y-permisos.md)

## Objetivo

Quedan funcionando los servicios que usan todos los módulos: el worker con la bandeja de eventos y los trabajos programados, los avisos en vivo, los folios, los parámetros y las listas, la bitácora, los avisos a personas con su correo, los archivos en R2, la impresión de etiquetas y los respaldos.

## Depende de

- [Fase 3](03-api-protocolo-e-idempotencia.md), terminada y en verde.

## Qué se construye

### Parte 1 · Eventos, worker y avisos en vivo

**Construye:** la tabla `eventos` partida por mes y `admin.guardar_evento`, que encola `procesar_eventos` en la misma transacción; el worker (`apps/api/src/trabajos.ts`) con Graphile Worker; el proceso de la bandeja con sus reintentos; el reloj de cada minuto que encola los trabajos según sus horarios en parámetros, una cola por trabajo; la tarea de depurar eventos; `GET /v1/eventos` con `LISTEN/NOTIFY`, el latido y el recorte por departamento.

**Leer:**
- [eventos y trabajos](../cimientos/EVENTOS-Y-TRABAJOS.md) — todo lo de esta parte.
- [módulos](../cimientos/MODULOS.md#eventos) — cómo guarda sus eventos una acción.

### Parte 2 · Folios, configuración y ubicaciones

**Construye:** `contadores_folio` con su siembra, `admin.tomar_folio` y la lectura `admin.siguiente_folio`; `parametros`, `parametros_historial`, `listas`, `lista_valores` y `empresa`, con `admin.cambiar_parametro`, `admin.agregar_a_lista`, `admin.editar_empresa` y la lectura `admin.parametro` (también con `en`); la siembra de parámetros desde el `parametros.ts` de cada módulo; la tabla `ubicaciones` con su siembra. El paso de la versión mínima de la fase 3 ya lee sus parámetros.

**Leer:**
- [folios](../modulos/admin/folios.md) — los contadores, la siembra, la interna y la lectura.
- [configuración](../modulos/admin/configuracion.md) — los parámetros, las listas y la empresa.
- [libro de movimientos](../modulos/inventario/libro-de-movimientos.md#la-tabla-ubicaciones) — solo la tabla `ubicaciones` y su siembra.

### Parte 3 · Bitácora

**Construye:** la tabla `bitacora` partida por mes, con sus índices y el de trigramas; `admin.escribir_bitacora` conectado al paso 8 del corredor de acciones; el recorte de sueldos y tarifas con su descripción recortada; las consultas sensibles cada diez minutos; las alertas con su evento; `admin.marcar_alerta_revisada`.

**Leer:**
- [bitácora](../modulos/admin/bitacora.md) — todo lo de esta parte.

### Parte 4 · Avisos y correo

**Construye:** la tabla `avisos`; `admin.crear_aviso` con sus reglas de destinatarios y sin repetidos; `admin.marcar_aviso_leido`; los tipos del núcleo con sus parámetros de correo; la tarea `enviar_correos` con Resend y su plantilla de React Email, con reintentos.

**Leer:**
- [avisos](../modulos/admin/avisos.md) — los tipos, el correo y sus parámetros.
- [pruebas](../cimientos/PRUEBAS.md#simuladores-de-los-servicios-de-fuera) — el simulador de Resend.

### Parte 5 · Archivos

**Construye:** la tabla `archivos`; `POST /v1/archivos/subida` con la dirección firmada que lleva tipo, tamaño y suma; `admin.guardar_archivo`; `admin.ligar_archivo` con sus revisiones; `GET /v1/archivos/{id}`; el servidor compatible con S3 para `pnpm local`.

**Leer:**
- [archivos](../modulos/admin/archivos.md) — todo lo de esta parte.

### Parte 6 · Impresión

**Construye:** las tablas `impresoras` y `trabajos_impresion`; `admin.guardar_impresora`, `admin.mandar_a_imprimir`, `admin.confirmar_impresion`, la consulta del puente y `GET /v1/etiquetas/{tipo}/{id}` con el registro de tipos de etiqueta.

**Leer:**
- [impresión](../modulos/admin/impresion.md) — el mecanismo, los estados de un trabajo y los tipos.

### Parte 7 · Respaldos

**Construye:** las tablas `respaldos` y `restauraciones_probadas`; `admin.registrar_restauracion` y `admin.registrar_respaldo`; el trabajo del respaldo semanal (volcado, cifrado con llave pública y subida a R2 sin pasar por disco) y el del recordatorio.

**Leer:**
- [respaldos](../modulos/admin/respaldos.md) — los dos trabajos, las tablas y la acción.
- [infraestructura](../cimientos/INFRAESTRUCTURA.md) — dónde vive la llave y cómo se prueba una restauración.

## Cómo se construye

- Un solo agente, una parte a la vez.
- Cada servicio de fuera se prueba con su simulador (Resend y R2) y la base con Postgres real.
- Las cuentas (fase 5), los aparatos (fase 6) y las personas (fase 7) todavía no existen: las columnas que apuntan a ellos nacen con su `@llavePendiente`, y las pruebas usan quién llama con el identificador de prueba de la fase 3.
- No va en esta fase: entrar con Google, registrar aparatos ni el contenido de ninguna etiqueta del negocio.

## Excepciones permitidas

- La tabla `ubicaciones` es del módulo `inventario` (fase 9), pero se construye aquí con su siembra porque la usan los parámetros y las impresoras, y después las cuentas, los aparatos y las personas.
- Las reglas de destinatarios de los avisos (`duena`, `departamento:{clave}`, `soporte`) se resuelven con `usuarios` desde la fase 5; aquí se prueban con cuentas de prueba.
- Que una impresora esté conectada se mide con el último contacto de su puente, que llega en la fase 6; aquí se prueba con ese dato puesto por la prueba.
- La tarea de depurar eventos se construye y se prueba aquí; la encola el cuadre nocturno desde la fase 9.
- Los tipos de etiqueta del negocio los registra la fase 20; aquí se prueba con un tipo de prueba.

## Criterios de terminado

| Criterio | Prueba que lo demuestra |
|---|---|
| Una acción que confirma deja sus eventos y la tarea encolada; una que falla, ninguno de los dos | `modulos/admin/internas/guardar-evento.prueba.ts` |
| Con dos workers, cada evento se procesa una vez; uno que falla se reintenta a 1, 5, 30 y 120 minutos y a los 10 intentos avisa a soporte | `nucleo/trabajos/procesar-eventos.prueba.ts` |
| Un trabajo corre a la hora de México de su parámetro, una sola vez por periodo, y un cambio de horario vale desde la siguiente vuelta | `nucleo/trabajos/reloj.prueba.ts`, con «ahora» controlado |
| Una sesión recibe `cambios` solo de las tablas que leen sus departamentos; ningún evento en vivo lleva montos; un `NOTIFY` llega a las conexiones de otra instancia | `nucleo/sincronizacion/eventos-en-vivo.prueba.ts` |
| Dos documentos que piden folio a la vez reciben números seguidos, sin huecos aunque uno falle; el año nuevo en hora de México empieza en 1; el número de un aparato solo sube el contador | `modulos/admin/internas/tomar-folio.prueba.ts` |
| Solo la dueña cambia un parámetro; cada cambio deja historial y bitácora; vacío, cero o fuera de rango no se guardan; la lectura con `en` da el valor de ese momento; la siembra no pisa un valor cambiado | `modulos/admin/acciones/cambiar-parametro.prueba.ts` y `lecturas/parametro.prueba.ts` |
| Un valor repetido en una lista (sin mayúsculas ni acentos) responde `ya_esta`; la empresa nunca tiene dos renglones | `modulos/admin/acciones/agregar-a-lista.prueba.ts` y `editar-empresa.prueba.ts` |
| Toda acción deja su renglón de bitácora (uno, o uno por documento cuando su archivo lo dice, todos con el mismo `comando_id`); uno con un secreto falla; uno con sueldos guarda su descripción recortada; la misma consulta sensible se apunta una vez cada diez minutos; una alerta se vuelve aviso a la dueña | `modulos/admin/internas/escribir-bitacora.prueba.ts` |
| Un aviso no se repite sin leer; va por correo según su parámetro; el correo sale por el simulador de Resend y, si falla, se reintenta | `modulos/admin/internas/crear-aviso.prueba.ts` y `modulos/admin/trabajos/enviar-correos.prueba.ts` |
| Un archivo de otro tipo o más grande no se acepta; uno que no llegó, de otra cuenta o ya ligado no se liga; la dirección firmada vence; quien no ve el documento recibe `404` | `modulos/admin/acciones/subir-archivo.prueba.ts` e `internas/ligar-archivo.prueba.ts` |
| Un trabajo de impresión pasa de `por_imprimir` a `mandado` y a `impreso` o `fallo`; sin puente conectado responde `impresora_sin_puente`; confirmar dos veces contesta lo mismo | `modulos/admin/acciones/confirmar-impresion.prueba.ts` e `internas/mandar-a-imprimir.prueba.ts` |
| El respaldo semanal sale cifrado, llega con su SHA-256 y, descifrado y restaurado en otra base, trae los mismos conteos; no corre dos veces en la misma semana; el recordatorio avisa a su tiempo y no antes | `modulos/admin/trabajos/respaldo-semanal.prueba.ts` y `recordatorio-restauracion.prueba.ts` |

## Revisión de fase

Normal: un [auditor](../../.claude/agents/auditor.md) con contexto limpio revisa los seis puntos de la [revisión de fase](../trabajo/REVISION-DE-FASE.md).
