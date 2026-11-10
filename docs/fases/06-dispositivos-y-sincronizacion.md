# Fase 06: Dispositivos y sincronización ●

> **Etapa:** Módulos.
> **Estado:** Pendiente.
> **Antes de empezar:** lee la [forma de trabajo](../trabajo/FORMA-DE-TRABAJO.md) y la [revisión de fase](../trabajo/REVISION-DE-FASE.md).
> **Se conecta con:** [fases](FASES.md) · [fase 5](05-acceso-con-google-cuentas-y-permisos.md) · [fase 7](07-autorizaciones-y-personal.md)

## Objetivo

Un aparato se registra con un código de 10 minutos y entra con su propia llave; sube su cola en orden sin duplicar ni perder nada, baja solo lo suyo hasta un tope seguro, y si se revoca deja de entrar sin que se pierda lo que tenía sin subir.

## Depende de

- [Fase 5](05-acceso-con-google-cuentas-y-permisos.md), terminada y en verde.

## Qué se construye

### Parte 1 · Aparatos y llaves

**Construye:** las tablas `dispositivos`, `codigos_registro` y `dispositivos_sync`; `admin.generar_codigo_registro`, `admin.cancelar_codigo_registro` y `admin.canjear_codigo` (con su `429`); `admin.revocar_dispositivo` y `admin.rotar_llave` con su gracia; el paso «quién llama» del corredor con la llave del aparato (`Authorization: Llave`), comparada en tiempo constante; el contacto de cada llamada. Las llaves pendientes hacia `dispositivos` de las fases anteriores se agregan.

