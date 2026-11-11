# Fase 10: Patronaje y Compras

> **Etapa:** Módulos.
> **Estado:** Terminada.
> **Antes de empezar:** lee la [forma de trabajo](../trabajo/FORMA-DE-TRABAJO.md) y la [revisión de fase](../trabajo/REVISION-DE-FASE.md).
> **Se conecta con:** [fases](FASES.md) · [fase 9](09-inventario-libro-existencias-reservas-y-traspasos.md) · [fase 11](11-aduana-y-bodega.md)

## Objetivo

Patronaje dice qué lleva cada prenda y Compras consigue lo que hace falta. Quedan listas las recetas con sus versiones, la única cuenta de material del sistema y los desarrollos de prendas nuevas; los proveedores ligados a su tercero, los materiales con sus proveedores y su historial de precios, las órdenes de compra de principio a fin, y la proyección que dice qué material se acaba, cuándo y cuánto pedir.

## Depende de

- [Fase 9](09-inventario-libro-existencias-reservas-y-traspasos.md), terminada y en verde.

## Qué se construye

### Parte 1 · Terceros, proveedores y materiales

**Construye:** la tabla `terceros`, las internas `contaduria.crear_tercero` (con `ligar_si_existe`) y `contaduria.renombrar_tercero` y la lectura `contaduria.datos_terceros`, en la carpeta `modulos/contaduria/`; las tablas `proveedores`, `materiales`, `material_proveedores` y `precios_compra` (esta solo crece); la siembra de la lista «Unidades de material»; `compras.crear_proveedor`, `compras.guardar_proveedor`, `compras.dar_baja_proveedor` (con su candado `proveedor_habitual_de`) y `compras.reactivar_proveedor`; `compras.crear_material`, `compras.guardar_material`, `compras.dar_baja_material` (con su candado `material_con_existencia`) y `compras.reactivar_material`; `compras.agregar_proveedor_material`, `compras.quitar_proveedor_material` y `compras.hacer_habitual`; la lectura `compras.costo_material`; y la bajada de los consumibles a la tablet.

**Leer:**
- [terceros y deudas](../modulos/contaduria/terceros-y-deudas.md) — la tabla `terceros`, las dos internas y la lectura; lo demás es de la fase 17.
- [proveedores y precios](../modulos/compras/proveedores-y-precios.md) — todo, menos `compras.registrar_precios_nota` (parte 4).
- [materiales](../modulos/compras/materiales.md) — todo; los candados `material_en_receta` y `material_en_orden` llegan en las partes 2 y 4.
- [configuración](../modulos/admin/configuracion.md) — las listas, con `se_cuenta_entera` en las unidades de material.
- [sincronización](../cimientos/SINCRONIZACION.md) — cómo baja una tabla a la tablet y cómo se quita un renglón.

### Parte 2 · Recetas y cuenta de material

**Construye:** las tablas `recetas`, `receta_versiones`, `receta_lineas`, `receta_linea_tallas` y `receta_medidas` (las versiones y lo que cuelga de ellas solo crecen); `patronaje.guardar_receta`; las internas `patronaje.iniciar_receta`, con su llamada desde `catalogo.crear_producto` (que ahora regresa la receta y su estado), y `patronaje.verificar_receta`; la lectura `patronaje.receta_cubre_tallas`, con el aviso de `catalogo.agregar_talla` cuando la receta no tiene la talla nueva; la lectura `patronaje.recetas_con_material`, con el candado `material_en_receta` de `compras.dar_baja_material`; la cuenta de material como función pura del paquete compartido; y las lecturas `patronaje.calcular_material` y `patronaje.desperdicio_prenda`.

