# Glosario

> **Qué cubre:** las palabras del negocio que usan las pantallas, el código y los archivos de creación, cada una con lo que significa en Unifórmame y un ejemplo.
> **Estado:** Decidido.
> **Se construye en:** [fase 1](fases/01-repositorio-reglas-y-paquete-compartido.md).
> **Se conecta con:** [AGENTS.md](../AGENTS.md) · [CLAUDE.md](../CLAUDE.md) · [proyecto](PROYECTO.md) · [folios](modulos/admin/folios.md)

Cada palabra significa una sola cosa en todo el sistema. El código usa la misma palabra, sin acentos ni ñ (`retazo`, `apartado_tienda`). Los prefijos de folio y quién los da están en [folios](modulos/admin/folios.md).

## Lugares y piezas

| Palabra | Qué es | Ejemplo |
|---|---|---|
| **Ubicación** | Donde está una pieza, siempre con un responsable. Las del sistema: Aduana, Bodega, Tienda 1, Tienda 2, Taller, Tránsito y En camino a aduana | — |
| **Aduana** | La ubicación de paso de la fábrica: ahí se recibe, se cuenta a ciegas y se despacha. Nada entra a la fábrica ni sale de ella sin pasar por Aduana | — |
| **Bodega** | Donde se guarda la prenda terminada y el material (tela, avíos y consumibles), y de donde se surte | — |
| **Tránsito / En camino a aduana** | Las ubicaciones de lo que va de camino. Mientras viaja, la pieza sigue a cargo de quien la despachó | — |
| **En línea** | No es una ubicación: es una reserva sobre piezas que siguen en Bodega o en una tienda | — |
| **Variante** | Un producto en una talla. Tiene su código de barras de 6 dígitos, que nunca se recicla | Playera polo blanca con escudo, talla 12 · 100256 |
| **Existencia** | Cuántas piezas de una variante hay en una ubicación. Sale del libro de movimientos | — |
| **Comprometido · Disponible (libres)** | Comprometido es lo reservado; disponible es la existencia menos lo comprometido | — |
| **En diferencia** | Variante cuya existencia del sistema quedó en negativo o no cuadra. Nunca se tapa con cero | — |
| **Movimiento** | Un renglón del libro: qué variante o material, de dónde, a dónde, cuántas, de qué lote y por qué documento | — |
| **Reserva** | Piezas apartadas para un documento (pedido en línea, nota de entrega, pedido externo, apartado o pedido especial). No se mueven, pero dejan de estar disponibles | — |
| **Separada** | Pieza de un pedido en línea que la tienda ya apartó físicamente | — |
| **Mínimo** | Las piezas que una ubicación debe tener por tipo de talla (tallas de mayor venta y demás tallas). Debajo del mínimo, se propone reabasto | Bodega 30 y 12 |

## Documentos que mueven inventario

| Palabra | Qué es | Ejemplo |
|---|---|---|
| **Traspaso** | Lo que pasa de una ubicación a otra. Lo confirman los dos lados: quien despacha y quien recibe | — |
| **Partida en aduana** | Lo que Bodega manda a Aduana y lo que está parado en Aduana | A-01 |
| **Despacho** | Lo que Aduana manda a una tienda, a Bodega o a un cliente | D-0412 |
| **Reabasto** | Traspaso de Bodega a una tienda que quedó bajo su mínimo | RB-061 |
| **Solicitud de tienda** | Lo que una tienda le pide a Bodega | S-T2-052 |
| **Salida de tienda** | Lo que una tienda manda a Aduana: un pedido en línea, una prenda con defecto, un sobrante o un traspaso | E-T2-0187 |
| **Envío pedido a una tienda** | Lo que Bodega le pide a una tienda que mande, con fecha límite | SE-0012 |
| **Diferencia** | Lo que no cuadra entre lo mandado y lo recibido, a cargo de quien despachó, hasta que se aclara | DF-031 |
| **Conteo** | El conteo físico de una ubicación. Guarda lo que decía el sistema al contar | CN-024 |
| **Ajuste** | Corrige la existencia contra lo contado. Siempre pide autorización de Dirección | AJ-0046 |
| **Merma** | Pieza o material que ya no sirve y sale del inventario | MR-T1-012 |
| **Excepción** | Lo que llegó de un aparato y no cuadra. Se aplicó igual y queda en la bandeja de Bodega (o de Contaduría, si es dinero) | — |
| **Cuadre** | El proceso de cada noche que recalcula la existencia desde el libro y avisa si algo no cuadra | — |

## Tela y producción

