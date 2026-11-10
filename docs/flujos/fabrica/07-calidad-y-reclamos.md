# Flujo 07 · Calidad y reclamos

> **Qué cubre:** la revisión de un lote con rechazos por talla, el reproceso que regresa al taller y vuelve aprobado, el reclamo de un cliente rastreado desde el código de la prenda, la nota de crédito con piezas que regresan, la revisión de esa devolución y el reclamo resuelto; lo que tiene que cuadrar al final y lo que sale mal.
> **Estado:** Decidido.
> **Se construye en:** [fase 21](../../fases/21-pruebas-de-punta-a-punta.md).
> **Se conecta con:** [pruebas](../../cimientos/PRUEBAS.md) · [revisión de lotes](../../modulos/calidad/revision-de-lotes.md)

## Qué prueba

Que cada pieza mala se sabe de dónde salió y quién la hizo, que lo rechazado regresa contado, y que una devolución termina en Bodega o en merma con su motivo, mientras Contaduría cobra solo lo que de verdad se quedó el cliente.

## Datos de arranque

- Los datos de la muestra.
- **Un lote terminado** de pantalón azul marino para un pedido de Distribuidora Escolar Zamora, 60 piezas (20 de las tallas 8, 10 y 12), con sus registros de la tablet: Juana hizo la mayoría de «Costados» en la talla 10.
- **Un lote ya entregado** de la misma prenda, de una nota entregada y sin pagar del mismo cliente, para el reclamo.
- **Las cuentas:** la dueña (Dirección), la oficina (Ventas y Contaduría), Aduana, y el encargado del taller con Producción y Calidad.

## Pasos

| # | Quién · dónde | Qué hace | Qué tiene que pasar |
|---|---|---|---|
| 1 | Calidad · Revisión del lote | Talla 10: 3 rechazadas por «Costura abierta» en «Costados»; propone a Juana y se deja. «Aprobar 57 y regresar 3» → `calidad.revisar_lote` | «{L}: 57 aprobadas pasan a aduana, 3 regresan al taller»: el lote revisado y el reproceso {L}-R1 con 3 piezas y Juana |
| 2 | Aduana · Recibir del taller | Cuenta a ciegas: 57 → `inventario.recibir_del_taller` | El lote en aduana; el R1 sigue en el taller |
| 3 | Calidad · Reproceso en el taller | El taller los compuso: «Aprobar» → `calidad.aprobar_reproceso` | «3 piezas de {L} aprobadas: pasan a aduana para {PE}» |
| 4 | Aduana · Recibir lo que viene en camino | El R1, a ciegas: 3 → `inventario.recibir_reproceso` | «{L}-R1 en aduana: 3 piezas para {cliente}», en su propio A- |
| 5 | Calidad · Reclamos | El cliente reclama 4 pantalones del otro lote con la costura abierta. «Nuevo reclamo»: el cliente, la nota, el código de la prenda, «Costura abierta», 4 piezas y lo que dice el cliente → `calidad.registrar_reclamo` | «{RC} registrado. Del código se llega al lote {L}»: el rastreo con el lote, quién lo revisó y cuándo, la operación, la persona congelada y la partida de los rollos del corte |
| 6 | Ventas · cajón de la nota | «Nota de crédito»: las 4 piezas regresan, con su monto → `ventas.pedir_nota_credito` | «Nota de crédito para {NV} enviada a Dirección» |
| 7 | Dirección · Autorizaciones | Autoriza → `direccion.decidir_autorizacion` | Nace la NC- (`ventas.aplicar_decision_nota_credito`); baja el saldo de la nota (`contaduria.aplicar_nota_credito`), que conserva su total; Aduana espera 4 piezas en un A- `esperado` |
| 8 | Aduana · Recibir lo que viene en camino | Llegan las 4: «Llegó completo» → `inventario.recibir_en_aduana` | «{folio} recibida: pasa a Calidad» |
| 9 | Calidad · Pendientes | «Revisar»: 1 sirve, 3 son merma («costura abierta y tela rota») → `calidad.revisar_devolucion` | «{folio}: 1 a bodega, 3 como merma»: la que sirve sale en un traspaso hijo a Bodega y las 3 salen con `merma_calidad` |
| 10 | Calidad · Reclamos | «Marcar resuelto», con «Se repusieron las 4 piezas» → `calidad.resolver_reclamo` | «{RC} queda resuelto» |

## Lo que tiene que cuadrar al final

- **El lote:** 60 cortadas = 57 aprobadas + 3 del reproceso, y las 60 llegaron a aduana para el pedido.
- **La devolución:** 4 recibidas = 1 en Bodega + 3 de merma, cada una con su motivo; nada queda por revisar.
- **El dinero:** el saldo de la nota del reclamo es su total menos la NC-; la cuenta por cobrar lo dice y Contaduría cobra eso.
- **El reclamo:** resuelto, con Juana congelada aunque después cambien los registros del lote.
- **La nómina:** los rechazos no le quitan piezas a nadie: lo registrado en la tablet se paga igual.
- **Calidad:** los defectos del periodo cuentan los 3 rechazos y el reclamo en «Costura abierta», en «Costados».
- **El inventario:** la existencia es la suma del libro y el cuadre de la noche no deja residuo.

## Lo que sale mal

- **Rechazar más de las listas de una talla:** `rechazos_mas_que_listas`.
- **Revisar un lote que no está terminado:** `lote_no_terminado`.
- **Aprobar el reproceso antes de que Aduana reciba el lote:** `lote_no_recibido`.
- **Quien revisa cosió en el lote:** se revisa, con el aviso «Cosiste en este lote: la revisión queda marcada».
- **Un código que no es de ninguna prenda,** o una prenda sin lotes revisados: `codigo_desconocido` o `sin_lotes_revisados`.
- **Dirección rechaza la nota de crédito:** nada cambia; el saldo y las piezas se quedan como estaban.
- **Revisar más piezas de las que quedan en un renglón:** `piezas_mas_que_pendientes`.
- **Aduana cuenta 2 del reproceso:** la que falta queda por aclarar a cargo del taller.

## Cómo está hecho

*Lo escribe Claude Code al terminar la fase 21.*