**Leer:**
- [recetas](../modulos/patronaje/recetas.md) — las reglas, los estados, las tablas, la acción, las internas y las lecturas.
- [cuenta de material](../modulos/patronaje/cuenta-de-material.md) — la cuenta, el desperdicio y sus lecturas.
- [paquete compartido](../cimientos/PAQUETE-COMPARTIDO.md) — cómo vive y se prueba un cálculo puro.
- [productos](../modulos/catalogo/productos.md#catalogocrear_producto) — dónde entra la receta en el alta.
- [tallas y tipos de prenda](../modulos/catalogo/tallas-y-tipos-de-prenda.md#catalogoagregar_talla) — el aviso de la talla que la receta no tiene.

### Parte 3 · Desarrollos

**Construye:** las tablas `desarrollos` (folio DS-) y `desarrollo_eventos`; las seis acciones del desarrollo; la interna `patronaje.aplicar_decision_desarrollo`, registrada como el efecto del tipo `aprobar_desarrollo` (con su liga `desarrollo_id`, que deja su `@llavePendiente`); la interna `patronaje.ligar_producto_desarrollo`, con su llamada desde `catalogo.crear_producto` con `origen = desarrollo`; y la lectura `patronaje.desarrollos_en_proceso_de_escuela`, con el candado `escuela_con_desarrollos` de `catalogo.dar_baja_escuela`.

**Leer:**
- [desarrollos](../modulos/patronaje/desarrollos.md) — todo.
- [autorizaciones](../modulos/direccion/autorizaciones.md) — el tipo `aprobar_desarrollo` y cómo se registra su efecto.
- [escuelas y secciones](../modulos/catalogo/escuelas-y-secciones.md#catalogodar_baja_escuela) — el candado que se agrega aquí.

### Parte 4 · Órdenes de compra

**Construye:** las tablas `ordenes_compra` y `orden_compra_lineas`, con el único de un borrador por proveedor; `compras.levantar_orden`, `compras.guardar_borrador_orden`, `compras.marcar_orden_enviada` (con su PDF), `compras.cancelar_orden` y `compras.cerrar_orden_con_faltante`; las internas `compras.recalcular_estado_orden`, `compras.cerrar_orden_pagada`, `compras.reabrir_orden_pagada` y `compras.registrar_precios_nota`; la lectura `compras.ordenes_por_recibir`; y los candados que miran las órdenes: `material_en_orden` al dar de baja un material, `proveedor_con_ordenes` al dar de baja un proveedor y `en_borrador` al quitar un proveedor de un material.

**Leer:**
- [órdenes de compra](../modulos/compras/ordenes-de-compra.md) — todo.
- [proveedores y precios](../modulos/compras/proveedores-y-precios.md#comprasregistrar_precios_nota) — el precio de la nota y el historial que nace al enviar.
- [folios](../modulos/admin/folios.md) — el folio OC-.
- [archivos](../modulos/admin/archivos.md) — guardar el PDF antes de confirmar.
- [impresión](../modulos/admin/impresion.md) — el PDF de una hoja.

### Parte 5 · Proyección de material

**Construye:** la proyección como función pura del paquete compartido (los pasos 7 a 14 de su archivo); la lectura `compras.cuenta_material`, que calcula todos los materiales en una pasada y se memoriza durante la petición; y el consumo medido con las salidas del libro de movimientos.

**Leer:**
- [proyección de material](../modulos/compras/proyeccion-de-material.md) — todo.
- [existencias y cuadre](../modulos/inventario/existencias-y-cuadre.md#inventarioexistencia_materialmaterial-ubicacion) — lo que hay en Bodega y en Aduana.
- [libro de movimientos](../modulos/inventario/libro-de-movimientos.md#los-tipos-de-movimiento) — los tipos que cuentan como salida para el consumo medido.

## Cómo se construye

- Un solo agente, una parte a la vez. El orden sigue las llaves: el proveedor cuelga de su tercero, el material de su proveedor habitual, la receta de sus materiales y la orden de sus materiales y su proveedor.
- Todo es de la web, menos los consumibles que bajan a la tablet.
- Nada se recibe todavía: Aduana llega en la fase 11. Las pruebas de la proyección ponen existencias y salidas con movimientos de prueba escritos con `escribirMovimiento`, como en la fase 9.
- La cuenta de material y la proyección se prueban también con datos al azar.
- Al cerrar la fase, los datos de la muestra de Patronaje y Compras (proveedores, materiales, recetas, desarrollos y órdenes de compra) se cargan con estas mismas acciones (ver [base de datos](../cimientos/BASE-DE-DATOS.md#siembra-del-sistema-y-datos-de-la-muestra)).
- No va en esta fase: ninguna pantalla ni las consultas de Patronaje y de Compras (fase 19), ni la hoja de la orden de compra (fase 20).

## Excepciones permitidas

- **Los terceros antes de su fase.** Un proveedor no tiene nombre sin su tercero, así que la tabla `terceros` y las internas `contaduria.crear_tercero` y `contaduria.renombrar_tercero` se construyen aquí. Lo demás de [terceros y deudas](../modulos/contaduria/terceros-y-deudas.md) es de la fase 17, y Ventas usa `ligar_si_existe` desde la fase 16.
- **Lo que llega de fases posteriores** se construye aquí y se prueba directo: `compras.recalcular_estado_orden` y `compras.ordenes_por_recibir` las usa Aduana (11); `patronaje.verificar_receta`, el cierre del corte (12); `compras.registrar_precios_nota`, `compras.cerrar_orden_pagada` y `compras.reabrir_orden_pagada`, Contaduría (17). Hasta la fase 11 nada está recibido y todo proveedor está «Sin entregas todavía»; hasta la fase 12 nada está comprometido y todo desperdicio es el estimado.
- **Las llamadas a fases posteriores** las agrega esa fase: `inventario.actualizar_costo_rollos` desde `compras.registrar_precios_nota` y `inventario.recibido_de_ordenes` en la proyección y en el estado de la orden (11); los lotes por cortar en el comprometido (12).
- `recetas.verificada_lote_id` lleva su `@llavePendiente` hasta la fase 12.
- La hoja `orden_compra` la registra la fase 20: `compras.marcar_orden_enviada` se prueba con el tipo de prueba de la fase 4.

## Criterios de terminado

| Criterio | Prueba que lo demuestra |
|---|---|
| Un proveedor nuevo con el nombre de un cliente se liga a su tercero en lugar de crear otro; con el de otro proveedor, sin importar acentos ni mayúsculas, es `proveedor_repetido` | `modulos/compras/acciones/crear-proveedor.prueba.ts` y `modulos/contaduria/internas/crear-tercero.prueba.ts` |
| Renombrar un proveedor renombra su tercero; su condición nueva no cambia la de las órdenes ya enviadas | `modulos/compras/acciones/guardar-proveedor.prueba.ts` |
| El alta de un material deja, en una transacción, el material sin existencia, su proveedor habitual con su último precio y el primer precio del historial; la tela solo en metros; una unidad que no está en la lista no entra | `modulos/compras/acciones/crear-material.prueba.ts` |
| Un material con existencia, en una orden abierta o en la receta vigente de una prenda no se da de baja; un proveedor habitual o con órdenes abiertas, tampoco; un material cuyo habitual está dado de baja no se reactiva | `dar-baja-material.prueba.ts`, `dar-baja-proveedor.prueba.ts` y `reactivar-material.prueba.ts` |
| El habitual no deja de surtir; agregar, quitar o hacer habitual un proveedor sube la versión del material | `quitar-proveedor-material.prueba.ts` y `hacer-habitual.prueba.ts` |
| El historial de precios solo crece y el rol de la app no lo cambia ni lo borra; cada renglón trae su anterior y su cambio; el último precio de cada par es siempre el renglón más nuevo | `modulos/compras/tablas.prueba.ts` y `marcar-orden-enviada.prueba.ts` |
| El costo de un material es el precio vigente de la orden enviada más reciente que no está cancelada, con cualquier proveedor, o el del alta | `modulos/compras/lecturas/costo-material.prueba.ts` |
| A la tablet bajan los consumibles activos con su nombre y sus unidades, nunca un costo; al darse de baja, se quitan | `modulos/compras/bajada.prueba.ts` |
| Guardar una receta crea una versión que no cambia, con la conversión congelada; cambiar solo medidas no quita la verificación | `modulos/patronaje/acciones/guardar-receta.prueba.ts` |
| Un producto de una sección con receta nace con la suya; a partir de otro, con la versión vigente del base, solo sus tallas y las medidas del alta; desde un desarrollo, lo liga y el desarrollo queda en catálogo | `modulos/catalogo/acciones/crear-producto.prueba.ts` y `modulos/patronaje/internas/iniciar-receta.prueba.ts` |
| La cuenta de material da lo mismo en la pantalla y en la API: la tela principal con desperdicio, todo hacia arriba, un cono por lo menos, y «—» si falta un dato | `packages/compartido/src/calculos/cuenta-material.prueba.ts`, con fast-check, y `modulos/patronaje/lecturas/calcular-material.prueba.ts` |
| Un desarrollo sin escuela solo lo aprueba Dirección; si lo rechaza, regresa a muestra con el motivo; pedir cambios o descartarlo cancela su autorización | `modulos/patronaje/internas/aplicar-decision-desarrollo.prueba.ts` y `pedir-cambios-muestra.prueba.ts` |
| Una escuela con desarrollos en proceso no se da de baja | `modulos/catalogo/acciones/dar-baja-escuela.prueba.ts` |
| Un proveedor tiene un solo borrador: lo que se levanta se suma ahí, también con dos personas al mismo tiempo; una cantidad que no es múltiplo o pasa del tope no entra | `modulos/compras/acciones/levantar-orden.prueba.ts`, con dos conexiones |
| Enviar congela cantidades y precios, copia la condición, guarda el PDF antes de confirmar (si falla, la orden sigue en borrador) y deja a un proveedor nuevo entre los que surten el material | `modulos/compras/acciones/marcar-orden-enviada.prueba.ts` |
| Una orden recibida en parte no se cancela; solo ella se cierra con faltante; cancelar o cerrar deja de contar en camino; nada se borra | `cancelar-orden.prueba.ts` y `cerrar-orden-con-faltante.prueba.ts` |
| La orden pagada se cierra sola y vuelve a recibida al cancelarse su pago; las internas no tocan una orden en otro estado | `modulos/compras/internas/cerrar-orden-pagada.prueba.ts` y `reabrir-orden-pagada.prueba.ts` |
| La nota cambia el precio vigente de la línea, deja su renglón «según la nota» y no toca una línea con el mismo precio | `modulos/compras/internas/registrar-precios-nota.prueba.ts` |
| La proyección da los números del ejemplo de la gabardina azul marino (se acaba el 21 oct, faltan 4 días, pide 1,700 m), y lo mismo en la pantalla que en la API | `packages/compartido/src/calculos/proyeccion-material.prueba.ts` y `modulos/compras/lecturas/cuenta-material.prueba.ts` |
| Con datos al azar: el día en que se acaba es el primero en que la serie baja de cero; lo que faltó no se recupera; el pedido sugerido es múltiplo de compra y cubre los días más el mínimo | `proyeccion-material.prueba.ts`, con fast-check |
| Con 90 días de salidas, el consumo deja de ser el inicial y sale de las salidas divididas entre el factor de su mes | `cuenta-material.prueba.ts` |

## Revisión de fase

Normal: un [auditor](../../.claude/agents/auditor.md) con contexto limpio revisa los seis puntos de la [revisión de fase](../trabajo/REVISION-DE-FASE.md).
