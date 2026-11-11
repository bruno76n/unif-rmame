# Registros de operación

> **Qué cubre:** lo que sube la tablet del taller: las piezas buenas y dañadas de una operación en un bulto, con su tarifa congelada; cancelar un registro; la tarifa que llega después; los consumibles que se toman; y el aviso de un PIN bloqueado.
> **Estado:** Decidido.
> **Se construye en:** [fase 12](../../fases/12-produccion.md).
> **Se conecta con:** [lotes](lotes.md) · [corte y bultos](corte-y-bultos.md) · [operaciones y flujos](operaciones-y-flujos.md) · [tarifas](../personal/tarifas.md) · [PIN del taller](../personal/pin-del-taller.md) · [personas](../personal/personas.md) · [material en bodega](../inventario/material-en-bodega.md) · [diferencias, ajustes y mermas](../inventario/diferencias-ajustes-y-mermas.md) · [excepciones](../inventario/excepciones.md) · [nómina](../contaduria/nomina.md) · [sincronización](../../cimientos/SINCRONIZACION.md) · [la tablet](../../apps/tablet.md) · [pantallas de Producción](../../interfaz/fabrica/produccion.md) · [paquete compartido](../../cimientos/PAQUETE-COMPARTIDO.md) · [reclamos y devoluciones](../calidad/reclamos-y-devoluciones.md) · [revisión de lotes](../calidad/revision-de-lotes.md) · [pantallas de Calidad](../../interfaz/fabrica/calidad.md) · [pantallas de la tablet](../../interfaz/tablet.md)

## Para qué sirve

Cada persona del taller registra en la tablet lo que hizo: entra con su nombre y su PIN, escanea o escoge el bulto, escoge su operación y escribe cuántas piezas buenas y cuántas dañadas. De ahí salen el avance de cada lote, la producción de cada persona y la nómina por pieza. Ejemplo: Ana registra 24 buenas de «Costados» en el bulto B-2026-121-03, sin internet. La tablet lo guarda en su cola, baja el tope de ese bulto y suma a «Hoy llevas»; al volver el internet sube y el servidor lo aplica con la hora en que lo hizo y con la tarifa que valía en ese momento.

## Reglas

1. **Lo que ya se hizo no se rechaza.** Un registro mal formado se aparta (no se aplica); uno que pasa del tope o llega cuando el lote ya no está en proceso se aplica igual y abre su excepción, porque la pieza ya se hizo (ver [sincronización](../../cimientos/SINCRONIZACION.md)).
2. **Mal formado, se aparta:** el bulto no existe; la operación no es del flujo del lote; es la operación de corte (sus registros nacen al cerrar el corte); buenas + dañadas es 0; un número es negativo; la persona no existe o no es del Taller.
3. **El tope se revisa en el servidor:** buenas + dañadas no deberían pasar de lo que la operación anterior hizo en ese bulto (o de las piezas del bulto, en la primera después del corte), menos lo que esta operación ya registró ahí, contando lo aplicado antes en la misma tanda. Si pasan, la excepción `pasa_tope_bulto`. Si el lote ya está revisado o en aduana, la excepción `lote_no_en_proceso`. Las dos las ve Producción en su bandeja (ver [excepciones](../inventario/excepciones.md)).
4. **La tarifa se congela al llegar:** la vigente de esa operación de ese flujo a la hora en que se hizo, con la fila de tarifa que se tomó. Si todavía no tenía, el registro llega sin tarifa y la toma cuando Personal la pone; si su semana ya se pagó, Contaduría la paga en la siguiente nómina.
5. **Las dañadas** son merma de esa operación: no pasan a la siguiente y salen del inventario del Taller con la persona y la tablet.
6. **El lote avanza con cada registro,** en la misma transacción: suma la merma de la talla del bulto y, si es la última operación del flujo, sus terminadas; si el lote queda completo, pasa a terminado (ver [lotes](lotes.md)).
7. **Cancelar un registro** es del encargado del taller (departamento Producción), con motivo: descuenta sus piezas del lote, del bulto y de la persona, y regresa su merma. No se deja si la operación siguiente ya reportó en ese bulto más de lo que le quedaría a esta, si es un registro del corte, o si el lote ya pasó por Calidad. Un lote terminado regresa a en proceso. Si ya se pagó, Contaduría pone el renglón negativo en la siguiente nómina.
8. **Cuentan solo las buenas de los registros vigentes** para la producción de cada persona y para la nómina por pieza.
9. **Los consumibles** que se toman en la tablet llegan en la unidad de la tablet y se descuentan del inventario, aunque la cantidad pase de `produccion.consumible_max_por_vez` o la existencia quede negativa: ya se tomaron (ver [material en bodega](../inventario/material-en-bodega.md)).
10. **Un PIN bloqueado** en la tablet sube su aviso: Personal deja el PIN bloqueado (ver [PIN del taller](../personal/pin-del-taller.md)).

