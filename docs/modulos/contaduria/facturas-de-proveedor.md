# Facturas de proveedor

> **Qué cubre:** la factura o nota FP- de un proveedor, tal como llegó, y sus tres puntas: lo pedido, lo recibido y lo facturado; cuándo queda conciliada o detenida y quién responde; los precios de la nota que corrigen la orden; cancelarla; la nota de crédito del proveedor que aclara la diferencia; y lo que Compras lee de la facturación de su orden.
> **Estado:** Decidido.
> **Se construye en:** [fase 17 ●](../../fases/17-contaduria-por-pagar-facturas-gastos-y-nomina.md).
> **Se conecta con:** [cuentas por pagar](cuentas-por-pagar.md) · [terceros y deudas](terceros-y-deudas.md) · [órdenes de compra](../compras/ordenes-de-compra.md) · [proveedores y precios](../compras/proveedores-y-precios.md) · [recepciones en aduana](../inventario/recepciones-en-aduana.md) · [material en bodega](../inventario/material-en-bodega.md) · [autorizaciones](../direccion/autorizaciones.md) · [archivos](../admin/archivos.md) · [folios](../admin/folios.md) · [pantallas de Contaduría](../../interfaz/fabrica/contaduria.md) · [pantallas de Compras](../../interfaz/fabrica/compras.md) · [contador y cuadres](contador-y-cuadres.md)

## Para qué sirve

No se paga lo que no llegó. Ejemplo: Textiles Aurora manda su factura A-1182 por $46,400 ($40,000 más IVA) de la OC-0222. Contaduría la captura: lo recibido en aduana de esa orden, al precio vigente, vale $40,000, así que queda conciliada y su cuenta por pagar, por pagar. Si hubiera cobrado $40,000 cuando solo llegaron $32,000, quedaría detenida, a cargo de Contaduría: «La factura dice $40,000 sin IVA y lo recibido suma $32,000». Si la nota dice que el metro de gabardina cuesta $82 y no $78, ese precio pasa a la orden y al costo de sus rollos.

## Reglas

1. **La factura no cambia:** su monto es el que llegó. Lleva su folio FP-, el folio del proveedor (único por proveedor entre las no canceladas), su fecha, su subtotal, su IVA y su total (subtotal + IVA = total), y, si se tienen, el UUID del CFDI, su XML y su PDF o foto.
2. **Cubre una o varias órdenes** del mismo proveedor, enviadas o recibidas, con lo que toca a cada una sin IVA; juntas suman el subtotal. Una orden puede tener varias facturas.
3. **Los precios de la nota primero:** si la nota cobra otro precio por una línea, se guarda en Compras como el vigente, «según la nota», y corrige el costo de sus rollos (ver [proveedores y precios](../compras/proveedores-y-precios.md)). Avisa si sube o baja `compras.umbral_cambio_precio_pct` (15 %) o más.
4. **El valor recibido de una orden** es, por línea, lo recibido en aduana menos lo devuelto al proveedor, por su precio vigente, menos lo que ya cubren las otras facturas no canceladas de esa orden capturadas antes. Así las tres puntas comparan cantidades, no precios. Aduana nunca lo recibe.
5. **Las tres puntas:** si de alguna orden no ha llegado nada, queda detenida a cargo de Aduana («Ya facturaron y la mercancía no ha llegado a aduana»); si lo facturado de una orden pasa de su valor recibido, detenida a cargo de Contaduría («La factura dice {subtotal} sin IVA y lo recibido suma {recibido}»); si no, conciliada. Una factura menor que lo recibido no se detiene: puede ser parcial.
6. **Cada vez que cambia lo recibido de una orden** (al recibirla en aduana o cuando Dirección rechaza lo recibido de más) se vuelven a revisar sus facturas detenidas y conciliadas sin pagos. Las que tienen pagos o ya se autorizaron no cambian: si dejaron de cuadrar, avisan a Contaduría.
7. **Se cancela** con motivo, solo detenida o conciliada y sin pagos; su cuenta por pagar se cancela con ella, las facturas de esas órdenes capturadas después vuelven a revisarse y los precios de su nota se quedan en Compras.
8. **La diferencia por aclarar** de una factura que Dirección autorizó pagar por lo recibido queda abierta hasta que llega la nota de crédito del proveedor.

## Estados

