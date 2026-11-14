# Órdenes de compra

> **Qué cubre:** la orden de compra OC-, una por proveedor: levantarla en borrador, editarla, enviarla con su PDF, recibirla en parte o completa, cerrarla con faltante, cancelarla o descartarla, y cerrarla cuando se paga; lo que está en camino y cuándo se espera.
> **Estado:** Decidido.
> **Se construye en:** [fase 10](../../fases/10-patronaje-y-compras.md).
> **Se conecta con:** [proveedores y precios](proveedores-y-precios.md) · [proyección de material](proyeccion-de-material.md) · [materiales](materiales.md) · [folios](../admin/folios.md) · [archivos](../admin/archivos.md) · [recepciones en aduana](../inventario/recepciones-en-aduana.md) · [autorizaciones](../direccion/autorizaciones.md) · [terceros y deudas](../contaduria/terceros-y-deudas.md) · [cuentas por pagar](../contaduria/cuentas-por-pagar.md) · [facturas de proveedor](../contaduria/facturas-de-proveedor.md) · [pagos y saldo a favor](../contaduria/pagos-y-saldo-a-favor.md) · [hojas](../../impresos/hojas.md) · [compra de material](../../flujos/fabrica/04-compra-de-material.md) · [pantallas de Compras](../../interfaz/fabrica/compras.md)

## Para qué sirve

La orden de compra es lo que se le pide a un proveedor, con la cantidad y el precio de cada material. Nace en borrador, que todavía no cuenta como material en camino; al enviarla se congela, se guarda su PDF y lo pedido empieza a contar en camino y a salir en Aduana.

Ejemplo de la muestra: Compras levanta OC-0225 con Refacciones Ochoa: 10 cajas de agujas 14/90 a $260 y 6 bandas de transmisión a $95, $3,170 en total. La marca enviada el 8 de octubre, con la promesa de llegar el 12. Desde ese día las 10 cajas y las 6 bandas cuentan en camino, y Aduana la ve en Recepción para recibirla.

## Reglas