## Estados del registro

| De | A | Qué pasa | Quién |
|---|---|---|---|
| — | `vigente` | «Registrar {n} pieza(s)» en la tablet, o el cierre del corte | La persona con su PIN; Producción |
| `vigente` | `cancelado` | «Cancelar registro», con motivo | Producción |

## La tabla `registros_operacion`

| Columna | Tipo | Nulo | Qué es |
|---|---|---|---|
| `id` | uuid | no | Llave. La hace la tablet (v7); en el corte, el servidor |
| `origen` | text | no | CHECK (`tablet`, `corte`). default `tablet` |
| `corte_id` | uuid | sí | → `cortes.id`. CHECK: lleno con `corte` |
| `bulto_id` | uuid | no | → `bultos.id` |
| `lote_id` | uuid | no | → `lotes.id`. El del bulto, para consultar por lote |
| `flujo_operacion_id` | uuid | no | → `flujo_operaciones.id`. Del flujo del lote |
| `persona_id` | uuid | no | → `personas.id` |
| `dispositivo_id` | uuid | sí | → `dispositivos.id`. CHECK: lleno con `tablet` |
| `piezas_buenas` · `piezas_danadas` | integer | no | CHECK ≥ 0, y entre las dos más de 0 |
| `tarifa_centavos` | bigint | sí | La tarifa congelada (regla 4). Vacía si todavía no tenía |
| `tarifa_operacion_id` | uuid | sí | → `tarifas_operacion.id`: la fila que se tomó |
| `tarifa_puesta_en` | timestamptz | sí | Cuando tomó la tarifa que Personal puso después |
| `clave_idempotencia` | uuid | no | Única. La de la tablet; en el corte, la derivada |
| `hecho_en` | timestamptz | no | La hora en la tablet. Las barras por hora salen de aquí |
| `fecha` | date | no | El día de negocio de `hecho_en`. La semana de la nómina sale de aquí |
| `recibido_en` | timestamptz | no | default `now()` |
| `sin_internet` | boolean | no | Se capturó sin conexión |
| `excepcion_id` | uuid | sí | → `excepciones.id`, si pasó del tope o el lote ya no estaba en proceso |
| `estado` | text | no | CHECK (`vigente`, `cancelado`). default `vigente` |
| `cancelado_en` · `cancelado_por` · `motivo_cancelacion` | | sí | |