| Palabra | Qué es | Ejemplo |
|---|---|---|
| **Rollo** | Un rollo de tela, con sus metros | R-0452 |
| **Partida** | El tono de una tela: los rollos de la misma partida son del mismo tono. Se guarda como la escribe el proveedor | P-2236 |
| **Retazo** | Lo que quedó de un rollo y todavía sirve (menos de la frontera, 15 m al inicio) | RZ-013 |
| **Avíos** | Lo que lleva la prenda además de la tela: botones, cierres, hilo, etiquetas | — |
| **Consumibles** | Material del taller que se toma desde la tablet, como agujas o aceite | — |
| **Receta** | Lo que lleva una prenda, talla por talla: medidas, tela y avíos. Tiene versiones; sin receta no se corta | — |
| **Cuenta de material** | Cuánto material lleva un lote según su receta | 190 piezas llevan 214 m |
| **Desarrollo** | Un producto nuevo: solicitud, muestra, aprobación, ficha y catálogo | DS-015 |
| **Orden de producción** | Lo que se manda a fabricar, con su motivo: cliente, reabasto, temporada o pedido especial | OP-2026-064 |
| **Lote** | Lo que se corta junto y avanza junto por el taller | L-2026-122 |
| **Corte** | Cortar la tela de un lote. Al cerrar el corte se registran los rollos de cada tela, lo que se usó según la receta, lo que quedó y los bultos; nadie mide tela | — |
| **Entrega a corte** | La tela y los avíos que Bodega entrega al taller para un lote | — |
| **Bulto** | Un grupo de piezas de un lote que viaja junto por el taller con su etiqueta | B-2026-121-03 |
| **Flujo · Operación** | El flujo es la lista ordenada de operaciones de un producto (costura, planchado, empaque…); cada operación tiene su tarifa por pieza | — |
| **Registro de operación** | Lo que la costurera marca en la tablet: qué operación hizo, en qué bulto y cuántas piezas | — |
| **El hilo** | El avance de un pedido en seis paradas: Pedido · Corte · Costura · Calidad · Aduana · Entrega | — |
| **Revisión · Rechazo · Reproceso** | Calidad revisa el lote; lo que rechaza puede regresar al taller a reproceso o irse a merma | — |
| **Reclamo** | La queja de un cliente sobre una prenda, rastreable hasta su lote y su partida | RC-031 |
| **Falla · Servicio · Hora de paro** | Una máquina que falla, lo que se le hace para arreglarla y el tiempo que estuvo parada | FM-0043 · SM-0018 |
| **Puerta del taller** | La tablet del taller: cada persona elige su nombre, mete su PIN y registra lo que hizo | — |

## Ventas y dinero

| Palabra | Qué es | Ejemplo |
|---|---|---|
| **Cliente externo** | Escuela, mayorista u otro cliente que compra con pedido | Instituto Juan Pablo II |
| **Pedido** | El pedido de un cliente externo, talla por talla. Cada cambio guarda una versión | PE-0145 |
| **Nota de entrega** | Lo que sale de Aduana para un pedido. Al confirmar la entrega nace la cuenta por cobrar | NV-0151 |
| **Nota de crédito** | Corrige una nota de entrega ya entregada | NC-0012 |
| **Lista de precios** | Los precios de un canal o de un cliente: mostrador, mayoreo, del cliente y en línea | — |
| **Tercero** | La ficha común de un cliente, un proveedor o un acreedor, en Contaduría | — |
| **Anticipo · Saldo a favor** | Lo que un cliente paga antes; lo que le sobra queda a su favor | — |
| **Tres puntas** | Orden de compra, recepción y factura del proveedor. Si no cuadran, el pago se detiene | — |
| **Paquete del contador** | Lo que Contaduría le manda cada mes al contador externo | — |
| **Pedido en línea** | Un pedido de uniformame.mx, que atiende Tienda en línea | W-1045 |

## Tiendas (proyecto del POS)

| Palabra | Qué es | Ejemplo |
|---|---|---|
| **Caja** | La computadora de una tienda que cobra. Trabaja sin internet | — |
| **Tienda sin caja** | Una tienda cuya existencia todavía no lleva Unifórmame (no ha hecho la carga inicial de su caja): Bodega le manda lo que pide y Aduana confirma su entrega con la firma de su encargada (ver [migración](MIGRACION.md#las-tiendas-sin-caja)) | — |
| **Turno · Corte de caja** | El turno abre y cierra la caja; el corte cuenta el dinero al cerrar | CT1-1010 |
| **Apartado** | Prendas que un cliente deja apartadas en tienda con un anticipo | AP-T1-0032 |
| **Pedido especial** | Lo que una tienda pide fabricar para un cliente, como una talla especial | PE-T1-0041 |
| **Sobre** | El anticipo o abono de un apartado o pedido especial. El efectivo se guarda en el sobre y entra completo al cajón el día de la entrega | — |

## El sistema

| Palabra | Qué es | Ejemplo |
|---|---|---|
| **Departamento** | Cada área del menú, de Dirección a Administración del sistema. Una cuenta ve solo los suyos | — |
| **La dueña** | La única que da y quita accesos, registra y revoca aparatos, cambia parámetros y registra restauraciones | — |
| **Persona · Cuenta** | La persona es quien trabaja (folio E-); la cuenta es su entrada con Google. Una costurera es persona sin cuenta | E-001 |
| **PIN** | Cuatro cifras con las que una persona del taller entra a la tablet | — |
| **Confirmar con Google** | Volver a entrar con Google antes de una acción delicada | — |
| **Autorización** | Lo que un departamento le pide a Dirección: un ajuste, una nota de crédito, una cuenta nueva… | AU-0028 |
| **Parámetro** | Un valor del negocio que la dueña cambia en Configuración, con su historial | Lote atorado: 2 días hábiles |
| **Dispositivo** | Un aparato registrado: la tablet, la caja de una tienda, el teléfono para escanear o el programa puente | DV-01 |
| **Puente de impresión** | El programa de la computadora de Aduana o del taller que manda las etiquetas a la Zebra | — |
| **Arranque** | El día en que la fábrica empieza a trabajar en Unifórmame, con lo que se contó ese día y lo que se cargó de las hojas de hoy (ver [migración](MIGRACION.md)) | — |
| **Bitácora** | Quién hizo qué y cuándo, con lo que había antes y lo que quedó. Solo crece | — |
| **Pendientes** | La primera pestaña de cada departamento: sus indicadores y su cola de trabajo | — |
| **Cajón · Ventana · Aviso** | El panel que entra por la derecha; el recuadro al centro para confirmar; el mensaje que sale abajo unos segundos | — |
