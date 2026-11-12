# Recepción del taller

> **Qué cubre:** cómo entra a Aduana lo que termina el taller: el lote revisado y el reproceso aprobado, contados a ciegas; el reparto por talla y destino en sus A-; el consumo de los avíos; y lo que se queda en el Taller cuando no cuadra.
> **Estado:** Decidido.
> **Se construye en:** [fase 14 ●](../../fases/14-inventario-recepcion-del-taller-conteos-ajustes-y-reabasto.md).
> **Se conecta con:** [traspasos](traspasos.md) · [recepciones en aduana](recepciones-en-aduana.md) · [libro de movimientos](libro-de-movimientos.md) · [reservas](reservas.md) · [diferencias, ajustes y mermas](diferencias-ajustes-y-mermas.md) · [entregas a corte](entregas-a-corte.md) · [surtido y despachos](surtido-y-despachos.md) · [existencias y cuadre](existencias-y-cuadre.md) · [lotes](../produccion/lotes.md) · [corte y bultos](../produccion/corte-y-bultos.md) · [revisión de lotes](../calidad/revision-de-lotes.md) · [variantes, códigos y etiquetas](../catalogo/variantes-codigos-y-etiquetas.md) · [pedidos](../ventas/pedidos.md) · [pantallas de Aduana](../../interfaz/fabrica/aduana.md) · [cambios a un pedido en producción](../produccion/cambios-a-pedido.md) · [pantallas de Bodega](../../interfaz/fabrica/bodega.md) · [pantallas de Calidad](../../interfaz/fabrica/calidad.md) · [etiquetas](../../impresos/etiquetas.md)

## Para qué sirve

Lo que hace el taller no es inventario de nadie hasta que Aduana lo cuenta. Ejemplo: Calidad revisó el L-2026-124, 60 playeras polo para la Tienda 1, y aprobó 58; las 2 rechazadas son el reproceso L-2026-124-R1. Aduana abre «Recibir del taller», cuenta talla por talla sin ver lo aprobado y llegan 58: nace el A-21, `lote_reabasto`, en aduana para la Tienda 1, con sus etiquetas por imprimir; los botones que Bodega entregó para el lote salen del Taller y el lote queda en aduana. Cuando Calidad aprueba el R1, Aduana lo cuenta igual y sus 2 piezas van a la Tienda 1 en su propio A-.

## Reglas

