# Autorizaciones

> **Qué cubre:** lo que un departamento no puede resolver solo y espera la decisión de Dirección (folio AU-): cómo se pide, cómo se decide una sola vez, el efecto que aplica el módulo de origen, «Pedida por ti» y la cancelación cuando el documento se cancela.
> **Estado:** Decidido.
> **Se construye en:** [fase 7 ●](../../fases/07-autorizaciones-y-personal.md).
> **Se conecta con:** [módulos](../../cimientos/MODULOS.md) · [cuentas](../admin/cuentas.md) · [folios](../admin/folios.md) · [avisos](../admin/avisos.md) · [diferencias, ajustes y mermas](../inventario/diferencias-ajustes-y-mermas.md) · [recepciones en aduana](../inventario/recepciones-en-aduana.md) · [notas de crédito](../ventas/notas-de-credito.md) · [facturas de proveedor](../contaduria/facturas-de-proveedor.md) · [desarrollos](../patronaje/desarrollos.md) · [pantallas de Dirección](../../interfaz/fabrica/direccion.md) · [flujo de autorizaciones](../../flujos/fabrica/09-autorizaciones.md) · [órdenes de compra](../compras/ordenes-de-compra.md) · [conteos y carga inicial](../inventario/conteos.md) · [cuentas por pagar](../contaduria/cuentas-por-pagar.md) · [alertas e indicadores](alertas-e-indicadores.md) · [pantallas de Administración del sistema](../../interfaz/fabrica/administracion.md) · [pantallas de Bodega](../../interfaz/fabrica/bodega.md) · [pantallas de Patronaje](../../interfaz/fabrica/patronaje.md)

## Para qué sirve

Hay cosas que pide un departamento y decide Dirección: un ajuste de inventario, una nota de crédito, pagar lo recibido cuando la factura no cuadra, recibir de más, aprobar una muestra sin escuela, una cuenta nueva. Cada una es una autorización AU- que llega a Dirección · Autorizaciones con lo que se pide en palabras. Ejemplo: Ventas pide la nota de crédito de $1,200 sobre la NV-0142; nace la AU-0028, «Ventas · 9 nov · Nota de crédito NV-0142 por $1,200»; Dirección la autoriza y, en la misma transacción, Ventas le da su folio NC-0012 y Contaduría baja el saldo por cobrar.

## Reglas

1. **Se decide una sola vez.** Decidida, solo se lee.
2. **Decide cualquier cuenta con Dirección,** con «Confirmar con Google»; el alta de usuario, solo la dueña. La dueña también decide los ajustes desde Bodega · Conteos y ajustes y las altas desde el cajón «Alta de usuario».
3. **Rechazar pide motivo,** que le llega a quien la pidió.
4. **El efecto lo aplica el módulo de origen,** en la misma transacción de la decisión: Dirección decide; cada módulo sabe qué pasa con su documento. Si el módulo no puede aplicarlo, su error sale tal cual y no se decide nada.
5. **Una pendiente por documento:** un documento no puede tener dos autorizaciones esperando.
6. **«Pedida por ti»:** si quien decide es quien la pidió, Dirección lo ve marcado y la bitácora lo dice.
7. **Si el documento se cancela mientras espera,** su módulo cancela la autorización.
8. **La liga va de la autorización al documento.** El documento muestra su propio estado («Esperando autorización»).

## Los tipos

| Tipo | Lo pide | Apunta a | Al autorizar | Al rechazar | Su efecto llega en |
|---|---|---|---|---|---|
| `ajuste_inventario` | Bodega o Aduana: «Guardar y pedir ajuste» en un conteo con diferencias; Bodega: una DF- aclarada como «Se perdió» o con ajuste. Nace con el AJ- | `ajuste_id` | Inventario aplica el AJ-: mueve la diferencia que se vio, sin pisar lo que pasó después. Sus DF- quedan resueltas | El AJ- queda rechazado con el motivo; la existencia no cambia; sus DF- regresan a «Por contar» o «Por aclarar», como estaban | Fase 14 |
| `recepcion_de_mas` | Aduana, sola, al recibir de un proveedor más de lo pedido. Una por material; en tela, solo si pasa del margen | `recepcion_id`, `orden_compra_linea_id` | Lo de más se queda | Lo de más regresa al proveedor (devolución) y la orden baja lo recibido | Fase 11 |
| `nota_credito` | Ventas: «Nota de crédito» en una NV entregada → «Mandar a Dirección» | `nota_entrega_id`, `nota_credito_id` | Ventas le da su folio NC- y Contaduría baja el saldo por cobrar; la NV conserva su total | No pasa nada | Fase 16 |
| `pago_fuera_de_lo_normal` | Contaduría: «Pagar lo recibido» en un pago detenido | `factura_proveedor_id` | La factura conserva su monto; se guarda lo autorizado y la diferencia por aclarar; deja de estar detenida | Regresa a «Detenido · no cuadra» | Fase 17 |
| `aprobar_desarrollo` | Patronaje: una muestra sin escuela | `desarrollo_id` | El desarrollo sigue a ficha técnica | Regresa a muestra | Fase 10 |
| `alta_usuario` | Administración del sistema: «Pedir cuenta nueva» | `usuario_solicitado_id` | La cuenta pasa a activa con los departamentos pedidos | La cuenta pasa a rechazada | Esta fase |

