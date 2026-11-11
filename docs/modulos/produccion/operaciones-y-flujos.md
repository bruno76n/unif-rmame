# Operaciones y flujos

> **Qué cubre:** las operaciones del taller y el flujo de cada prenda: en qué orden pasan las piezas y quién hace cada operación de base; crear un flujo, agregar y quitar operaciones, y el candado que no deja cambiar un flujo con lotes en proceso.
> **Estado:** Decidido.
> **Se construye en:** [fase 12](../../fases/12-produccion.md).
> **Se conecta con:** [lotes](lotes.md) · [registros de operación](registros-de-operacion.md) · [corte y bultos](corte-y-bultos.md) · [tarifas](../personal/tarifas.md) · [personas](../personal/personas.md) · [productos](../catalogo/productos.md) · [tallas y tipos de prenda](../catalogo/tallas-y-tipos-de-prenda.md) · [revisión de lotes](../calidad/revision-de-lotes.md) · [máquinas, fallas y servicios](../mantenimiento/maquinas-fallas-y-servicios.md) · [pantallas de Producción](../../interfaz/fabrica/produccion.md) · [pantallas de Calidad](../../interfaz/fabrica/calidad.md) · [pantallas de Catálogo](../../interfaz/fabrica/catalogo.md) · [pantallas de Personal](../../interfaz/fabrica/personal.md) · [la tablet del taller](../../apps/tablet.md) · [pantallas de la tablet](../../interfaz/tablet.md)

## Para qué sirve

El flujo dice por qué operaciones pasa una prenda, en qué orden y quién hace cada una de base. Con él la tablet sabe qué bultos mostrarle a cada persona, el avance del lote sabe qué operación sigue y Personal pone una tarifa por operación de cada flujo. Ejemplo de la muestra: hay siete flujos de inicio, uno por tipo de prenda (Playera polo, Camisa y bata, Suéter y chaleco, Sudadera y chamarra, Pants y short, Falda, jumper y mandil, y Pantalón). Todos empiezan con el corte. Si mañana hace falta otro para una chamarra con forro, Producción lo hace a partir del de «Sudadera y chamarra» y le agrega «Pegar forro» antes de «Planchado»; Personal ve la operación nueva «Sin tarifa».

## Reglas

