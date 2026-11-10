# Listas de precios

> **Qué cubre:** las listas Mostrador, Mayoreo y En línea, la lista de cada cliente externo con su porcentaje de básicos y de especiales, las categorías de mayoreo (Básico, Especial, Accesorio y Sin descuento) y qué productos salen en cada lista.
> **Estado:** Decidido.
> **Se construye en:** [fase 8](../../fases/08-catalogo.md).
> **Se conecta con:** [precios](precios.md) · [variantes, códigos y etiquetas](variantes-codigos-y-etiquetas.md) · [clientes](../ventas/clientes.md) · [pantallas de Catálogo](../../interfaz/fabrica/catalogo.md)

## Para qué sirve

Una lista de precios dice cuánto cuesta cada producto según a quién se le vende. Hay tres generales (Mostrador, Mayoreo y En línea) y una por cada cliente externo, que nace vacía cuando Ventas lo da de alta. Lo que define el precio de un cliente vive en un solo lugar, su lista: los precios que Catálogo le pone y sus dos porcentajes de mayoreo.

Ejemplo: Distribuidora Escolar Zamora compra con 12 % sobre mostrador en los básicos. Catálogo lo pone en el encabezado de su lista; desde ese momento, una playera polo básica que no tiene precio en su lista le sale a Ventas como sugerido: mostrador menos 12 %, redondeado a peso (ver [precios](precios.md#el-precio-sugerido-a-un-cliente-externo)).

## Reglas

1. **Tres listas generales, una de cada tipo:** Mostrador (la que cobran las dos tiendas), Mayoreo y En línea. Son de la siembra del sistema.
2. **La lista Mayoreo ya no es obligatoria** (decisión del 6 de noviembre): el mayoreo es el porcentaje de cada cliente sobre mostrador. Mayoreo queda como respaldo del precio sugerido.
3. **Cada cliente externo tiene su lista,** que nace vacía y sin porcentajes al darlo de alta en Ventas. Se llama como el cliente y cambia de nombre cuando Ventas lo renombra. Se da de baja y se reactiva con el cliente; sus precios se conservan.
4. **El porcentaje de mayoreo de un cliente vive en su lista** (decisión de integración 5): `pct_basicos` y `pct_especiales`, de 0 a 100, o vacío si no tiene. `clientes` no los copia. Los pone Catálogo.
5. **Cada producto lleva una categoría de mayoreo,** y la categoría dice qué porcentaje del cliente le toca: el de básicos, el de especiales o ninguno. Es dato, no código.
6. **Un pedido confirmado no cambia** cuando cambian los porcentajes: congeló su precio.
7. **Qué productos salen en cada lista** (solo los activos):
   - Mostrador y Mayoreo: los que se venden en mostrador;
   - En línea: los que se venden en línea;
   - la de un cliente: los que se venden a externos y tienen precio en esa lista, o son modelo de la escuela de ese cliente.
8. **«Modelo sin precio»:** un producto activo que se vende a externos, modelo de una escuela que es cliente, sin precio base en la lista de ese cliente. Es pendiente de Catálogo, porque Ventas no lo puede cotizar.

## La tabla `listas_precios`

| Columna | Tipo | Nulo | Qué es |
|---|---|---|---|
| `id` | uuid | no | Llave |
| `tipo` | text | no | CHECK (`mostrador`, `mayoreo`, `en_linea`, `cliente`) |
| `nombre` | text | no | Único sin importar mayúsculas. En una de cliente, el nombre del cliente |
| `nombre_corto` | text | sí | Lo que dice «Lista {corta}» en el pedido externo. En una de cliente nace igual que el nombre |
| `descripcion` | text | sí | El texto del encabezado de la lista. En las de cliente va vacía: la pantalla arma su encabezado con el cliente |
| `cliente_id` | uuid | sí | → `clientes.id`. CHECK: lleno si y solo si es de tipo `cliente`. Lleva su `@llavePendiente` hasta la fase 16 |
| `pct_basicos` · `pct_especiales` | numeric(6,3) | sí | El % del cliente sobre mostrador para cada categoría. CHECK: solo en tipo `cliente`, entre 0 y 100. Vacío: no tiene |
| `orden` | integer | no | |
| `baja_en` · `baja_por` · `motivo_baja` · `reactivado_en` | | sí | La lista de un cliente dado de baja |

- Lleva las columnas comunes (ver [base de datos](../../cimientos/BASE-DE-DATOS.md#columnas-comunes)).
- **Índices:** único (`lower(nombre)`) · único (`tipo`) donde `tipo` no es `cliente` y `baja_en` es nulo · único (`cliente_id`) donde no es vacío · (`version`).

### La siembra

| Tipo | Nombre | Nombre corto | Descripción |
|---|---|---|---|
| `mostrador` | Mostrador | Mostrador | «La que cobran las dos tiendas en el mostrador.» |
| `mayoreo` | Mayoreo | Mayoreo | «Mayoreo en mostrador: el descuento de cada cliente se aplica según la categoría de cada prenda.» |
| `en_linea` | En línea | En línea | «La que ve la tienda en línea. Los pedidos especiales no se publican.» |

## La tabla `categorias_mayoreo`

| Columna | Tipo | Nulo | Qué es |
|---|---|---|---|
| `id` | uuid | no | Llave |
| `nombre` | text | no | Único sin importar mayúsculas |
| `descripcion` | text | no | La explicación que sale en la ficha y en el alta |
| `porcentaje_que_aplica` | text | no | CHECK (`basicos`, `especiales`, `ninguno`): qué porcentaje del cliente le toca |
| `defecto_para` | text | sí | CHECK (`con_escuela`, `sin_escuela`). La que el alta pone sola según «Para quién», salvo que se cambie a mano o venga de un producto base. Único donde no es vacío |
| `orden` | integer | no | |
| `baja_en` · `baja_por` · `motivo_baja` · `reactivado_en` | | sí | |

Lleva las columnas comunes. **Índices:** único (`lower(nombre)`) · único (`defecto_para`) donde no es vacío · (`version`). La primera versión no tiene pantalla para cambiarlas: son las de la siembra.

### La siembra

| Nombre | Le toca | Por omisión para | Descripción |
|---|---|---|---|
| Básico | `basicos` | `sin_escuela` | «Prenda lisa, sin escudo. Lleva el % de básicos de cada cliente de mayoreo.» |
| Especial | `especiales` | `con_escuela` | «Con escudo o modelo de escuela. Lleva el % de especiales.» |
| Accesorio | `basicos` | — | «Lleva el % de básicos.» |
| Sin descuento | `ninguno` | — | «Escudos, pegado de escudo y bordado de nombre: no llevan descuento de mayoreo.» |

## Acciones

### `catalogo.cambiar_porcentajes_cliente`

| | |
|---|---|
| **Pantalla** | Catálogo · Listas de precios · la lista de un cliente · encabezado «% de básicos» y «% de especiales» (pantalla nueva: la muestra no los captura) |
| **Quién** | Catálogo |
| **Recibe** | `lista_id` · uuid · obligatorio<br>`pct_basicos` · decimal de 0 a 100, o vacío · obligatorio<br>`pct_especiales` · decimal de 0 a 100, o vacío · obligatorio<br>`version` · la de la lista · obligatorio |
| **Reglas y errores** | `400`: «Entre 0 y 100 %»<br>`422 lista_no_es_de_cliente`: «{lista} no es lista de un cliente.»<br>`422 lista_dada_de_baja`: «{lista} está dada de baja con su cliente.» |
| **Escribe** | `pct_basicos` y `pct_especiales` de la lista |
| **Regresa** | «Porcentajes de {lista} guardados. Ventas a externos ya los usa» |
| **Eventos** | `lista_precios.cambiada` |
| **Bitácora** | «% de {lista}: básicos {antes} → {después}; especiales {antes} → {después}» |

## Acciones internas

Las llama Ventas a externos dentro de sus propias acciones (ver [clientes](../ventas/clientes.md)). Lo que cambian va en el renglón de bitácora de la acción de Ventas.

### `catalogo.crear_lista_cliente`

| | |
|---|---|
| **La llama** | `ventas.crear_cliente` |
| **Recibe** | `cliente_id` · `nombre` |
| **Reglas** | `422 lista_repetida`: «{cliente} ya tiene lista de precios.» |
| **Escribe** | Una lista de tipo `cliente`, vacía y sin porcentajes, con el nombre del cliente |
| **Regresa** | `lista_id` |
| **Eventos** | `lista_precios.creada` |

### `catalogo.sincronizar_nombre_cliente`

| | |
|---|---|
| **La llama** | `ventas.editar_cliente`, cuando cambia el nombre |
| **Recibe** | `cliente_id` · `nombre_anterior` · `nombre` · `escuela_id` (la escuela del cliente, si es escuela) |
| **Reglas** | `422 escuela_repetida`: «Esa escuela ya existe.», si el nombre nuevo choca con otra escuela del mismo municipio |
| **Escribe** | El nombre de su lista, y su nombre corto si era igual al nombre anterior. El de su escuela, solo si se llamaba igual que el cliente: la escuela pudo existir antes que el cliente, con otro nombre |
| **Regresa** | Lo que renombró |
| **Eventos** | `lista_precios.cambiada` · `escuela.cambiada` si renombró la escuela |

### `catalogo.dar_baja_lista_cliente`

| | |
|---|---|
| **La llama** | `ventas.dar_baja_cliente` |
| **Recibe** | `cliente_id` · `motivo` |
| **Escribe** | La baja de su lista, con el motivo del cliente. Sus precios se conservan |
| **Eventos** | `lista_precios.cambiada` |

### `catalogo.reactivar_lista_cliente`

| | |
|---|---|
| **La llama** | `ventas.reactivar_cliente` |
| **Recibe** | `cliente_id` |
| **Escribe** | Limpia la baja de su lista y pone `reactivado_en` |
| **Eventos** | `lista_precios.cambiada` |

## Permisos

- Cambiar los porcentajes: Catálogo.
- Crear, renombrar, dar de baja y reactivar la lista de un cliente: solo por las acciones de Ventas a externos.
- Las listas y sus porcentajes son precios: no viajan a los departamentos que no ven precios (ver [permisos](../admin/permisos.md#qué-ve-cada-departamento)).

## Eventos

`lista_precios.creada` · `lista_precios.cambiada`.

## Lo que llega después

- **Fase 16:** Ventas llama a estas internas al dar de alta, editar, dar de baja y reactivar un cliente; la llave de `listas_precios.cliente_id`; y «modelo de la escuela de ese cliente» (regla 7) con la escuela del cliente, que vive en `clientes.escuela_id` (decisión de integración 21).
- **Con el POS:** bajan a la caja las listas Mostrador y Mayoreo y todas las categorías de mayoreo (la caja las usa para el mayoreo de mostrador). Si un mayorista de la tienda está ligado a un cliente externo, baja también la lista de ese cliente, solo con `id`, `nombre`, `pct_basicos`, `pct_especiales` y `baja_en`: sus porcentajes salen de ahí y la tienda no los edita (decisión de integración 22). Con eso, `lista_precios.cambiada` también le avisa a esa caja.

## Cómo está hecho

*Lo escribe Claude Code al terminar la fase 8.*
