# Tarifas

> **Qué cubre:** la tarifa por pieza de cada operación de un flujo, con su historia: quién la pone (Personal, con el permiso de sueldos), desde cuándo vale, la operación sin tarifa y cómo se congela en cada registro de la tablet.
> **Estado:** Decidido.
> **Se construye en:** [fase 7 ●](../../fases/07-autorizaciones-y-personal.md).
> **Se conecta con:** [personas](personas.md) · [operaciones y flujos](../produccion/operaciones-y-flujos.md) · [registros de operación](../produccion/registros-de-operacion.md) · [nómina](../contaduria/nomina.md) · [pantallas de Personal](../../interfaz/fabrica/personal.md) · [corte y bultos](../produccion/corte-y-bultos.md) · [lotes](../produccion/lotes.md) · [pantallas de Producción](../../interfaz/fabrica/produccion.md) · [la tablet del taller](../../apps/tablet.md) · [pantallas de la tablet](../../interfaz/tablet.md)

## Para qué sirve

Quien cobra por pieza cobra por cada operación que hace, a la tarifa de esa operación en su flujo. Personal pone la tarifa; Producción solo ve las operaciones, sin tarifa. Ejemplo: en el flujo de la playera polo, «Hombros» vale $1 por pieza; si Personal la sube a $1.20, vale desde ese momento: lo que ya se registró se queda a $1.

## Reglas

1. **La tarifa la pone Personal, con «ven sueldos y tarifas».** Producción ve las operaciones sin tarifa.
2. **Una sola vigente por operación del flujo,** con su historia: cambiarla cierra la anterior y abre la nueva.
3. **Vale para lo que se registre desde ese momento.** Cada registro de la tablet congela la tarifa que tenía al pasar (ver [registros de operación](../produccion/registros-de-operacion.md)).
4. **Una operación sin tarifa** («Sin tarifa») registra sus piezas sin tarifa, y esas piezas no se pagan. Cuando Personal le pone su primera tarifa, los registros vigentes de esa operación que no tenían la toman; los de semanas ya pagadas entran en la siguiente nómina.
5. **Una tarifa no puede ser cero.**
6. **Un flujo nuevo que parte de otro copia sus tarifas;** una operación del origen sin tarifa queda «Sin tarifa».

## La tabla `tarifas_operacion`

| Columna | Tipo | Nulo | Qué es |
|---|---|---|---|
| `id` | uuid | no | Llave |
| `flujo_operacion_id` | uuid | no | → `flujo_operaciones.id`: la operación dentro de su flujo («Tarifa de {operación} en {flujo}») |
| `tarifa_centavos` | bigint | no | CHECK > 0. Pesos por pieza en centavos ($1.50 = 150) |
| `vigente_desde` | timestamptz | no | default `now()` |
| `vigente_hasta` | timestamptz | sí | Se llena cuando otra la reemplaza. Vacía es la vigente |

- Lleva las columnas comunes y, como baja a la tablet, `xid_escritura`.
- **Único:** una vigente por `flujo_operacion_id` (donde `vigente_hasta` es nulo).
- `flujo_operacion_id` lleva su `@llavePendiente` hasta la fase 12.

## Acciones

### `personal.poner_tarifa_operacion`

| | |
|---|---|
| **Pantalla** | Personal · Tarifas · casilla «Tarifa por pieza»; Pendientes de Personal · «Tarifa · Sin tarifa» · «Poner tarifa» |
| **Quién** | Personal · «ven sueldos y tarifas» |
| **Recibe** | `flujo_operacion_id` · uuid · obligatorio<br>`tarifa_centavos` · mayor que 0 · obligatorio<br>`version`: la de la tarifa vigente; vacía si no tenía |
| **Reglas y errores** | `400`: «Escribe la tarifa en pesos, por ejemplo 1.50» (cero o texto)<br>`422 operacion_de_baja`: «Esa operación ya no está en el flujo»<br>La misma tarifa: no escribe nada |
| **Escribe** | Cierra la vigente y crea la nueva |
| **Llama** | Si la operación no tenía tarifa: `produccion.poner_tarifa_a_registros`, que la escribe en los registros vigentes de esa operación que no la tenían |
| **Regresa** | «{operación}: ${tarifa} por pieza desde ahora». Aviso que no bloquea: «{n} registros sin tarifa ya la tomaron» («1 registro sin tarifa ya la tomó» si es uno), más «. Los de semanas pagadas entran en la siguiente nómina» si aplica |
| **Eventos** | `tarifa.puesta`: «hay cambios» para Producción y, si la tablet muestra la tarifa, para la tablet |
| **Bitácora** | «Tarifa de «{operación}» en {flujo}: {antes} → {después}», marcada como sueldo |

## Acciones internas

### `personal.copiar_tarifas_flujo`

