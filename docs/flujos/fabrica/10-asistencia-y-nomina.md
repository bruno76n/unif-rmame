# Flujo 10 · Asistencia y nómina

> **Qué cubre:** una semana de trabajo hasta su pago: las piezas de la tablet con su tarifa congelada, la operación nueva que todavía no tiene tarifa, el registro cancelado, la asistencia, el cierre de la semana, el descuento semanal, pagar la nómina y la corrección de algo ya pagado en la siguiente; lo que tiene que cuadrar al final y lo que sale mal.
> **Estado:** Decidido.
> **Se construye en:** [fase 21](../../fases/21-pruebas-de-punta-a-punta.md).
> **Se conecta con:** [pruebas](../../cimientos/PRUEBAS.md) · [nómina](../../modulos/contaduria/nomina.md) · [asistencia](../../modulos/personal/asistencia.md) · [fase 21](../../fases/21-pruebas-de-punta-a-punta.md)

## Qué prueba

Que lo que se ve en la nómina es lo que se paga: cada pieza con la tarifa que valía cuando se hizo, cada día con lo que capturó Personal, cada descuento hasta donde alcanza, y que lo pagado ya no cambia: lo que esté mal se corrige en la semana siguiente.

## Datos de arranque

- Los datos de la muestra, en una semana nueva de lunes a sábado.
- **Las personas:** Sergio Gómez, por tiempo, $350 por día; Lupita Ramos, por pieza; Juana Pérez, mixta, $200 por día más sus piezas. Las tres con PIN.
- **El flujo** de su prenda con sus tarifas, y una operación nueva, «Bies», sin tarifa todavía.
- **Las cuentas:** la dueña, Personal, y la oficina con Contaduría y el permiso «ven sueldos y tarifas».

## Pasos

| # | Quién · dónde | Qué hace | Qué tiene que pasar |
|---|---|---|---|
| 1 | Tablet | Durante la semana Lupita y Juana registran sus operaciones → `produccion.registrar_operacion`; Lupita registra 40 de «Bies» | Cada registro con la tarifa vigente a la hora en que se hizo; los de «Bies», sin tarifa |
| 2 | Personal · Tarifas | El miércoles, la tarifa de «Costados» sube de $1.50 a $1.80 → `personal.poner_tarifa_operacion` | Los registros de antes siguen con $1.50; los de después toman $1.80 |
| 3 | Personal · Pendientes | «Tarifa · Sin tarifa» · «Poner tarifa» a «Bies»: $0.90 | «Bies: $0.90 por pieza desde ahora» y «40 registros sin tarifa ya la tomaron» |
| 4 | Producción · cajón del lote | Cancela un registro de Juana de 12 que se capturó dos veces, con motivo → `produccion.cancelar_registro` | «Registro cancelado: 12 piezas menos para Juana Pérez en la nómina» |
| 5 | Contaduría · Descuento semanal | A Sergio, $200 cada semana por un préstamo → `contaduria.guardar_descuento_semanal` | «Sergio Gómez: $200 de descuento cada semana, desde esta nómina» |
| 6 | Personal · Asistencia | Captura los días: Sergio 5 completos y medio sábado; Juana 6 completos → `personal.cambiar_dia_asistencia` | La cuadrícula llena; Lupita no aparece: cobra por pieza |
| 7 | Personal · Asistencia | El sábado, «Cerrar semana» → `personal.cerrar_semana_asistencia` | «Semana cerrada: contaduría ya puede pagar la nómina»: nace la nómina por pagar, para el martes |
| 8 | Contaduría · Nómina | Revisa y «Pagar nómina» → «Confirmar con Google» → `contaduria.pagar_nomina` | «Nómina del {semana} pagada»: se congela con todo lo que usó |
| 9 | Producción | El lunes siguiente cancela un registro de Lupita de la semana pagada | La nómina pagada no cambia; el registro entra a la nómina siguiente en negativo |
| 10 | Tablet, Personal y Contaduría | La semana siguiente con sus registros y su asistencia, cerrada y pagada | La corrección de Lupita y el descuento de Sergio entran en su nómina |

## Lo que tiene que cuadrar al final

- **Sergio:** 5.5 días × $350 = $1,925, menos $200 = $1,725 cada semana.
- **Lupita:** la suma de sus buenas vigentes por la tarifa congelada de cada registro, con «Bies» a $0.90; la semana siguiente, menos lo que se le pagó del registro cancelado.
- **Juana:** 6 días × $200 más sus piezas, sin las 12 canceladas; las de «Costados» a $1.50 antes del miércoles y a $1.80 después.
- **La nómina pagada:** su total es el que vio la pantalla al pagar; sus renglones guardan cada día, cada registro con su tarifa y el descuento, y no cambian.
- **Producción por persona** y la nómina cuentan lo mismo: las buenas de los registros vigentes.
- **El paquete del contador** del mes lleva la nómina pagada con cuántas semanas.
- **Lo que vio cada cuenta:** sin el permiso de sueldos nadie vio un pago por día, una tarifa ni un monto de nómina.

## Lo que sale mal

- **Cerrar la semana con un día vacío:** «Falta 1 día por capturar», con la persona y la fecha para poner ahí el foco.
- **Pagar antes de cerrar:** `asistencia_sin_cerrar`; **pagar la segunda antes que la primera:** `semana_anterior_sin_pagar`.
- **Llega un registro mientras se ve la nómina:** al pagar, el total ya no es el que vio la pantalla y no paga hasta revisarla.
- **El descuento es mayor que lo ganado:** se descuenta hasta lo ganado y lo demás se perdona o pasa a la siguiente semana, según `nomina.descuento_mayor_que_lo_ganado`.
- **Reabrir una semana:** solo la dueña, con motivo; una semana ya pagada no se reabre (`nomina_pagada`).
- **Capturar un día en una semana cerrada:** `semana_cerrada`.
- **Una cuenta de Contaduría sin el permiso** abre la nómina: no recibe los montos.
- **La tablet sin red el viernes:** sus registros llegan el sábado con su hora y entran en su semana, aunque la nómina ya exista y no se haya pagado.

## Cómo está hecho

*Lo escribe Claude Code al terminar la fase 21.*
