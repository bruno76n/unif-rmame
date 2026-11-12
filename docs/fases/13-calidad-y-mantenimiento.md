# Fase 13: Calidad y Mantenimiento

> **Etapa:** Módulos.
> **Estado:** Terminada.
> **Antes de empezar:** lee la [forma de trabajo](../trabajo/FORMA-DE-TRABAJO.md) y la [revisión de fase](../trabajo/REVISION-DE-FASE.md).
> **Se conecta con:** [fases](FASES.md) · [fase 12](12-produccion.md) · [fase 14](14-inventario-recepcion-del-taller-conteos-ajustes-y-reabasto.md)

## Objetivo

Ningún lote llega a aduana sin que Calidad lo revise, y lo que regresa mal se rastrea hasta su lote, su operación, su persona y su tela. Mantenimiento sabe qué máquina está parada, qué lotes detiene, quién la repara y cuánto cuesta.

## Depende de

- [Fase 12](12-produccion.md), terminada y en verde.

## Qué se construye

### Parte 1 · Revisión de lotes

**Construye:** las tablas `revisiones`, `revision_tallas`, `rechazos`, `reprocesos`, `defectos` y `defecto_operaciones` (con ellas dejan su `@llavePendiente` las columnas que apuntan a los reprocesos y los defectos); `calidad.revisar_lote`, `calidad.aprobar_reproceso` y `calidad.agregar_defecto`; las lecturas `calidad.aprobadas_del_lote` y `calidad.en_reproceso_de_pedido` (con esta, los reprocesos en `produccion.piezas_en_produccion`); la lectura `produccion.persona_que_la_hizo`; y el lote como agregado con sus tallas.

**Leer:**
- [revisión de lotes](../modulos/calidad/revision-de-lotes.md) — todo.
- [lotes](../modulos/produccion/lotes.md#reglas) — las reglas 9 y 12, que aquí se completan.
- [registros de operación](../modulos/produccion/registros-de-operacion.md#lecturas) — la persona que se propone.

### Parte 2 · Reclamos

**Construye:** la tabla `reclamos`; `calidad.registrar_reclamo` y `calidad.resolver_reclamo`; y la lectura `catalogo.variante_por_codigo`.

**Leer:**
- [reclamos y devoluciones](../modulos/calidad/reclamos-y-devoluciones.md) — los reclamos (la revisión de devoluciones es de la fase 16).
- [variantes, códigos y etiquetas](../modulos/catalogo/variantes-codigos-y-etiquetas.md#lecturas) — la lectura del código.

### Parte 3 · Máquinas, fallas y servicios

**Construye:** las tablas `tipos_maquina`, `maquinas`, `motivos_falla` (con su siembra), `fallas`, `servicios` y `tecnicos`, y la lista «Áreas del taller»; las siete acciones de Mantenimiento, con el reporte de falla que llega de la tablet por su cola; la lectura `mantenimiento.fallas_que_detienen` y, con ella, el atorado por máquina en la salud de los lotes y en el trabajo «Vigilar lotes atorados»; las horas de paro y su costo; y la bajada de máquinas, fallas y motivos a la tablet.

**Leer:**
- [máquinas, fallas y servicios](../modulos/mantenimiento/maquinas-fallas-y-servicios.md) — todo.
- [lotes](../modulos/produccion/lotes.md#reglas) — el atorado por máquina (regla 7).
- [configuración](../modulos/admin/configuracion.md) — las decisiones de operación y las listas.
- [sincronización](../cimientos/SINCRONIZACION.md) — lo que sube y baja de la tablet.

## Cómo se construye

- Un solo agente, una parte a la vez.
- El reporte de falla de la tablet se prueba con un aparato de prueba y su cola, como en la fase 12.
- Las horas de paro se prueban con fechas fijas: días de trabajo, hoy y ayer.
- Al cerrar la fase, los datos de la muestra de Calidad y Mantenimiento (defectos, revisiones, reclamos, tipos, máquinas, fallas, servicios y técnicos) se cargan con estas mismas acciones (ver [base de datos](../cimientos/BASE-DE-DATOS.md#siembra-del-sistema-y-datos-de-la-muestra)).
- No va en esta fase: las pantallas y las consultas (fase 19) ni la tablet (fase 20).

## Excepciones permitidas

- `calidad.revisar_devolucion` y la tabla `revisiones_devolucion` se construyen en la fase 16, con las devoluciones de los clientes.
- `reclamos.cliente_id` y `reclamos.nota_entrega_id` llevan su `@llavePendiente` hasta la fase 16, y `reclamos.salida_tienda_id`, hasta el POS; aquí se prueban con documentos de prueba.
- El gasto del servicio (`contaduria.registrar_gasto_mantenimiento` y `servicios.gasto_id`) llega en la fase 17, con sus dos parámetros; hasta entonces un servicio con costo no pide gasto.
- Aduana recibe el lote revisado y su reproceso en la fase 14: `calidad.aprobar_reproceso` se prueba con un lote puesto en aduana por la prueba.

## Criterios de terminado

| Criterio | Prueba que lo demuestra |
|---|---|
| Revisar un lote terminado congela sus aprobadas por talla, crea un reproceso por rechazo y deja el lote revisado; no se rechazan más piezas que las listas de una talla | `modulos/calidad/acciones/revisar-lote.prueba.ts` |
| Si llega un registro de la tablet mientras se revisa, la revisión recibe `409` | La misma prueba |
| La persona propuesta de un rechazo o de un reclamo es la de más piezas buenas de esa operación y talla, o la de base | `modulos/produccion/lecturas/persona-que-la-hizo.prueba.ts` |
| Quien cosió puede revisar, y la revisión queda marcada | `revisar-lote.prueba.ts` |
| Un reproceso solo se aprueba con su lote en aduana, y se aprueba completo | `modulos/calidad/acciones/revisar-lote.prueba.ts` |
| Un reclamo llega del código al lote revisado, con una operación del flujo ligada al defecto y la persona congelada | `modulos/calidad/acciones/registrar-reclamo.prueba.ts` |
| Una máquina nace con el folio de su tipo, y un tipo nuevo toma un prefijo que no choca | `modulos/mantenimiento/acciones/alta-maquina.prueba.ts` |
| Una máquina tiene una sola falla abierta: desde la tablet se aplica sin crear otra; desde Mantenimiento es un error | `modulos/mantenimiento/acciones/reportar-falla.prueba.ts` |
| Las horas de paro cuentan desde que se paró, con los días de trabajo y las horas de hoy; una resuelta usa las que se registraron | `modulos/mantenimiento/lecturas/fallas-que-detienen.prueba.ts` |
| Una falla que detuvo la máquina atora los lotes de la operación de quien la trae, y resolverla quita el atorado | `modulos/produccion/trabajos/vigilar-lotes-atorados.prueba.ts` y `packages/compartido/src/calculos/salud-lote.prueba.ts` |
| Una máquina con falla abierta no se da de baja; cambiar quién la trae no cambia la falla abierta | `baja-maquina.prueba.ts` y `cambiar-asignacion-maquina.prueba.ts` |
| A la tablet bajan las máquinas activas, sus fallas abiertas y los motivos, nunca costos | `modulos/mantenimiento/bajada.prueba.ts` |

## Revisión de fase

Normal: un [auditor](../../.claude/agents/auditor.md) con contexto limpio revisa los seis puntos de la [revisión de fase](../trabajo/REVISION-DE-FASE.md).
