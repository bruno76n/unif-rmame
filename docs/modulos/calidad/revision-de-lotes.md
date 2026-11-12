# Revisión de lotes

> **Qué cubre:** Calidad revisa cada lote terminado: aprueba por talla y regresa a reproceso lo que tiene defecto, a la operación y la persona que lo causó; aprueba el reproceso cuando Aduana ya recibió el lote; y el catálogo de defectos con las operaciones que suelen causarlos.
> **Estado:** Decidido.
> **Se construye en:** [fase 13](../../fases/13-calidad-y-mantenimiento.md).
> **Se conecta con:** [lotes](../produccion/lotes.md) · [registros de operación](../produccion/registros-de-operacion.md) · [operaciones y flujos](../produccion/operaciones-y-flujos.md) · [recepción del taller](../inventario/recepcion-del-taller.md) · [reclamos y devoluciones](reclamos-y-devoluciones.md) · [personas](../personal/personas.md) · [pedidos](../ventas/pedidos.md) · [pantallas de Calidad](../../interfaz/fabrica/calidad.md) · [pantallas de Producción](../../interfaz/fabrica/produccion.md) · [flujo 07 · Calidad y reclamos](../../flujos/fabrica/07-calidad-y-reclamos.md)

## Para qué sirve

Ningún lote llega a aduana sin que Calidad lo revise. Ejemplo: al revisar el L-2026-121, Calidad encuentra 3 piezas con costura abierta en la talla 10. El rechazo va a «Costados», la primera operación del flujo que suele causar ese defecto, y a la persona que hizo más piezas de esa operación en esa talla. Al apretar «Aprobar {n} y regresar 3», el lote queda revisado, Aduana ve las aprobadas por recibir y las 3 regresan al taller como el reproceso L-2026-121-R1.

## Reglas

1. **Se revisa cada lote terminado.** Es «Por revisar hoy» si se entrega en `calidad.por_revisar_hoy_dias` (1) días o menos; si no, «Por revisar».
2. **Revisadas y aprobadas, por talla:** las revisadas son las listas del lote al revisar (sus terminadas); las aprobadas, las revisadas menos los rechazos de esa talla. No se rechazan más piezas que las listas de la talla.
3. **Cada rechazo dice** el defecto, la operación que lo causó, la persona, la talla y cuántas piezas (al menos una). La operación que se propone es la primera del flujo que suele causar ese defecto o, si ninguna, la última. La persona que se propone es la que hizo más piezas buenas vigentes de esa operación en los bultos de esa talla o, si no hay registros, la de base. Las dos se pueden cambiar.
4. **Al cerrar la revisión,** el lote queda revisado, sus aprobadas por talla quedan congeladas (contra ellas cuenta Aduana a ciegas) y cada rechazo nace como un reproceso, con folio {lote}-R{n}. Nada se mueve: las piezas siguen en el Taller hasta que Aduana las cuenta.
5. **El rechazo no cambia el pago:** se paga lo registrado. Guarda la operación y la persona para la tasa de defectos.
6. **Quien cosió puede revisar su lote,** pero la revisión queda marcada en el lote y en la bitácora («revisó quien cosió en el lote») si la persona de la cuenta tiene registros vigentes en él.
7. **Un reproceso se aprueba solo cuando Aduana ya recibió su lote.** Se aprueba completo: sin paso en la tablet y sin merma. Sus piezas pasan a Aduana, que las cuenta a ciegas, y completan las tallas que le faltaron al lote. Mientras está en reproceso, sus piezas siguen contando para su pedido como «En reproceso».
8. **El catálogo de defectos:** un nombre único sin importar mayúsculas, de 4 letras o más, con al menos una operación que suele causarlo.
9. **La tasa de defectos,** en los últimos `calidad.defectos_periodo_dias` (30) días: por operación, sus rechazos ÷ las revisadas de los lotes cuyo flujo la tiene; por persona, sus rechazos ÷ las revisadas de los lotes donde tiene registros. Arriba de `calidad.defectos_tasa_roja_porcentaje` (2 %) sale en rojo.
10. **El lote no cambia mientras se revisa:** si llega un registro de la tablet, sube la versión del lote y la revisión recibe `409` (ver [lotes](../produccion/lotes.md)).

## Estados del reproceso

| De | A | Qué pasa | Quién |
|---|---|---|---|
| — | `en_reproceso` | Se cierra la revisión: uno por rechazo | Calidad |
| `en_reproceso` | `listo` | «Aprobar», con el lote ya en aduana | Calidad |

## La tabla `revisiones`