**Cada módulo registra el efecto de su tipo:** la interna `{modulo}.aplicar_decision_{tipo}` que recibe la decisión. Dirección no conoce los documentos de los demás: llama al efecto que registró el tipo. Un tipo nuevo es un efecto nuevo en su módulo, sin tocar Dirección.

## La tabla `autorizaciones`

| Columna | Tipo | Nulo | Qué es |
|---|---|---|---|
| `id` | uuid | no | Llave |
| `folio` | text | no | AU-, único |
| `tipo` | text | no | CHECK con los tipos de arriba |
| `estado` | text | no | CHECK (`por_autorizar`, `autorizada`, `rechazada`, `cancelada`). default `por_autorizar` |
| `departamento_origen_id` | uuid | no | → `departamentos.id`. La tarjeta dice «{departamento} · {fecha}» |
| `resumen` | text | no | «Qué se pide», ya armado. La tarjeta y «Resueltas» lo muestran tal cual |
| `detalle` | text | sí | La segunda línea de la tarjeta |
| `importe_centavos` | bigint | sí | Nota de crédito: su monto. Pago fuera de lo normal: lo recibido |
| `importe_facturado_centavos` | bigint | sí | Solo pago fuera de lo normal: lo facturado |
| `cantidad` · `unidad` | numeric(12,3) · text | sí | Solo recepción de más: lo recibido de más, con la unidad del material |
| `ajuste_id` · `recepcion_id` · `orden_compra_linea_id` · `nota_entrega_id` · `nota_credito_id` · `factura_proveedor_id` · `desarrollo_id` · `usuario_solicitado_id` | uuid | sí | La liga a su documento, según el tipo |
| `decidida_en` · `decidida_por` | timestamptz · uuid | sí | |
| `decidida_desde_id` | uuid | sí | → `departamentos.id`: Dirección, Bodega o Administración del sistema |
| `motivo_rechazo` | text | sí | De 5 a 90 letras. Obligatorio si `rechazada` (CHECK) |
| `misma_persona` | boolean | sí | Columna generada: `decidida_por = creado_por` |
| `confirmado_con_google_en` | timestamptz | sí | El de quien decidió |
| `cancelado_en` · `cancelado_por` · `motivo_cancelacion` | | sí | Cancelada porque su documento se canceló |
| `persona_id` · `dispositivo_id` | uuid | sí | Si se pidió desde un aparato |

- Lleva las columnas comunes. `creado_por` es quien la pidió («Lo pidió…»); en la recepción de más, quien recibió.
- **CHECK por tipo:** cada tipo lleva su liga y las demás van vacías.
- **Índices:** único (`folio`); (`estado`, `creado_en`) donde `estado = 'por_autorizar'`; un único parcial por cada liga donde `estado = 'por_autorizar'` (una pendiente por documento).
- Las ligas a documentos de fases posteriores llevan su `@llavePendiente` hasta la fase que los crea.

## Acciones

### `direccion.decidir_autorizacion`

