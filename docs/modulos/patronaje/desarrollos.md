# Desarrollos

> **Qué cubre:** el desarrollo de un producto nuevo (DS-): la solicitud, la muestra, los cambios, la aprobación del cliente o de Dirección, el descarte y el alta en catálogo, con su historial.
> **Estado:** Decidido.
> **Se construye en:** [fase 10](../../fases/10-patronaje-y-compras.md).
> **Se conecta con:** [recetas](recetas.md) · [autorizaciones](../direccion/autorizaciones.md) · [productos](../catalogo/productos.md) · [tallas y tipos de prenda](../catalogo/tallas-y-tipos-de-prenda.md) · [escuelas y secciones](../catalogo/escuelas-y-secciones.md) · [folios](../admin/folios.md) · [pantallas de Patronaje](../../interfaz/fabrica/patronaje.md)

## Para qué sirve

Antes de que una prenda nueva exista en el catálogo, Patronaje la desarrolla: registra lo que pidieron, hace la muestra, la enseña y la corrige hasta que la aprueban, y entonces la da de alta. Ejemplo: la Secundaria Técnica 12 pide una chamarra con su escudo en tallas 10 a 16. Patronaje registra la solicitud DS-015, empieza la muestra en talla M, la entrega al cliente, el cliente pide cambios en el cuello, Patronaje los hace, el cliente aprueba y DS-015 pasa a Ficha técnica. Con «Dar de alta en catálogo», Catálogo crea el producto y el desarrollo queda «En catálogo».

## Reglas

1. **Quién aprueba depende de para quién es.** Con escuela, aprueba el cliente: Patronaje registra «El cliente aprobó». Sin escuela («Ninguna escuela: básico o general»), aprueba Dirección, con la autorización `aprobar_desarrollo` que nace al entregar la muestra (ver [autorizaciones](../direccion/autorizaciones.md)); Patronaje no puede aprobarla por su cuenta.
2. **Si Dirección rechaza,** la muestra regresa a hacerse, con el motivo del rechazo como cambios pedidos.
3. **Pedir cambios o descartar con una autorización esperando** la cancela, con su motivo («Patronaje regresó la muestra con cambios», «Patronaje descartó el desarrollo»).
4. **Se descarta con motivo** en cualquier etapa menos «En catálogo». El motivo lleva al menos `general.largo_minimo_motivo` (5) letras; en pantalla, `cancelado` se llama «Descartado».
5. **El alta la hace Catálogo:** «Dar de alta en catálogo» abre el alta con el nombre y la escuela de la solicitud, y al crear el producto lo liga al desarrollo (ver [productos](../catalogo/productos.md)). La receta del producto nuevo empieza en «Sin receta», y su pantalla propone la tela de la solicitud (decisión 538).
6. **Todo queda en su historial** (`desarrollo_eventos`), con quién, cuándo y su motivo. El historial solo crece.
7. **La tela de la solicitud** tiene que ser una tela de Compras. La escuela, si la tiene, no puede estar dada de baja.
8. **El material de la muestra no se descuenta** del inventario en la primera versión.

## Estados

| De | A | Acción | Quién |
|---|---|---|---|
| — | `solicitud` | «Registrar solicitud» | Patronaje |
| `solicitud` | `muestra` | «Empezar muestra» | Patronaje |
| `muestra` | `aprobacion` | «Muestra entregada al cliente» (con escuela) o «Muestra lista para aprobar» (sin escuela, nace la AU-) | Patronaje |
| `aprobacion` | `ficha_tecnica` | Con escuela: «El cliente aprobó». Sin escuela: Dirección autoriza la AU- | Patronaje; Dirección |
| `aprobacion` | `muestra` | «Pidió cambios» o «Pidieron cambios», con motivo; sin escuela, también si Dirección rechaza | Patronaje; Dirección |
| `ficha_tecnica` | `en_catalogo` | Catálogo crea el producto desde «Dar de alta en catálogo» | Catálogo |
| cualquiera menos `en_catalogo` | `cancelado` | «Descartar con motivo» | Patronaje |

## La tabla `desarrollos`