**Leer:**
- [dispositivos](../modulos/admin/dispositivos.md) — los tipos, las tablas y las acciones.
- [acceso y permisos](../cimientos/ACCESO-Y-PERMISOS.md#las-formas-de-entrar) — la llave y el alcance.

### Parte 2 · Subir

**Construye:** `POST /v1/sync/subir` con sus pasos, una transacción por comando, `aplicado`, `repetido`, `apartado` y `excepcion`, la tanda cortada con `detenido`, el desfase del reloj y la cancelación tardía; `admin.reintentar_comando_apartado`, `admin.descartar_comando_apartado` y el reintento solo de lo que esperaba un documento.

**Leer:**
- [sincronización](../cimientos/SINCRONIZACION.md#subir--post-v1syncsubir) — la subida completa.
- [idempotencia y concurrencia](../cimientos/IDEMPOTENCIA-Y-CONCURRENCIA.md) — la tabla `comandos_recibidos`, que ya existe desde la fase 3.

### Parte 3 · Bajar y la foto

**Construye:** el registro de lo que baja a cada tipo de aparato (cada módulo lo declara en su `bajada.ts`: sus tablas, su filtro, sus columnas y su orden); `GET /v1/sync/bajar` con el cursor firmado sobre `xid_escritura`, el tope seguro, `cambio` y `quitar`, y `requiere_foto`; `GET /v1/sync/foto` sin tocar la cola del aparato; los filtros que cambian sin tocar el renglón (`foto_pedida_en` y `resincronizar`).

**Leer:**
- [sincronización](../cimientos/SINCRONIZACION.md#bajar--get-v1syncbajardesdecursorlimiten) — la bajada, la foto y los filtros.
- [base de datos](../cimientos/BASE-DE-DATOS.md#columnas-comunes) — `xid_escritura` y su disparador, que ya existen desde la fase 2.

### Parte 4 · El aparato revocado y lo que vigila

**Construye:** lo que llega de un aparato revocado (retenido o apartado según cuándo pasó, con su alerta por tanda); `401 llave_revocada` en todo lo demás; los avisos en vivo con la llave (`dispositivo_revocado`, `resincronizar`); el trabajo de aparatos sin sincronizar; el trabajo del tope detenido; la lectura `admin.ultima_sincronizacion`.

**Leer:**
- [sincronización](../cimientos/SINCRONIZACION.md#el-aparato-revocado) — el revocado, el reloj y el tope detenido.
- [dispositivos](../modulos/admin/dispositivos.md#trabajos) — el trabajo de aparatos sin sincronizar.

## Cómo se construye

- Un solo agente, una parte a la vez.
- Todavía no hay acciones de la tablet ni tablas del negocio que bajen: las pruebas usan un módulo de prueba con una acción de aparato, una tabla que baja con su filtro y una que depende de otra.
- La sincronización se prueba con datos al azar y con dos conexiones a la base que confirman en distinto orden.
- No va en esta fase: la app de la tablet (fase 20) ni la caja (proyecto del POS).

## Excepciones permitidas

- Abrir la excepción de un comando que no cuadra (`inventario.registrar_excepcion`) llega en la fase 9; aquí el resultado `excepcion` se prueba con el módulo de prueba.
- Lo que llega de un aparato revocado queda retenido en `comandos_recibidos`; su excepción en la bandeja de Bodega y `admin.aplicar_comando_retenido` llegan en la fase 9.
- La llamada a `personal.anular_pines_ubicacion` al revocar la tablet llega en la fase 7.

## Criterios de terminado

| Criterio | Prueba que lo demuestra |
|---|---|
| Un código de registro vale `admin.codigo_registro_vigencia_min`, se canjea una vez, no dice si no existe o venció, y después de `admin.intentos_codigo_max` equivocados responde `429` | `modulos/admin/acciones/canjear-codigo.prueba.ts` |
| Al canjear, el aparato queda con su llave y el servidor guarda solo el hash; el reintento del canje con la misma clave contesta lo mismo sin el secreto | La misma prueba |
| Un aparato solo entra con su llave vigente; revocado, responde `401 llave_revocada` en todo menos la subida; rotada, valen las dos durante la gracia | `nucleo/acceso/llave.prueba.ts` |
| Un comando fuera del alcance de su tipo se aparta con `fuera_de_alcance`; uno mal formado, con `mal_formado`; con la misma clave y otros datos, con `clave_repetida_con_otros_datos` | `nucleo/sincronizacion/subir.prueba.ts` |
| Un comando que espera un documento se aparta y se aplica solo cuando ese documento llega | La misma prueba |
| Con cualquier orden de tandas, respuestas perdidas, tandas cortadas y reintentos, la base queda igual que sin fallas, sin duplicados ni pérdidas | `nucleo/sincronizacion/azar.prueba.ts`, con fast-check |
| Una transacción que tomó su número antes y confirmó después que otra no se salta: su renglón baja en la siguiente ventana | `nucleo/sincronizacion/tope.prueba.ts`, con dos conexiones |
| Un renglón que sale del filtro baja como `quitar`; un parámetro que cambia el filtro pide la foto; un cursor viejo, ajeno o de otro esquema pide la foto | `nucleo/sincronizacion/bajar.prueba.ts` |
| La foto entrega todo lo vigente del aparato y, al terminar, la bajada sigue desde su inicio sin perder lo que cambió durante la foto | `nucleo/sincronizacion/foto.prueba.ts` |
| Lo que llega de un aparato revocado y pasó antes de revocarlo queda retenido; lo de después se aparta; ninguna de las dos cosas se pierde | `nucleo/sincronizacion/revocado.prueba.ts` |
| Un aparato sin sincronizar `admin.horas_sin_sincronizar_aviso` avisa a la dueña una sola vez por episodio | `modulos/admin/trabajos/aparatos-sin-sincronizar.prueba.ts` |
| Un tope que no avanza en `sync.minutos_tope_detenido` avisa a soporte | `nucleo/trabajos/tope-detenido.prueba.ts` |

## Revisión de fase

Delicada ●: tres [auditores](../../.claude/agents/auditor.md), cada uno con su tema, y el [desmentidor](../../.claude/agents/desmentidor.md):

- **sincronización** (nada se duplica, se pierde ni se salta);
- **secretos** (las llaves y los códigos solo como hash, nunca en respuestas guardadas ni en la bitácora);
- **permisos y datos personales** (el alcance de cada tipo de aparato).