| | |
|---|---|
| **Pantalla** | Dirección · Autorizaciones · tarjeta · «Autorizar», o «Rechazar» → ventana «Rechazar». También Bodega · Conteos y ajustes (la dueña, ajustes) y Administración del sistema · cajón «Alta de usuario» · «Dar de alta» / «Rechazar» |
| **Quién** | Dirección · «Confirmar con Google». El alta de usuario, además `solo_duena` («Las cuentas nuevas solo las da la dueña»). Desde Bodega: solo la dueña y solo ajustes. Desde Administración: solo la dueña y solo altas |
| **Recibe** | `autorizacion_id` · uuid · obligatorio<br>`decision` · `autorizar` o `rechazar` · obligatorio<br>`motivo` · texto · de 5 a 90 letras · obligatorio si rechaza<br>`desde` · `direccion`, `bodega` o `admin` · obligatorio: el departamento de la pantalla<br>`version` · entero · obligatorio |
| **Reglas y errores** | `400` en `motivo`: «Escribe el motivo: le llega a quien lo pidió»<br>`422 ya_decidida`: «Esa autorización ya se decidió.»; si se canceló: «Esa autorización se canceló: {motivo}.»<br>El error del efecto del módulo de origen sale tal cual |
| **Escribe** | La autorización: autorizada o rechazada, quién, cuándo, desde dónde, el motivo y la confirmación |
| **Llama** | El efecto que registró su tipo: `inventario.aplicar_decision_ajuste` · `inventario.aplicar_decision_recepcion_de_mas` · `ventas.aplicar_decision_nota_credito` · `contaduria.aplicar_decision_pago_fuera_de_lo_normal` · `patronaje.aplicar_decision_desarrollo` · `admin.aplicar_decision_alta_usuario` |
| **Regresa** | El estado, el folio y lo que regresó el efecto (por ejemplo, el NC-). «Autorizado por Dirección: {tipo}» o «Rechazado: {tipo}»; una recepción de más rechazada: «Rechazado: recepción de más. {OC}: lo de más regresa al proveedor»; un alta: «{persona} dada de alta: ya puede entrar con su cuenta de Google» o «Alta rechazada» |
| **Eventos** | `autorizacion.decidida` (tipo, decisión y quién la pidió): el aviso `autorizacion_decidida` a quien la pidió, con el motivo si se rechazó |
| **Bitácora** | Un solo renglón, del módulo `direccion` y del departamento de `desde`: «Autorizó: {qué se pide}», con « · pedida y autorizada por la misma persona» si lo fue; «Rechazó: {qué se pide} · {motivo}». En un alta: «Dio de alta a {persona} con {departamentos} · autorizado por dirección» o «Rechazó la alta de {persona}: {motivo}». `antes` y `despues`: el estado de la AU- y el del documento |

## Acciones internas

### `direccion.pedir_autorizacion`

| | |
|---|---|
| **La llaman** | Inventario (el ajuste; la recepción de más), Ventas (la nota de crédito), Contaduría («Pagar lo recibido»), Patronaje (la muestra sin escuela) y Administración (`admin.pedir_cuenta`) |
| **Recibe** | `tipo` · `departamento_origen` · `resumen` ya armado · `detalle` · el importe, lo facturado, la cantidad y la unidad según el tipo · la liga a su documento · quién (la cuenta, o la persona y el aparato) |
| **Reglas y errores** | Cada tipo lleva su liga y las demás vacías.<br>`422 ya_pedida`: «{documento} ya tiene una autorización esperando: {AU}.» (en una nota de crédito: «{NV} ya tiene una nota de crédito esperando autorización») |
| **Escribe** | La autorización por autorizar, con su folio AU- |
| **Llama** | `admin.tomar_folio` (AU-) |
| **Regresa** | `autorizacion_id` y su folio |
| **Eventos** | `autorizacion.pedida`: el aviso `autorizacion_pedida` a las cuentas con Dirección (el alta de usuario, solo a la dueña) y «hay cambios» para Dirección |

### `direccion.cancelar_autorizacion`

| | |
|---|---|
| **La llaman** | El módulo de origen cuando su documento se cancela mientras espera, y `admin.cerrar_cuenta_de_persona` |
| **Recibe** | `autorizacion_id`, o el tipo y el id del documento · `motivo` |
| **Reglas y errores** | `422 ya_decidida`: solo se cancela una que espera |
| **Escribe** | La autorización cancelada, con quién, cuándo y su motivo |
| **Eventos** | `autorizacion.cancelada`: «hay cambios» para Dirección |

## Parámetros

| Parámetro | Valor inicial | Para qué |
|---|---|---|
| `direccion.autorizacion_dias_rojo` | 2 días | Desde cuántos días esperando la tarjeta dice «Por autorizar · {n} días» en rojo |
| `direccion.autorizacion_dias_menu_rojo` | 3 días | Desde cuántos días esperando el conteo del menú de Dirección se pone rojo |

## Permisos

- Ver y decidir: Dirección (y la dueña desde Bodega y desde Administración, como dice la regla 2).
- Pedir: cada módulo, con el permiso de su propia acción.

## Eventos

`autorizacion.pedida` · `autorizacion.decidida` · `autorizacion.cancelada`.

## Lo que llega después

Cada fase que crea un tipo de documento agrega su liga (quita su `@llavePendiente`) y registra su efecto: la 10 (`aprobar_desarrollo`), la 11 (`recepcion_de_mas`), la 14 (`ajuste_inventario`), la 16 (`nota_credito`) y la 17 (`pago_fuera_de_lo_normal`).

## Cómo está hecho

*Lo escribe Claude Code al terminar la fase 7.*
