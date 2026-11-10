# Flujo 01 · Pedido externo

> **Qué cubre:** el pedido de un cliente externo de punta a punta, de la venta al cobro: confirmar, anticipo, mandar a producción, entregar tela, cortar, la tablet, Calidad, Aduana, la nota, el despacho, la entrega y el pago; lo que tiene que cuadrar al final y lo que sale mal.
> **Estado:** Decidido.
> **Se construye en:** [fase 21](../../fases/21-pruebas-de-punta-a-punta.md).
> **Se conecta con:** [pruebas](../../cimientos/PRUEBAS.md) · [pedidos](../../modulos/ventas/pedidos.md) · [fase 21](../../fases/21-pruebas-de-punta-a-punta.md)

## Qué prueba

Que un pedido de un cliente externo recorre toda la fábrica sin que nadie copie nada a mano: cada departamento ve lo suyo en el momento, las piezas siempre están en un solo lugar, el anticipo y la cuenta por cobrar dan exacto, y la tablet y las etiquetas funcionan en el camino.

## Datos de arranque

- Los datos de la muestra (`pnpm base:sembrar`).
- **El cliente:** Colegio Morelos, activo, con crédito al corriente.
- **La prenda:** Pantalón azul marino, con receta verificada y su flujo de operaciones, cada operación con su persona de base y su tarifa.
- **La tela:** rollos de gabardina azul marino en Bodega que alcanzan para el corte, y los avíos de la receta en existencia.
- **El taller:** la tablet registrada (Chrome emulado) y las personas del flujo con PIN; la Zebra de Aduana y la del taller, de mentira, con su puente.
- **Las cuentas:** la dueña, la oficina (Ventas y Contaduría), Aduana y Bodega, y el encargado del taller (Producción y Calidad).

## Pasos

| # | Quién · dónde | Qué hace | Qué tiene que pasar |
|---|---|---|---|
| 1 | Ventas · Pedido nuevo | Colegio Morelos, entrega en 21 días, forma de pago «Anticipo», 20 piezas en las tallas 8, 10 y 12. «Guardar y confirmar» → `ventas.confirmar_pedido` | El PE- queda confirmado con el precio congelado: «{PE} confirmado para Colegio Morelos. El precio quedó congelado.» |
| 2 | Contaduría · Registrar pago | $5,000 al pedido → `contaduria.registrar_pago_recibido` | Nace el PG- y el anticipo del pedido tiene $5,000 disponibles |
| 3 | Ventas · Mandar a producción | La revisión sin avisos → `ventas.mandar_a_produccion` | Nace la OP- con un lote L- por cortar de 60 piezas; el pedido queda en producción; Compras ve la tela comprometida |
| 4 | Bodega · Entrega al corte | Los rollos sugeridos, de una sola partida → `inventario.entregar_al_corte` | «{lote}: {n} rollos pasan al taller»: los rollos y los avíos salen de Bodega al Taller |
| 5 | Producción · Corte | Los rollos que entregó Bodega, lo que queda del último según la receta (más de 15 m, sin cambiarlo), las piezas por talla y quién cortó → `produccion.cerrar_corte` | El lote queda en proceso con 3 bultos B- de 20; se descuenta la tela que pide la receta; el último rollo queda por recibir en Bodega; los registros del corte, a nombre del cortador |
| 6 | Producción · cajón del lote | «Imprimir etiquetas de bulto» → `produccion.imprimir_etiquetas_bulto` | La Zebra de mentira del taller recibe 3 etiquetas B- y el trabajo queda impreso |
| 7 | Bodega · Materiales | «Recibir» el rollo que regresó → `inventario.recibir_del_corte` | El rollo vuelve a estar disponible en Bodega con sus metros |
| 8 | Tablet | Cada persona entra con su PIN, escanea su bulto y registra sus operaciones → `produccion.registrar_operacion`; a media mañana se va la red y dos registros quedan «guardada aquí» | Al volver la red suben una vez, en orden; con la última operación completa, el lote queda terminado y le aparece a Calidad |
| 9 | Calidad · Revisión del lote | 58 aprobadas y 2 rechazadas, con su defecto, operación y persona → `calidad.revisar_lote` | «{lote}: 58 aprobadas pasan a aduana, 2 regresan al taller»: el lote revisado y su reproceso R1 de 2 piezas |
| 10 | Aduana · Recibir del taller | Cuenta a ciegas, talla por talla: 58 → `inventario.recibir_del_taller` | «{lote} en aduana: 58 piezas para Clientes externos»: nace el A- con sus etiquetas por imprimir; los avíos del lote se consumen; el lote queda en aduana |
| 11 | Aduana · Despachar | «Imprimir etiquetas» → `inventario.marcar_etiquetas_impresas` | La Zebra de mentira de Aduana recibe 58 etiquetas de prenda, una por pieza, y el A- queda con sus etiquetas impresas |
| 12 | Ventas · Armar nota | Las 58 listas, con $5,000 del anticipo → `ventas.armar_nota_entrega` | «{NV} lista: 58 piezas por despachar en aduana»: las piezas quedan apartadas para la nota y el anticipo disponible baja a $0 |
| 13 | Aduana · Despachar | «Despachar a Colegio Morelos» → `inventario.despachar`, y su «Hoja» | «{NV} sale con {D} a Colegio Morelos. Queda en camino hasta que firme de recibido»: las piezas pasan a Tránsito; la hoja del despacho y la nota de Aduana no traen ningún peso |
| 14 | Aduana · En tránsito | «Confirmar entrega», recibió «Laura Méndez» → `ventas.confirmar_entrega` | La nota queda entregada y el pedido en entrega parcial; nace la cuenta por cobrar por el subtotal menos $5,000 |
| 15 | Calidad y Aduana | Aprueba el R1 → `calidad.aprobar_reproceso`; Aduana lo recibe → `inventario.recibir_reproceso` | Las 2 piezas en aduana para el pedido, en su propio A- |
| 16 | Ventas y Aduana | Segunda nota con las 2 piezas, despacho y entrega | El pedido queda entregado; nace la segunda cuenta por cobrar, sin anticipo |
| 17 | Contaduría · Registrar pago | El saldo de las dos notas → `contaduria.registrar_pago_recibido` | Las dos notas pagadas y el cliente sin saldo |