| De | A | Qué pasa | Quién |
|---|---|---|---|
| — | `conciliada` o `detenida` | «Guardar» en «Capturar nota o factura», según sus tres puntas | Contaduría |
| `detenida` | `conciliada` | Una recepción la hace cuadrar | La API |
| `conciliada` | `detenida` | Dirección rechaza lo recibido de más y la factura queda cobrando de más, sin pagos | La API |
| `detenida` (a cargo de Contaduría) | `esperando_autorizacion` | «Pagar lo recibido» (ver [cuentas por pagar](cuentas-por-pagar.md)) | Contaduría |
| `esperando_autorizacion` | `autorizada` · `detenida` | Dirección autoriza o rechaza | Dirección |
| `detenida` · `conciliada` | `cancelada` | «Cancelar factura», sin pagos | Contaduría |

## La tabla `facturas_proveedor`

| Columna | Tipo | Nulo | Qué es |
|---|---|---|---|
| `id` | uuid | no | Llave |
| `folio` | text | no | FP-8841 (contador `factura_proveedor`). Único |
| `folio_proveedor` | text | no | El de su factura, de 3 a 12, en mayúsculas. Único con `proveedor_id` entre las no canceladas |
| `uuid_cfdi` | text | sí | Único donde no es nulo |
| `proveedor_id` · `tercero_id` | uuid | no | El proveedor y su tercero |
| `fecha_captura` · `fecha_factura` | date | no · sí | Cuando se capturó y la que dice el documento (nunca futura) |
| `subtotal_centavos` · `iva_centavos` · `total_facturado_centavos` | bigint | no | CHECK: subtotal > 0, IVA ≥ 0 y subtotal + IVA = total |
| `valor_recibido_centavos` | bigint | no | La suma de sus órdenes en la última revisión (regla 4) |
| `estado` | text | no | CHECK (`detenida`, `esperando_autorizacion`, `conciliada`, `autorizada`, `cancelada`) |
| `motivo_detencion` · `responsable_detencion` | text | sí | El motivo y a cargo de quién (`aduana` o `contaduria`). CHECK: llenos en `detenida` y `esperando_autorizacion` |
| `autorizacion_id` | uuid | sí | → `autorizaciones.id`: la última «Pago fuera de lo normal» |
| `monto_autorizado_centavos` · `diferencia_por_aclarar_centavos` | bigint | sí | Lo autorizado y total − autorizado. CHECK: llenos en `autorizada`, y autorizado ≤ total |
| `nota_credito_proveedor` · `diferencia_aclarada_en` · `diferencia_aclarada_por` · `diferencia_aclarada_archivo_id` | | sí | La nota de crédito del proveedor que aclaró la diferencia |
| `archivo_xml_id` · `archivo_pdf_id` | uuid | sí | → `archivos.id` |
| `cancelado_en` · `cancelado_por` · `motivo_cancelacion` | | sí | CHECK: llenos en `cancelada` |

