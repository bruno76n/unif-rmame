# Hojas

> **Qué cubre:** las hojas en PDF que arma la API con React-PDF: la orden de compra, el pedido, la nota de entrega (con precios y sin precios), la hoja del despacho D- y la hoja del lote; lo que lleva cada una, quién la saca y desde dónde.
> **Estado:** Decidido.
> **Se construye en:** [fase 20](../fases/20-tablet-puente-de-impresion-e-impresos.md).
> **Se conecta con:** [impresión](../modulos/admin/impresion.md) · [etiquetas](etiquetas.md) · [órdenes de compra](../modulos/compras/ordenes-de-compra.md) · [pedidos](../modulos/ventas/pedidos.md) · [notas de entrega](../modulos/ventas/notas-de-entrega.md) · [surtido y despachos](../modulos/inventario/surtido-y-despachos.md) · [lotes](../modulos/produccion/lotes.md) · [corte y bultos](../modulos/produccion/corte-y-bultos.md) · [configuración](../modulos/admin/configuracion.md) · [archivos](../modulos/admin/archivos.md) · [pantallas de Compras](../interfaz/fabrica/compras.md) · [pantallas de Ventas](../interfaz/fabrica/ventas.md) · [pantallas de Aduana](../interfaz/fabrica/aduana.md) · [pantallas de Producción](../interfaz/fabrica/produccion.md) · [arquitectura](../cimientos/ARQUITECTURA.md) · [estructura](../cimientos/ESTRUCTURA.md) · [fase 20](../fases/20-tablet-puente-de-impresion-e-impresos.md)

## Para qué sirve

Lo que sale de la fábrica en papel sale igual siempre, con los datos del sistema y sin pasarlos a mano. Ejemplo: Aduana despacha el D-0414 a la Tienda 1 y aprieta «Hoja»: sale la hoja con los dos traspasos que lleva, prenda por prenda y talla por talla, sin un solo precio, y abajo los renglones para que la encargada firme de recibido. Ventas saca la nota NV-0151 con sus precios para el cliente; si la abre Aduana, sale la misma nota sin precios.

## Reglas

