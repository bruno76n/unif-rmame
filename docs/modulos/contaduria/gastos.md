# Gastos

> **Qué cubre:** el gasto de operación G-, con su categoría, dónde se gastó, de dónde salió el dinero y su comprobante; el que entra solo por un servicio de Mantenimiento con costo; cancelarlo; y las listas de categorías y de tipos de comprobante.
> **Estado:** Decidido.
> **Se construye en:** [fase 17 ●](../../fases/17-contaduria-por-pagar-facturas-gastos-y-nomina.md).
> **Se conecta con:** [máquinas, fallas y servicios](../mantenimiento/maquinas-fallas-y-servicios.md) · [pagos y saldo a favor](pagos-y-saldo-a-favor.md) · [contador y cuadres](contador-y-cuadres.md) · [configuración](../admin/configuracion.md) · [archivos](../admin/archivos.md) · [folios](../admin/folios.md) · [pantallas de Contaduría](../../interfaz/fabrica/contaduria.md) · [pantallas de Mantenimiento](../../interfaz/fabrica/mantenimiento.md)

## Para qué sirve

Cada peso que la fábrica gasta queda con su categoría y su comprobante, listo para el contador. Ejemplo: Contaduría registra el recibo de luz de noviembre, $3,840, «Fábrica», pagado desde la cuenta de la fábrica, con la foto del recibo: nace el G-0412. Cuando Mantenimiento registra un servicio de $1,200 a la recta, el gasto «Reparación de máquinas» entra solo, en el Taller, ligado al servicio.

## Reglas

1. **Un gasto tiene** su categoría (la lista «Categorías de gasto»), su monto en pesos enteros, dónde se gastó (la fábrica, una ubicación como el Taller o una tienda, o la tienda en línea), su fecha (hoy o antes), de dónde salió el dinero (efectivo o una cuenta de la fábrica) y, si lo hay, su comprobante: imagen, PDF o XML. Sin comprobante queda «Sin comprobante».
2. **«Reparación de máquinas» la pone el sistema:** solo la usan los servicios de Mantenimiento con costo, que entran solos con la categoría de `mantenimiento.servicio_categoria_gasto` y en la ubicación de `mantenimiento.servicio_ubicacion_gasto` (Taller), sin decir de dónde salió el dinero.
3. **Se cancela** con motivo. El de un servicio se corrige desde Mantenimiento.
4. **Un gasto con fecha de un mes cuyo paquete ya se mandó al contador** sale en el siguiente paquete, como de meses anteriores.

## Estados

| De | A | Qué pasa | Quién |
|---|---|---|---|
| — | `registrado` | «Registrar gasto», o un servicio con costo | Contaduría; Mantenimiento |
| `registrado` | `cancelado` | «Cancelar gasto», con motivo | Contaduría |

## La tabla `gastos`

