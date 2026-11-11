# Escuelas y secciones

> **Qué cubre:** las escuelas con modelos propios (agregarlas, editarlas, darlas de baja, reactivarlas y la que nace al dar de alta un cliente escuela) y las secciones del catálogo, que agrega la dueña.
> **Estado:** Decidido.
> **Se construye en:** [fase 8](../../fases/08-catalogo.md).
> **Se conecta con:** [configuración](../admin/configuracion.md) · [clientes](../ventas/clientes.md) · [pantallas de Catálogo](../../interfaz/fabrica/catalogo.md) · [pantallas de Administración](../../interfaz/fabrica/administracion.md) · [desarrollos](../patronaje/desarrollos.md) · [conteos y carga inicial](../inventario/conteos.md) · [sistema de diseño](../../interfaz/DISENO.md) · [migración](../../MIGRACION.md)

## Para qué sirve

Una **escuela** es para quién se hacen modelos propios: la playera con su escudo, la falda de su cuadro. Agregarla no la vuelve cliente ni le da lista de precios: eso pasa cuando Ventas a externos da de alta al cliente. Una **sección** es un bloque del catálogo (Playeras, Pantalones…): ordena Productos, Listas de precios y el alta, y dice si sus productos llevan receta.

Ejemplo: Catálogo agrega «Colegio Hidalgo», de Zamora. Queda con su color y 0 modelos, y el aviso dice «Colegio Hidalgo ya está en el catálogo. Ahora puedes crearle modelos». Desde ese momento sale en «Para quién» del alta y de las solicitudes de diseño, y en los filtros.

## Reglas

1. **Una escuela es única por nombre y municipio,** sin importar acentos ni mayúsculas: en México el mismo nombre se repite entre municipios.
2. **Su color lo pone el servidor:** el siguiente de la paleta de escuelas del [sistema de diseño](../../interfaz/DISENO.md), en orden; al acabarse la paleta, vuelve a empezar.
3. **Agregar una escuela no la vuelve cliente.** El cliente apunta a su escuela (`clientes.escuela_id`, decisión de integración 21), así que una escuela no guarda a su cliente. Al dar de alta un cliente escuela, Ventas escoge la escuela si ya existe; si no, se crea con el nombre y el municipio del cliente.
4. **Una escuela se da de baja solo si nada la usa:** ni modelos activos, ni un cliente activo, ni desarrollos en proceso. Sus modelos y su historial se conservan, y se puede reactivar. Un producto de una escuela dada de baja no se reactiva hasta reactivar la escuela.
5. **Las secciones las agrega solo la dueña,** en Configuración · Listas · «Secciones del catálogo». En la primera versión no se renombran ni se quitan: «nada se quita desde aquí». Una nueva va al final del orden.
6. **Una sección dice si lleva receta.** Si no la lleva (hoy, «Accesorios y servicios»), sus productos no entran a Patronaje, no muestran medidas ni «Abrir receta» y no necesitan tipo de prenda.

## La tabla `escuelas`

| Columna | Tipo | Nulo | Qué es |
|---|---|---|---|
| `id` | uuid | no | Llave |
| `nombre` | text | no | De 4 a 80 |
| `municipio` | text | no | De 3 a 60 |
| `color` | text | no | CHECK formato `#RRGGBB` |
| `baja_en` · `baja_por` · `motivo_baja` · `reactivado_en` | | sí | Al reactivar se limpian los tres primeros y se pone `reactivado_en` |