## Lo que tiene que cuadrar al final

- **Las piezas:** 60 cortadas = 60 terminadas = 58 aprobadas + 2 del reproceso = 60 entregadas. Ninguna de esas variantes queda en Aduana, en Tránsito ni en el Taller por este pedido.
- **El inventario:** la existencia de cada ubicación es la suma de su libro, y el cuadre de la noche (`inventario.correr_cuadre`) no deja residuo.
- **La tela:** los metros entregados son los usados más los que regresaron en el rollo, y los usados son los que pide la receta para 60 piezas; los avíos, los de la receta para 60 piezas.
- **El dinero:** lo cobrado de las dos notas más el anticipo es el total del pedido; el anticipo disponible es $0 y el cliente no tiene saldo ni saldo a favor.
- **La nómina:** cada registro vigente de la tablet está en la semana de su persona con su tarifa congelada; solo cuentan las buenas.
- **Lo que vio cada cuenta:** Aduana nunca recibió un precio, ni en sus consultas, ni en la nota, ni en la hoja del despacho.
- **La bitácora:** un renglón por acción, con quién y desde dónde; los de la tablet, con la persona y la tablet.

## Lo que sale mal

- **La tablet sin red durante toda una tanda, y la respuesta se pierde:** al reintentar, cada registro es `repetido`; ningún bulto pasa de su tope y nada se cuenta dos veces.
- **Dos clics en «Confirmar entrega»** con la misma clave: una sola cuenta por cobrar y la misma respuesta.
- **El cliente se detiene por crédito** antes del paso 1: `cliente_detenido` y el pedido no se confirma; Contaduría lo libera y se confirma.
- **La prenda sin receta:** mandar a producción avisa y la entrega al corte responde `sin_receta`; Patronaje guarda la receta y el flujo sigue.
- **Del último rollo no quedó lo que dice la receta:** se cambia lo que quedó en la captura; el corte usa esos metros, el rendimiento lo dice y el desperdicio de la prenda se mueve.
- **Aduana cuenta 57:** nace la diferencia por la pieza que falta, a cargo del taller, y la nota se arma con 57.
- **La nota se cancela por despachar:** sus piezas regresan a lo listo del pedido y su anticipo al pedido; la nota siguiente lo vuelve a usar.
- **La Zebra de Aduana sin papel:** el trabajo queda en `fallo`, quien lo pidió ve «No se imprimió en {impresora}: Sin etiquetas en la impresora. Usa el PDF.» y el PDF trae las mismas 58.

## Cómo está hecho

*Lo escribe Claude Code al terminar la fase 21.*