Nace cerrada y no cambia. Una por lote.

| Columna | Tipo | Nulo | Qué es |
|---|---|---|---|
| `id` | uuid | no | Llave (v7) |
| `lote_id` | uuid | no | → `lotes.id`. Único |
| `revisado_por` | uuid | no | → `usuarios.id`: la cuenta que revisó |
| `persona_id` | uuid | sí | → `personas.id`: la persona de esa cuenta, si está ligada |
| `revisado_en` | timestamptz | no | |
| `fecha` | date | no | El día de la revisión |
| `piezas_revisadas` · `piezas_aprobadas` | integer | no | CHECK ≥ 0, y aprobadas ≤ revisadas |
| `reviso_quien_coso` | boolean | no | Regla 6 |

Lleva las columnas comunes (ver [base de datos](../../cimientos/BASE-DE-DATOS.md#columnas-comunes)). **Índices:** único (`lote_id`) · (`fecha`).

## La tabla `revision_tallas`

| Columna | Tipo | Nulo | Qué es |
|---|---|---|---|
| `id` | uuid | no | Llave |
| `revision_id` | uuid | no | → `revisiones.id` |
| `variante_id` | uuid | no | → `variantes.id`. Única con `revision_id` |
| `piezas_revisadas` · `piezas_aprobadas` | integer | no | CHECK ≥ 0, y aprobadas ≤ revisadas |

Lleva las columnas comunes.

## La tabla `rechazos`

| Columna | Tipo | Nulo | Qué es |
|---|---|---|---|
| `id` | uuid | no | Llave |
| `revision_id` | uuid | no | → `revisiones.id` |
| `defecto_id` | uuid | no | → `defectos.id` |
| `flujo_operacion_id` | uuid | no | → `flujo_operaciones.id`, del flujo del lote |
| `persona_id` | uuid | no | → `personas.id` |
| `variante_id` | uuid | no | → `variantes.id`: la talla |
| `piezas` | integer | no | CHECK > 0 |

Lleva las columnas comunes. **Índices:** único (`revision_id`, `defecto_id`, `flujo_operacion_id`, `variante_id`) · (`flujo_operacion_id`) · (`persona_id`).

## La tabla `reprocesos`

| Columna | Tipo | Nulo | Qué es |
|---|---|---|---|
| `id` | uuid | no | Llave |
| `folio` | text | no | L-2026-121-R1: el folio del lote y el siguiente número de sus reprocesos. Único |
| `rechazo_id` | uuid | no | → `rechazos.id`. Único |
| `lote_id` | uuid | no | → `lotes.id` |
| `estado` | text | no | CHECK (`en_reproceso`, `listo`). default `en_reproceso` |
| `aprobado_en` · `aprobado_por` | timestamptz · uuid | sí | CHECK: llenos en `listo` |
| `piezas_aprobadas` · `piezas_merma` | integer | sí | Al aprobar: todas las del rechazo y 0. Juntas suman las del rechazo |

Lleva las columnas comunes. **Índices:** único (`folio`) · (`lote_id`, `estado`). Con ella dejan su `@llavePendiente` `traspasos.reproceso_id` y `recepciones.reproceso_id`.

## La tabla `defectos`

| Columna | Tipo | Nulo | Qué es |
|---|---|---|---|
| `id` | uuid | no | Llave |
| `nombre` | text | no | De 4 a 60 letras. Único sin importar mayúsculas |
| `baja_en` · `baja_por` · `motivo_baja` · `reactivado_en` | | sí | |

Lleva las columnas comunes y, con el POS, `xid_escritura`: baja a la caja para las devoluciones con defecto. **Índice:** único (`lower(nombre)`). No tiene siembra: los datos de la muestra traen sus defectos. Con ella dejan su `@llavePendiente` `recepcion_lineas.defecto_id` y `traspaso_lineas.defecto_id`.

## La tabla `defecto_operaciones`

| Columna | Tipo | Nulo | Qué es |
|---|---|---|---|
| `id` | uuid | no | Llave |
| `defecto_id` | uuid | no | → `defectos.id` |
| `operacion_id` | uuid | no | → `operaciones.id` |
| `baja_en` · `baja_por` · `motivo_baja` | | sí | |

Lleva las columnas comunes. **Índice:** único (`defecto_id`, `operacion_id`) donde no tiene baja.

## Acciones

Todas son de la web, con el departamento Calidad.

### `calidad.revisar_lote`

| | |
|---|---|
| **Pantalla** | Calidad · Por revisar · Revisión de un lote · «Aprobar {n}» o «Aprobar {n} y regresar {m}» |
| **Recibe** | `lote_id` · `version` del lote · `rechazos`, opcional: por renglón, `defecto_id`, `flujo_operacion_id`, `persona_id`, `variante_id` y `piezas` (≥ 1) |
| **Reglas y errores** | `400`: un renglón repetido (mismo defecto, operación y talla) · una talla que no es del lote<br>`422 lote_no_terminado`: «{lote} no está terminado: todavía no se revisa.»<br>`422 operacion_fuera_del_flujo`: «Esa operación no es del flujo de {prenda}.»<br>`422 defecto_de_baja`: «Ese defecto ya no está en el catálogo.»<br>`422 rechazos_mas_que_listas`: «En la talla {t} hay {n} piezas listas: no se pueden rechazar más.»<br>Aviso que no detiene, si la persona de la cuenta tiene registros vigentes en el lote: «Cosiste en este lote: la revisión queda marcada» |
| **Escribe** | La revisión, sus tallas (revisadas = terminadas; aprobadas = revisadas − rechazos), sus rechazos y un reproceso por rechazo |
| **Llama** | `produccion.marcar_lote_revisado` |
| **Regresa** | La revisión y sus reprocesos. «{lote}: {n} aprobadas pasan a aduana, {m} regresan al taller» (sin la segunda parte si no hubo rechazos) |
| **Eventos** | `lote.revisado`: Aduana lo ve en Recepción «Del taller»; Producción; el hilo del pedido · `reproceso.creado` |
| **Bitácora** | «Revisó {lote}: {n} aprobadas, {m} a reproceso» y, si aplica, «· revisó quien cosió en el lote», con las aprobadas por talla y los rechazos en `despues` |

### `calidad.aprobar_reproceso`

| | |
|---|---|
| **Pantalla** | Calidad · Pendientes («Reproceso») y Por revisar · Reproceso en el taller · «Aprobar» |
| **Recibe** | `reproceso_id` · `version` |
| **Reglas y errores** | `422 reproceso_ya_listo`: «Ese reproceso ya está aprobado.»<br>`422 lote_no_recibido`: «Aduana todavía no recibe {lote}: el reproceso se aprueba después.» |
| **Escribe** | El reproceso, `listo`, con quién y cuándo, todas sus piezas aprobadas y 0 de merma. Nada se mueve: Aduana lo ve por recibir y lo cuenta a ciegas (ver [recepción del taller](../inventario/recepcion-del-taller.md)) |
| **Regresa** | «{n} pieza(s) de {lote} aprobadas: pasan a aduana para {pedido}» (sin «para…» si no es de un pedido) |
| **Eventos** | `reproceso.aprobado`: Aduana · Recepción y el hilo del pedido |
| **Bitácora** | «Aprobó el reproceso {folio}: {n} piezas» |

### `calidad.agregar_defecto`

| | |
|---|---|
| **Pantalla** | Calidad · Defectos · «Agregar defecto» → ventana Defecto nuevo · «Agregar al catálogo» |
| **Recibe** | `nombre` (hasta 60) · `operacion_ids`: al menos una |
| **Reglas y errores** | `400`: «Escribe el defecto.» (menos de 4 letras) · «Marca al menos una operación.»<br>`422 defecto_repetido`: «Ese defecto ya está en el catálogo.»<br>`422 operacion_de_baja`: «Esa operación ya no está en el catálogo.» |
| **Escribe** | El defecto y sus operaciones |
| **Regresa** | «{defecto} agregado: ya se puede escoger al revisar» |
| **Eventos** | `defecto.creado` |
| **Bitácora** | «Agregó el defecto {nombre}: {operaciones}» |

## Lecturas

### `calidad.aprobadas_del_lote(lote)`

| | |
|---|---|
| **La usa** | Inventario, al recibir el lote en aduana a ciegas (ver [recepción del taller](../inventario/recepcion-del-taller.md)) |
| **Regresa** | Su revisión y, por talla, las aprobadas congeladas en ella; y sus reprocesos, con su talla, su estado y sus piezas |

### `calidad.reproceso_para_aduana(reproceso)`

Se construye en la [fase 14](../../fases/14-inventario-recepcion-del-taller-conteos-ajustes-y-reabasto.md), con la recepción del taller.

| | |
|---|---|
| **La usa** | Inventario, al recibir el reproceso en aduana a ciegas (ver [recepción del taller](../inventario/recepcion-del-taller.md)) |
| **Regresa** | Su folio, su lote, su talla, su estado y sus piezas aprobadas |

### `calidad.en_reproceso_de_pedido(pedido)`

| | |
|---|---|
| **La usa** | Producción, para lo que el pedido tiene en producción (ver [lotes](../produccion/lotes.md#reglas)) |
| **Regresa** | Por talla, las piezas en reproceso de los lotes de ese pedido |

## Parámetros

Los cambia solo la dueña, en Configuración (ver [configuración](../admin/configuracion.md)). Todos van en «Parámetros».

| Parámetro | Valor inicial | Para qué |
|---|---|---|
| `calidad.por_revisar_hoy_dias` | 1 día | Un lote que se entrega en estos días o menos es «Por revisar hoy» |
| `calidad.defectos_periodo_dias` | 30 días | El periodo de la tasa de defectos |
| `calidad.defectos_tasa_roja_porcentaje` | 2 % | Arriba de esto, la tasa sale en rojo |

## Permisos

- Revisar, aprobar reprocesos y agregar defectos: Calidad. La revisión guarda la cuenta que revisó.
- Calidad no ve tarifas ni costos.

## Eventos

`lote.revisado` · `reproceso.creado` · `reproceso.aprobado` · `defecto.creado`.

## Lo que llega después

- **Fase 14:** Aduana recibe el lote revisado y su reproceso, contados a ciegas contra las aprobadas, con `calidad.reproceso_para_aduana` (ver [recepción del taller](../inventario/recepcion-del-taller.md)).
- **Fase 16:** el pedido muestra sus piezas «En reproceso».
- **Con el POS:** los defectos bajan a la caja para las devoluciones de tienda.

## Cómo está hecho

**Fase 13, parte 1.**

- **Las tablas** `defectos`, `defecto_operaciones`, `revisiones`, `revision_tallas`, `rechazos` y `reprocesos` son de `calidad` (`apps/api/src/modulos/calidad/tablas.ts`, migración `0042`), con sus CHECK y sus únicos; la revisión, sus tallas y sus rechazos solo crecen. Con ellas son llaves `traspasos.reproceso_id`, `recepciones.reproceso_id`, `recepciones.revision_id`, `recepcion_lineas.defecto_id` y `traspaso_lineas.defecto_id`.
- **Las acciones** están en `acciones/revision.ts`, con sus contratos en `packages/compartido/src/contratos/calidad/revision.ts`:
  - `revisar_lote` lee el lote y lo bloquea con su versión sin escribirlo (`revisarVersion`): un registro de la tablet que llegó mientras se revisaba da `409` (regla 10). El cambio a revisado lo hace `produccion.marcar_lote_revisado`, que sí escribe el lote (decisión 622). Revisa los rechazos (repetidos, tallas, operaciones del flujo, defectos vigentes, personas que existen y las listas de cada talla), escribe la revisión, sus tallas, sus rechazos y un reproceso por rechazo con folio `{lote}-R{n}`, y marca quién cosió con los registros vigentes de la persona de la cuenta.
  - `aprobar_reproceso` toma la versión del reproceso y lo aprueba completo solo con el lote en aduana. El «para {pedido}» del mensaje llega con los pedidos (fase 16, decisión 623).
  - `agregar_defecto` revisa el nombre sin mayúsculas y que las operaciones estén vigentes.
- **Las lecturas** (`lecturas/revision.ts`): `aprobadas_del_lote` y `en_reproceso_de_pedido`, que regresa las piezas por lote y talla; `produccion.piezas_en_produccion` suma solo las de los lotes que ya llegaron a aduana, porque antes lo rechazado sigue contado en su lote (decisión 621).
- **Los parámetros** (`parametros.ts`): `calidad.por_revisar_hoy_dias`, `calidad.defectos_periodo_dias` y `calidad.defectos_tasa_roja_porcentaje`; los usan las pantallas y la tasa de defectos (fase 19).
- **Pruebas:** `acciones/revisar-lote.prueba.ts` (las aprobadas y el reproceso, lo que no deja revisar, el `409`, quien cosió, aprobar el reproceso con el pedido en producción, el catálogo de defectos) y `produccion/lecturas/persona-que-la-hizo.prueba.ts`. Las pruebas usan la cuenta de prueba `calidad`.

**Fase 14, parte 2.** `calidad.reproceso_para_aduana` (`lecturas/revision.ts`) regresa el folio, el lote, la talla, el estado y las piezas aprobadas de un reproceso; Aduana lo cuenta a ciegas contra ellas. Lo prueba `modulos/inventario/acciones/recibir-del-taller.prueba.ts`.