1. **Solo Aduana mueve piezas del Taller a Aduana,** y solo con estas dos acciones; lo que el Taller trae después de la recepción entra cuando Bodega aclara su DF- como `llego` (ver [diferencias, ajustes y mermas](diferencias-ajustes-y-mermas.md#cómo-se-aclara-una-de-recepción)). El «Aprobar» de Calidad no mueve inventario: el lote y el reproceso se quedan en el Taller hasta que Aduana los cuenta.
2. **Se recibe un lote revisado o un reproceso aprobado** (`listo`), una sola vez.
3. **A ciegas:** Aduana escribe lo que contó de cada talla, aunque sea 0, sin ver lo que aprobó Calidad. Lo aprobado viaja solo al servidor, que lo guarda como lo esperado; la diferencia no detiene la recepción.
4. **El reparto por talla y destino:**

   | Destino del lote | A dónde va cada talla | Tipo del A- | Reserva en Aduana | Desde |
   |---|---|---|---|---|
   | Una tienda | Todo a su tienda | `lote_reabasto` | — | Fase 14 |
   | Temporada (también el lote de un pedido cancelado) | Todo a Bodega | `lote_temporada` | — | Fase 14 |
   | Un pedido | Primero lo que le falta al pedido en esa talla, al cliente; lo demás a Bodega: hasta `piezas_a_bodega` como `quitado_de_pedido` y el resto como `excedente_pedido` | `lote_cliente`, `quitado_de_pedido`, `excedente_pedido` | `pedido_externo`, por lo del cliente | Fase 16 |
   | Un pedido especial de tienda | Todo a su tienda | `lote_pedido_especial` | `pedido_especial_tienda` | Con el POS |

   Lo que le falta al pedido (lo pedido − lo entregado − lo que va en nota − lo listo en aduana − lo que le aparta Bodega o viene en camino para él) lo da Ventas con `ventas.avance_pedido` (ver [pedidos](../ventas/pedidos.md#el-avance-la-etapa-y-la-alerta)). Un reproceso lleva el mismo reparto que su lote, en traspasos de tipo `reproceso`.
5. **Un A- por destino:** nace `en_aduana`, del Taller a su destino, con su lote (o su reproceso), `llego_aduana_en` = ahora, `fecha_salida_esperada` = la entrega del lote y sus etiquetas por imprimir: las de prenda de cada pieza, que Aduana imprime ahí (ver [variantes, códigos y etiquetas](../catalogo/variantes-codigos-y-etiquetas.md), regla 7, y [surtido y despachos](surtido-y-despachos.md)).
6. **Lo que no cuadra se queda en el Taller,** a cargo del Taller: por cada talla en que lo contado no es lo aprobado nace una DF- `recepcion_taller`, con el lote y la recepción. Lo que faltó sigue en el Taller; lo que sobró sale igual y el Taller queda en negativo en ese lote. Cómo se aclara está en [diferencias, ajustes y mermas](diferencias-ajustes-y-mermas.md#cómo-se-aclara-una-de-recepción): lo que llega después entra con este mismo reparto.
7. **Los avíos se consumen al recibir el lote:** salen del Taller los avíos que su entrega a corte pasó al Taller, por lo que se entregó y con el lote. La tela no, ninguna: esa la cierra el corte (ver [entregas a corte](entregas-a-corte.md)). El reproceso no consume nada.
8. **Lo que queda en el Taller de un lote recibido** son solo las piezas de sus reprocesos que Aduana no ha recibido y lo que dicen sus DF- de la recepción del taller abiertas. El cuadre de la noche lo revisa en su paso 4 (ver [diferencias, ajustes y mermas](diferencias-ajustes-y-mermas.md#el-cuadre)).

## Acciones

Las dos son de la web, con el departamento Aduana.

### `inventario.recibir_del_taller`

| | |
|---|---|
| **Pantalla** | Aduana · cajón Recibir del taller · «Recibir en aduana». Se abre desde Recepción · Del taller o desde la tarjeta del lote en «Entra» |
| **Recibe** | `lote_id`<br>`tallas`: una por cada talla que revisó Calidad, con `variante_id` y `piezas` (entero de 0 a 9999) |
| **Reglas y errores** | `400` en `campos`: «Cuenta esta talla, aunque sea 0» (una talla sin número) · «Número entero»<br>`422 lote_no_revisado`: «{lote} todavía no lo revisa Calidad.»<br>`422 lote_ya_recibido`: «{lote} ya se recibió en aduana.» |
| **Escribe** | Todo lo hace `inventario.registrar_entrada_del_taller` |
| **Llama** | `produccion.lote_para_aduana` · `calidad.aprobadas_del_lote` · `inventario.registrar_entrada_del_taller` · `produccion.marcar_lote_en_aduana`, con la recepción |
| **Regresa** | La recepción y sus A-. «{lote} en aduana: {n} piezas para {destino}» y, si no cuadró con lo aprobado, «. Faltaron {n} contra lo que aprobó calidad: queda por aclarar a cargo del taller» (o «. Sobraron {n}…») |
| **Eventos** | `recepcion.del_taller` · `traspaso.en_aduana`, uno por A-: sus etiquetas quedan por imprimir · `diferencia.creada`, si hubo · `lote.en_aduana`, de Producción |
| **Bitácora** | «Recibió {lote}», con las piezas por talla, los destinos y las diferencias en `despues` |

### `inventario.recibir_reproceso`

| | |
|---|---|
| **Pantalla** | Aduana · cajón Recibir lo que viene en camino, abierto en un reproceso «{lote}-R{n}» · «Recibir lo contado». Sale en Recepción · Del taller |
| **Recibe** | `reproceso_id` · `piezas` (entero de 0 a 9999): un reproceso es de una sola talla |
| **Reglas y errores** | `400`: «Escribe cuántas llegaron, aunque sea 0.»<br>`422 reproceso_no_listo`: «{reproceso} todavía no lo aprueba Calidad.»<br>`422 reproceso_ya_recibido`: «{reproceso} ya se recibió.» |
| **Escribe** | Todo lo hace `inventario.registrar_entrada_del_taller` |
| **Llama** | `calidad.reproceso_para_aduana` · `produccion.lote_para_aduana` · `inventario.registrar_entrada_del_taller` |
| **Regresa** | «{reproceso} en aduana: {n} piezas para {destino}» y, si no cuadró, «. Faltaron {n} contra lo que aprobó calidad: queda por aclarar a cargo del taller» (o «. Sobraron {n}…») |
| **Eventos** | `recepcion.del_taller` · `traspaso.en_aduana` · `diferencia.creada`, si hubo |
| **Bitácora** | «Recibió {reproceso}», con las piezas, el destino y la diferencia |

## Acciones internas

### `inventario.registrar_entrada_del_taller`

| | |
|---|---|
| **La llaman** | `inventario.recibir_del_taller` e `inventario.recibir_reproceso`. Ningún otro módulo mueve piezas del Taller a Aduana |
| **Recibe** | `origen` (`lote` o `reproceso`) · el lote, su destino y su entrega · la revisión o el reproceso · lo aprobado y lo contado por talla |
| **Escribe** | La recepción `aduana_del_taller`, modo `ciego`, en Aduana, con el lote y la revisión o el reproceso; por talla, lo aprobado como esperado y lo contado. Los A- de la regla 5, con el reparto de la regla 4. El movimiento `recepcion_taller` (o `recepcion_reproceso`), del Taller a Aduana: un renglón por talla y destino, con su A- y el lote. Solo en un lote, el movimiento `consumo_avios`, del Taller a Fuera (regla 7). Una DF- por talla que no cuadró (regla 6) |
| **Llama** | `admin.tomar_folio` (`partida_aduana`) |
| **Regresa** | La recepción, sus A- y sus DF- |

## Parámetros

Ninguno propio.

## Permisos

- Recibir del taller y los reprocesos: Aduana.
- Aduana nunca recibe lo que aprobó Calidad antes de contar: ni la pantalla ni un error lo dicen.

## Eventos

`recepcion.del_taller`. Los de los A- y las DF- los guarda la acción, como dicen sus archivos.

## Lo que llega después

- **Fase 16:** el reparto de un lote de pedido, con lo que le falta al pedido (lo da Ventas) y su reserva `pedido_externo` en Aduana (ver [pedidos](../ventas/pedidos.md)); también el de sus reprocesos.
- **Fase 19:** Recepción · Del taller y los cajones de Aduana.
- **Fase 20:** la etiqueta de prenda que se imprime al recibir.
- **Con el POS:** el lote de un pedido especial de tienda, con su reserva `pedido_especial_tienda`.

## Cómo está hecho

**Fase 14, parte 2.** En `modulos/inventario/`:

- **Las acciones** `recibir_del_taller` y `recibir_reproceso` (`acciones/recibir-del-taller.ts`, contratos en `packages/compartido/src/contratos/inventario/taller.ts`). Cada una toma primero un candado por lote o por reproceso y la base cuida que se reciban una sola vez (decisión 643). El lote se lee con `produccion.lote_para_aduana` y lo aprobado con `calidad.aprobadas_del_lote`; cada talla de la revisión va una vez, aunque sea 0, y ninguna otra (`400` en `tallas`). El reproceso se lee con `calidad.reproceso_para_aduana`. Después del lote, `produccion.marcar_lote_en_aduana`. Lo que regresan dice cuántas piezas para quién y cuántas faltaron o sobraron, nunca lo aprobado.
- **La interna** `registrar_entrada_del_taller` (`internas/entrada-del-taller.ts`): la recepción `aduana_del_taller`, modo `ciego`, con lo aprobado como esperado; el A- de su destino con lo que llegó (ninguno si no llegó nada, decisión 642), `en_aduana`, con su lote, su recepción y la fecha de entrega del lote como salida esperada; el movimiento `recepcion_taller` o `recepcion_reproceso` por talla, con el A- y el lote; en un lote, `consumo_avios` por lo que sus entregas a corte pasaron sin rollo; y una DF- `recepcion_taller` por talla que no cuadró. El reparto (`dominio/taller.ts`) manda lo de una tienda a su tienda (`lote_reabasto`) y lo de temporada a Bodega (`lote_temporada`), y un reproceso en un A- `reproceso` al mismo destino; el de un lote de pedido llega con la fase 16 (decisión 641).
- **«Imprimir etiquetas»** de un lote o un reproceso recibido es `inventario.marcar_etiquetas_impresas` (fase 11), con el tipo de prueba hasta la fase 20.
- **Lo que llega después** de una DF- del taller entra con el mismo reparto (decisión 644).
- **Pruebas:** `acciones/recibir-del-taller.prueba.ts` (a ciegas con sus A-, su DF- y sus avíos; lo que no deja recibir; dos a la vez; el reproceso y sus etiquetas; lo que llega después) y, en `internas/correr-cuadre.prueba.ts`, el paso 4 con un lote recibido.

**Fase 16, parte 3.** El reparto (`dominio/taller.ts`) regresa sus partes, una por A-, cada una con su tipo, su destino y sus piezas por talla:

- **Un lote de pedido:** con el candado de las variantes puesto, lee lo que le falta al pedido de cada talla con `ventas.avance_pedido` (`falta`). De cada talla, hasta eso va al cliente en un A- `lote_cliente` con destino el cliente externo y el pedido; de lo demás, hasta `piezas_a_bodega` del lote, menos lo que ya salió de ese lote como `quitado_de_pedido`, va a Bodega como `quitado_de_pedido`, y el resto como `excedente_pedido` (decisión 684). Un reproceso lleva el mismo reparto en dos A- `reproceso`: lo del cliente y lo de Bodega.
- **La interna** crea un A- por parte (`crearPartesDelReparto`), escribe un solo movimiento con un renglón por talla y destino, y después aparta lo del cliente en Aduana: una reserva `pedido_externo` por talla, ligada a su A- (`apartarLoDelCliente`). El mensaje nombra los destinos unidos: «… piezas para PE-0042 y Bodega».
- **Lo que llega después** de una DF- del taller entra con el mismo reparto, en un A- por parte (decisión 685).
- **Pruebas:** en `acciones/recibir-del-taller.prueba.ts`, el lote de un pedido: lo que le falta va al cliente apartado en Aduana, lo demás a Bodega como quitado y excedente, y lo que llega después y su reproceso con el mismo reparto.
