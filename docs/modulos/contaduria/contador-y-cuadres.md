# Contador y cuadres

> **Qué cubre:** el paquete de cada mes para el contador externo (qué lleva, cuándo nace, cómo se congela al mandarlo y su archivo), los documentos que el contador regresa, lo que el paquete mandado ya no deja cambiar, el cuadre de saldos de cada noche y el resumen de saldos que lee Dirección.
> **Estado:** Decidido.
> **Se construye en:** [fase 18](../../fases/18-tienda-en-linea-direccion-y-contador.md).
> **Se conecta con:** [cuentas por cobrar](cuentas-por-cobrar.md) · [cuentas por pagar](cuentas-por-pagar.md) · [pagos y saldo a favor](pagos-y-saldo-a-favor.md) · [anticipos](anticipos.md) · [terceros y deudas](terceros-y-deudas.md) · [gastos](gastos.md) · [nómina](nomina.md) · [facturas de proveedor](facturas-de-proveedor.md) · [alertas e indicadores](../direccion/alertas-e-indicadores.md) · [archivos](../admin/archivos.md) · [avisos](../admin/avisos.md) · [existencias y cuadre](../inventario/existencias-y-cuadre.md) · [pantallas de Contaduría](../../interfaz/fabrica/contaduria.md)

## Para qué sirve

El contador recibe cada mes lo mismo, ya sumado, y lo que se le mandó no cambia después. Ejemplo: el 1 de noviembre nace el paquete de octubre, «Por enviar», que vence el 17. El día 12 Contaduría lo revisa: cobranza a clientes $184,300, anticipos recibidos $40,000, pagos a proveedores y acreedores $152,600, nómina de 4 semanas $96,420 y los gastos por categoría. Aprieta «Marcar como enviado»: los renglones se congelan, se arma el ZIP con la relación y los comprobantes, y desde ese momento ningún pago, compensación ni gasto de octubre se cancela. Un recibo de luz de octubre que llega el 20 sale en el paquete de noviembre, «de meses anteriores».

## Reglas

1. **Un paquete por mes.** Nace «Por enviar» el día 1 del mes siguiente y vence el día `contaduria.contador_dia_limite` (17) de ese mes.
2. **Mientras no se manda, se calcula al momento** con la tabla de abajo; al marcarlo enviado, sus renglones se congelan y ya no cambian.
3. **El mes de cada cosa** es su fecha: la del pago, la del renglón del anticipo, la de la aplicación a una cuenta por pagar y la del gasto. La nómina entra en el mes en que se pagó.
4. **Un gasto que llega tarde** (con fecha de un mes ya mandado) sale en el siguiente paquete, en su categoría y marcado «de meses anteriores». Cada gasto sale en un solo paquete.
5. **Lo mandado no se toca:** ya no se cancela un pago ni una compensación del mes de un paquete mandado, ni un gasto que ya salió en uno (`paquete_ya_enviado`).
6. **Si al mandarlo una semana que terminó en el mes sigue sin pagarse,** se avisa: esa nómina sale en el paquete del mes en que se pague.
7. **El contador regresa documentos** (declaraciones, acuses, facturas y otros), que se guardan con su tipo y, si se sabe, su mes y su paquete.
8. **Cada noche se cuadran los saldos:** el saldo guardado de cada cuenta por cobrar y por pagar debe ser su importe menos sus aplicaciones vigentes, y ningún anticipo disponible ni saldo a favor puede quedar negativo. Lo que no cuadra no se corrige solo: avisa a la dueña.

## Lo que lleva el paquete

| Concepto | Qué suma | Cómo entra |
|---|---|---|
| `cobranza_clientes` | Los pagos recibidos de clientes a sus notas | Ingreso |
| `anticipos_recibidos` | Los pagos recibidos a pedidos | Ingreso (dinero del cliente) |
| `anticipos_aplicados` | Los anticipos que se descontaron de una nota | Informativo |
| `ventas_tiendas` · `anticipos_tiendas` | Los cortes de caja de las tiendas y los anticipos que se quedaron | Ingreso. En 0 hasta el POS |
| `ventas_en_linea` · `comisiones_pasarela` · `reembolsos_en_linea` | Los depósitos de la pasarela | Ingreso y egresos. En 0 hasta la pasarela |
| `devoluciones_saldo_favor` | Los pagos emitidos que regresan saldo a favor | Egreso |
| `pagos_proveedores_acreedores` | Lo abonado a cuentas por pagar: pagos emitidos, depósitos de clientes a terceros y compensaciones | Egreso |
| `nomina` | Las nóminas pagadas, con cuántas semanas | Egreso |
| `gasto` | Los gastos no cancelados, uno por categoría (con «Reparación de máquinas»), y aparte los de meses anteriores | Egreso |

