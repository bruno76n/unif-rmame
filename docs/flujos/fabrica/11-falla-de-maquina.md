# Flujo 11 · Falla de máquina

> **Qué cubre:** una falla de punta a punta: el reporte desde la tablet (también sin internet), la máquina parada que atora un lote, mandarla a reparación, la nota de seguimiento, registrar la reparación con su costo y sus horas de paro, el gasto que nace en Contaduría y el lote que deja de estar atorado; lo que tiene que cuadrar al final y lo que sale mal.
> **Estado:** Decidido.
> **Se construye en:** [fase 21](../../fases/21-pruebas-de-punta-a-punta.md).
> **Se conecta con:** [pruebas](../../cimientos/PRUEBAS.md) · [máquinas, fallas y servicios](../../modulos/mantenimiento/maquinas-fallas-y-servicios.md)

## Qué prueba

Que una máquina que se para se sabe al momento, aunque no haya internet en el taller; que el lote que espera a esa máquina se ve atorado y por qué; y que la reparación deja su costo en Contaduría y sus horas de paro, sin que nadie las capture dos veces.

## Datos de arranque

- Los datos de la muestra.
- **La Collareta 3 (C-03),** que trae Beto, sin falla abierta.
- **Un lote en proceso** con piezas esperando en «Cuello», la operación que Beto hace de base.
- **El técnico** «Servicio Industrial Pérez» en la lista.
- **Las cuentas:** la dueña (Dirección), Mantenimiento, el encargado del taller, y la oficina con Contaduría.

## Pasos

| # | Quién · dónde | Qué hace | Qué tiene que pasar |
|---|---|---|---|
| 1 | Tablet, sin internet | Beto entra con su PIN: «Falla de máquina» → «Collareta 3» → «No prende» → `mantenimiento.reportar_falla` por la cola | «Falla de Collareta 3 guardada en la tablet; llega a Mantenimiento al volver el internet»; en la tablet la Collareta 3 sale «Reportada desde hoy» |
| 2 | Tablet | Regresa el internet | La falla sube con la hora en que se reportó: nace la FM-, reportada, con Beto y la máquina parada desde esa hora |
| 3 | Mantenimiento · Pendientes | Mira | «Falla» de la Collareta 3, «Parada» |
| 4 | Producción · Lotes | Mira | El lote «Atorado» por la máquina: «La collareta 3 está parada. Mantenimiento la está revisando.»; el trabajo «Vigilar lotes atorados» avisa a Producción, Dirección y Ventas, y la dueña recibe `lote_atorado` |
| 5 | Mantenimiento · cajón de la falla | «Mandar a reparación» con Servicio Industrial Pérez → `mantenimiento.mandar_a_reparacion` | «{FM} en reparación con Servicio Industrial Pérez»; el paro sigue contando desde que se paró |
| 6 | Mantenimiento · cajón de la falla | «Nota de seguimiento»: «Esperan la refacción el jueves» → `mantenimiento.guardar_nota_seguimiento` | «Nota guardada en {FM}» |
| 7 | Mantenimiento · cajón de la falla | Dos días de trabajo después: «Registrar reparación» → «Marcar resuelta», «Cambio de motor», $1,850, con las horas de paro que propone → `mantenimiento.registrar_servicio` | «Collareta 3 vuelve a trabajar. {n} horas de paro quedan registradas»: nace el SM-, la falla resuelta y sin nota, la máquina trabajando |
| 8 | Contaduría · Gastos | Mira | Un gasto de mantenimiento por $1,850 en «Reparación de máquinas», del Taller, ligado al SM- (`contaduria.registrar_gasto_mantenimiento`) |
| 9 | Producción · Lotes | Mira | El lote deja de estar atorado por la máquina |

## Lo que tiene que cuadrar al final

- **Las horas de paro:** las que propuso la reparación son `mantenimiento.paro_horas_por_dia` (9) por cada día de trabajo desde que se paró hasta ayer, más `mantenimiento.paro_horas_hoy` (4) de hoy; las guardadas son las que se escribieron.
- **El costo del paro** en Mantenimiento es esas horas por `mantenimiento.costo_hora_paro` ($450).
- **El dinero:** un solo gasto por el servicio, con su categoría y su ubicación; el paquete del contador del mes lo lleva en «Reparación de máquinas».
- **La falla:** una sola por la máquina, con su folio FM-, quién la reportó, quién la traía, su técnico, su servicio y su nota en la bitácora.
- **La salud del lote:** atorado por máquina mientras la falla estuvo abierta, y en su salud de siempre después.

## Lo que sale mal

- **Mantenimiento ya la reportó desde la web** mientras la tablet estaba sin red: al subir la de la tablet, el servidor no crea otra y el resultado dice que ya estaba reportada; no es una excepción.
- **Con la falla ya en la tablet,** la máquina no muestra los motivos: «Ya está reportada: No prende, reportada desde el {fecha}».
- **Mantenimiento reporta desde la web** una máquina con falla abierta: `maquina_con_falla_abierta`.
- **Mandar a reparación una falla que ya está en reparación:** `falla_no_reportada`.
- **Registrar dos veces la reparación:** `falla_resuelta`; un solo gasto.
- **Una reparación de $0:** no nace gasto.
- **Una falla que no detuvo la máquina** («Rompe el hilo»): la máquina trabaja con falla, el lote no se atora y no cuenta paro hasta que se manda a reparación parada.
- **Cambiar quién trae la máquina** con la falla abierta: la falla guarda quién la traía al fallar.

## Cómo está hecho

*Lo escribe Claude Code al terminar la fase 21.*