| | |
|---|---|
| **La llama** | `produccion.crear_flujo`, cuando el flujo nuevo parte de otro |
| **Recibe** | El flujo de origen, el nuevo, y por operación la de origen y la nueva · quién |
| **Reglas** | No rechaza. No pide «ven sueldos y tarifas» a quien crea el flujo, porque la tarifa no viaja a su pantalla |
| **Escribe** | Una tarifa por operación nueva, con la vigente de su operación de origen, desde ahora |
| **Regresa** | Cuántas copió, sin montos |
| **Eventos** | Un `tarifa.puesta` con el flujo |
| **Bitácora** | «Copió {n} tarifas de {origen} a {flujo}», marcada como sueldo |

## Lecturas

### `personal.tarifa_vigente`

| | |
|---|---|
| **La usa** | Producción, al recibir un registro de la tablet |
| **Regresa** | La tarifa vigente de esa operación del flujo en el momento en que pasó el registro, o vacío |

## Lo que baja a la tablet

| Tabla | Filtro | Columnas |
|---|---|---|
| `tarifas_operacion` | Solo si `produccion.tarifa_visible_tablet` dice que se muestra; las vigentes de los flujos que bajan | `id`, `flujo_operacion_id`, `tarifa_centavos`, `vigente_desde` |

Si la dueña cambia ese parámetro, la tablet pide su foto completa (ver [sincronización](../../cimientos/SINCRONIZACION.md#filtros-que-cambian-sin-tocar-el-renglón)).

## Permisos

- Ver y poner tarifas: Personal con «ven sueldos y tarifas».
- Sin el permiso, la tarifa no viaja a ninguna pantalla.

## Eventos

`tarifa.puesta`.

## Lo que llega después

- **Fase 12:** la liga a `flujo_operaciones` (quita su `@llavePendiente`) y la regla `operacion_de_baja`; las llamadas con Producción: `produccion.poner_tarifa_a_registros` y `personal.copiar_tarifas_flujo` desde `produccion.crear_flujo`; la lectura `personal.tarifa_vigente` al registrar en la tablet.

## Cómo está hecho

**Fase 7, parte 5.**

- **La tabla** `tarifas_operacion` es de `personal` (migración `0019_asistencia_y_tarifas.sql`), con `tarifa_centavos > 0` (y a lo más 99,999,999 en su contrato), el periodo con `vigente_hasta >= vigente_desde` (migración `0020`), una vigente por operación (único parcial donde `vigente_hasta` es nulo), su `xid_escritura` y la `@llavePendiente` hacia `flujo_operaciones`. `tarifa_centavos` es un campo de sueldo (`camposDeSueldo`): sin el permiso no viaja y su renglón de bitácora queda sensible. Lo que baja a la tablet llega con Producción (fase 12).
- **`personal.poner_tarifa_operacion`** (`acciones/poner-tarifa-operacion.ts`, contrato en `packages/compartido/src/contratos/personal/tarifas.ts`): pide «ven sueldos y tarifas» en su contrato; un candado por operación; la versión de la vigente va en `datos` (la primera no la tiene); cierra la vigente y abre la nueva; la misma tarifa solo revisa la versión (`revisarVersion`) y no escribe nada. La bitácora va como plantilla con las tarifas como sueldo. Mientras no haya flujos, el mensaje dice «La operación: {tarifa} por pieza desde ahora» (decisión 434).
- **`personal.copiar_tarifas_flujo`** (`internas/tarifas.ts`): copia la vigente de cada operación de origen a su operación nueva, deja «Sin tarifa» las que no tenían y regresa cuántas, sin montos.
- **`personal.tarifa_vigente`** (`lecturas/tarifa-vigente.ts`): la de ese momento (la más reciente que empezó antes), o `null`.
- **Las pruebas:** `modulos/personal/acciones/poner-tarifa-operacion.prueba.ts` (la nueva cierra la vigente, la misma no escribe ni cambia la versión, el `409`, la bitácora sensible; cero y texto no; sin el permiso; la vigente de un momento; copiar un flujo y su bitácora sensible; tres primeras tarifas a la vez).

**Fase 12, parte 1.** `tarifas_operacion.flujo_operacion_id` ya es llave. `personal.poner_tarifa_operacion` lee la operación de su flujo con `FOR SHARE` (decisión 594): si ya no está en el flujo, `422 operacion_de_baja`; su mensaje dice el nombre de la operación y su bitácora, también el del flujo. Lo prueba `poner-tarifa-operacion.prueba.ts`, con flujos de prueba de verdad.

**Fase 12.** Lo que baja a la tablet está en `bajada.ts`: las tarifas vigentes de las operaciones vigentes de los flujos vigentes, solo con `produccion.tarifa_visible_tablet` encendido; el parámetro está en la lista de la tabla, así que cambiarlo pide la foto a las tablets (decisión 619). Lo prueba `produccion/bajada.prueba.ts`. El aviso de `poner_tarifa_operacion` dice «1 registro sin tarifa ya la tomó» cuando es uno.
