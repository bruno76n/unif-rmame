# Migración

> **Qué cubre:** el arranque con los datos de hoy: qué entra y qué no, los archivos que se llenan, el orden y los tres tiempos de la carga, cómo se ensaya y cómo se revisa, los códigos de barras de hoy, las existencias por conteo, los pedidos y los lotes que están a medias el día del arranque, lo que se termina como hoy, y las tiendas mientras no tienen su caja.
> **Estado:** Decidido.
> **Se construye en:** [fase 23 ●](fases/23-puesta-en-marcha.md).
> **Se conecta con:** [cuentas](modulos/admin/cuentas.md) · [variantes, códigos y etiquetas](modulos/catalogo/variantes-codigos-y-etiquetas.md) · [proveedores y precios](modulos/compras/proveedores-y-precios.md) · [conteos](modulos/inventario/conteos.md) · [surtido y despachos](modulos/inventario/surtido-y-despachos.md) · [personas](modulos/personal/personas.md) · [clientes](modulos/ventas/clientes.md) · [mínimos y reabasto](modulos/inventario/minimos-y-reabasto.md) · [libro de movimientos](modulos/inventario/libro-de-movimientos.md) · [escuelas y secciones](modulos/catalogo/escuelas-y-secciones.md) · [precios](modulos/catalogo/precios.md) · [folios](modulos/admin/folios.md) · [terceros y deudas](modulos/contaduria/terceros-y-deudas.md) · [nómina](modulos/contaduria/nomina.md) · [infraestructura](cimientos/INFRAESTRUCTURA.md) · [flujo 05](flujos/fabrica/05-reabasto-y-surtido-a-tiendas.md)

## Para qué sirve

Que el lunes del arranque todos trabajen en Unifórmame con lo que de verdad hay, sin capturar a mano lo que ya existe en las hojas de hoy. Ejemplo: el jueves se cargan el catálogo con sus códigos de siempre, las personas, los clientes y los proveedores. Viernes y sábado Patronaje pasa sus recetas, Producción sus flujos, Personal las tarifas y los PIN, y la dueña da las cuentas y registra la tablet y las impresoras. El sábado en la tarde se cuenta todo y el domingo entran las existencias, los pedidos abiertos y las deudas. El lunes la tablet ya registra.

## Reglas

1. **Se carga una vez,** sobre la base de producción recién sembrada. Antes se ensaya en una base de ensayo con los mismos archivos, las veces que haga falta, hasta que sale limpia.
2. **Primero se revisa todo:** si un archivo tiene un error, no se carga nada de ese tiempo y el reporte dice archivo, renglón, columna y qué está mal.
3. **Entra por los módulos:** cada renglón lo escribe la acción de su módulo, en su transacción, con su bitácora a nombre de «Migración» y origen `migracion`. Nunca SQL a mano. Solo lo que una acción no puede hacer (conservar un código de hoy, seguir la numeración de hoy) tiene su carga de arranque (abajo).
4. **Entra lo vigente, no la historia:** el catálogo vivo, las personas activas, los clientes y proveedores con trato, las existencias contadas, lo que está abierto. Las ventas, los pedidos cerrados y los movimientos de antes se quedan en las hojas de hoy.
5. **Lo que se puede contar, se cuenta:** las existencias entran por el conteo físico del día del arranque, no por lo que dice una hoja.
6. **Lo de dinero que ya estaba abierto se termina como hoy:** lo que deben los clientes y lo que se debe a los proveedores el día del arranque se cobra y se paga fuera del sistema; en Unifórmame nace solo lo nuevo. Sí entran las deudas con sus mensualidades que faltan y los descuentos semanales (abajo).
7. **Los archivos llevan datos personales y sueldos:** viven en la computadora de Bruno, nunca entran a git y se borran del servidor al terminar.

## El comando

