# Clientes externos

> **Qué cubre:** el cliente externo (escuela, mayorista, empresa u otro): su alta con su tercero, su crédito, su lista de precios y su escuela; sus cambios, su baja y su reactivación; y lo que otros módulos leen de él.
> **Estado:** Decidido.
> **Se construye en:** [fase 16](../../fases/16-ventas-a-externos.md).
> **Se conecta con:** [pedidos](pedidos.md) · [notas de entrega](notas-de-entrega.md) · [terceros y deudas](../contaduria/terceros-y-deudas.md) · [crédito de clientes](../contaduria/credito-de-clientes.md) · [cuentas por cobrar](../contaduria/cuentas-por-cobrar.md) · [pagos y saldo a favor](../contaduria/pagos-y-saldo-a-favor.md) · [anticipos](../contaduria/anticipos.md) · [listas de precios](../catalogo/listas-de-precios.md) · [escuelas y secciones](../catalogo/escuelas-y-secciones.md) · [precios](../catalogo/precios.md) · [reclamos y devoluciones](../calidad/reclamos-y-devoluciones.md) · [pantallas de Ventas](../../interfaz/fabrica/ventas.md) · [pantallas de Catálogo](../../interfaz/fabrica/catalogo.md) · [pantallas de Contaduría](../../interfaz/fabrica/contaduria.md) · [migración](../../MIGRACION.md)

## Para qué sirve

Ventas da de alta a quien le compra por pedido, y con el alta nace todo lo que el cliente necesita. Ejemplo: Ventas da de alta a Distribuidora Escolar Zamora, mayorista de León. Nace su ficha de tercero en Contaduría (o se liga a la que ya había), su crédito («Sin crédito», 15 días) y su lista de precios, vacía, en Catálogo: mientras Catálogo no le ponga precios, compra con los de mayoreo. Si fuera una escuela, nacería también su escuela en Catálogo, ligada al cliente.

## Reglas