Lleva las columnas comunes y, como baja a la tablet, `xid_escritura` (ver [base de datos](../../cimientos/BASE-DE-DATOS.md#columnas-comunes)). `creado_por` va vacío en lo que hizo la tablet: quién lo hizo está en la persona y la tablet. **Índices:** único (`clave_idempotencia`) · (`lote_id`, `flujo_operacion_id`) donde está vigente · (`bulto_id`, `flujo_operacion_id`) · (`persona_id`, `fecha`) · (`fecha`) · (`flujo_operacion_id`) donde no tiene tarifa y está vigente.

## Acciones

### `produccion.registrar_operacion`

| | |
|---|---|
| **Pantalla** | Puerta del taller · Registrar una operación · «Registrar {n} pieza(s)» |
| **Quién** | La tablet, por su cola (`sync/subir`), con la persona que entró con su PIN |
| **Recibe** | `id` (v7, de la tablet) · `bulto_id` · `flujo_operacion_id` · `piezas_buenas` · `piezas_danadas` · `sin_internet`. Del sobre: la persona, `ocurrido_en` y la clave |
| **Reglas y errores** | `apartado`: lo de la regla 2<br>`excepcion`, y se aplica: `pasa_tope_bulto` o `lote_no_en_proceso` (regla 3) |
| **Escribe** | El registro con el id de la tablet, su lote, su tablet, su persona, `hecho_en` = `ocurrido_en`, su fecha, su excepción si la hubo y su tarifa congelada. La talla del bulto en `lote_tallas`: merma += dañadas y, en la última operación, terminadas += buenas. El lote, a terminado si queda completo |
| **Llama** | `personal.tarifa_vigente` · `inventario.registrar_merma_produccion`, si hay dañadas · `inventario.registrar_excepcion`, si aplica |
| **Regresa** | `registro_id`, el tope al llegar y el estado del lote |
| **Eventos** | `registro_operacion.creado` · `lote.terminado`, si quedó completo: Calidad lo ve por revisar |
| **Bitácora** | «{persona} registró {buenas} buenas y {dañadas} dañadas de {operación} en {bulto}», con origen `tablet`, la persona y la tablet; el registro va en `despues`, sin la tarifa |
| **Sin internet** | Sí: la tablet lo guarda en su cola, lo suma a su copia del bulto y a «Hoy llevas», y lo marca «guardada aquí» hasta que sube (ver [la tablet](../../apps/tablet.md)) |

### `produccion.cancelar_registro`

| | |
|---|---|
| **Pantalla** | Producción · cajón del lote · Registros de la tablet · «Cancelar registro» |
| **Quién** | Producción (el encargado del taller) |
| **Recibe** | `registro_id` · `version` · `motivo` (al menos `general.largo_minimo_motivo`, 5 letras) |
| **Reglas y errores** | `400`: «Escribe el motivo.»<br>`422 registro_ya_cancelado`: «Ese registro ya está cancelado.»<br>`422 registro_de_corte`: «Las piezas del corte no se cancelan: el corte cerrado no se modifica.»<br>`422 lote_ya_revisado`: «{lote} ya pasó por Calidad: este registro ya no se cancela.»<br>`422 operacion_siguiente_ya_reporto`: «La operación siguiente ya reportó {n}: primero se cancela lo de {operación}» |
| **Escribe** | El registro, cancelado, con quién, cuándo y el motivo. La talla del bulto: resta sus dañadas de la merma y, si era la última operación, sus buenas de las terminadas. Un lote terminado regresa a en proceso y pierde `terminado_en` |
| **Llama** | `inventario.revertir_merma_produccion`, si tenía dañadas |
| **Regresa** | «Registro cancelado: {n} piezas menos para {nombre} en la nómina» |
| **Eventos** | `registro_operacion.cancelado` · `lote.reabierto`, si regresó a en proceso. Baja a la tablet |
| **Bitácora** | «Canceló el registro de {persona}: {n} {operación} en {bulto}. Motivo: {motivo}», con el registro vigente (y su tarifa) en `antes` y cancelado en `despues`, marcado como sueldo |

### `produccion.tomar_consumible`

| | |
|---|---|
| **Pantalla** | Puerta del taller · ¿Qué tomas? · «Tomar» |
| **Quién** | La tablet, por su cola, con la persona |
| **Recibe** | `id` (de la tablet) · `renglones`: al menos uno, con `material_id` y `cantidad` (entera ≥ 1, en la unidad de la tablet). Del sobre: la persona y `ocurrido_en` |
| **Reglas y errores** | `apartado`: un material que no existe o no es consumible · una cantidad menor que 1 · un material repetido<br>Se aplica igual si pasa de `produccion.consumible_max_por_vez` o la existencia queda negativa |
| **Escribe** | Nada en las tablas de Producción. Convierte cada cantidad a la unidad de inventario (÷ el factor de la tablet) |
| **Llama** | `compras.datos_materiales` (que sea un consumible y su factor) · `inventario.tomar_consumible` |
| **Regresa** | El movimiento y lo descontado por material. El texto lo pone la tablet: «Tomaste {n} {unidad} y {n} {unidad}. Se descuenta del taller» |
| **Bitácora** | «{persona} tomó {n} {unidad} de {material}…», con origen `tablet` |
| **Sin internet** | Sí: queda en la cola y se aplica con su hora al subir. La tablet no lleva existencia de consumibles |

### `produccion.registrar_bloqueo_pin`

| | |
|---|---|
| **Pantalla** | Puerta del taller · «{nombre}, tu PIN», al llegar a `personal.pin_intentos_bloqueo` equivocados: «Bloqueado: pide al encargado que lo desbloquee en Personal» |
| **Quién** | La tablet, por su cola. La persona del sobre es la bloqueada |
| **Recibe** | `pin_id` (el que bajó) · `intentos` |
| **Reglas y errores** | `apartado`: el PIN no existe o no es de esa persona<br>Si ese PIN ya no está activo (bloqueado, anulado o restablecido después), se aplica sin cambiar nada y el resultado lo dice |
| **Escribe** | Nada en las tablas de Producción |
| **Llama** | `personal.bloquear_pin`, con la hora del aparato y los intentos |
| **Regresa** | El estado del PIN |
| **Bitácora** | Renglón de alerta: «PIN de {persona} bloqueado en la tablet después de {n} intentos» |
| **Sin internet** | Sí: la tablet la bloquea en ese momento y la sigue mostrando bloqueada mientras no baje un desbloqueo posterior. Un PIN equivocado suelto no sube |

## Acciones internas

### `produccion.poner_tarifa_a_registros`

| | |
|---|---|
| **La llama** | `personal.poner_tarifa_operacion`, cuando una operación de un flujo recibe su primera tarifa (ver [tarifas](../personal/tarifas.md)) |
| **Recibe** | `flujo_operacion_id` · `tarifa_operacion_id` · `tarifa_centavos` |
| **Escribe** | Los registros vigentes de esa operación sin tarifa toman esa, con `tarifa_puesta_en` |
| **Regresa** | Cuántos la tomaron y cuántos son de semanas ya pagadas, sin montos |
| **Eventos** | `registros_operacion.tarifa_puesta` |

## Lecturas

### `produccion.registros_para_nomina(desde, hasta)`

| | |
|---|---|
| **La usa** | Contaduría, para la nómina por pieza (ver [nómina](../contaduria/nomina.md)) |
| **Regresa** | Los registros que llegaron al servidor, se cancelaron o tomaron su tarifa en ese tiempo, cada uno con su persona, su fecha, su operación y su flujo, sus buenas y sus dañadas, su tarifa, cuándo la tomó, su estado y cuándo se canceló |

### `produccion.persona_que_la_hizo(lote, flujo_operacion, variante)`

| | |
|---|---|
| **La usa** | Calidad: la persona que se propone en un rechazo y la que se congela en un reclamo (ver [revisión de lotes](../calidad/revision-de-lotes.md)) |
| **Regresa** | La persona con más piezas buenas vigentes de esa operación en los bultos de esa talla del lote; si no hay registros, la de base |

## Lo que baja a la tablet

| Tabla | Filtro | Columnas |
|---|---|---|
| `registros_operacion` | Vigentes y cancelados de los lotes en proceso y terminados, y los de la semana en curso de cualquier lote | `id`, `bulto_id`, `lote_id`, `flujo_operacion_id`, `persona_id`, buenas, dañadas, `hecho_en`, `estado`, `origen` |

Con ellos la tablet calcula el tope sin internet, «Hoy llevas», la semana, las barras por hora y los últimos tres. Nunca baja una tarifa con el registro.

**Bultos para ti:** los bultos de lotes en proceso con tope mayor que 0 en una operación que la persona hace de base, primero los atorados y atrasados, luego en riesgo, por fecha de entrega y por orden, hasta `produccion.bultos_para_ti_max` (6). Lo calcula la tablet con la función del paquete compartido.

## Parámetros

Los cambia solo la dueña, en Configuración (ver [configuración](../admin/configuracion.md)).

| Parámetro | Valor inicial | Sección | Baja a | Para qué |
|---|---|---|---|---|
| `produccion.tarifa_visible_tablet` | No se muestra | Decisiones de operación | La tablet | Si la tablet muestra la tarifa de cada operación. Al cambiarlo, la tablet pide su foto completa |
| `produccion.bultos_para_ti_max` | 6 | Parámetros | La tablet | Cuántos bultos muestra «Bultos para ti» |
| `produccion.consumible_max_por_vez` | 20 | Parámetros | La tablet | El tope del contador de cada consumible por vez |

Usa también `general.largo_minimo_motivo` y, de Personal, `personal.pin_intentos_bloqueo` y `personal.tablet_inactividad_seg`.

## Permisos

- Registrar, tomar consumibles y bloquear un PIN: la tablet del taller, con la persona que entró con su PIN.
- Cancelar un registro: Producción.
- La tarifa de cada registro solo viaja a las cuentas con «ven sueldos y tarifas».

## Eventos

`registro_operacion.creado` · `registro_operacion.cancelado` · `registros_operacion.tarifa_puesta`.

## Lo que llega después

- **Fase 17:** Contaduría lee `produccion.registros_para_nomina` para la nómina por pieza.
- **Fase 20:** la tablet: sus pantallas, su cola y su copia local (ver [la tablet](../../apps/tablet.md)).

## Cómo está hecho

**Fase 12, parte 4.**

- **La tabla** `registros_operacion` es de `produccion` (`tablas.ts`, migración `0041`), con sus CHECK (el origen y su corte, la tablet en lo de la tablet, las piezas, la cancelación) y `xid_escritura`.
- **Lo que sube la tablet** está en `acciones/registros.ts`, con sus contratos en `packages/compartido/src/contratos/produccion/registros.ts` (permiso de la cola de la tablet). Lo mal formado es un `422` en la cola, que la subida aparta: el bulto que no existe, la operación ajena o de corte, sin piezas, la persona que no es del Taller (decisión 611).
  - `registrar_operacion` bloquea el lote, cuenta el tope con `topeDelBulto` y `pasaDelTope` del paquete compartido (`packages/compartido/src/calculos/tope-bulto.ts`), abre `pasa_tope_bulto` o `lote_no_en_proceso` con `inventario.registrar_excepcion`, congela la tarifa que valía a la hora de la tablet (`personal.tarifa_vigente`), mueve la talla y, si queda completo, termina el lote. Las dañadas salen con `inventario.registrar_merma_produccion`.
  - `tomar_consumible` pasa cada cantidad a la unidad de inventario (÷ el factor, hacia arriba al milésimo) y llama `inventario.tomar_consumible`; `registrar_bloqueo_pin` revisa que el PIN sea de la persona y llama `personal.bloquear_pin`.
- **`cancelar_registro`** toma la versión del registro y revisa sus candados; regresa la talla, revierte la merma (`inventario.revertir_merma_produccion`) y reabre el lote terminado solo si con eso ya no está completo. Su bitácora lleva la tarifa, así que va como plantilla (decisión 612).
- **Lo común** (`dominio/registros.ts`): el flujo del lote, lo hecho en un bulto, la tarifa que valía, mover la talla, el lote completo y los registros del corte, que nacen al cerrarlo, uno por bulto.
- **`poner_tarifa_a_registros`** y **`registros_para_nomina`** (`internas/registros.ts`); `personal.poner_tarifa_operacion` la llama con la primera tarifa y avisa cuántos la tomaron. Los de semanas pagadas llegan con la nómina (fase 17).
- **Lo que baja a la tablet:** los registros de los lotes en proceso y terminados y los de la semana, sin la tarifa.
- **Los parámetros** `produccion.tarifa_visible_tablet`, `produccion.bultos_para_ti_max` y `produccion.consumible_max_por_vez`.
- **«Bultos para ti»** es `bultosParaTi` del paquete compartido (`packages/compartido/src/calculos/bultos-para-ti.ts`): recibe los bultos con su tope, su salud y su fecha de entrega, y los ordena y corta hasta el máximo; la prueba `bultos-para-ti.prueba.ts`, también con fast-check.
- **Pruebas:** `acciones/registrar-operacion.prueba.ts` (la hora y la tarifa, lo que se aparta, el tope, terminar y reabrir, cancelar lo que sobró sin reabrir, el lote revisado, los registros del corte, la tarifa que llega después), `acciones/tomar-consumible.prueba.ts` (también el PIN) y `tope-bulto.prueba.ts` con fast-check.

**Fase 13, parte 1.** La lectura `produccion.persona_que_la_hizo` (`lecturas/persona-que-la-hizo.ts`): la persona con más buenas vigentes de esa operación en los bultos de esa talla (si empatan, la del primer registro), o la de base. Lo prueba `lecturas/persona-que-la-hizo.prueba.ts`.