| Columna | Tipo | Nulo | Qué es |
|---|---|---|---|
| `id` | uuid | no | Llave |
| `folio` | text | no | G-0412 (contador `gasto`). Único |
| `fecha` | date | no | Nunca futura |
| `categoria_id` | uuid | no | → `lista_valores.id`, de «Categorías de gasto» |
| `monto_centavos` | bigint | no | CHECK > 0 |
| `area` | text | no | CHECK (`fabrica`, `ubicacion`, `en_linea`) |
| `ubicacion_id` | uuid | sí | → `ubicaciones.id`. CHECK: llena si y solo si el área es `ubicacion` |
| `medio` | text | sí | De dónde salió: CHECK (`efectivo`, `cuenta_fabrica`). CHECK: lleno salvo en `mantenimiento` |
| `cuenta_fabrica_id` | uuid | sí | → `lista_valores.id`, de «Cuentas de la fábrica» (ver [pagos y saldo a favor](pagos-y-saldo-a-favor.md#la-lista-cuentas-de-la-fábrica)). CHECK: lleno con `cuenta_fabrica` |
| `comprobante_archivo_id` · `tipo_comprobante_id` | uuid | sí | → `archivos.id` y → `lista_valores.id`, de «Tipos de comprobante de gasto» |
| `origen` | text | no | CHECK (`manual`, `mantenimiento`, `tienda`). `tienda`, con el POS |
| `servicio_id` · `maquina_id` | uuid | sí | → `servicios.id` (único) y su máquina. CHECK: llenos en `mantenimiento` |
| `movimiento_caja_id` · `motivo` · `dispositivo_id` · `persona_id` | | sí | Con el POS: el gasto que una tienda sacó de su cajón |
| `paquete_contador_id` | uuid | sí | → `paquetes_contador.id`: el paquete del contador en que salió. Lleva su `@llavePendiente` hasta la fase 18 |
| `estado` | text | no | CHECK (`registrado`, `cancelado`). default `registrado` |
| `cancelado_en` · `cancelado_por` · `motivo_cancelacion` | | sí | CHECK: llenos en `cancelado` |

Lleva las columnas comunes (ver [base de datos](../../cimientos/BASE-DE-DATOS.md#columnas-comunes)). **Índices:** único (`folio`) · único (`servicio_id`) donde no es nulo · (`fecha`) · (`categoria_id`). `movimiento_caja_id` lleva su `@llavePendiente` hasta el POS. Con esta tabla deja la suya `servicios.gasto_id`.

## Las listas

Este archivo siembra dos listas de [configuración](../admin/configuracion.md):

- **«Categorías de gasto»** (`categorias_gasto`): Luz · Agua · Teléfono e internet · Gasolina y fletes · Papelería y oficina · Limpieza · Paquetería · Reparación de máquinas (clave `reparacion_maquinas`, no seleccionable). La dueña agrega más.
- **«Tipos de comprobante de gasto»** (`tipos_comprobante_gasto`): Factura (`factura`) · Nota o ticket (`nota_ticket`) · Sin comprobante (`sin_comprobante`).

Y siembra los dos parámetros de Mantenimiento que apuntan aquí: `mantenimiento.servicio_categoria_gasto` («Reparación de máquinas») y `mantenimiento.servicio_ubicacion_gasto` (Taller), que declara su [archivo](../mantenimiento/maquinas-fallas-y-servicios.md#parámetros).

## Acciones

Las dos son de la web, con el departamento Contaduría.

### `contaduria.registrar_gasto`

| | |
|---|---|
| **Pantalla** | Gastos · «Registrar gasto» → ventana «Registrar gasto» · «Registrar gasto» |
| **Recibe** | `categoria_id` · `monto_centavos` (en pesos enteros) · `area` · `ubicacion_id`, con `ubicacion` · `fecha` · `medio` (`efectivo` o `cuenta_fabrica`) · `cuenta_fabrica_id`, si hay más de una · `comprobante_archivo_id` y `tipo_comprobante_id`, opcionales |
| **Reglas y errores** | `400`: «Escribe el monto en pesos» · «La fecha no puede ser futura» · «Escoge la ubicación»<br>`422 categoria_del_sistema`: «Esa categoría la pone el sistema.»<br>`422 categoria_de_baja`: «Esa categoría ya no se usa.»<br>`422 archivo_invalido`: «El comprobante debe ser imagen, PDF o XML.» |
| **Escribe** | El gasto, `manual`, `registrado` |
| **Llama** | `admin.tomar_folio` (`gasto`) · `admin.ligar_archivo`, si trae comprobante |
| **Regresa** | «{G} registrado» |
| **Eventos** | `gasto.registrado` |
| **Bitácora** | «Registró el gasto {G}: {categoría}, {monto}» |

### `contaduria.cancelar_gasto`

| | |
|---|---|
| **Pantalla** | Gastos · Registro de gastos · «Cancelar gasto» (pantalla nueva) |
| **Recibe** | `gasto_id` · `motivo` · `version` |
| **Reglas y errores** | `400` en `motivo`: «Escribe el motivo»<br>`422 gasto_cancelado`: «{G} ya está cancelado.»<br>`422 gasto_de_mantenimiento`: «Este gasto viene del servicio {SM} de Mantenimiento.» |
| **Escribe** | El gasto, `cancelado`, con quién, cuándo y su motivo |
| **Regresa** | «{G} cancelado» |
| **Eventos** | `gasto.cancelado` |
| **Bitácora** | «Canceló el gasto {G}: {motivo}» |

## Acciones internas

### `contaduria.registrar_gasto_mantenimiento`

| | |
|---|---|
| **La llama** | `mantenimiento.registrar_servicio`, con costo mayor que 0 (ver [máquinas, fallas y servicios](../mantenimiento/maquinas-fallas-y-servicios.md)) |
| **Recibe** | `servicio_id` · `maquina_id` · `fecha` · `costo_centavos` |
| **Reglas** | Un costo en 0 no lleva gasto: es un error del programa |
| **Escribe** | El gasto, `mantenimiento`, con la categoría y la ubicación de sus parámetros (regla 2), su servicio y su máquina |
| **Llama** | `admin.tomar_folio` (`gasto`) |
| **Regresa** | `gasto_id`: Mantenimiento lo guarda en su servicio |
| **Eventos** | `gasto.registrado` |

La bitácora va con la acción del servicio: con la misma clave, otro renglón «Registró el gasto {G}: Reparación de máquinas, {monto} ({máquina}, {SM})».

## Parámetros

Ninguno propio. Usa los dos de Mantenimiento de la regla 2 y `general.largo_minimo_motivo`.

## Permisos

- Registrar y cancelar: Contaduría.

## Eventos

`gasto.registrado` · `gasto.cancelado`.

## Lo que llega después

- **Fase 18:** los gastos por categoría en el paquete del contador, y ya no se cancela un gasto de un mes cuyo paquete se mandó (`paquete_ya_enviado`); el aviso de la regla 4 al registrar uno de ese mes (ver [contador y cuadres](contador-y-cuadres.md)).
- **Fase 19:** Gastos, la ventana «Registrar gasto» y «Cancelar gasto».
- **Con el POS:** el gasto de caja de una tienda, que llega con su movimiento, su motivo y su tipo de comprobante, y se cancela desde la tienda. Las categorías siguen siendo una sola lista: cada una lleva una marca de si baja a la caja, que la dueña cambia. Al inicio bajan Papelería y oficina, Limpieza, Gasolina y fletes y Paquetería.

## Cómo está hecho

**Fase 17, parte 3.**

- **La tabla** `gastos` está en `apps/api/src/modulos/contaduria/tablas.ts` (migración `0060`), con sus CHECK: el monto en pesos enteros si es `manual`, la ubicación solo con `ubicacion`, el medio salvo en `mantenimiento`, la cuenta solo con `cuenta_fabrica`, el servicio y la máquina solo en `mantenimiento` y la cancelación completa. `movimiento_caja_id` y `paquete_contador_id` llevan su `@llavePendiente`. La misma migración pone la llave de `servicios.gasto_id` y le deja a la app escribir solo esa columna del servicio (decisión 709).
- **Las listas** «Categorías de gasto» y «Tipos de comprobante de gasto» se siembran en `siembra.ts` (`semillaDeListasDeGastos`): agregan lo que falte. «Reparación de máquinas» lleva la clave `reparacion_maquinas` y no es seleccionable.
- **Las acciones** (`acciones/gastos.ts`, contratos en `packages/compartido/src/contratos/contaduria/gastos.ts`):
  - `registrar_gasto` revisa la categoría (`valorDeLista` en `dominio/gastos.ts`), la ubicación, la cuenta de la fábrica (`cuentaFabricaEscogida`, la misma de los pagos) y el comprobante. Sin archivo queda «Sin comprobante». El archivo se liga con el propósito `comprobante` (decisión 710).
  - `cancelar_gasto` cancela con motivo; el de un servicio responde `gasto_de_mantenimiento` con su SM-.
- **La interna** `registrar_gasto_mantenimiento` (`internas/gastos.ts`) lee la categoría y la ubicación de los dos parámetros de Mantenimiento, de tipo texto: la clave de la categoría y el código de la ubicación. Regresa el gasto, su folio y el nombre de su categoría para el renglón de bitácora del servicio.
- **Pruebas:** `acciones/registrar-gasto.prueba.ts`, `acciones/cancelar-gasto.prueba.ts` e `internas/registrar-gasto-mantenimiento.prueba.ts`. Las ayudas están en `nucleo/pruebas/gastos-de-prueba.ts`.