1. **Tres tipos:** `escuela`, `mayorista` y `empresa_otro`. El tipo no cambia.
2. **El cliente cuelga de su tercero.** El nombre y el RFC viven en la ficha de Contaduría (ver [terceros y deudas](../contaduria/terceros-y-deudas.md)); aquí, el municipio, la dirección de entrega, el contacto, el teléfono y el correo. Un nombre que ya es tercero con otro rol se liga solo; uno que ya es cliente es repetido.
3. **Nace con lo suyo:** su crédito, sin límite (ver [crédito de clientes](../contaduria/credito-de-clientes.md)); su lista de precios, vacía (ver [listas de precios](../catalogo/listas-de-precios.md)); y, si es escuela, su escuela: la que se escoja o una nueva con su nombre y su municipio. Una escuela es cliente una sola vez.
4. **Mientras no tenga precios propios,** compra con el precio sugerido: su lista, su porcentaje, mayoreo o mostrador (ver [precios](../catalogo/precios.md#el-precio-sugerido-a-un-cliente-externo)).
5. **Cambiar el nombre** renombra su tercero, su lista y su escuela, si se llamaban igual.
6. **Se da de baja** solo sin pedidos abiertos (borrador o confirmado) y sin saldo por cobrar. Su historial se conserva, su lista se da de baja con él y ya no sale para pedidos nuevos.
7. **«Cliente desde {año}»** es el año en que se dio de alta.

## Estados

| De | A | Qué pasa | Quién |
|---|---|---|---|
| — | activo | «Dar de alta» | Ventas |
| activo | de baja | «Dar de baja», con motivo | Ventas |
| de baja | activo | «Reactivar» | Ventas |

## La tabla `clientes`

| Columna | Tipo | Nulo | Qué es |
|---|---|---|---|
| `id` | uuid | no | Llave |
| `tercero_id` | uuid | no | → `terceros.id`: su nombre y su RFC. Único |
| `tipo` | text | no | CHECK (`escuela`, `mayorista`, `empresa_otro`) |
| `escuela_id` | uuid | sí | → `escuelas.id`. Único donde no es nulo. CHECK: lleno si y solo si es `escuela` |
| `municipio` | text | no | De 3 a 60. «{tipo} en {municipio}» |
| `direccion_entrega` | text | no | De 8 a 200: la usa Aduana para despachar |
| `contacto` | text | sí | «¿Con quién se trata?», hasta 60 |
| `telefono` | text | no | 10 dígitos |
| `correo` | text | sí | |
| `baja_en` · `baja_por` · `motivo_baja` · `reactivado_en` | | sí | |

Lleva las columnas comunes (ver [base de datos](../../cimientos/BASE-DE-DATOS.md#columnas-comunes)). **Índices:** único (`tercero_id`) · único (`escuela_id`) donde no es nulo · (`tipo`) donde `baja_en` es nulo. Con esta tabla dejan su `@llavePendiente` las columnas que apuntan a `clientes`: `listas_precios.cliente_id`, `credito_clientes.cliente_id`, `cuentas_por_cobrar.cliente_id`, `pagos.cliente_id`, `saldo_favor_movimientos.cliente_id`, `anticipos.cliente_id` y `reclamos.cliente_id`.

## Acciones

Todas son de la web, con el departamento Ventas.

### `ventas.crear_cliente`

| | |
|---|---|
| **Pantalla** | Ventas · Clientes · «Nuevo cliente» → cajón Cliente nuevo · «Dar de alta»; también Pedido nuevo · «Cliente nuevo» · «Dar de alta y usar en el pedido» |
| **Recibe** | `nombre` (de 3 a 80) · `tipo` · `escuela_id`, opcional: una que ya existe · `municipio` (de 3 a 60) · `direccion_entrega` (de 8 a 200) · `contacto`, opcional · `telefono` (10 dígitos) · `correo`, opcional · `rfc`, opcional (12 o 13) |
| **Reglas y errores** | `400`: «Escribe el nombre del cliente.» · «Escribe el municipio.» · «Escribe la dirección de entrega: Aduana la necesita para despachar.» · «Teléfono a 10 dígitos.» · «Revisa el correo.» · «El RFC lleva 12 o 13 letras y números.»<br>`422 cliente_repetido`: «Ya hay un cliente con ese nombre.»<br>`422 escuela_ya_es_cliente`: «{escuela} ya es cliente: {cliente}.»<br>`422 escuela_repetida`: «Esa escuela ya existe: escógela en la lista.»<br>Aviso que no detiene: «Se ligó a la ficha de {nombre} que ya existía en Contaduría.» |
| **Escribe** | El cliente, con su tercero y, si es escuela, su escuela |
| **Llama** | `contaduria.crear_tercero`, rol `cliente`, con el nombre, el RFC y `ligar_si_existe` (su `rol_ya_existe` sale como `cliente_repetido`) · `catalogo.crear_escuela_para_cliente`, si es escuela sin escuela escogida · `contaduria.abrir_credito_cliente`, con su tipo · `catalogo.crear_lista_cliente` |
| **Regresa** | `cliente_id`, `lista_id` y `escuela_id`. «{cliente} dado de alta. Compra con precios de mayoreo hasta que Catálogo le ponga su lista»; desde el pedido, «{cliente} dado de alta y escogido para el pedido» |
| **Eventos** | `cliente.creado` |
| **Bitácora** | «Cliente nuevo: {cliente}, {tipo} en {municipio}; sin crédito, {n} días», con la ficha en `despues` (el RFC no va en el texto) |

### `ventas.editar_cliente`

| | |
|---|---|
| **Pantalla** | Clientes · la ficha · «Editar datos» → cajón Datos del cliente · «Guardar cambios» |
| **Recibe** | `cliente_id` · `version` · los campos del alta menos el tipo y la escuela, todos opcionales |
| **Reglas y errores** | Los `400` del alta<br>`422 cliente_repetido`, como en el alta<br>`422 sin_cambios`: «Sin cambios» |
| **Escribe** | Lo que cambió |
| **Llama** | `contaduria.datos_terceros` (el nombre y el RFC de hoy) · `contaduria.renombrar_tercero`, si cambió el nombre o el RFC (su `nombre_repetido` sale como `cliente_repetido`) · `catalogo.sincronizar_nombre_cliente`, si cambió el nombre, con su escuela |
| **Regresa** | «Datos de {cliente} guardados» |
| **Eventos** | `cliente.cambiado` |
| **Bitácora** | «{cliente}: {campo} {antes} → {después}», con `antes` y `despues` |

### `ventas.dar_baja_cliente`

| | |
|---|---|
| **Pantalla** | Cajón Datos del cliente · «Dar de baja» → ventana «Dar de baja a {cliente}» · «Dar de baja» |
| **Recibe** | `cliente_id` · `motivo` · `version` |
| **Reglas y errores** | `400` en `motivo`: «Escribe el motivo.»<br>`422 cliente_con_pedidos`: «{cliente} tiene {n} pedido(s) abierto(s): no se puede dar de baja.»<br>`422 cliente_con_saldo`: «{cliente} tiene saldo por cobrar: no se puede dar de baja hasta que pague.» A quien tiene Contaduría: «{cliente} nos debe {monto}: no se puede dar de baja hasta que pague.» |
| **Escribe** | La baja, con quién, cuándo y el motivo. Sus pedidos, notas y pagos se conservan |
| **Llama** | `contaduria.saldo_por_cobrar_de_cliente` · `catalogo.dar_baja_lista_cliente` |
| **Regresa** | «{cliente} dado de baja. Su historial se conserva» |
| **Eventos** | `cliente.cambiado` |
| **Bitácora** | «Dio de baja a {cliente}: {motivo}» |

### `ventas.reactivar_cliente`

| | |
|---|---|
| **Pantalla** | Clientes · «Dados de baja» · «Reactivar» |
| **Recibe** | `cliente_id` · `version` |
| **Reglas y errores** | `422 cliente_activo`: «{cliente} ya está activo.» |
| **Escribe** | Limpia la baja y pone `reactivado_en` |
| **Llama** | `catalogo.reactivar_lista_cliente` |
| **Regresa** | «{cliente} vuelve a estar activo» |
| **Eventos** | `cliente.cambiado` |
| **Bitácora** | «{cliente} vuelve a estar activo» |

## Lecturas

### `ventas.estado_cliente(cliente)`

| | |
|---|---|
| **La usa** | Contaduría: no cambia el crédito de un cliente dado de baja (ver [crédito de clientes](../contaduria/credito-de-clientes.md)) |
| **Regresa** | Su tipo, su escuela y si está de baja |

### `ventas.cliente_activo_de_escuela(escuela)`

| | |
|---|---|
| **La usa** | Catálogo, al dar de baja una escuela: `escuela_de_cliente` (ver [escuelas y secciones](../catalogo/escuelas-y-secciones.md)) |
| **Regresa** | El cliente activo de esa escuela, si hay |

## Parámetros

Ninguno propio: los días de crédito con que nace son de Contaduría, y el largo del motivo es `general.largo_minimo_motivo`.

## Permisos

- Todo lo de este archivo: Ventas.
- Ventas no ve el saldo de un cliente: solo quien también tiene Contaduría ve el monto en el error de la baja.

## Eventos

`cliente.creado` · `cliente.cambiado`.

## Lo que llega después

- **Fase 19:** Clientes, su ficha, el cajón Cliente nuevo y el de Datos del cliente.
- **Con el POS:** el alta desde un mayorista de tienda, que liga su cliente de mayoreo.

## Cómo está hecho

*Lo escribe Claude Code al terminar la fase 16.*