| Columna | Tipo | Nulo | Qué es |
|---|---|---|---|
| `id` | uuid | no | Llave |
| `folio` | text | no | `DS-…`, único, del contador `desarrollo` de [folios](../admin/folios.md) |
| `etapa` | text | no | CHECK (`solicitud`, `muestra`, `aprobacion`, `ficha_tecnica`, `en_catalogo`, `cancelado`) |
| `escuela_id` | uuid | sí | → `escuelas.id`. Vacío: «Ninguna escuela: básico o general» (aprueba Dirección) |
| `prenda` | text | no | Qué prenda piden. De 4 a 60 |
| `tela_material_id` | uuid | no | → `materiales.id`: la tela de la solicitud |
| `tallas` | text | no | Libre, de 1 a 30 («6 a 14») |
| `descripcion` | text | sí | «Qué pidieron», hasta 200 |
| `muestra_talla` | text | sí | La talla de la muestra, hasta 10 («M») |
| `muestra_empezada_en` · `muestra_entregada_en` | timestamptz | sí | Con escuela, entregada al cliente; sin escuela, lista para aprobar |
| `motivo_cambios` | text | sí | Los últimos cambios pedidos: la tarjeta dice «Con cambios: {motivo}». Todos quedan en el historial |
| `autorizacion_id` | uuid | sí | → `autorizaciones.id`: la AU- abierta, o la última, cuando no tiene escuela |
| `aprobado_en` · `aprobado_por` | timestamptz · uuid | sí | Quien registró «El cliente aprobó» o quien autorizó la AU- |
| `aprobado_por_tipo` | text | sí | CHECK (`cliente`, `direccion`). CHECK: `direccion` si y solo si no tiene escuela |
| `producto_id` | uuid | sí | → `productos.id`. Único. CHECK: lleno en `en_catalogo` |
| `en_catalogo_en` | timestamptz | sí | |
| `cancelado_en` · `cancelado_por` · `motivo_cancelacion` | | sí | CHECK: llenos si y solo si está `cancelado` |

