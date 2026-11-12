# Terceros y deudas

> **Qué cubre:** la ficha común de quien nos debe o a quien le debemos (cliente, proveedor o acreedor, o varios a la vez), cómo nace y se liga sin duplicarse; las compensaciones entre lo que nos debe y lo que le debemos; y las deudas PR- con sus mensualidades.
> **Estado:** Decidido.
> **Se construye en:** [fase 17 ●](../../fases/17-contaduria-por-pagar-facturas-gastos-y-nomina.md).
> **Se conecta con:** [proveedores y precios](../compras/proveedores-y-precios.md) · [órdenes de compra](../compras/ordenes-de-compra.md) · [clientes](../ventas/clientes.md) · [máquinas, fallas y servicios](../mantenimiento/maquinas-fallas-y-servicios.md) · [cuentas por pagar](cuentas-por-pagar.md) · [cuentas por cobrar](cuentas-por-cobrar.md) · [pagos y saldo a favor](pagos-y-saldo-a-favor.md) · [crédito de clientes](credito-de-clientes.md) · [contador y cuadres](contador-y-cuadres.md) · [configuración](../admin/configuracion.md) · [folios](../admin/folios.md) · [pantallas de Contaduría](../../interfaz/fabrica/contaduria.md) · [facturas de proveedor](facturas-de-proveedor.md) · [migración](../../MIGRACION.md)

## Para qué sirve

Una persona o empresa es una sola ficha, aunque nos venda, nos compre y nos preste. Ejemplo: si Textiles Aurora, que nos surte tela, también nos compra uniformes para su personal, es una sola ficha, proveedor y cliente. Si nos debe $6,000 y le debemos $20,000, «Compensar» descuenta los $6,000 de los dos lados sin mover dinero, y le quedamos debiendo $14,000. Y un préstamo del banco por $240,000 es la deuda PR-08, en 20 mensualidades de $12,000: cada una es una cuenta por pagar con su vencimiento.

## Reglas

1. **Una ficha por quien sea.** El nombre y el RFC viven solo aquí; el contacto y la dirección, en el cliente o en el proveedor. Una ficha puede ser cliente, proveedor y acreedor a la vez, y un rol prendido no se apaga: queda para el historial.
2. **El nombre es único** sin importar acentos, mayúsculas ni espacios dobles.
3. **Nace o se liga, nunca se duplica.** Compras y Ventas, al dar de alta un proveedor o un cliente con un nombre que ya es tercero con otro rol, lo ligan solas (`ligar_si_existe`) y avisan «Se ligó a la ficha…»; si ya tiene ese rol, es repetido. Contaduría, al registrar una deuda con un acreedor nuevo cuyo nombre ya existe, pregunta «¿Es el mismo?» y liga si se le dice que sí.
4. **El saldo neto de un tercero** es lo que nos debe (sus cuentas por cobrar) menos lo que le debemos (sus cuentas por pagar): «A favor», «En contra» o «Saldado».
5. **Compensar** descuenta lo que nos compró de lo que le debemos, sin mover dinero: aplicaciones por el mismo monto a sus cuentas por cobrar y a sus cuentas por pagar no detenidas, primero las que vencen antes. El monto, en pesos enteros, llega hasta lo menor entre lo que nos debe y lo que le debemos sin las detenidas. Se cancela como un pago: con motivo y «Confirmar con Google», y se cancelan sus aplicaciones.
6. **Una deuda PR-** es un préstamo o un crédito con un acreedor: lo que se va a pagar en total, en mensualidades. Cada mensualidad es una cuenta por pagar de su acreedor (ver [cuentas por pagar](cuentas-por-pagar.md)). Nacen iguales, una por mes desde el primer vencimiento, con el ajuste de centavos en la última, y se pueden cambiar al registrar: suman el total y cada una vence después de la anterior. Los intereses no se calculan: las mensualidades ya los llevan.
7. **Una deuda queda saldada** cuando se pagan todas sus mensualidades, y vuelve a abierta si se cancela un pago o una compensación que la saldó. Solo se cancela sin pagos.

## Estados

| Documento | De | A | Qué pasa | Quién |
|---|---|---|---|---|
| Compensación | — | `registrada` | «Compensar» | Contaduría |
| Compensación | `registrada` | `cancelada` | «Cancelar», con «Confirmar con Google» | Contaduría |
| Deuda | — | `abierta` | «Registrar deuda» | Contaduría |
| Deuda | `abierta` | `saldada` | Su última mensualidad queda pagada | La API |
| Deuda | `saldada` | `abierta` | Se cancela un pago o una compensación que la saldó | La API |
| Deuda | `abierta` | `cancelada` | «Cancelar deuda», sin pagos | Contaduría |