1. **Tamaño carta, vertical,** con márgenes de 1.5 cm. Helvetica de 10 puntos y sus títulos en negritas; los folios y las cifras con números tabulares. Sin letras descargadas.
2. **El encabezado de todas:** a la izquierda, el nombre comercial en negritas y abajo la razón social, el RFC y el domicilio, de Configuración · Empresa (ver [configuración](../modulos/admin/configuracion.md#la-tabla-empresa)); a la derecha, el nombre de la hoja, su folio grande y su fecha.
3. **El pie de todas:** «Hoja {n} de {total}» y «Sacada el {fecha} a las {hora} por {nombre}». Una tabla que no cabe sigue en la hoja siguiente con su encabezado.
4. **Cada hoja trae solo lo que la cuenta puede ver:** la nota de entrega sale sin precios para quien no los ve, y la del despacho y la del lote nunca llevan precios ni costos. La cuenta de soporte nunca recibe un monto (ver [acceso y permisos](../cimientos/ACCESO-Y-PERMISOS.md)): su nota sale sin precios, y la orden de compra y el pedido, que siempre los llevan, le responden `403`.
5. **Con los datos de ese momento,** salvo la orden de compra: su PDF se guarda al enviarla y es el que se ve después (ver [órdenes de compra](../modulos/compras/ordenes-de-compra.md#comprasmarcar_orden_enviada)).
6. **Pesos y fechas como en las pantallas:** pesos enteros o con sus dos centavos, nunca a medias; fechas como «7 nov 2026» (ver [textos](../interfaz/TEXTOS.md#reglas)).
7. **Se abren en el navegador** desde su botón («PDF», «Hoja», «Ver PDF»): desde ahí se imprimen, se guardan o se mandan.

## La orden de compra

Tipo `orden_compra`, del módulo `compras`. La sacan Compras y Contaduría.

- **Cuándo:** se arma y se guarda al «Marcar enviada»; «Ver PDF» del cajón de la orden abre la guardada.
- **Lleva:** «Orden de compra {OC}» y «Creada el {fecha}»; el proveedor (nombre, RFC si lo tiene y teléfono); «Promete llegar el {fecha}» y la condición («Contado» o «Crédito {n} días»); la tabla Material · Cantidad (en su unidad) · Precio · Importe; el total y «Precios sin IVA»; «Entregar en Aduana: {domicilio}»; y quién la levantó.

## El pedido

Tipo `pedido`, del módulo `ventas`. Lo saca Ventas.

- **Cuándo:** «PDF» en el cajón del pedido, desde que se confirma.
- **Lleva:** «Pedido {PE}» y «versión {n}»; el cliente (nombre, contacto, teléfono y dirección de entrega); «Para el {fecha}» y la forma de pago («Contado», «Anticipo» o «Crédito {n} días»); la tabla Prenda · Tallas · Piezas · Precio · Importe, con las tallas especiales marcadas; el total; y, si ya hubo notas, «{n} de {m} piezas entregadas».

## La nota de entrega

Tipo `nota_entrega`, del módulo `ventas`. La sacan Ventas, Contaduría y Aduana.

- **Cuándo:** «PDF» en el cajón de la nota, desde que se arma; viaja con el despacho.
- **Con precios** (Ventas y Contaduría): «Nota de entrega {NV}», «nota {i} de {n} del pedido {PE}»; el cliente y su dirección de entrega; armada y, si ya salió, «Salió el {fecha} con {D}»; la tabla Prenda · Talla · Piezas · Precio · Importe; subtotal, anticipo aplicado, nota de crédito si tiene, y «Por cobrar»; la forma de pago y, a crédito, «Vence el {fecha}» desde que se entrega.
- **Sin precios** (Aduana): lo mismo sin Precio, Importe ni lo de dinero.
- **Abajo, en las dos:** «Recibí completo», con renglones para nombre, firma y fecha.

## La hoja del despacho

Tipo `despacho`, del módulo `inventario`. La saca Aduana.

- **Cuándo:** «Hoja» en cada despacho de En tránsito (ver [pantallas de Aduana](../interfaz/fabrica/aduana.md)); viaja con la mercancía.
- **Lleva:** «Despacho {D}»; el destino (Bodega, la tienda, o el cliente con su NV-); «Salió el {fecha} a las {hora}» y quién despachó; por cada traspaso, su folio y de qué es («L-2026-124 · reabasto», «S-T1-088», «NV-0151», «OC-0225 · material») y su tabla Prenda · Talla · Piezas (en el material, Material · Rollo · Cantidad: los metros del rollo o la cantidad en su unidad); el total de piezas si lleva prendas; y «Recibió», con renglones para nombre, firma, fecha y hora.
- **Nunca lleva precios.**

## La hoja del lote

Tipo `lote`, del módulo `produccion`. La saca Producción.

- **Cuándo:** «Hoja del lote» en el cajón del lote, ya cortado; acompaña a los bultos en el taller.
- **Lleva:** «Lote {L}» y «{OP}»; la prenda; «{para quién} · entrega {fecha}»; «Cortado el {fecha} por {nombre}» y la versión de la receta; la tela y sus partidas («Partida P-2224 y P-2231: el tono puede variar entre piezas» si son varias); la tabla Bulto · Talla · Piezas, con su total; y el flujo: Orden · Operación · La hace.
- **Nunca lleva** precios, costos ni tarifas.

## Cómo se arman

- **Cada módulo registra su tipo** en su `index.ts`, con quién la pide y la función que junta sus datos con el recorte de esa cuenta (ver [impresión](../modulos/admin/impresion.md#los-tipos-de-etiqueta-y-de-hoja)).
- **Los dibujos** viven en `apps/api/src/impresos/` (ver [estructura](../cimientos/ESTRUCTURA.md#la-api-por-dentro)), uno por hoja, con React-PDF. Reciben datos ya listos y no consultan nada ni deciden nada del negocio.
- **Salen por** `GET /v1/etiquetas/{tipo}/{id}?formato=pdf`; la orden de compra, además, se guarda como archivo con el propósito `pdf_documento` (ver [archivos](../modulos/admin/archivos.md)).

## Cómo se prueba

- **Cada hoja,** con los datos de la muestra: trae el texto esperado, se parte bien en varias hojas y repite el encabezado de su tabla.
- **El recorte:** la nota que pide Aduana no trae un solo peso; la del despacho y la del lote tampoco, las pida quien las pida; una cuenta sin el departamento recibe `403`, como en las etiquetas (decisión 811).
- **La orden de compra:** el PDF guardado al enviarla no cambia aunque después cambien el proveedor o la nota del proveedor.

## Cómo está hecho

**Fase 20, parte 2.**

- **Lo común** (`apps/api/src/impresos/hoja.ts`): `hojaPdf` arma la hoja carta con React-PDF (márgenes de 42.5 puntos, Helvetica de 10), su encabezado con la empresa y su nombre, folio y fecha, y el pie fijo con «Hoja {n} de {total}» y «Sacada el…». `datosPdf`, `subtituloPdf`, `tablaPdf` (su renglón de títulos es fijo, así se repite en cada hoja; cada renglón no se parte) y `firmasPdf` son sus piezas. Sin JSX: Node corre el archivo tal cual, con `createElement`.
- **El marco** (`apps/api/src/nucleo/hojas.ts`): `marcoDeLaHoja` lee la empresa con la lectura `admin.empresa` (ver [configuración](../modulos/admin/configuracion.md#adminempresa)) y el nombre de quien la pide con `nombreDeCuenta`, y escribe la fecha y la hora de México (`textoDeDiaConAnio` y `textoDeHora` del paquete compartido).
- **Los dibujos** (`impresos/hojas/orden-compra.ts`, `pedido.ts`, `nota-entrega.ts`, `despacho.ts` y `lote.ts`) reciben todo ya escrito. A la nota de quien no ve precios no le llega nada de dinero: su dibujo deja fuera Precio, Importe y las cuentas.
- **Los tipos,** en el `impresion.ts` de su módulo. `orden_compra` y `pedido` llevan `llevaMontos`, y la ruta de `/v1/etiquetas` le responde `403` a la cuenta de soporte, porque un PDF no pasa por el recorte común:
  - `orden_compra` (`compras`; Compras y Contaduría): la condición de la orden o, mientras se envía, la del proveedor; se entrega en el domicilio de la empresa. `compras.marcar_orden_enviada` la arma y la guarda como `pdf_documento`;
  - `pedido` (`ventas`; Ventas): un renglón por prenda y precio, así las tallas especiales van en el suyo con «(especiales)»; «{n} de {m} piezas entregadas» del avance de Ventas, si ya hubo notas. Un borrador da `422 pedido_no_confirmado`;
  - `nota_entrega` (`ventas`; Ventas, Contaduría y Aduana): ven precios Ventas, Contaduría y Dirección, nunca soporte (`vePreciosDeNotas` de `ventas/dominio/notas.ts`, la misma regla del cajón y de lo que regresan sus acciones); el renglón «Total» lleva las piezas y el subtotal en Importe. «Por cobrar» es el subtotal menos el anticipo aplicado y las notas de crédito autorizadas; a crédito, ya entregada, «Vence el {fecha}» a sus días. Los descuentos van con «-»: la Helvetica del PDF no trae «−»;
  - `despacho` (`inventario`; Aduana): cada traspaso con su folio y de qué es, su tabla de prendas o de material (Material · Rollo · Cantidad) y, si lleva prendas, el total de piezas;
  - `lote` (`produccion`; Producción): solo de un lote cortado (`422 lote_sin_cortar`); sus partidas son las de los rollos apartados de la tela principal.
- **Los botones** abren la hoja en otra pestaña con `abrirHoja` (`apps/web/src/comun/hojas.ts`): «PDF» en los cajones del pedido y de la nota, «Hoja del lote» en el del lote y «Hoja» en cada despacho de En tránsito.
- **Las pruebas,** en `apps/api/src/impresos/hojas/`: `orden-compra.prueba.ts`, `ventas.prueba.ts` (el pedido y la nota con la muestra, con y sin precios, también para soporte con Ventas), `despacho.prueba.ts` (también uno solo de material, sin total de piezas) y `lote.prueba.ts` (también que se parte en dos hojas con el encabezado de su tabla). Que el PDF de la orden no cambie después de enviarla, en `modulos/compras/acciones/marcar-orden-enviada.prueba.ts`. «Hoja» de En tránsito, en `apps/web/src/departamentos/aduana/aduana.prueba.ts`.