- Lleva las columnas comunes (ver [base de datos](../../cimientos/BASE-DE-DATOS.md#columnas-comunes)). No lleva `cliente_id` (decisión de integración 21).
- **Índices:** único (`sin_acentos(lower(nombre))`, `sin_acentos(lower(municipio))`) · (`version`).

## La tabla `secciones`

| Columna | Tipo | Nulo | Qué es |
|---|---|---|---|
| `id` | uuid | no | Llave |
| `nombre` | text | no | De 3 a 40. Único sin importar mayúsculas. No se renombra |
| `orden` | integer | no | El orden de los bloques en Productos, Listas de precios y el alta |
| `lleva_receta` | boolean | no | default true |
| `tipo_prenda_defecto_id` | uuid | sí | → `tipos_prenda.id`: el tipo que propone el alta desde cero en esta sección. Lo pone `catalogo.agregar_seccion` si se escoge; las secciones de la siembra nacen sin él y el alta pide escoger el tipo |
| `baja_en` · `baja_por` · `motivo_baja` · `reactivado_en` | | sí | La primera versión no da de baja secciones |

Lleva las columnas comunes. **Índice:** único (`lower(nombre)`).

### La siembra

Las siete secciones de la muestra, en este orden, son parte de la siembra del sistema:

| Orden | Sección | Lleva receta |
|---|---|---|
| 1 | Playeras | Sí |
| 2 | Camisas y batas | Sí |
| 3 | Suéteres y chalecos | Sí |
| 4 | Pants y sudaderas | Sí |
| 5 | Faldas, jumpers y mandiles | Sí |
| 6 | Pantalones | Sí |
| 7 | Accesorios y servicios | No |

Las escuelas no tienen siembra: en producción llegan con la [migración](../../MIGRACION.md); en local, con los datos de la muestra (Colegio Morelos, Instituto Juan Pablo II, Secundaria Técnica 12, Jardín de Niños Gabriela Mistral, Primaria Benito Juárez y Colegio Allende).

## Acciones

Todas son de la web. Los errores `422` llevan su `codigo` y su mensaje (formato en [API](../../cimientos/API.md)).

### `catalogo.agregar_escuela`

| | |
|---|---|
| **Pantalla** | Catálogo · Escuelas y tallas · «Agregar escuela» → ventana «Agregar escuela» · «Agregar escuela» |
| **Quién** | Catálogo |
| **Recibe** | `nombre` · texto · de 4 a 80 · obligatorio<br>`municipio` · texto · de 3 a 60 · obligatorio |
| **Reglas y errores** | `400`: «Escribe el nombre completo de la escuela.» (menos de 4 letras) · «Escribe el municipio.» (menos de 3 letras)<br>`422 escuela_repetida`: «Esa escuela ya existe.» (mismo nombre y municipio, sin importar acentos ni mayúsculas) |
| **Escribe** | La escuela, con el color que le toca |
| **Regresa** | `escuela_id` y `color`. «{escuela} ya está en el catálogo. Ahora puedes crearle modelos» |
| **Eventos** | `escuela.agregada` |
| **Bitácora** | «Escuela nueva: {escuela}, {municipio}» |

### `catalogo.editar_escuela`

| | |
|---|---|
| **Pantalla** | Catálogo · Escuelas y tallas · una escuela · «Editar» (pantalla nueva) |
| **Quién** | Catálogo |
| **Recibe** | `escuela_id` · uuid · obligatorio<br>`nombre` · texto · de 4 a 80 · obligatorio<br>`municipio` · texto · de 3 a 60 · obligatorio<br>`version` · obligatorio |
| **Reglas y errores** | Las de forma de `catalogo.agregar_escuela`<br>`422 escuela_repetida`: «Esa escuela ya existe.» |
| **Escribe** | El nombre y el municipio |
| **Regresa** | «Datos de {escuela} guardados» |
| **Eventos** | `escuela.cambiada` |
| **Bitácora** | «Escuela {antes} → {después}», con el nombre y el municipio en `antes` y `despues` |

### `catalogo.dar_baja_escuela`

| | |
|---|---|
| **Pantalla** | Catálogo · Escuelas y tallas · una escuela · «Dar de baja» (pantalla nueva) |
| **Quién** | Catálogo |
| **Recibe** | `escuela_id` · uuid · obligatorio<br>`motivo` · texto · al menos `general.largo_minimo_motivo` (5) letras · obligatorio<br>`version` · obligatorio |
| **Reglas y errores** | `400`: «Escribe al menos 5 letras.»<br>`422 ya_dada_de_baja`: «{escuela} ya está dada de baja.»<br>`422 escuela_con_modelos`: «{escuela} tiene {n} modelos activos: descontinúalos antes de darla de baja.»<br>Desde la fase de su módulo (ver «Lo que llega después»):<br>· `422 escuela_con_desarrollos`: «{escuela} tiene desarrollos en proceso: {DS}.»<br>· `422 escuela_de_cliente`: «{escuela} es de {cliente}, que sigue activo: se da de baja con el cliente en Ventas a externos.» |
| **Escribe** | `baja_en`, `baja_por` y `motivo_baja` |
| **Regresa** | «{escuela} dada de baja. Sus modelos y su historial se conservan» |
| **Eventos** | `escuela.cambiada` |
| **Bitácora** | «Dio de baja {escuela}: {motivo}» |

### `catalogo.reactivar_escuela`

| | |
|---|---|
| **Pantalla** | Catálogo · Escuelas y tallas · escuelas dadas de baja · «Reactivar» (pantalla nueva) |
| **Quién** | Catálogo |
| **Recibe** | `escuela_id` · uuid · obligatorio<br>`version` · obligatorio |
| **Reglas y errores** | `422 escuela_activa`: «{escuela} ya está activa.» |
| **Escribe** | Limpia la baja y pone `reactivado_en`. Sus productos descontinuados siguen así: cada uno se reactiva en su ficha |
| **Regresa** | «{escuela} vuelve a estar activa» |
| **Eventos** | `escuela.cambiada` |
| **Bitácora** | «{escuela} vuelve a estar activa», con el motivo que tenía en `antes` |

### `catalogo.agregar_seccion`

| | |
|---|---|
| **Pantalla** | Administración del sistema · Configuración · Listas · «Secciones del catálogo» · «Agregar». La pantalla es de Administración; el renglón lo escribe Catálogo |
| **Quién** | La dueña (`solo_duena`) |
| **Recibe** | `nombre` · texto · de 3 a 40 · obligatorio<br>`lleva_receta` · booleano · opcional (sí, si no viene)<br>`tipo_prenda_defecto_id` · uuid · opcional: un tipo de prenda activo |
| **Reglas y errores** | `400`: un nombre de menos de 3 letras<br>`422 seccion_repetida`: «Ya está en la lista.» |
| **Escribe** | La sección, al final del orden |
| **Regresa** | «{sección} ya está en Catálogo. Sale en Productos y en el alta» |
| **Eventos** | `seccion.agregada` |
| **Bitácora** | «Sección nueva del catálogo: {sección}» |

## Acciones internas

### `catalogo.crear_escuela_para_cliente`

| | |
|---|---|
| **La llama** | `ventas.crear_cliente`, con un cliente escuela sin escuela escogida (ver [clientes](../ventas/clientes.md)) |
| **Recibe** | `nombre` · `municipio` (los del cliente) |
| **Reglas** | `422 escuela_repetida`: «Esa escuela ya existe: escógela en la lista.» |
| **Escribe** | La escuela, igual que `catalogo.agregar_escuela`. Lo que cambió va en el renglón de bitácora de Ventas |
| **Regresa** | `escuela_id` |
| **Eventos** | `escuela.agregada` |

## Permisos

- Escuelas: Catálogo.
- Secciones: solo la dueña.
- Escuelas y secciones las leen casi todos los departamentos: no traen dinero.

## Eventos

`escuela.agregada` · `escuela.cambiada` · `seccion.agregada`.

## Lo que llega después

- **Fase 10:** el candado `escuela_con_desarrollos`, con la lectura de Patronaje de los desarrollos en proceso de una escuela.
- **Fase 16:** el candado `escuela_de_cliente`, con la lectura de Ventas del cliente activo de una escuela; Ventas llama a `catalogo.crear_escuela_para_cliente`; y Escuelas y tallas dice « · cliente externo» junto a la escuela que es cliente.
- **Con el POS:** las escuelas (`id`, `nombre`, `municipio`, `color` y `baja_en`) y las secciones bajan a la caja de cada tienda, todas.

## Cómo está hecho

**Fase 8, parte 1.**

- **Las tablas** `escuelas` y `secciones` son del módulo `catalogo` (`apps/api/src/modulos/catalogo/tablas.ts`, migración `0022_catalogo_escuelas_y_tallas.sql`): la escuela es única por `sin_acentos(nombre)` y `sin_acentos(municipio)` (un índice único de la base) y su color, `#RRGGBB` por CHECK; la sección, única por `lower(nombre)`. Las siete secciones son parte de la siembra del sistema (`siembra.ts`).
- **El color** (`dominio/escuelas.ts`, `crearEscuela`): el siguiente de `paletaDeEscuelas` (`packages/compartido/src/contratos/catalogo/escuelas.ts`) según cuántas escuelas hay, con un candado para que dos a la vez no tomen el mismo (decisión 437).
- **Las acciones** (`acciones/escuelas.ts`, contratos en `packages/compartido/src/contratos/catalogo/escuelas.ts`): agregar, editar (con su versión, sin chocar con otra), dar de baja (el motivo con `general.largo_minimo_motivo`, `ya_dada_de_baja`) y reactivar (`escuela_activa`, con el motivo que tenía en `antes`). `catalogo.agregar_seccion` (`acciones/agregar-seccion.ts`) es solo de la dueña y va al final del orden. El candado `escuela_con_modelos` cuenta los productos activos de la escuela (parte 3, decisión 436).
- **La interna** `catalogo.crear_escuela_para_cliente` (`internas/crear-escuela-para-cliente.ts`) crea la escuela igual, sin bitácora propia.
- **Las pruebas:** `modulos/catalogo/acciones/agregar-escuela.prueba.ts` (única sin acentos ni mayúsculas, en otro municipio sí, el color en orden, los `400`, editar y la escuela del cliente), `dar-baja-escuela.prueba.ts` (el motivo, una sola vez, reactivar) y `agregar-seccion.prueba.ts` (la siembra, solo la dueña, al final, repetida).

**Fase 10, parte 3.** `catalogo.dar_baja_escuela` pregunta a `patronaje.desarrollos_en_proceso_de_escuela` y responde `escuela_con_desarrollos` con sus folios. La escuela ya está bloqueada, y la solicitud de un desarrollo la lee compartida: las dos se esperan. Lo prueba `acciones/dar-baja-escuela.prueba.ts`.