Lleva las columnas comunes (ver [base de datos](../../cimientos/BASE-DE-DATOS.md#columnas-comunes)). **Índices:** único (`folio`) · único (`proveedor_id`, `folio_proveedor`) donde no está cancelada · único (`uuid_cfdi`) donde no es nulo · (`estado`). Con esta tabla deja su `@llavePendiente` `autorizaciones.factura_proveedor_id`.

## La tabla `factura_proveedor_ordenes`

| Columna | Tipo | Nulo | Qué es |
|---|---|---|---|
| `id` | uuid | no | Llave |
| `factura_proveedor_id` | uuid | no | → `facturas_proveedor.id` |
| `orden_compra_id` | uuid | no | → `ordenes_compra.id`. Único con la factura |
| `importe_facturado_centavos` | bigint | no | CHECK > 0. Lo de esta orden, sin IVA |
| `valor_recibido_centavos` | bigint | no | Regla 4, en la última revisión |
| `sin_recepcion` | boolean | no | Si de esta orden no había llegado nada |

Lleva las columnas comunes. **Índice:** (`orden_compra_id`).

## Acciones

Todas son de la web, con el departamento Contaduría.

### `contaduria.capturar_factura_proveedor`

| | |
|---|---|
| **Pantalla** | Cuentas por pagar · «Capturar factura» → ventana «Capturar nota o factura» · «Guardar»; también Compras · la orden · «Capturar nota o factura», con la orden ya escogida |
| **Recibe** | `ordenes`: al menos una, con `orden_compra_id` e `importe_sin_iva_centavos` (con una sola, es el subtotal) · `folio_proveedor` · `fecha_factura`, opcional · `subtotal_centavos` · `iva_centavos` · `total_centavos` · `uuid_cfdi`, opcional · `archivo_xml_id` y `archivo_pdf_id`, opcionales (ver [archivos](../admin/archivos.md)) · `precios_nota`, opcional: `orden_compra_linea_id` y `precio_centavos`, solo las líneas que cambian |
| **Reglas y errores** | `400`: «Escribe el folio» · «Escribe el total en pesos» · «Escribe el precio.» · «La fecha de la factura no puede ser futura»<br>`422 orden_no_facturable`: «{OC} está en borrador o cancelada: no se le captura factura.»<br>`422 ordenes_de_otro_proveedor`: «Todas las órdenes deben ser del mismo proveedor.»<br>`422 folio_repetido`: «{proveedor} ya tiene la factura {folio}: es {FP}.»<br>`422 total_no_suma`: «Subtotal más IVA no da el total: revisa los tres.»<br>`422 importes_no_suman`: «Lo de cada orden suma {suma} y el subtotal es {subtotal}.»<br>`422 linea_de_otra_orden`: «Ese material no es de las órdenes escogidas.»<br>`422 uuid_repetido`: «Ese UUID ya está en {FP}.»<br>`422 archivo_invalido`: «El archivo debe ser PDF, imagen o XML.»<br>Aviso por línea que no detiene: «{material}: sube {n} % · antes ${precio}» (o «baja») |
| **Escribe** | Primero, los precios de la nota (regla 3). Después, la factura con sus tres puntas, su estado, su motivo y su responsable; sus órdenes con lo de cada una y su valor recibido; y su cuenta por pagar, `por_pagar` o `detenida`, con su vencimiento (ver [cuentas por pagar](cuentas-por-pagar.md#reglas)) e importe = saldo = total |
| **Llama** | `compras.ordenes_para_factura` · `compras.registrar_precios_nota` · `compras.precio_vigente_lineas` · `inventario.recibido_de_ordenes` · `admin.tomar_folio` (`factura_proveedor`) · `admin.ligar_archivo` |
| **Regresa** | «{FP} conciliada con la orden y la recepción» o «{FP} registrada con diferencias: pago detenido» y, con precios nuevos, «. Precio nuevo: {material} a ${precio}» |
| **Eventos** | `factura_proveedor.capturada` · `factura_proveedor.detenida`, si nació detenida |
| **Bitácora** | «Capturó la factura {FP} de {proveedor}» y, con la misma clave, un renglón por precio nuevo: «Precio de {material} con {proveedor}: ${antes} → ${nuevo} ({OC}, según la nota)» |

### `contaduria.cancelar_factura_proveedor`

| | |
|---|---|
| **Pantalla** | «Cancelar factura» en la tarjeta del pago detenido y en Facturas de proveedor (pantalla nueva) |
| **Recibe** | `factura_proveedor_id` · `motivo` · `version` |
| **Reglas y errores** | `400` en `motivo`: «Escribe el motivo»<br>`422 factura_con_pagos`: «{FP} ya tiene pagos: no se puede cancelar.»<br>`422 factura_no_cancelable`: «Solo se cancela una factura detenida o lista para pagar.» |
| **Escribe** | La factura y su cuenta, `cancelada`; las facturas de esas órdenes capturadas después, revisadas otra vez (regla 7) |
| **Llama** | `compras.precio_vigente_lineas` · `inventario.recibido_de_ordenes` |
| **Regresa** | «{FP} cancelada» |
| **Eventos** | `factura_proveedor.cancelada` · `factura_proveedor.liberada`, las que quedan conciliadas |
| **Bitácora** | «Canceló la factura {FP} de {proveedor}: {motivo}» |

### `contaduria.registrar_nota_credito_proveedor`

| | |
|---|---|
| **Pantalla** | Cuentas por pagar · Facturas de proveedor · factura «Autorizada por dirección» · «Llegó su nota de crédito» (pantalla nueva) |
| **Recibe** | `factura_proveedor_id` · `folio_nota` (de 3 a 20) · `archivo_id`, opcional · `version` |
| **Reglas y errores** | `400`: «Escribe el folio de la nota de crédito»<br>`422 factura_no_autorizada`: «Solo una factura autorizada por Dirección tiene diferencia por aclarar.»<br>`422 diferencia_ya_aclarada`: «La diferencia de {FP} ya se aclaró con {folio}.» |
| **Escribe** | La nota de crédito del proveedor, quién, cuándo y su archivo |
| **Llama** | `admin.ligar_archivo`, si trae archivo |
| **Regresa** | «Diferencia de {FP} aclarada con {folio}» |
| **Eventos** | `factura_proveedor.diferencia_aclarada` |
| **Bitácora** | «Registró la nota de crédito {folio} de {proveedor} para {FP}» |

## Acciones internas

### `contaduria.revisar_facturas_de_orden`

| | |
|---|---|
| **La llama** | Inventario, al recibir una orden en aduana y cuando Dirección rechaza lo recibido de más (ver [recepciones en aduana](../inventario/recepciones-en-aduana.md)) |
| **Recibe** | `orden_compra_id` |
| **Reglas** | Regla 6 |
| **Escribe** | Las facturas que cambian: estado, motivo, responsable y valor recibido; sus órdenes; y sus cuentas, `detenida` o `por_pagar` |
| **Llama** | `compras.precio_vigente_lineas` · `inventario.recibido_de_ordenes` |
| **Regresa** | Las facturas que cambiaron: Aduana sigue su mensaje con «. {FP} ya se puede pagar» o «. {FP} no cuadra con lo recibido». Y si la orden se cerró porque quedó recibida con sus facturas pagadas (`orden_cerrada`), que va en el `despues` del renglón de quien llama |
| **Eventos** | `factura_proveedor.liberada` · `factura_proveedor.detenida` · el aviso a Contaduría de una ya pagada o autorizada que dejó de cuadrar |

Su bitácora va en el renglón de la acción que la llama (la recepción o la decisión de Dirección), con la misma clave: «{FP} quedó conciliada al recibir {OC}» o «{FP} quedó detenida: {motivo}».

### `contaduria.bloquear_ordenes_ligadas`

| | |
|---|---|
| **La llama** | Inventario, al recibir una orden y cuando Dirección rechaza lo recibido de más, después del candado de lo recibido y antes de tocar la orden |
| **Recibe** | `orden_compra_id` |
| **Reglas** | Bloquea, en orden de id, la orden y las demás órdenes de sus facturas no canceladas: las que `revisar_facturas_de_orden` compara juntas al final. Así sus candados van en el mismo orden que los de un pago o una captura (decisión 716) |
| **Llama** | `compras.ordenes_para_factura` |
| **Regresa** | Cuántas órdenes bloqueó |

## Lecturas

### `contaduria.facturacion_de_orden(ordenes)`

| | |
|---|---|
| **La usa** | Compras: «Esperando factura» y el cierre de la orden pagada (ver [órdenes de compra](../compras/ordenes-de-compra.md)) |
| **Regresa** | Por orden, si tiene factura no cancelada, su estado y si su cuenta quedó pagada |

## Parámetros

Ninguno propio: la marca del cambio de precio es `compras.umbral_cambio_precio_pct` (ver [proveedores y precios](../compras/proveedores-y-precios.md#parámetros)).

## Permisos

- Capturar, cancelar y registrar la nota de crédito: Contaduría. Compras captura desde su orden con el mismo permiso de Contaduría.
- Aduana nunca recibe precios, valor recibido ni importes.

## Eventos

`factura_proveedor.capturada` · `factura_proveedor.detenida` · `factura_proveedor.liberada` · `factura_proveedor.cancelada` · `factura_proveedor.diferencia_aclarada`.

## Lo que llega después

- **Fase 18:** las facturas y sus pagos en el paquete del contador (ver [contador y cuadres](contador-y-cuadres.md)).
- **Fase 19:** la ventana «Capturar nota o factura», Pagos detenidos, Facturas de proveedor y la conciliación de Compras.

## Cómo está hecho

**Fase 17, parte 1.**

- **Las tablas** `facturas_proveedor` y `factura_proveedor_ordenes` están en `apps/api/src/modulos/contaduria/tablas.ts` (migración `0058`), con sus CHECK (importes que suman, folio del proveedor de 3 a 12 en mayúsculas, motivo y responsable en `detenida` y `esperando_autorizacion`, lo autorizado y la diferencia en `autorizada`, la nota de crédito solo en una autorizada, la cancelación completa) y sus índices únicos. La misma migración pone la llave de `autorizaciones.factura_proveedor_id`.
- **Lo común** (`dominio/facturas.ts`):
  - `bloquearOrdenes` lee las órdenes con `compras.ordenes_para_factura`, que las bloquea en orden de id. El orden de los candados es órdenes, facturas en orden de id, cuentas y folio (decisión 698).
  - `recibidoDeOrdenes` da el valor recibido de cada orden: lo recibido (`inventario.recibido_de_ordenes`) por el precio vigente (`compras.precio_vigente_lineas`), redondeado al centavo.
  - `puntasDeOrdenes` encadena las facturas de cada orden en el orden en que se capturaron: cada una cubre lo suyo hasta su valor recibido (regla 4, decisión 700).
  - `tresPuntas` es la regla 5, una función pura.
  - `revisarFacturas` es la regla 6: las detenidas y conciliadas sin pagos cambian y su cuenta las sigue; las que tienen pagos, esperan o están autorizadas no cambian, y si lo recibido bajó y ya no cuadran, guardan el evento `factura_proveedor.dejo_de_cuadrar` (decisión 702).
- **Las acciones** (`acciones/facturas.ts`, contratos en `packages/compartido/src/contratos/contaduria/por-pagar.ts`):
  - `capturar_factura_proveedor` revisa los importes y las órdenes, bloquea las órdenes, pasa primero los precios de la nota a `compras.registrar_precios_nota` (que regresa el material y el aviso desde el umbral, decisión 704), toma el FP-, escribe la factura con sus órdenes, compara sus tres puntas y crea su cuenta por pagar. La bitácora lleva un renglón por precio nuevo, con la misma clave. El archivo se liga con `admin.ligar_archivo`, propósito `factura_proveedor`.
  - `cancelar_factura_proveedor` cancela la factura y su cuenta y vuelve a revisar las de sus órdenes.
  - `registrar_nota_credito_proveedor` aclara la diferencia de una autorizada, una sola vez.
- **La interna** `revisar_facturas_de_orden` (`internas/facturas.ts`) no escribe bitácora: regresa las facturas que cambiaron con su renglón. `inventario.recibir_de_proveedor` los escribe con su clave y suma a su mensaje «. {FP} ya se puede pagar» o «. {FP} no cuadra con lo recibido», sin montos. `inventario.aplicar_decision_recepcion_de_mas` los pone en el `despues` del renglón de Dirección (decisión 701).
- **La lectura** `facturacion_de_orden` (`lecturas/facturas.ts`) da, por orden, sus facturas no canceladas, sin montos.
- **Pruebas:** `acciones/capturar-factura-proveedor.prueba.ts` (las tres puntas, los precios de la nota con su bitácora y su aviso, varias órdenes, lo que se rechaza y la lectura), `internas/revisar-facturas-de-orden.prueba.ts` (recibir, recibir en parte, rechazar lo de más, una con pagos que avisa) y `acciones/cancelar-factura-proveedor.prueba.ts`. Las ayudas están en `nucleo/pruebas/por-pagar-de-prueba.ts`, con órdenes y recepciones reales.

**Cierre de la fase 17** (correcciones de la auditoría, decisión 716):

- `tresPuntas` toma de cada orden su valor recibido solo hasta lo que se le facturó: lo que llegó de más en una orden no cubre lo que falta en otra, y «Pagar lo recibido» nunca pasa del total.
- La cadena de facturas de una orden sigue el orden de sus folios FP- (`enOrdenDeCaptura`), no `creado_en`, que es la hora en que empezó la transacción y no la del candado.
- `revisarFacturas` guarda el evento y regresa el renglón también cuando cambia quién tiene la factura detenida o su motivo, no solo su estado.
- Antes de revisar, quien ya va a tocar una orden bloquea juntas, en orden de id, todas las órdenes ligadas por sus facturas (`ordenesLigadas`): la recepción y el rechazo de lo recibido de más con la interna `bloquear_ordenes_ligadas`, la cancelación y la captura con precios de la nota directo.
- Capturar con precios de la nota vuelve a revisar las demás facturas de esas órdenes, con un renglón por cada una que cambia.
- Cancelar una factura y `revisar_facturas_de_orden` llaman `alPagarse`: la orden recibida cuyas facturas no canceladas quedaron pagadas se cierra.
- El folio del proveedor y el UUID se revisan con un candado por proveedor y folio y otro por UUID: dos capturas iguales a la vez dan `folio_repetido`, no un error del servidor.
- **Pruebas:** `dominio/facturas.prueba.ts` (varias órdenes), y casos nuevos en `capturar-factura-proveedor.prueba.ts` (precios que detienen una anterior, folio repetido a la vez), `cancelar-factura-proveedor.prueba.ts` (la orden que se cierra) y `revisar-facturas-de-orden.prueba.ts` (cambia quién la tiene, la orden pagada en parte que se cierra al completarse, el pago cancelado que la vuelve a detener).