Lleva las columnas comunes (ver [base de datos](../../cimientos/BASE-DE-DATOS.md#columnas-comunes)); `creado_por` es quien solicitó. **Índices:** único (`folio`) · único (`producto_id`) donde no es vacío · (`etapa`) donde no es `en_catalogo` ni `cancelado`.

## La tabla `desarrollo_eventos`

| Columna | Tipo | Nulo | Qué es |
|---|---|---|---|
| `id` | uuid | no | Llave |
| `desarrollo_id` | uuid | no | → `desarrollos.id` |
| `accion` | text | no | CHECK (`solicitud_registrada`, `muestra_empezada`, `muestra_entregada`, `cambios_pedidos`, `aprobado`, `alta_en_catalogo`, `cancelado`) |
| `etapa_antes` | text | sí | Vacía en `solicitud_registrada` |
| `etapa_despues` | text | no | |
| `motivo` | text | sí | Lleno en `cambios_pedidos` y `cancelado` |
| `autorizacion_id` | uuid | sí | → `autorizaciones.id`, si el paso vino de Dirección |

Lleva las columnas comunes: `creado_en` y `creado_por` dicen «{persona} {qué hizo}» y su fecha. **Solo crece.** **Índice:** (`desarrollo_id`, `creado_en` desc).

## Acciones

Todas son de la web, con el departamento Patronaje, y mandan la `version` del desarrollo cuando lo cambian. Cada una escribe su paso en el historial.

### `patronaje.registrar_solicitud`

| | |
|---|---|
| **Pantalla** | Desarrollo de producto · «Nueva solicitud» → ventana «Nueva solicitud de diseño» · «Registrar solicitud» |
| **Recibe** | `escuela_id` · uuid o vacío · obligatorio<br>`prenda` · texto · de 4 a 60 · obligatorio<br>`tela_material_id` · uuid · obligatorio<br>`tallas` · texto · de 1 a 30 · obligatorio<br>`descripcion` · texto · hasta 200 · opcional |
| **Reglas y errores** | `400`: «Escribe qué prenda piden» · «Escribe las tallas, por ejemplo 6 a 14»<br>`422 tela_no_es_tela`: «Escoge una tela.»<br>`422 escuela_dada_de_baja`: «{escuela} está dada de baja.» |
| **Escribe** | El desarrollo en `solicitud`, con su folio DS-; su paso `solicitud_registrada` |
| **Llama** | `admin.tomar_folio` (`desarrollo`) |
| **Regresa** | «{DS} registrada en Solicitud» |
| **Eventos** | `desarrollo.cambiado` |
| **Bitácora** | «Registró {DS} {prenda}» |

### `patronaje.empezar_muestra`

| | |
|---|---|
| **Pantalla** | Cajón del desarrollo · «Empezar muestra» |
| **Recibe** | `desarrollo_id` · `muestra_talla` (opcional, hasta 10) · `version` |
| **Reglas y errores** | `422 etapa_no_permite`: «{DS} está en {etapa}: este paso ya no aplica.» |
| **Escribe** | Etapa `muestra`, `muestra_empezada_en` y `muestra_talla`; su paso `muestra_empezada` |
| **Regresa** | «{DS}: muestra» |
| **Eventos** | `desarrollo.cambiado` |
| **Bitácora** | «Empezó la muestra de {DS}» |

### `patronaje.entregar_muestra`

| | |
|---|---|
| **Pantalla** | Cajón del desarrollo · «Muestra entregada al cliente» (con escuela) o «Muestra lista para aprobar» (sin escuela) |
| **Recibe** | `desarrollo_id` · `version` |
| **Reglas y errores** | `422 etapa_no_permite` |
| **Escribe** | Etapa `aprobacion` y `muestra_entregada_en`; sin escuela, también `autorizacion_id`. Su paso `muestra_entregada`, con la AU- si la hay |
| **Llama** | Sin escuela: `direccion.pedir_autorizacion`, tipo `aprobar_desarrollo`, desde Patronaje, con el resumen «Aprobar la muestra de {DS} · {prenda}» y el detalle «Básico o general · {tela} · tallas {tallas}» |
| **Regresa** | «{DS}: aprobación». En Pendientes sale «Esperando aprobación del cliente» o «Esperando aprobación de Dirección» |
| **Eventos** | `desarrollo.cambiado` |
| **Bitácora** | «Entregó la muestra de {DS} al cliente» o «Terminó la muestra de {DS} para aprobar» |

### `patronaje.pedir_cambios_muestra`

| | |
|---|---|
| **Pantalla** | Cajón del desarrollo · «Pidió cambios» o «Pidieron cambios» → ventana «Cambios a la muestra de {prenda}» · «Regresar a muestra» |
| **Recibe** | `desarrollo_id` · `motivo` (al menos 5 letras) · `version` |
| **Reglas y errores** | `400`: «Escribe al menos 5 letras.»<br>`422 etapa_no_permite` |
| **Escribe** | Etapa `muestra` y `motivo_cambios`; su paso `cambios_pedidos`, con el motivo |
| **Llama** | Sin escuela y con la AU- esperando: `direccion.cancelar_autorizacion`, con «Patronaje regresó la muestra con cambios» |
| **Regresa** | «{DS} regresa a muestra» |
| **Eventos** | `desarrollo.cambiado` |
| **Bitácora** | «Regresó la muestra de {DS} con cambios: {motivo}» |

### `patronaje.registrar_aprobacion_cliente`

| | |
|---|---|
| **Pantalla** | Cajón del desarrollo · «El cliente aprobó» |
| **Recibe** | `desarrollo_id` · `version` |
| **Reglas y errores** | `422 etapa_no_permite`<br>`422 aprueba_direccion`: «Sin escuela la aprueba Dirección: está en sus autorizaciones ({AU}).» |
| **Escribe** | Etapa `ficha_tecnica`, `aprobado_en`, `aprobado_por_tipo = cliente` y `aprobado_por`; su paso `aprobado` |
| **Regresa** | «{DS}: ficha técnica» |
| **Eventos** | `desarrollo.cambiado` |
| **Bitácora** | «El cliente aprobó la muestra de {DS}» |

### `patronaje.descartar_desarrollo`

| | |
|---|---|
| **Pantalla** | Cajón del desarrollo · «Descartar con motivo» → ventana «Descartar {prenda}» · «Descartar» |
| **Recibe** | `desarrollo_id` · `motivo` (al menos 5 letras) · `version` |
| **Reglas y errores** | `400`: «Escribe al menos 5 letras.»<br>`422 desarrollo_terminado`: «{DS} ya está en catálogo: no se descarta.» o «{DS} ya está descartado.» |
| **Escribe** | Etapa `cancelado`, con quién, cuándo y su motivo; su paso `cancelado` |
| **Llama** | Con la AU- esperando: `direccion.cancelar_autorizacion`, con «Patronaje descartó el desarrollo» |
| **Regresa** | «{DS} descartada. Queda en el historial con su motivo» |
| **Eventos** | `desarrollo.cambiado` |
| **Bitácora** | «Descartó {DS} {prenda}: {motivo}» |

## Acciones internas

### `patronaje.aplicar_decision_desarrollo`

El efecto que este módulo registra para el tipo `aprobar_desarrollo` (ver [módulos](../../cimientos/MODULOS.md#puntos-de-extensión)).

| | |
|---|---|
| **La llama** | `direccion.decidir_autorizacion`, en su misma transacción |
| **Recibe** | Lo que manda `direccion.decidir_autorizacion`: `autorizacion_id` · `decision` (`autorizar` o `rechazar`) · `motivo` (al rechazar, siempre) · `desarrollo_id`. Quién decidió es quien llama |
| **Reglas** | Si el desarrollo ya no está en `aprobacion`, no hace nada |
| **Escribe** | Autorizada: etapa `ficha_tecnica`, `aprobado_por_tipo = direccion` y `aprobado_por` = quien autorizó; su paso `aprobado`, con la AU- («Dirección aprobó la muestra»). Rechazada: regresa a `muestra` con el motivo del rechazo en `motivo_cambios`; su paso `cambios_pedidos` |
| **Eventos** | `desarrollo.cambiado` |

La bitácora es el renglón de Dirección.

### `patronaje.ligar_producto_desarrollo`

| | |
|---|---|
| **La llama** | `catalogo.crear_producto` con `origen = desarrollo` |
| **Recibe** | `desarrollo_id` · `producto_id` |
| **Reglas** | `422 desarrollo_no_disponible`: «{DS} ya no está en Ficha técnica: revisa el desarrollo.» |
| **Escribe** | Etapa `en_catalogo`, `producto_id` y `en_catalogo_en`; su paso `alta_en_catalogo` («dio de alta el producto en catálogo») |
| **Eventos** | `desarrollo.cambiado` |

## Lecturas

### `patronaje.desarrollos_en_proceso_de_escuela(escuela)`

| | |
|---|---|
| **La usa** | Catálogo, al dar de baja una escuela (`escuela_con_desarrollos`; ver [escuelas y secciones](../catalogo/escuelas-y-secciones.md)) |
| **Regresa** | Los folios DS- de esa escuela que no están en catálogo ni descartados |

## Parámetros

Usa `general.largo_minimo_motivo` ([configuración](../admin/configuracion.md)). No tiene parámetros propios.

## Permisos

- Todo el desarrollo: Patronaje.
- Aprobar o rechazar un desarrollo sin escuela: Dirección, con «Confirmar con Google», en sus autorizaciones.
- Dar de alta en catálogo: quien tiene Catálogo (el alta es de Catálogo).

## Eventos

`desarrollo.cambiado`.

## Cómo está hecho

**Fase 10, parte 3.**

- **Las tablas** `desarrollos` y `desarrollo_eventos` están en `modulos/patronaje/tablas.ts` (migración `0034`), con sus CHECK; el historial solo crece. La misma migración pone la llave de `autorizaciones.desarrollo_id`.
- **Lo común** (`dominio/desarrollos.ts`): leer con candado, revisar la etapa (`etapa_no_permite` con el nombre de pantalla de la etapa) y `avanzar`, que cambia la etapa, escribe el paso y guarda `desarrollo.cambiado`.
- **Las acciones** (`acciones/desarrollos.ts`, con sus contratos en `packages/compartido/src/contratos/patronaje/desarrollos.ts`): cada una toma la versión del desarrollo. Una tela de la solicitud dada de baja también es `tela_no_es_tela` (decisión 534). `entregar_muestra` sin escuela pide la AU- y regresa su id (decisión 536); pedir cambios o descartar con la AU- esperando la cancela por su id.
- **Las internas** (`internas/desarrollos.ts`): `aplicar_decision_desarrollo` es el efecto de `aprobar_desarrollo` (`efectosDeAutorizacion` en `index.ts`); si el desarrollo ya no está en aprobación, no hace nada. `ligar_producto_desarrollo` la llama `catalogo.crear_producto` con `origen = desarrollo`.
- **La lectura** `desarrollos_en_proceso_de_escuela` (`lecturas/desarrollos.ts`) regresa los folios en orden; la usa `catalogo.dar_baja_escuela`.
- **La receta del producto nuevo** nace como la de cualquier alta, en «Sin receta»: la tela de la solicitud la propone la pantalla de la receta (fase 19, decisión 538).
- **Pruebas:** `acciones/pedir-cambios-muestra.prueba.ts` (con escuela, de la solicitud a la ficha técnica con su historial; la tela y el descarte), `internas/aplicar-decision-desarrollo.prueba.ts` (sin escuela: la AU-, `aprueba_direccion`, autorizar, rechazar, y la AU- cancelada al pedir cambios o descartar), `catalogo/acciones/crear-producto.prueba.ts` (desde un desarrollo) y `catalogo/acciones/dar-baja-escuela.prueba.ts` (`escuela_con_desarrollos`).

**Fase 10, cierre.** Un rechazo de Dirección siempre trae su motivo; si llegara sin él es un error del programa (decisión 557, que reemplaza la 535).