## La tabla `terceros`

Se construye en la [fase 10](../../fases/10-patronaje-y-compras.md), con sus dos internas: un proveedor no tiene nombre sin su tercero. Lo demás de este archivo se construye en la fase 17, con las cuentas por pagar.

| Columna | Tipo | Nulo | Qué es |
|---|---|---|---|
| `id` | uuid | no | Llave |
| `nombre` | text | no | De 3 a 120 |
| `nombre_busqueda` | text | no | En minúsculas, sin acentos y sin espacios dobles. Único (regla 2) |
| `clase` | text | sí | CHECK (`persona`, `empresa`, `banco`). La pide «Registrar deuda» con un acreedor nuevo |
| `es_cliente` · `es_proveedor` · `es_acreedor` | boolean | no | default false. CHECK: al menos uno prendido |
| `rfc` | text | sí | 12 o 13 letras y números, en mayúsculas |
| `telefono` | text | sí | Solo del acreedor que no es cliente ni proveedor |
| `notas` | text | sí | |

Lleva las columnas comunes (ver [base de datos](../../cimientos/BASE-DE-DATOS.md#columnas-comunes)). **Índices:** único (`nombre_busqueda`) · (`rfc`).

## La tabla `compensaciones`

| Columna | Tipo | Nulo | Qué es |
|---|---|---|---|
| `id` | uuid | no | Llave |
| `tercero_id` | uuid | no | → `terceros.id` |
| `fecha` | date | no | |
| `monto_centavos` | bigint | no | CHECK > 0, en pesos enteros |
| `descripcion` | text | no | default «Su compra se descontó de lo que le debemos» |
| `estado` | text | no | CHECK (`registrada`, `cancelada`). default `registrada` |
| `cancelado_en` · `cancelado_por` · `motivo_cancelacion` | | sí | CHECK: llenos en `cancelada` |

Lleva las columnas comunes. **Índice:** (`tercero_id`, `fecha`). Con esta tabla deja su `@llavePendiente` `aplicaciones_pago.compensacion_id`.

## La tabla `deudas`

| Columna | Tipo | Nulo | Qué es |
|---|---|---|---|
| `id` | uuid | no | Llave |
| `folio` | text | no | PR-08 (contador `deuda` de [folios](../admin/folios.md)). Único |
| `tercero_id` | uuid | no | → `terceros.id`: el acreedor |
| `descripcion` | text | no | «De qué es», 5 letras o más |
| `monto_total_centavos` | bigint | no | CHECK > 0. Lo que se va a pagar en total: suma sus mensualidades |
| `numero_mensualidades` | integer | no | CHECK ≥ 1. Un solo pago es 1 |
| `estado` | text | no | CHECK (`abierta`, `saldada`, `cancelada`). default `abierta` |
| `saldada_en` | timestamptz | sí | |
| `cancelado_en` · `cancelado_por` · `motivo_cancelacion` | | sí | CHECK: llenos en `cancelada` |

Lleva las columnas comunes. **Índices:** único (`folio`) · (`tercero_id`, `estado`).

## La tabla `deuda_mensualidades`

| Columna | Tipo | Nulo | Qué es |
|---|---|---|---|
| `id` | uuid | no | Llave |
| `deuda_id` | uuid | no | → `deudas.id` |
| `numero` | integer | no | De 1 al número de mensualidades. Único con `deuda_id`: «mensualidad 8 de 20» |
| `vence` | date | no | |
| `importe_centavos` | bigint | no | CHECK > 0 |

Lleva las columnas comunes. Su cuenta por pagar la apunta (ver [cuentas por pagar](cuentas-por-pagar.md)): con esta tabla deja su `@llavePendiente` `cuentas_por_pagar.deuda_mensualidad_id`.

## Acciones

Todas son de la web, con el departamento Contaduría.

### `contaduria.compensar`

| | |
|---|---|
| **Pantalla** | Cajón del tercero · «Compensar» → ventana «Compensar con {tercero}» · «Compensar» |
| **Recibe** | `tercero_id` · `monto_centavos` (en pesos enteros) |
| **Reglas y errores** | `400`: «Escribe el monto en pesos»<br>`422 sin_saldo_para_compensar`: «{tercero} no nos debe y le debemos a la vez: no hay qué compensar.»<br>`422 monto_mayor_que_maximo`: «Hasta {máximo}.» (regla 5)<br>Toma las cuentas que va a bajar con su candado, en orden |
| **Escribe** | La compensación, `registrada`. Sus aplicaciones a las cuentas por cobrar y por pagar del tercero, por el mismo total de cada lado, primero las que vencen antes; sus saldos y estados; las deudas que queden saldadas |
| **Llama** | `compras.cerrar_orden_pagada`, por cada orden cuyas facturas quedan todas pagadas (ver [cuentas por pagar](cuentas-por-pagar.md#reglas)) |
| **Regresa** | «Compensación registrada: {monto} con {tercero}» |
| **Eventos** | `compensacion.registrada` · `cuenta_por_cobrar.pagada` · `cuenta_por_pagar.pagada` · `deuda.saldada`, las que apliquen |
| **Bitácora** | «Compensó {monto} con {tercero}», con lo que nos debe y lo que le debemos en `antes` y `despues` |

### `contaduria.cancelar_compensacion`

| | |
|---|---|
| **Pantalla** | «Cancelar» en Terceros · Compensaciones y en el cajón del tercero (pantalla nueva) |
| **Quién** | Contaduría · «Confirmar con Google» |
| **Recibe** | `compensacion_id` · `motivo` · `version` |
| **Reglas y errores** | `400` en `motivo`: «Escribe el motivo»<br>`422 compensacion_cancelada`: «Esa compensación ya está cancelada.» |
| **Escribe** | La compensación, `cancelada`; sus aplicaciones, `cancelada`; los saldos y estados de sus cuentas de regreso; la deuda que había saldado, otra vez `abierta` |
| **Llama** | `compras.reabrir_orden_pagada`, si una factura deja de estar pagada |
| **Regresa** | «Compensación con {tercero} cancelada» |
| **Eventos** | `compensacion.cancelada` |
| **Bitácora** | «Canceló la compensación de {monto} con {tercero}: {motivo}», con la confirmación con Google; por cada orden que se reabre, otro renglón con la misma clave: «{OC} vuelve a Recibida: se canceló su pago» |

### `contaduria.registrar_deuda`

| | |
|---|---|
| **Pantalla** | Terceros · «Registrar deuda» → ventana Registrar deuda · «Registrar deuda» |
| **Recibe** | `tercero_id`, o `tercero_nuevo` con `nombre` y `clase` (`persona`, `banco` o `empresa`): exactamente uno · `ligar_a_tercero_id`, si se respondió «Es el mismo» · `descripcion` · `monto_total_centavos` · `numero_mensualidades` (≥ 1) · `primer_vencimiento` · `mensualidades`, opcional: cada una con `numero`, `vence` e `importe_centavos` |
| **Reglas y errores** | `400`: «¿A quién le debemos?» · «Escribe el nombre.» · «Escribe de qué es la deuda.» (menos de 5 letras) · «Escribe el monto en pesos.» · «¿Cuándo se paga?»<br>`422 tercero_ya_existe`: «Ya hay un tercero con ese nombre: {nombre} ({roles}). ¿Es el mismo?», con su id, para repetir con `ligar_a_tercero_id`<br>`422 mensualidades_no_suman`: «Las mensualidades suman {suma} y la deuda es {monto}.»<br>`422 vencimientos_desordenados`: «Cada mensualidad vence después de la anterior.»<br>Aviso que no detiene: «Ojo: la primera mensualidad ya venció» |
| **Escribe** | El acreedor: nuevo, o con su rol de acreedor prendido. La deuda PR-, `abierta`; sus mensualidades (regla 6) y una cuenta por pagar por mensualidad, `por_pagar`, con saldo igual a su importe |
| **Llama** | `admin.tomar_folio` (`deuda`) · `contaduria.crear_tercero`, rol `acreedor`, si es nuevo o se liga |
| **Regresa** | «{PR} registrada: {monto} a {acreedor}, vence el {fecha}» |
| **Eventos** | `deuda.registrada` · `tercero.creado` o `tercero.ligado`, si aplica |
| **Bitácora** | «Registró la deuda {PR} con {acreedor}: {monto} en {n} mensualidades», y si dio de alta al acreedor, otro renglón con la misma clave: «Dio de alta al tercero {nombre} (acreedor)» |

### `contaduria.cancelar_deuda`

| | |
|---|---|
| **Pantalla** | Cajón del tercero · la deuda · «Cancelar deuda» (pantalla nueva) |
| **Recibe** | `deuda_id` · `motivo` · `version` |
| **Reglas y errores** | `400` en `motivo`: «Escribe el motivo»<br>`422 deuda_con_pagos`: «{PR} ya tiene pagos: no se puede cancelar.»<br>`422 deuda_no_abierta`: «{PR} ya está saldada o cancelada.» |
| **Escribe** | La deuda, `cancelada`; sus cuentas por pagar, `cancelada` |
| **Regresa** | «{PR} cancelada» |
| **Eventos** | `deuda.cancelada` |
| **Bitácora** | «Canceló la deuda {PR} con {acreedor}: {motivo}» |

## Acciones internas

Las dos se construyen en la [fase 10](../../fases/10-patronaje-y-compras.md). Su bitácora es el renglón de la acción que las llama.

### `contaduria.crear_tercero`

| | |
|---|---|
| **La llaman** | `compras.crear_proveedor` (ver [proveedores y precios](../compras/proveedores-y-precios.md)), `ventas.crear_cliente` (ver [clientes](../ventas/clientes.md)) y `contaduria.registrar_deuda` |
| **Recibe** | `nombre` · `rol` (`cliente`, `proveedor` o `acreedor`) · `rfc`, `clase` y `telefono` (este, solo de un acreedor), opcionales · `ligar_si_existe` o `ligar_a_tercero_id`, opcionales |
| **Reglas** | `400`: «El RFC lleva 12 o 13 letras y números»<br>Con `ligar_a_tercero_id`: prende el rol en esa ficha. Si ya hay un tercero con ese nombre: con `ligar_si_existe`, si no tiene el rol lo prende y regresa `ya_existia`; si ya lo tiene, o sin `ligar_si_existe`, es un error: `422 rol_ya_existe`: «Ya está en la lista.» (Compras lo muestra como `proveedor_repetido` y Ventas como `cliente_repetido`) · `422 tercero_ya_existe`: «Ya hay un tercero con ese nombre: {nombre} ({roles}). ¿Es el mismo?», con su id, nombre y roles<br>Aviso que no detiene: «Ese RFC ya lo tiene {nombre}» |
| **Escribe** | La ficha nueva con su rol, o el rol prendido en la que ya existía |
| **Regresa** | `tercero_id` · `ya_existia` |
| **Eventos** | `tercero.creado` o `tercero.ligado` |

### `contaduria.renombrar_tercero`

| | |
|---|---|
| **La llaman** | `compras.guardar_proveedor` y `ventas.editar_cliente`, si cambió el nombre o el RFC |
| **Recibe** | `tercero_id` · `nombre` · `rfc`, opcional |
| **Reglas** | `422 nombre_repetido`: «Ya está en la lista.» |
| **Escribe** | El nombre, su nombre de búsqueda y, si viene, el RFC |
| **Eventos** | `tercero.renombrado` |

## Lecturas

### `contaduria.datos_terceros(terceros)`

Se construye en la [fase 10](../../fases/10-patronaje-y-compras.md), con la tabla.

| | |
|---|---|
| **La usan** | Compras y Ventas, en sus acciones: el nombre y el RFC de sus proveedores y sus clientes para sus mensajes, su bitácora y lo que cambió |
| **Regresa** | Por tercero, su nombre, su RFC y sus roles. Nunca saldos |

## Parámetros

Ninguno propio: el largo del motivo es `general.largo_minimo_motivo` (ver [configuración](../admin/configuracion.md)).

## Permisos

- Compensar, cancelar una compensación (con «Confirmar con Google») y las deudas: Contaduría.
- Las fichas con sus saldos las ve quien tiene Contaduría. Compras y Ventas ven el nombre y el RFC de sus proveedores y sus clientes.

## Eventos

`tercero.creado` · `tercero.ligado` · `tercero.renombrado` · `compensacion.registrada` · `compensacion.cancelada` · `deuda.registrada` · `deuda.saldada` · `deuda.cancelada`.

## Lo que llega después

- **Fase 16:** Ventas da de alta y renombra a sus clientes con las dos internas, y liga sola un nombre que ya es tercero con otro rol.
- **Fase 18:** ya no se cancela una compensación de un mes cuyo paquete se mandó al contador (`paquete_ya_enviado`), y las compensaciones y los pagos de las deudas salen en el paquete (ver [contador y cuadres](contador-y-cuadres.md)).
- **Fase 19:** Terceros, Compensaciones, el cajón del tercero y la ventana Registrar deuda.

## Cómo está hecho

**Fase 10, parte 1.** Solo la ficha: lo demás de este archivo llega en la fase 17.

- **La tabla** `terceros` está en `modulos/contaduria/tablas.ts` (migración `0032`), con sus CHECK: el nombre de 3 a 120, la clase, al menos un rol prendido y el RFC en mayúsculas. `nombre_busqueda` es `regexp_replace(sin_acentos(btrim(nombre)), '\s+', ' ', 'g')`: el índice único hace la regla 2.
- **Las internas** (`internas/terceros.ts`):
  - `crear_tercero` toma un candado por nombre de búsqueda antes de leer: dos altas del mismo nombre a la vez esperan, y la segunda liga o responde repetido. Con `ligar_a_tercero_id` prende el rol en esa ficha. Regresa también los avisos que no detienen («Ese RFC ya lo tiene {nombre}»), para que la acción que la llama los dé (decisión 519). El teléfono solo se guarda en un acreedor.
  - `renombrar_tercero` regresa lo de antes (para la bitácora de quien llama) y sus avisos.
  - `tercero_ya_existe` lleva en `datos` el id, el nombre y los roles.
- **La lectura** `datos_terceros` (`lecturas/terceros.ts`) regresa, por id, el nombre, el RFC y los roles.
- **Quién lee** `terceros`, para los avisos en vivo: Contaduría, Compras, Ventas y Dirección (`index.ts`).
- **Pruebas:** `internas/crear-tercero.prueba.ts` (nace, se liga sin importar acentos ni espacios, `rol_ya_existe`, `tercero_ya_existe` con sus datos, «Es el mismo», el RFC, renombrar, y dos altas a la vez en cinco rondas).

**Fase 17, parte 2.**

- **Las tablas** `compensaciones`, `deudas` y `deuda_mensualidades` están en `modulos/contaduria/tablas.ts` (migración `0059`), con sus CHECK. La misma migración pone las llaves de `aplicaciones_pago.compensacion_id` y `cuentas_por_pagar.deuda_mensualidad_id`. Las mensualidades solo crecen.
- **Las deudas** (`acciones/deudas.ts`):
  - `registrar_deuda` arma las mensualidades iguales con `mensualidadesIguales`: una por mes con Temporal, y el ajuste de centavos en la última. Si se escribieron a mano, revisa que sean una por número, que sumen el total y que cada una venza después de la anterior.
  - El acreedor nuevo nace con `contaduria.crear_tercero`, que pregunta «¿Es el mismo?». Un tercero que ya existe y no es acreedor prende su rol (decisión 707).
  - Escribe una cuenta por pagar `por_pagar` por mensualidad.
  - `cancelar_deuda` solo cancela sin aplicaciones, con sus cuentas.
- **Saldar y reabrir** viven en `dominio/cuentas-por-pagar.ts`: `alPagarse` salda la deuda cuyas cuentas quedaron todas pagadas; `regresarAplicacionesPorPagar` la vuelve a abrir con el evento `deuda.abierta` (decisión 708). Las deudas se bloquean con las órdenes, antes que sus cuentas (decisión 705).
- **Las compensaciones** (`acciones/compensaciones.ts`):
  - `compensar` bloquea lo que le debemos sin detenidas, lo que nos debe y luego reparte el mismo monto de cada lado, primero lo que vence antes (`repartirEnCuentas`), hasta lo menor de los dos.
  - `cancelar_compensacion` regresa las dos con `regresarAplicacionesPorCobrar` y `regresarAplicacionesPorPagar`, y deja un renglón por cada orden que se reabre.
- **Pruebas:** `acciones/registrar-deuda.prueba.ts`, `cancelar-deuda.prueba.ts` y `compensar.prueba.ts` (también la cancelación), y la prueba al azar `saldos-por-pagar.azar.prueba.ts`.

**Cierre de la fase 17** (decisión 716): con mensualidades iguales, una deuda con menos de $1 por mensualidad responde `400` en `numero_mensualidades` («Cada mensualidad lleva al menos $1.»), sin escribir nada. La muestra de lo que la fábrica debe está en `apps/api/semillas/por-pagar.ts` (decisión 715).