Cada renglón lleva cuántos documentos cubre. Todo sale de los renglones vigentes de cada tabla de Contaduría; la cuenta vive como función pura en `modulos/contaduria/dominio/`, y la usan «Marcar como enviado» y la consulta del paquete (fase 19).

**El paquete no valúa el inventario:** eso es del contador. Cada compra guarda su precio, y él usa el método que quiera.

## La tabla `paquetes_contador`

| Columna | Tipo | Nulo | Qué es |
|---|---|---|---|
| `id` | uuid | no | Llave |
| `mes` | date | no | El primer día del mes que cubre. Único |
| `fecha_limite` | date | no | Regla 1 |
| `estado` | text | no | CHECK (`por_enviar`, `enviado`). default `por_enviar` |
| `enviado_en` · `enviado_por` | timestamptz · uuid | sí | CHECK: llenos en `enviado` |
| `archivo_id` | uuid | sí | → `archivos.id`: el ZIP, cuando se arma |

Lleva las columnas comunes (ver [base de datos](../../cimientos/BASE-DE-DATOS.md#columnas-comunes)). **Índices:** único (`mes`). Con esta tabla deja su `@llavePendiente` `gastos.paquete_contador_id`.

## La tabla `paquete_contador_renglones`

Las cifras del paquete, congeladas al mandarlo.

| Columna | Tipo | Nulo | Qué es |
|---|---|---|---|
| `id` | uuid | no | Llave |
| `paquete_contador_id` | uuid | no | → `paquetes_contador.id` |
| `concepto` | text | no | CHECK con los conceptos de la tabla de arriba |
| `categoria_id` | uuid | sí | → `lista_valores.id`, de «Categorías de gasto». CHECK: lleno solo en `gasto` |
| `de_meses_anteriores` | boolean | no | default false. Solo en `gasto` (regla 4) |
| `monto_centavos` | bigint | no | CHECK ≥ 0. El concepto dice si suma o resta |
| `documentos` | integer | no | Cuántos pagos, renglones, semanas o gastos cubre |

Lleva las columnas comunes. **Índices:** único (`paquete_contador_id`, `concepto`, `categoria_id`, `de_meses_anteriores`).

## La tabla `documentos_contador`

| Columna | Tipo | Nulo | Qué es |
|---|---|---|---|
| `id` | uuid | no | Llave |
| `archivo_id` | uuid | no | → `archivos.id`, propósito `documento_contador`. Único |
| `nombre` | text | no | El nombre con que se subió |
| `tipo` | text | no | CHECK (`declaracion`, `acuse`, `facturas`, `documento`). default `documento` |
| `mes` | date | sí | El primer día del mes al que se refiere, si se sabe |
| `paquete_contador_id` | uuid | sí | → `paquetes_contador.id`, si responde a un paquete |
| `llego_en` | date | no | default hoy |

Lleva las columnas comunes. **Índices:** (`mes`) · (`paquete_contador_id`).

## Acciones

Las dos son de la web, con el departamento Contaduría.

### `contaduria.marcar_paquete_enviado`

| | |
|---|---|
| **Pantalla** | Pendientes y Contador externo · «Preparar paquete» → ventana «Paquete de {mes}» · «Marcar como enviado» |
| **Recibe** | `paquete_contador_id` · `version` |
| **Reglas y errores** | `422 paquete_ya_enviado`: «El paquete de {mes} ya se mandó el {fecha}.»<br>Aviso que no detiene: «La nómina del {semana} sigue por pagar: no entra en este paquete» (regla 6) |
| **Escribe** | El paquete, `enviado`, con quién y cuándo; sus renglones, con la cuenta del mes congelada; y en cada gasto que entró, su paquete |
| **Regresa** | «Paquete de {mes} enviado al contador» |
| **Eventos** | `paquete_contador.enviado`: arma su archivo |
| **Bitácora** | «Mandó el paquete de {mes} al contador», con los renglones en `despues` |

### `contaduria.adjuntar_documento_contador`

| | |
|---|---|
| **Pantalla** | Contador externo · «Adjuntar documento» |
| **Recibe** | `archivo_id` (propósito `documento_contador`, ver [archivos](../admin/archivos.md)) · `tipo`, opcional · `mes`, opcional · `paquete_contador_id`, opcional |
| **Reglas y errores** | `422 archivo_invalido`: «El archivo debe ser PDF, imagen, XML o ZIP.»<br>`422 archivo_ya_guardado`: «Ese archivo ya está guardado.» |
| **Escribe** | El documento, con su nombre, su tipo, su mes, su paquete y la fecha de hoy |
| **Llama** | `admin.ligar_archivo` |
| **Regresa** | «Documento guardado» |
| **Eventos** | `documento_contador.guardado` |
| **Bitácora** | «Guardó {archivo} del contador» |

## Lo que se agrega a otras acciones

- **Cancelar un pago o una compensación** (ver [pagos y saldo a favor](pagos-y-saldo-a-favor.md#lo-que-se-agrega-después-a-estas-acciones) y [terceros y deudas](terceros-y-deudas.md)): `422 paquete_ya_enviado`, si el paquete del mes de su fecha ya se mandó.
- **Cancelar un gasto** (ver [gastos](gastos.md)): `422 paquete_ya_enviado`: «{G} ya salió en el paquete de {mes}: ya no se puede cancelar.»
- **Registrar un gasto** con fecha de un mes ya mandado: el aviso que no detiene «El paquete de {mes} ya se mandó: este gasto sale en el siguiente».

## Trabajos

### Crear el paquete del mes

| | |
|---|---|
| **Cuándo** | El día 1 de cada mes, a las 00:20, hora de México |
| **Escribe** | El paquete del mes que terminó, `por_enviar`, con su fecha límite |
| **Avisa** | El evento `paquete_contador.creado`: el pendiente «Contador externo» de Contaduría |
| **Repetible** | El único de `mes`: si ya existe, no hace nada |

### Armar el archivo del paquete

| | |
|---|---|
| **Cuándo** | Al llegar el evento `paquete_contador.enviado` |
| **Lee** | Los renglones congelados, los gastos que entraron con su comprobante y las facturas de proveedor del mes con su XML y su PDF |
| **Escribe** | Un ZIP con la relación (sus renglones, en CSV) y los comprobantes, guardado con `admin.guardar_archivo` (propósito `documento_contador`), y el `archivo_id` del paquete |
| **Repetible** | Si el paquete ya tiene archivo, no hace nada |

### Cuadre de saldos

| | |
|---|---|
| **Cuándo** | Cada noche, al terminar el cuadre de inventario (evento `cuadre.terminado`, ver [existencias y cuadre](../inventario/existencias-y-cuadre.md)) |
| **Lee** | Las cuentas por cobrar y por pagar con sus aplicaciones, los anticipos y los movimientos del saldo a favor |
| **Escribe** | Nada en los documentos (regla 8) |
| **Avisa** | Si algo no cuadra: el aviso `saldos_no_cuadran` a la dueña, «Los saldos de {n} cuentas no cuadran con sus pagos: soporte ya lo está revisando», y un renglón de bitácora de origen `sistema` con cada diferencia |
| **Repetible** | Una vez por fecha |

El aviso `saldos_no_cuadran` se suma a los tipos de [avisos](../admin/avisos.md), sin correo al inicio (`avisos.correo_saldos_no_cuadran`, «No»).

## Lecturas

### `contaduria.resumen_direccion(dias_vencido)`

| | |
|---|---|
| **La usa** | Dirección: el indicador «Cuentas por cobrar y pagar» y la alerta de concentración (ver [alertas e indicadores](../direccion/alertas-e-indicadores.md)) |
| **Regresa** | El saldo por cobrar y lo vencido; el saldo por pagar (con detenidas) y lo vencido (sin detenidas); y el cliente que más debe, su saldo, su parte del total y lo que tiene vencido de más de `dias_vencido` días |

## Parámetros

Los cambia solo la dueña, en Configuración (ver [configuración](../admin/configuracion.md)).

| Parámetro | Valor inicial | Sección | Para qué |
|---|---|---|---|
| `contaduria.contador_dia_limite` | 17 | Parámetros | El día del mes siguiente en que vence el paquete |
| `avisos.correo_saldos_no_cuadran` | No | Parámetros | Si el aviso de saldos que no cuadran va también por correo |

## Permisos

- Mandar el paquete y guardar los documentos del contador: Contaduría.
- Sin «ven sueldos y tarifas», el monto de la nómina del paquete viaja vacío y la pantalla pinta «••••».

## Eventos

`paquete_contador.creado` · `paquete_contador.enviado` · `documento_contador.guardado`.

## Lo que llega después

- **Fase 19:** Contador externo (los paquetes, la ventana «Paquete de {mes}» y los documentos), su pendiente con la fecha límite, y el indicador de Dirección.
- **Con el POS:** las ventas y los anticipos de las tiendas, desde los cortes de caja, también los de meses anteriores.
- **Con uniformame.mx:** las ventas en línea, las comisiones y los reembolsos, desde los depósitos de la pasarela.
- **Si el contador pide el valor del inventario,** entra como un concepto más, con el método que él diga (ver los pendientes de [registros](../../registros/REGISTROS.md#pendientes)).

## Cómo está hecho

**Fase 18, parte 2.**

- **Las tablas** `paquetes_contador`, `paquete_contador_renglones` (solo crecen) y `documentos_contador` están en `apps/api/src/modulos/contaduria/tablas.ts` (migración `0063`), con sus CHECK. El único de los renglones trata la categoría vacía como un valor (`NULLS NOT DISTINCT`). La migración pone la llave de `gastos.paquete_contador_id` y suma `saldos_no_cuadran` al CHECK de `avisos.tipo`.
- **La cuenta** es `cuentaDelPaquete` (`dominio/paquete-mes.ts`), una función pura: cada concepto con lo de su mes (aunque sea cero) y los gastos del mes sin paquete más, «de meses anteriores», los de un mes cuyo paquete ya se mandó (decisión 726). `lecturaDelPaquete` lee los pagos, los anticipos aplicados, lo abonado a cuentas por pagar, las nóminas pagadas (por el día de México en que se pagaron) y los gastos sin paquete.
- **Las acciones** (`acciones/contador.ts`, contratos en `packages/compartido/src/contratos/contaduria/contador.ts`):
  - `marcar_paquete_enviado` bloquea el paquete con su versión, congela la cuenta, liga sus gastos, avisa de cada nómina del mes por pagar y deja la bitácora como plantilla, con la nómina en un campo de sueldos.
  - `adjuntar_documento_contador` revisa el tipo con `admin.datos_de_archivo` (que da también el nombre y la clave del archivo) y lo liga con `admin.ligar_archivo`.
- **Lo mandado no se toca:** `mesYaEnviado` lee el paquete del mes con candado compartido; cancelar un pago o una compensación de ese mes responde `paquete_ya_enviado`, cancelar un gasto que salió en un paquete también, y registrar un gasto de un mes mandado avisa que sale en el siguiente.
- **Los trabajos** (`trabajos/`):
  - «Crear el paquete del mes» corre el día 1 a las 00:20 (horario `mes`) y crea el del mes que terminó si no existe (decisión 725).
  - «Armar el archivo del paquete» corre tras `paquete_contador.enviado` y arma el de cada paquete mandado sin archivo: un ZIP (`dominio/zip.ts`, con `deflateRawSync` y `crc32` de Node) con `relacion.csv` y los comprobantes de sus gastos y de las facturas del mes, que lee con el nuevo `almacen.leer`, y lo guarda con `admin.guardar_archivo` (decisión 724).
  - «Cuadre de saldos» corre tras `cuadre.terminado`: `saldosQueNoCuadran` revisa cada cuenta por cobrar y por pagar, el anticipo de cada pedido y el saldo a favor de cada cliente; si algo no cuadra avisa a la dueña con un renglón de bitácora del sistema, una vez por día (decisión 727).
- **La lectura** `resumen_direccion` (`lecturas/resumen-direccion.ts`) da los saldos con lo vencido y el cliente que más debe, con su parte en milésimas (decisión 728).
- **Los parámetros** `contaduria.contador_dia_limite` y `avisos.correo_saldos_no_cuadran` están en `contaduria/parametros.ts`.
- **Pruebas:** `dominio/paquete-mes.prueba.ts` (con fast-check: cada gasto en un solo paquete y lo congelado sin cambios), `dominio/zip.prueba.ts`, `acciones/marcar-paquete-enviado.prueba.ts` (octubre de la muestra contra su suma en SQL, el gasto que llega tarde y la nómina), `cancelar-pago.prueba.ts`, `cancelar-compensacion.prueba.ts` y `cancelar-gasto.prueba.ts` (`paquete_ya_enviado`), `trabajos/cuadre-saldos.prueba.ts`, `trabajos/paquete-contador.prueba.ts` (el paquete del mes, el ZIP con el simulador de R2 y los documentos) y `lecturas/resumen-direccion.prueba.ts`.

**Fase 18, cierre.** `marcar_paquete_enviado` lee los gastos sin paquete con candado y en orden de id (`lecturaDelPaquete`), y los meses mandados después: una cancelación del mismo gasto o el envío de otro mes a la vez se ponen en fila, y al soltarse Postgres vuelve a revisar la condición, así que un gasto cancelado o que ya salió en otro paquete no entra (decisión 733). `adjuntar_documento_contador` toma un candado por archivo antes de revisar si ya está: dos a la vez dejan uno y el otro responde `archivo_ya_guardado`. Lo prueban los dos casos con dos conexiones de `acciones/marcar-paquete-enviado.prueba.ts` (en rojo sin el candado) y el caso «a la vez» de `trabajos/paquete-contador.prueba.ts`.