- `pnpm migracion:cargar <carpeta> --tiempo base|arranque`. En producción se corre en la consola del worker de Render, contra su `BASE_DATOS_URL` (ver [infraestructura](cimientos/INFRAESTRUCTURA.md#las-variables-de-entorno)), porque la base no se alcanza desde fuera; los archivos se suben ahí solo mientras dura la carga. Los ensayos, en una base local con la misma imagen.
- **Con `--ensayo`** revisa todo y lo carga en una transacción que deshace al final: dice qué haría.
- **Solo corre si la base está lista para eso:** sembrada y sin documentos del negocio que no sean de la migración. Si encuentra uno, se detiene.
- **«Migración»** es el actor del sistema con que entra todo: tiene los departamentos que pide cada acción, sin «Confirmar con Google», y solo existe dentro de este comando.
- **Al terminar la base** crea la cuenta de la dueña y la de soporte con `CORREO_DUENA` y `CORREO_SOPORTE`, ligadas a sus personas: es la siembra de la puesta en marcha (ver [cuentas](modulos/admin/cuentas.md#las-primeras-cuentas)). Las demás cuentas las da la dueña en la preparación.

## Los tres tiempos

| Tiempo | Cuándo | Qué entra | Cómo |
|---|---|---|---|
| **La base** | Unos días antes | Empresa, folios de hoy, escuelas, productos con sus tallas, sus códigos y sus precios, personas, clientes con su crédito, proveedores y materiales | `--tiempo base` |
| **La preparación** | Esos días, en el sistema | Las cuentas y sus departamentos, los aparatos y las impresoras (la dueña); las recetas (Patronaje); los flujos y sus personas (Producción); las tarifas y los PIN (Personal); los mínimos y los parámetros «Por decidir» (la dueña) | A mano, en sus pantallas, como cualquier día |
| **El arranque** | El día sin operación, después de contar | Existencias de prendas y de material, pedidos abiertos con sus anticipos, deudas y descuentos semanales | `--tiempo arranque` |

## Los archivos

CSV en UTF-8, con su renglón de encabezado, uno por tema, en una carpeta fuera del repositorio.

| Archivo | Tiempo | Columnas | Entra con |
|---|---|---|---|
| `empresa.csv` | base | razón social, nombre comercial, RFC, domicilio | `admin.editar_empresa` |
| `folios.csv` | base | tipo (`pedido`, `nota_entrega`, `orden_compra`), el último número de hoy | `admin.cargar_arranque` |
| `escuelas.csv` | base | nombre | `catalogo.agregar_escuela` |
| `productos.csv` | base | nombre, sección, escuela o vacío (Básico), tipo de prenda, dónde se vende, categoría de mayoreo, recargo de pedido especial | `catalogo.cargar_arranque` |
| `variantes.csv` | base | producto, talla, código de 6 dígitos, si es de pedido especial | `catalogo.cargar_arranque` |
| `precios.csv` | base | producto, talla (vacía: el precio base), lista, precio en pesos | `catalogo.cargar_arranque` |
| `personas.csv` | base | nombre, puesto, área, ubicación, forma de pago (tiempo, pieza o mixta), pago por día, fecha de ingreso, y `cuenta` (`duena` o `soporte`, solo en esas dos personas) | `personal.dar_alta_persona` |
| `clientes.csv` | base | nombre, RFC, tipo, escuela, municipio, dirección de entrega, contacto, teléfono, correo, días de crédito, límite de crédito | `ventas.crear_cliente` y `contaduria.cambiar_limite_credito` |
| `proveedores.csv` | base | nombre, RFC, contacto, teléfono, correo, condición en días, días que tarda | `compras.crear_proveedor` |
| `materiales.csv` | base | nombre, tipo (tela, avío o consumible), unidad, de cuánto en cuánto se compra, unidad y factor de la tablet (consumibles), proveedor habitual y su precio | `compras.crear_material` y `compras.agregar_proveedor_material` |
| `existencias.csv` | arranque | ubicación (Bodega o Aduana), código, piezas contadas | `inventario.registrar_carga_inicial` |
| `material.csv` | arranque | material, cantidad contada; en tela, un renglón por rollo con sus metros y su partida | `inventario.registrar_carga_inicial_material` |
| `pedidos.csv` | arranque | cliente, referencia de hoy, entrega, forma de pago, producto, talla, piezas que faltan por entregar, precio | `ventas.guardar_borrador_pedido` y `ventas.confirmar_pedido` |
| `anticipos.csv` | arranque | referencia del pedido, monto que dejó y no se ha usado | `contaduria.registrar_pago_recibido`, al pedido |
| `deudas.csv` | arranque | acreedor, motivo, lo que falta, mensualidad, siguiente pago | `contaduria.registrar_deuda` |
| `descuentos.csv` | arranque | persona, descuento semanal, motivo | `contaduria.guardar_descuento_semanal` |

Las cuentas, los aparatos, las recetas, los flujos, las tarifas, los PIN y los mínimos no tienen archivo: se capturan en la preparación, en sus pantallas.

## Las cargas de arranque

Lo único que las acciones de siempre no hacen. Cada una es una interna de su módulo, solo la llama el comando y no corre si su módulo ya tiene operación.

| Interna | Qué hace | Reglas |
|---|---|---|
| `admin.cargar_arranque` | Sube el contador de PE-, NV- y OC- para que sigan la numeración de hoy | Solo sube un contador, nunca lo baja (ver [folios](modulos/admin/folios.md)) |
| `catalogo.cargar_arranque` | Crea cada producto con sus variantes y sus códigos de hoy, y sus precios con origen `migracion` | Un código por variante, único y en su rango: 100001 a 499999 de la fábrica, 500001 a 599999 de los que nacieron en tienda (`codigo_migrado_de_tienda`). Las variantes nacen con su etiqueta impresa: las piezas ya la traen. El contador de fábrica queda en el mayor código de fábrica más uno (ver [variantes, códigos y etiquetas](modulos/catalogo/variantes-codigos-y-etiquetas.md)) |

## El día del arranque

- **Se escoge un día con lo menos posible a medias:** sin lotes en el taller si se puede, y con los despachos de la semana ya recibidos.
- **Se cuenta todo:** Bodega y Aduana, prenda por prenda, y el material de Bodega, rollo por rollo con su partida. Lo contado es la existencia de arranque.
- **Los pedidos abiertos** entran como pedidos nuevos, confirmados, con lo que les falta entregar y su precio de hoy; su anticipo sin usar entra como un pago a ese pedido. Lo que ya está hecho para ellos y se contó en Bodega se lo aparta Ventas con «Surtir de bodega».
- **Lo que esté en el taller** se termina como hoy. Cuando sale, Aduana lo recibe con la carga inicial si esa talla todavía no tiene movimientos en Aduana; si ya tiene, con un conteo y su ajuste («Producción de antes del arranque», que la dueña agrega a «Motivos de ajuste»), que autoriza Dirección.
- **Las órdenes de compra en camino** se capturan en Compras como órdenes enviadas, con lo que falta llegar, para que Aduana las reciba en el sistema.
- **Los respaldos:** el primer respaldo semanal se corre a mano al terminar la carga, y se prueba su restauración antes de la primera semana (ver [infraestructura](cimientos/INFRAESTRUCTURA.md#la-restauración-probada)).

## Las tiendas sin caja

Mientras Unifórmame no lleva la existencia de una tienda (su `ubicaciones.existencia_desde` va vacía, ver [libro de movimientos](modulos/inventario/libro-de-movimientos.md#la-tabla-ubicaciones)), su existencia la lleva su punto de venta de hoy y Unifórmame no la cuenta. No depende del aparato: registrar la caja no la cambia, y revocarla tampoco.

1. **Bodega le manda lo que pide** con «Mandar a {tienda}» en el cajón de la variante (`inventario.mover_a_tienda`); el reabasto no la cuenta (ver [mínimos y reabasto](modulos/inventario/minimos-y-reabasto.md#reglas), regla 12).
2. **Sale por Aduana** como todo: se recibe, se despacha en su D- y viaja con la hoja del despacho.
3. **Su encargada firma la hoja,** y Aduana confirma la entrega con ese nombre (`inventario.entregar_a_tienda_sin_caja`): lo que llegó sale de la fábrica con `entrega_tienda_sin_caja`, y lo que faltó se queda en Tránsito a cargo de Aduana, por aclarar (ver [surtido y despachos](modulos/inventario/surtido-y-despachos.md#reglas), regla 9).
4. **Lo que una tienda regresa** a la fábrica entra a Aduana con un conteo y su ajuste («Regreso de tienda», que la dueña agrega a «Motivos de ajuste»), que autoriza Dirección.
5. **Cuando llega su caja** (con el POS):
   1. La dueña registra la caja. La tienda sigue sin caja: Aduana confirma con la firma todo lo que iba en camino a ella, y la caja todavía no recibe ropa.
   2. Sin nada en tránsito hacia ella, la tienda hace su carga inicial por conteo, sin autorización (ver [conteos](modulos/inventario/conteos.md#reglas), regla 6). Esa carga pone `existencia_desde`; con un despacho en tránsito hacia la tienda, no se deja.
   3. Desde ahí todo es como dicen los módulos: la tienda confirma lo que recibe desde su caja y entra al reabasto.

El flujo completo está en el [flujo 05](flujos/fabrica/05-reabasto-y-surtido-a-tiendas.md).

## Cómo se revisa

- **Cada archivo,** antes de cargar: columnas, tipos, que cada referencia exista (la escuela de un producto, el producto de una variante, el cliente de un pedido) y que no haya repetidos (nombres, RFC, códigos).
- **Después de cargar,** el reporte de la carga: cuántos renglones entraron por archivo, contra cuántos traía; la suma de piezas y de metros contra los conteos; y el cuadre de la noche sin residuo.
- **Bruno revisa con la dueña** una muestra de cada archivo en las pantallas: diez productos con sus tallas y precios, diez clientes, el material de una tela, las existencias de una sección.

## Cómo se prueba

- **Con archivos de ejemplo** sacados de los datos de la muestra: la carga de los dos tiempos en una base vacía deja lo mismo que la muestra.
- **Un archivo con un error** no carga nada de su tiempo y el reporte dice dónde.
- **Una base con operación** no se deja cargar.
- **Los códigos:** se conservan; uno repetido o fuera de su rango detiene la carga; el contador queda en el mayor de fábrica más uno.
- **El ensayo** no deja nada escrito.

## Cómo está hecho

*Lo escribe Claude Code al terminar la fase 23.*