1. **Una orden por proveedor, y un solo borrador por proveedor.** Lo que se levanta para un proveedor que ya tiene borrador se suma a ese borrador; si el material ya estaba, cambian su cantidad y su precio.
2. **Al nacer** toma folio OC-, la fecha de hoy y una fecha prometida propuesta: hoy más lo que el proveedor dice que tarda.
3. **La cantidad de cada material** es entera, mayor que 0, hasta `compras.cantidad_maxima_linea` (999,999) y múltiplo de lo que se compra junto (`multiplo_compra` del material: de 50 en 50 m, de 100 en 100 pza).
4. **El precio es libre:** se escribe al levantar o en el borrador, por unidad de inventario, sin autorización; un cambio grande contra lo último que se le pagó a ese proveedor solo se marca en ámbar (ver [proveedores y precios](proveedores-y-precios.md)). El precio vigente de una línea es el de la nota del proveedor, si cobró otro, o el de la orden.
5. **Solo el borrador se edita:** cantidades, precios y fecha prometida. Un material no se quita de un borrador: para quitarlo se descarta el borrador.
6. **Al enviarla** se congelan las cantidades y los precios; la fecha prometida queda entre hoy y hoy más `compras.dias_max_fecha_prometida` (120) días; se copia la condición de pago del proveedor; y se guarda su PDF. Un proveedor que no surtía un material de la orden queda entre los que lo surten.
7. **Lo recibido de una línea** no se guarda en la orden: es lo que Aduana recibió menos lo que se devolvió al proveedor (ver [recepciones en aduana](../inventario/recepciones-en-aduana.md)). Al recibir, la orden pasa a `recibida` si en cada línea lo recibido llega a lo pedido, y si no, a `recibida_en_parte`.
8. **En camino** es lo que falta de cada línea de las órdenes enviadas o recibidas en parte. Los borradores no cuentan.
9. **Atrasada** no es estado: es una orden enviada o recibida en parte con la fecha prometida antes de hoy; sus días de atraso son hoy menos esa fecha.
10. **Cuándo se espera lo que falta:** en la fecha prometida; si ya pasó, hoy más `compras.dias_espera_orden_atrasada` (3) días. Aduana ve en Recepción las órdenes que se esperan dentro de `inventario.dias_ventana_ordenes` (7) días, y las atrasadas (ver [recepciones en aduana](../inventario/recepciones-en-aduana.md)). Esa ventana solo decide qué sale en la lista: Aduana recibe una orden enviada aunque llegue antes.
11. **Cancelar y descartar,** siempre con motivo: una orden enviada (o atrasada) se cancela; un borrador se descarta; una recibida en parte no se cancela, se cierra con faltante. Lo que faltaba deja de contar en camino y de salir en Aduana. Nada se borra: queda en Terminadas con fecha, quién y motivo, y un borrador descartado queda «Sin fecha».
12. **Cerrar con faltante,** solo una orden recibida en parte, con motivo y sin autorización: lo que faltó deja de contar en camino, Aduana ya no la espera, se paga lo recibido y Por pedir lo vuelve a sugerir si hace falta.
13. **Cerrada:** la orden recibida pasa sola a cerrada cuando quedan pagadas las cuentas de todas sus facturas, y vuelve a recibida si se cancela un pago y una deja de estar pagada (ver [cuentas por pagar](../contaduria/cuentas-por-pagar.md#reglas)).
14. **Recepción de más:** Aduana puede recibir más de lo que faltaba. Por cada material que pasa lo pedido nace una autorización «Recepción de más» para Dirección; en la tela, solo si pasa de `inventario.porcentaje_de_mas_tela` (3 %) de lo pedido. Autorizada, lo de más se queda; rechazada, regresa al proveedor, baja lo recibido de la línea y el estado se vuelve a calcular (ver [recepciones en aduana](../inventario/recepciones-en-aduana.md)).
15. **El total** de una orden es la suma de cada cantidad por su precio vigente. No se guarda.
16. **La orden es un agregado:** cualquier cambio en sus líneas sube su `version` (ver [idempotencia y concurrencia](../../cimientos/IDEMPOTENCIA-Y-CONCURRENCIA.md#que-nadie-pise-a-nadie)).

## Estados

| De | A | Cómo | Quién |
|---|---|---|---|
| — | `borrador` | «Crear la orden» en Levantar orden | Compras |
| `borrador` | `borrador` | Guardar cantidades, precios y fecha prometida | Compras |
| `borrador` | `enviada` | «Marcar enviada» | Compras |
| `borrador` | `cancelada` | «Descartar borrador», con motivo | Compras |
| `enviada` | `cancelada` | «Cancelar con motivo» | Compras |
| `enviada` o `recibida_en_parte` | `recibida_en_parte` o `recibida` | «Recibir en aduana» | Aduana, y Compras recalcula |
| `recibida` o `recibida_en_parte` | se recalcula | Dirección rechaza una recepción de más y lo de más regresa al proveedor | Dirección |
| `recibida_en_parte` | `cerrada_con_faltante` | «Cerrar con faltante», con motivo | Compras |
| `recibida` | `cerrada` | Quedan pagadas las cuentas de todas sus facturas | El sistema |
| `cerrada` | `recibida` | Se cancela el pago que la saldó | El sistema |

`cancelada` y `cerrada_con_faltante` son finales. «Atrasada» se muestra en lugar de Enviada o Recibida en parte.

## La tabla `ordenes_compra`

| Columna | Tipo | Nulo | Qué es |
|---|---|---|---|
| `id` | uuid | no | Llave (v7) |
| `folio` | text | no | OC-0225. Único |
| `proveedor_id` | uuid | no | → `proveedores.id` |
| `estado` | text | no | CHECK (`borrador`, `enviada`, `recibida_en_parte`, `recibida`, `cerrada`, `cerrada_con_faltante`, `cancelada`) |
| `fecha` | date | no | El día en que se levantó: «Creada el» |
| `fecha_prometida` | date | sí | «Promete llegar». CHECK: llena en toda orden que se envió |
| `enviada_en` · `enviada_por` | timestamptz · uuid | sí | «Marcar enviada». `enviada_por` → `usuarios.id` |
| `dias_credito` | integer | sí | La condición del proveedor, copiada al enviarla: no cambia si después cambia la del proveedor |
| `pdf_archivo_id` | uuid | sí | → `archivos.id`. El PDF que se guarda al enviarla |
| `cerrada_en` · `cerrada_por` · `motivo_cierre` | timestamptz · uuid · text | sí | Al pasar a `cerrada` o `cerrada_con_faltante`. `cerrada_por` vacío: la cerró el sistema. CHECK: motivo obligatorio en `cerrada_con_faltante` |
| `cancelado_en` · `cancelado_por` · `motivo_cancelacion` | timestamptz · uuid · text | sí | Cubre cancelar y descartar. CHECK: obligatorios en `cancelada` |

Lleva las columnas comunes; `creado_por` es quien la levantó (ver [base de datos](../../cimientos/BASE-DE-DATOS.md#columnas-comunes)). **Índices:** único (`folio`) · único (`proveedor_id`) donde el estado es `borrador` · (`estado`, `fecha_prometida`) · (`proveedor_id`, `enviada_en` desc).

## La tabla `orden_compra_lineas`

| Columna | Tipo | Nulo | Qué es |
|---|---|---|---|
| `id` | uuid | no | Llave |
| `orden_compra_id` | uuid | no | → `ordenes_compra.id` |
| `material_id` | uuid | no | → `materiales.id`. Único con `orden_compra_id` |
| `cantidad` | numeric(12,3) | no | Lo pedido, en la unidad de inventario. CHECK > 0. No cambia después de enviada |
| `precio_orden_centavos` | bigint | no | CHECK > 0. El precio escrito, que se congela al enviarla: «La orden decía» |
| `precio_nota_centavos` · `precio_nota_en` · `precio_nota_por` | bigint · timestamptz · uuid | sí | El precio que cobró la nota del proveedor, si fue otro. Lo pone Contaduría al capturar la nota (ver [proveedores y precios](proveedores-y-precios.md#comprasregistrar_precios_nota)) |

Lleva las columnas comunes. **Índices:** único (`orden_compra_id`, `material_id`) · (`material_id`). Lo recibido no se guarda aquí (regla 7).

## Acciones

Todas son de la web, con el departamento Compras.

### `compras.levantar_orden`

| | |
|---|---|
| **Pantalla** | Cajón Levantar orden · «Crear la orden» o «Crear {n} órdenes» |
| **Recibe** | `renglones`: al menos uno, cada uno con `material_id` · `proveedor_id` · `cantidad` (entero) · `precio_centavos` |
| **Reglas y errores** | `400`: «No hay materiales en la orden. Agrega uno de la lista.» · «Escribe cuánto pedir» · «Tiene que ser más de 0» · «Escribe el precio.»<br>`422 cantidad_demasiada`: «Es demasiado: revisa la cantidad»<br>`422 no_es_multiplo`: «Se compra de {n} en {n} {unidad}. Prueba con {cantidad más cercana}»<br>`422 material_repetido`: «{material} está dos veces con {proveedor}.»<br>`422 material_dado_de_baja`: «{material} está dado de baja.»<br>`422 proveedor_dado_de_baja`: «{proveedor} está dado de baja.»<br>Busca el borrador de cada proveedor con un candado por proveedor: si dos personas levantan a la vez, la segunda espera y suma en el borrador de la primera |
| **Escribe** | Por proveedor: suma a su borrador, o crea la orden en `borrador` con folio OC-, la fecha de hoy y la fecha prometida propuesta. Las líneas con el precio escrito. No cuenta en camino |
| **Llama** | `admin.tomar_folio`, tipo `orden_compra`, por cada orden nueva |
| **Regresa** | `ordenes`: [{`orden_id`, `folio`, `proveedor`, `nueva` o `sumada`}]. «{OC} quedó en borrador con {proveedor}» o «{n} órdenes quedaron en borrador: {OC}, {OC} y {OC}». Avisos, sin detener nada: por cada precio distinto del último que se le pagó a ese proveedor, «{material}: sube {n} % · antes ${precio}» o «baja…», en ámbar desde `compras.umbral_cambio_precio_pct` |
| **Eventos** | `orden_compra.levantada` |
| **Bitácora** | Un renglón por orden: «Levantó {OC} con {proveedor}: {materiales}» o «Sumó {materiales} al borrador {OC}» |

### `compras.guardar_borrador_orden`

| | |
|---|---|
| **Pantalla** | Cajón Orden de compra en borrador: cantidad, precio y «Promete llegar» · «Guardar» |
| **Recibe** | `orden_compra_id` · `version` · `renglones`: [{`orden_compra_linea_id`, `cantidad`, `precio_centavos`}] · `fecha_prometida` |
| **Reglas y errores** | Las de cantidad y precio de `compras.levantar_orden`<br>`400`: «Escribe la fecha en que promete llegar» · «La fecha no puede ser anterior a hoy» · «Es muy lejana: máximo {n} días» (`compras.dias_max_fecha_prometida`)<br>`422 orden_no_es_borrador`: «{OC} ya se envió: después de enviada no cambia.» |
| **Escribe** | Las cantidades, los precios y la fecha prometida |
| **Regresa** | «Borrador {OC} guardado» |
| **Eventos** | `orden_compra.cambiada` |
| **Bitácora** | Ninguna: guardar un borrador no deja renglón |

### `compras.marcar_orden_enviada`

| | |
|---|---|
| **Pantalla** | Cajón Orden de compra en borrador · «Marcar enviada» |
| **Recibe** | `orden_compra_id` · `version` · `renglones`: [{`orden_compra_linea_id`, `cantidad`, `precio_centavos`}], lo que se ve en el cajón · `fecha_prometida` |
| **Reglas y errores** | Las de `compras.guardar_borrador_orden`, con `orden_no_es_borrador` |
| **Escribe** | Las líneas con sus cantidades y precios, ya congelados. La orden: `enviada`, `enviada_en`, `enviada_por`, la fecha prometida, la condición copiada del proveedor y su PDF. En el historial de precios, con origen `orden`, cada línea cuyo precio es distinto del último con ese proveedor, o es el primero con él. El renglón del proveedor con cada material: nuevo, o reactivado si lo había dejado de surtir, y su último precio al día. El PDF de la hoja `orden_compra` se genera y se guarda antes de confirmar: si algo falla, la orden no queda enviada |
| **Llama** | `admin.guardar_archivo`, con el propósito `pdf_documento` |
| **Regresa** | `precios_nuevos` [{material, precio}] y la dirección firmada del PDF. «{OC} enviada a {proveedor}. Promete llegar el {fecha}» y, si hubo precios nuevos, «. Precio nuevo: {material} a ${precio}» |
| **Eventos** | `orden_compra.enviada` (aviso en vivo a Aduana) |
| **Bitácora** | «Mandó {OC} a {proveedor}. Promete llegar el {fecha}», y un renglón por cada precio nuevo: «Precio de {material} con {proveedor}: ${antes} → ${nuevo} ({OC})» |

### `compras.cancelar_orden`

| | |
|---|---|
| **Pantalla** | Cajón Orden de compra · «Cancelar con motivo» (enviada) o «Descartar borrador» → ventana · «Cancelar orden» o «Descartar orden» |
| **Recibe** | `orden_compra_id` · `motivo` (al menos `general.largo_minimo_motivo`, 5 letras) · `version` |
| **Reglas y errores** | `400`: «Escribe al menos 5 letras.»<br>`422 orden_recibida_en_parte`: «{OC} ya recibió material: ciérrala con faltante.»<br>`422 orden_terminada`: «{OC} ya está {estado}: no se cancela.» |
| **Escribe** | `cancelada`, con `cancelado_en`, `cancelado_por` y el motivo. Un borrador descartado queda sin fecha prometida |
| **Regresa** | «{OC} cancelada. Lo que faltaba ya no cuenta como en camino» o «{OC} descartada. Queda en el historial con su motivo» |
| **Eventos** | `orden_compra.cancelada` (aviso en vivo a Aduana) |
| **Bitácora** | «Canceló {OC}: {motivo}» o «Descartó el borrador {OC}: {motivo}» |

### `compras.cerrar_orden_con_faltante`

| | |
|---|---|
| **Pantalla** | Cajón Orden de compra recibida en parte · «Cerrar con faltante» → ventana «Cerrar {OC} con faltante» · «Cerrar orden» |
| **Recibe** | `orden_compra_id` · `motivo` (al menos 5 letras) · `version` |
| **Reglas y errores** | `400`: «Escribe al menos 5 letras.»<br>`422 orden_no_recibida_en_parte`: «{OC} no está recibida en parte: solo esas se cierran con faltante.» |
| **Escribe** | `cerrada_con_faltante`, con `cerrada_en`, `cerrada_por` y el motivo. Ningún movimiento |
| **Regresa** | «{OC} cerrada con faltante. {Lo que faltó} ya no cuenta como en camino» |
| **Eventos** | `orden_compra.cerrada_con_faltante` (aviso en vivo a Aduana) |
| **Bitácora** | «Cerró {OC} con faltante ({lo que faltó}): {motivo}» |

## Acciones internas

### `compras.recalcular_estado_orden`

| | |
|---|---|
| **La llama** | Inventario, al recibir en aduana una orden y al devolver al proveedor lo de más que Dirección rechazó (ver [recepciones en aduana](../inventario/recepciones-en-aduana.md)) |
| **Recibe** | `orden_compra_id` |
| **Reglas** | No toca una orden `cancelada`, `cerrada` ni `cerrada_con_faltante` |
| **Escribe** | `recibida` si en cada línea lo recibido llega a lo pedido; si no, `recibida_en_parte` |
| **Eventos** | `orden_compra.recibida` |

### `compras.cerrar_orden_pagada`

| | |
|---|---|
| **La llama** | Contaduría, cuando quedan pagadas las cuentas de todas las facturas de la orden (ver [cuentas por pagar](../contaduria/cuentas-por-pagar.md)) |
| **Recibe** | `orden_compra_id` |
| **Escribe** | Una orden `recibida` pasa a `cerrada`, con `cerrada_en` y sin `cerrada_por`: la cerró el sistema. En otro estado no hace nada |

### `compras.reabrir_orden_pagada`

| | |
|---|---|
| **La llama** | `contaduria.cancelar_pago` y `contaduria.cancelar_compensacion`, cuando la cuenta por pagar de una factura de la orden deja de estar pagada (ver [pagos y saldo a favor](../contaduria/pagos-y-saldo-a-favor.md)) |
| **Recibe** | `orden_compra_id` |
| **Reglas** | Solo reabre una orden que cerró `compras.cerrar_orden_pagada` (`cerrada` sin `cerrada_por`). En otro estado no hace nada. No rechaza: la cancelación del pago ya la decidió Contaduría |
| **Escribe** | `cerrada` → `recibida`, y limpia `cerrada_en` |
| **Regresa** | Si la reabrió |
| **Eventos** | `orden_compra.reabierta` |

La acción de Contaduría que la llama lleva, con el mismo `comando_id`, el renglón «{OC} vuelve a Recibida: se canceló su pago».

## Lecturas

### `compras.ordenes_por_recibir(ordenes)`

| | |
|---|---|
| **La usa** | Inventario: la Recepción de Aduana y «Recibir en aduana» (ver [recepciones en aduana](../inventario/recepciones-en-aduana.md)) |
| **Recibe** | Las órdenes que se quieren, o ninguna para todas las enviadas y recibidas en parte |
| **Regresa** | Por orden: folio, proveedor, estado, si se puede recibir (enviada o recibida en parte), la llegada esperada (regla 10), si está atrasada y cuántos días, y por línea el material, su unidad y lo pedido. **Sin precios** |

### `compras.precio_vigente_lineas(lineas)`

| | |
|---|---|
| **La usa** | Inventario, para el costo del metro de los rollos que nacen al recibir (ver [material en bodega](../inventario/material-en-bodega.md)). Nunca viaja a la pantalla de Aduana |
| **Regresa** | Por línea, su precio vigente en centavos (regla 4) |

### `compras.ordenes_para_factura(ordenes)`

Se construye en la [fase 17](../../fases/17-contaduria-por-pagar-facturas-gastos-y-nomina.md), con las facturas de proveedor.

| | |
|---|---|
| **La usa** | Contaduría, al capturar una nota o factura (ver [facturas de proveedor](../contaduria/facturas-de-proveedor.md)) |
| **Regresa** | Por orden: folio, estado, su proveedor con su tercero y los días de crédito que se copiaron al enviarla; por línea, su material y lo pedido |

## Parámetros

Los cambia solo la dueña, en Configuración (ver [configuración](../admin/configuracion.md)). Todos van en «Parámetros».

| Parámetro | Valor inicial | Para qué |
|---|---|---|
| `compras.cantidad_maxima_linea` | 999,999 | Más que esto en una línea es «Es demasiado: revisa la cantidad» |
| `compras.dias_max_fecha_prometida` | 120 días | Lo más lejos que puede prometer llegar una orden |
| `compras.dias_espera_orden_atrasada` | 3 días | Una orden atrasada se espera en estos días: en Compras, en Aduana y en la revisión de Ventas |

Usa también `compras.umbral_cambio_precio_pct` y `compras.precio_max_centavos` ([proveedores y precios](proveedores-y-precios.md#parámetros)) y `general.largo_minimo_motivo`.

## Permisos

- **Abrir el PDF de la orden** (fase 19): `compras.ve_documento` (`lecturas/ve-documento.ts`) deja abrir el PDF por `/v1/archivos/{id}` a Compras y Contaduría; Aduana lee la orden para recibirla, pero sin precios, así que no abre su PDF (decisión 805). Lo prueba `lecturas/ve-documento.prueba.ts`.
- Todo lo de este archivo: Compras.
- Aduana ve las órdenes por recibir sin precios, con la lectura de arriba.
- Contaduría captura la nota de una orden enviada (ver [facturas de proveedor](../contaduria/facturas-de-proveedor.md)).

## Eventos

`orden_compra.levantada` · `orden_compra.cambiada` · `orden_compra.enviada` · `orden_compra.cancelada` · `orden_compra.cerrada_con_faltante` · `orden_compra.recibida` · `orden_compra.reabierta`.

## Lo que llega después

- **Fase 11:** Aduana recibe las órdenes y llama `compras.recalcular_estado_orden`; la recepción de más con su autorización y la devolución al proveedor; y lo recibido de cada línea (`inventario.recibido_de_ordenes`) en el estado, en camino, el faltante y «Llegó el». Hasta entonces, nada está recibido.
- **Fase 17:** Contaduría captura la nota (con la lectura `compras.ordenes_para_factura`), cierra la orden pagada y la reabre si se cancela el pago.
- **Fase 20:** la hoja `orden_compra` con su PDF (ver [hojas](../../impresos/hojas.md)); desde entonces `compras.marcar_orden_enviada` guarda el PDF real. Antes se prueba con el tipo de prueba de la fase 4.
- **Fase 21:** el flujo [compra de material](../../flujos/fabrica/04-compra-de-material.md), de punta a punta.

## Cómo está hecho

**Fase 10, parte 4.**

- **Las tablas** `ordenes_compra` y `orden_compra_lineas` están en `apps/api/src/modulos/compras/tablas.ts` (migración `0035`), con sus CHECK por estado (enviada con fecha y condición, cancelada con su motivo, cerrada con su fecha), el folio único, un único parcial de un borrador por proveedor y un único (orden, material) en las líneas. La misma migración pone las llaves de `precios_compra` hacia la orden y la línea, la de `autorizaciones.orden_compra_linea_id` y la de `traspasos.orden_compra_id`.
- **Lo común** (`dominio/ordenes.ts`): leer la orden con candado y el nombre de su proveedor, sus líneas con su material, el precio vigente (el de la nota o el de la orden), la cantidad (`cantidad_demasiada`, `no_es_multiplo` con la cantidad más cercana) y la fecha prometida, lo recibido y lo que falta, el candado de sus materiales (antes que la orden), sus eventos y los folios de las órdenes abiertas que usan los candados. La versión de la orden la sube `subirVersion` del núcleo.
- **Lo recibido** lo da `inventario.recibido_de_ordenes`, que llega con Aduana en la fase 11. Mientras esa lectura no existe (`contexto.hayLectura`), nada está recibido (decisión 540).
- **Las acciones** (`acciones/ordenes.ts`, contratos en `packages/compartido/src/contratos/compras/ordenes.ts`):
  - `levantar_orden` agrupa por proveedor y busca su borrador o lo crea con un candado por proveedor: dos personas a la vez dejan un solo borrador (decisión 539). Un material que ya estaba cambia su cantidad y su precio. Avisa el precio distinto del último («Agujas 14/90: sube 4 % · antes $250»).
  - `guardar_borrador_orden` guarda lo del cajón sin bitácora, con su versión.
  - `marcar_orden_enviada` congela, copia `dias_credito` del proveedor, guarda el PDF antes de confirmar (la hoja `orden_compra` registrada y `admin.guardar_archivo` con `pdf_documento`), escribe el historial de precios (solo los que cambian, con su renglón de bitácora) y deja al proveedor entre los que surten el material (el par nace o se reactiva). Su `precios_nuevos[].precio_centavos` es opcional, para que el servidor lo recorte (decisión 544).
  - `cancelar_orden` descarta un borrador (sin fecha prometida) o cancela una enviada; una recibida en parte responde `orden_recibida_en_parte`.
  - `cerrar_orden_con_faltante`, solo la recibida en parte, con su motivo y quién.
- **Las internas** (`internas/ordenes.ts`): `recalcular_estado_orden`, `cerrar_orden_pagada` (sin quién: la cerró el sistema), `reabrir_orden_pagada` (solo la cerrada sin quién) y `registrar_precios_nota`. Las usan Aduana y Contaduría; se prueban directo.
- **Las lecturas** (`lecturas/ordenes.ts`): `ordenes_por_recibir`, sin precios, con lo que falta, la llegada esperada (si ya pasó la fecha, hoy más `compras.dias_espera_orden_atrasada`) y los días de atraso; y `precio_vigente_lineas`, para el costo de los rollos.
- **Los parámetros** `compras.cantidad_maxima_linea`, `compras.dias_max_fecha_prometida` y `compras.dias_espera_orden_atrasada` (`parametros.ts`).
- **Pruebas:** `acciones/levantar-orden.prueba.ts` (con dos a la vez, cinco rondas), `marcar-orden-enviada.prueba.ts` (con el simulador de R2; el PDF que falla deja el borrador), `cancelar-orden.prueba.ts`, `cerrar-orden-con-faltante.prueba.ts`, `internas/cerrar-orden-pagada.prueba.ts` (también `recalcular_estado_orden`), `reabrir-orden-pagada.prueba.ts`, `registrar-precios-nota.prueba.ts` y `lecturas/ordenes-por-recibir.prueba.ts`. Las que no prueban el envío ponen el estado de la orden en la base con `ordenEnEstado` (`nucleo/pruebas/compras-de-prueba.ts`). La hoja se prueba con la de prueba del módulo de prueba, que falla a propósito (decisión 542).

**Fase 10, cierre.** Aduana recibe el aviso en vivo de `ordenes_compra` (no el de sus líneas, que llevan precios) y vuelve a leer con `compras.ordenes_por_recibir` (decisión 556). Al enviar y al capturar la nota, los materiales de la orden se bloquean en el orden de su id antes que la orden, como al levantarla (materiales y luego el borrador), y el que cambió sube su versión con `material.cambiado` (decisión 558). Lo recibido y lo que falta van en milésimos con las ayudas del paquete compartido (`aMilesimosConSigno`, `deMilesimos` y `cantidadEnTexto`). El ámbar del aviso de precio (`compras.umbral_cambio_precio_pct`) llega con el cajón Levantar orden en la fase 19.

**Fase 11, parte 1.** Lo recibido lo da `inventario.recibido_de_ordenes`, con su forma nueva (`lineas` y `recepciones`). `compras.ordenes_por_recibir` regresa también el id del proveedor y, por línea, su tipo y si se cuenta entera, para que Aduana reciba sin preguntar a Compras otra vez.

**Fase 17, parte 1.** `compras.ordenes_para_factura` (`lecturas/ordenes.ts`) regresa, por orden, su folio, su estado, su proveedor con su tercero y sus días de crédito, y por línea su material, su unidad y lo pedido. Además bloquea las órdenes en orden de id (`FOR UPDATE` solo de `ordenes_compra`): así Contaduría captura, revisa, cancela y paga las facturas de una orden una a la vez (decisión 698). `cerrar_orden_pagada` la llama `contaduria.pagar_cuenta_por_pagar`; la prueba `contaduria/acciones/pagar-cuenta-por-pagar.prueba.ts` la cierra con dos pagos a la vez.

**Fase 17, parte 2.** `reabrir_orden_pagada` la llaman `contaduria.cancelar_pago` y `contaduria.cancelar_compensacion` cuando una factura de la orden deja de estar pagada; esa acción deja el renglón «{OC} vuelve a Recibida: se canceló su pago» con su clave. La prueba `contaduria/acciones/pagar-cuenta-por-pagar.prueba.ts` lo revisa.