1. **Las operaciones son un catálogo** que comparten los flujos (Corte, Costados, Hombros, Planchado, Empaque…). Su nombre es único sin importar mayúsculas: una operación nueva con un nombre que ya existe usa la misma. A ellas apuntan los defectos de Calidad.
2. **El corte va primero en todo flujo** y nunca se quita. Hay una sola operación de corte; sus registros no los hace la tablet: nacen al cerrar el corte (ver [corte y bultos](corte-y-bultos.md)).
3. **Un flujo lleva al menos el corte y otra operación,** en orden, cada una con quien la hace de base: una persona activa del Taller. La tarifa no va en el flujo: la pone Personal por cada operación de cada flujo (ver [tarifas](../personal/tarifas.md)).
4. **Cada prenda tiene su flujo:** el que escoge el producto o, si no escoge, el de su producto base o el de su tipo de prenda (ver [productos](../catalogo/productos.md)). Una prenda sin flujo no pasa por el taller. El lote congela el flujo al cerrar su corte: cambiar el flujo de un producto no toca los lotes ya cortados.
5. **El candado del flujo:** no se agrega ni se quita una operación de un flujo que tienen lotes en proceso o terminados sin revisar (cancelar un registro puede reabrir un lote terminado): «{n} lotes en proceso usan este flujo: cámbialo cuando terminen o haz un flujo nuevo».
6. **Un flujo nuevo** parte de otro, y copia sus operaciones vigentes con su orden y su persona (Personal copia sus tarifas en la misma transacción), o es de «Una sola operación»: el corte y las de `produccion.flujo_una_sola_operacion` («Confección completa · Empaque»), con quien corta y quien hace las demás.
7. **Una operación nueva** entra antes de la que se escoja («Va antes de»; la pantalla propone `produccion.operacion_antes_por_omision`, «Planchado», o la última) y las siguientes recorren su orden. Nace sin tarifa.
8. **Quitar no borra:** la operación del flujo queda dada de baja y los registros viejos siguen apuntando a ella; las siguientes recorren su orden. Su tarifa se queda en Personal y deja de contar como pendiente.
9. **El flujo es un agregado:** cambiar sus operaciones sube su `version` (ver [idempotencia y concurrencia](../../cimientos/IDEMPOTENCIA-Y-CONCURRENCIA.md#que-nadie-pise-a-nadie)).

## La tabla `operaciones`

| Columna | Tipo | Nulo | Qué es |
|---|---|---|---|
| `id` | uuid | no | Llave (v7) |
| `nombre` | text | no | Hasta 40. Único sin importar mayúsculas |
| `es_corte` | boolean | no | default false. Solo una puede ser el corte (índice único parcial) |
| `baja_en` · `baja_por` · `motivo_baja` · `reactivado_en` | | sí | |

Lleva las columnas comunes y, como baja a la tablet, `xid_escritura` (ver [base de datos](../../cimientos/BASE-DE-DATOS.md#columnas-comunes)). **Índices:** único (`lower(nombre)`) · único (`es_corte`) donde es verdadero. **La siembra:** la operación «Corte», con `es_corte`; existe en toda base.

## La tabla `flujos`

| Columna | Tipo | Nulo | Qué es |
|---|---|---|---|
| `id` | uuid | no | Llave (v7) |
| `nombre` | text | no | Hasta 60. Único sin importar mayúsculas |
| `copiado_de_flujo_id` | uuid | sí | → `flujos.id`: del que se copió con «Parte de». Vacío si es de «Una sola operación» |
| `baja_en` · `baja_por` · `motivo_baja` · `reactivado_en` | | sí | |

Lleva las columnas comunes y `xid_escritura`. **Índice:** único (`lower(nombre)`). No tiene siembra: los crea Producción, y los datos de la muestra traen sus siete. Con ella dejan su `@llavePendiente` `productos.flujo_id` y `tipos_prenda.flujo_defecto_id`.

## La tabla `flujo_operaciones`

Cada operación de un flujo: su orden y quién la hace de base.

| Columna | Tipo | Nulo | Qué es |
|---|---|---|---|
| `id` | uuid | no | Llave (v7) |
| `flujo_id` | uuid | no | → `flujos.id` |
| `operacion_id` | uuid | no | → `operaciones.id` |
| `orden` | smallint | no | 1 es el corte |
| `persona_base_id` | uuid | no | → `personas.id`: «La hace» |
| `baja_en` · `baja_por` · `motivo_baja` | | sí | «Quitada del flujo» |

Lleva las columnas comunes y `xid_escritura`. **Índices:** únicos (`flujo_id`, `operacion_id`) y (`flujo_id`, `orden`) donde no tiene baja, el del orden revisado al final de la transacción · (`persona_base_id`). Con ella deja su `@llavePendiente` `tarifas_operacion.flujo_operacion_id`.

## Acciones

Todas son de la web, con el departamento Producción.

### `produccion.crear_flujo`

| | |
|---|---|
| **Pantalla** | Producción · Operaciones · «Nuevo flujo» → ventana Flujo nuevo · «Crear flujo» |
| **Recibe** | `nombre` · texto · hasta 60 · obligatorio<br>`parte_de` · `flujo` o `una_sola_operacion` · obligatorio<br>`flujo_origen_id`, si parte de un flujo<br>`persona_corte_id` y `persona_base_id`, si es de una sola operación: «¿Quién corta?» y «¿Quién la hace?» |
| **Reglas y errores** | `400`: «Escribe el nombre del flujo.» · «Escoge de cuál parte.» · «¿Quién la hace?»<br>`422 flujo_repetido`: «Ya hay un flujo con ese nombre.»<br>`422 flujo_origen_de_baja`: «Ese flujo está dado de baja.»<br>`422 persona_no_valida`: «¿Quién la hace?» (no es del Taller o está dada de baja) |
| **Escribe** | El flujo y sus operaciones: las del origen, con su orden y su persona; o el corte (con quien corta) y las de `produccion.flujo_una_sola_operacion` en ese orden (con la otra persona). Una operación que no existe se crea con ese nombre |
| **Llama** | `personal.copiar_tarifas_flujo`, si parte de otro flujo |
| **Regresa** | `flujo_id` y sus operaciones. «Flujo «{nombre}» creado con {n} operaciones. Se escoge al dar de alta un producto» |
| **Eventos** | `flujo.creado` |
| **Bitácora** | «Creó el flujo {nombre} a partir de {origen o una sola operación}», con las operaciones, su orden y sus personas en `despues`. Las tarifas copiadas no van aquí |

### `produccion.agregar_operacion_flujo`

| | |
|---|---|
| **Pantalla** | Producción · Operaciones · «Agregar operación» → ventana Operación nueva · «Agregar operación» |
| **Recibe** | `flujo_id` · `version` del flujo · `operacion` (texto, hasta 40) · `persona_base_id` · `va_antes_de_id` (una operación del flujo) |
| **Reglas y errores** | `422 flujo_con_lotes`: el candado del flujo (regla 5)<br>`400`: «Escribe la operación.» · «¿Quién la hace?»<br>`422 operacion_ya_en_flujo`: «Ya está en este flujo.»<br>`422 corte_va_primero`: «El corte siempre va primero» (va antes del corte)<br>`422 persona_no_valida`: «¿Quién la hace?» |
| **Escribe** | La operación del catálogo, si no existía. La operación del flujo con el orden de la que va después, y las siguientes recorren uno |
| **Regresa** | «{operación} agregada a {flujo}. La tarifa la pone Personal» |
| **Eventos** | `flujo.cambiado`: el pendiente «Sin tarifa» de Personal y la tablet |
| **Bitácora** | «Agregó {operación} a {flujo}, antes de {operación}», con la lista de operaciones y su orden en `antes` y `despues` |

### `produccion.quitar_operacion_flujo`

| | |
|---|---|
| **Pantalla** | Producción · Operaciones · × de una operación |
| **Recibe** | `flujo_operacion_id` · `version` del flujo |
| **Reglas y errores** | `422 flujo_con_lotes`: el candado del flujo<br>`422 corte_va_primero`: «El corte siempre va primero»<br>`422 flujo_minimo`: «Un flujo lleva al menos el corte y una operación» |
| **Escribe** | La baja de la operación del flujo, «Quitada del flujo»; las siguientes bajan uno su orden |
| **Regresa** | «{operación} quitada de {flujo}» |
| **Eventos** | `flujo.cambiado` |
| **Bitácora** | «Quitó {operación} de {flujo}», con la lista de operaciones y su orden en `antes` y `despues` |

## Lecturas

### `produccion.flujo_vigente(flujo)`

| | |
|---|---|
| **La usa** | Catálogo, al dar de alta un producto, cambiar su flujo o guardar el flujo de un tipo de prenda |
| **Regresa** | Si el flujo existe y no está dado de baja |

## Lo que baja a la tablet

| Tabla | Filtro | Columnas |
|---|---|---|
| `flujos` · `flujo_operaciones` · `operaciones` | Los vigentes. Lo que se da de baja baja como `quitar` | `id`, `nombre`; `flujo_id`, `operacion_id`, `orden`, `persona_base_id`; `es_corte` |

Con ellos la tablet arma «Sus operaciones» de quien todavía no registra nada. Nunca baja una tarifa con el flujo: la tarifa baja aparte, si la dueña lo decide (ver [tarifas](../personal/tarifas.md#lo-que-baja-a-la-tablet)).

## Parámetros

Los cambia solo la dueña, en Configuración (ver [configuración](../admin/configuracion.md)). Todos van en «Parámetros».

| Parámetro | Valor inicial | Para qué |
|---|---|---|
| `produccion.flujo_una_sola_operacion` | Confección completa · Empaque | Las operaciones después del corte de un flujo de «Una sola operación», en ese orden |
| `produccion.operacion_antes_por_omision` | Planchado | La que propone «Va antes de» en una operación nueva |

## Permisos

- Crear flujos y cambiar sus operaciones: Producción.
- Producción no ve tarifas: las pone Personal, con «ven sueldos y tarifas».

## Eventos

`flujo.creado` · `flujo.cambiado`.

## Lo que llega después

- **Fase 13:** los defectos de Calidad apuntan a las operaciones, y el atorado por máquina cruza la persona de base de cada operación con la máquina que trae (ver [máquinas, fallas y servicios](../mantenimiento/maquinas-fallas-y-servicios.md)).

## Cómo está hecho

**Fase 12, parte 1.**

- **Las tablas** `operaciones`, `flujos` y `flujo_operaciones` son de `produccion` (`apps/api/src/modulos/produccion/tablas.ts`, migración `0038`), con sus CHECK, sus únicos y `xid_escritura`. El único del orden de las operaciones vigentes de un flujo es una exclusión diferida (`flujo_operaciones_un_orden`), revisada al final de la transacción (decisión 593). Con ellas, `productos.flujo_id`, `tipos_prenda.flujo_defecto_id` y `tarifas_operacion.flujo_operacion_id` ya son llaves. La siembra (`siembra.ts`) agrega la operación «Corte»; los parámetros están en `parametros.ts`, con las operaciones de «Una sola operación» separadas por coma (decisión 590).
- **Las acciones** están en `acciones/flujos.ts`, con sus contratos en `packages/compartido/src/contratos/produccion/flujos.ts`; lo común, en `dominio/flujos.ts`:
  - `crear_flujo` copia del origen (con `FOR SHARE`) sus operaciones vigentes con su orden y su persona y llama `personal.copiar_tarifas_flujo`; o arma el corte y las del parámetro. Una operación que no existe nace con ese nombre (`operacionPorNombre`, sin importar mayúsculas). Quien hace cada una es una persona activa del Taller (`persona_no_valida`).
  - `agregar_operacion_flujo` y `quitar_operacion_flujo` toman la versión del flujo; las siguientes recorren su orden. Si la operación que se escoge en «Va antes de» no es del flujo, `400` «Escoge antes de cuál va.»; la que propone `produccion.operacion_antes_por_omision` la lee la pantalla (fase 19, decisión 595).
  - El candado de los lotes (`flujo_con_lotes`) cuenta los lotes en proceso o terminados sin revisar con ese flujo (decisión 591); `cerrar_corte` lee el flujo con `FOR SHARE` al congelarlo, así que un cambio y un corte del mismo flujo van uno tras otro.
- **La lectura** `produccion.flujo_vigente` (`lecturas/flujos.ts`) regresa si está vigente y su nombre, con `FOR SHARE`.
- **Lo que baja a la tablet** (`bajada.ts`): las tres tablas, lo vigente; lo que se da de baja baja como `quitar`.
- **Pruebas:** `acciones/crear-flujo.prueba.ts`, `acciones/cambiar-operaciones-flujo.prueba.ts` (agregar, quitar, el corte, el mínimo, el `409` y dos cambios a la vez) y `bajada.prueba.ts`; las ayudas están en `nucleo/pruebas/produccion-de-prueba.ts`.
