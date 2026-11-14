# Etiquetas

> **Qué cubre:** las etiquetas que imprimen las Zebra en ZPL, con su PDF de respaldo: la de prenda con el Code 128 de su variante, la de rollo R- (y la de retazo RZ-), la de bulto B- y las que lleva un A- al salir de aduana; su medida, su contenido, quién las imprime y desde dónde, y cómo se arman.
> **Estado:** Decidido.
> **Se construye en:** [fase 20](../fases/20-tablet-puente-de-impresion-e-impresos.md).
> **Se conecta con:** [impresión](../modulos/admin/impresion.md) · [puente de impresión](../apps/puente-de-impresion.md) · [hojas](hojas.md) · [variantes, códigos y etiquetas](../modulos/catalogo/variantes-codigos-y-etiquetas.md) · [material en bodega](../modulos/inventario/material-en-bodega.md) · [recepción del taller](../modulos/inventario/recepcion-del-taller.md) · [surtido y despachos](../modulos/inventario/surtido-y-despachos.md) · [corte y bultos](../modulos/produccion/corte-y-bultos.md) · [la tablet](../apps/tablet.md) · [pantallas de la tablet](../interfaz/tablet.md) · [pantallas de Catálogo](../interfaz/fabrica/catalogo.md) · [pantallas de Aduana](../interfaz/fabrica/aduana.md) · [pantallas de Bodega](../interfaz/fabrica/bodega.md) · [pantallas de Producción](../interfaz/fabrica/produccion.md) · [arquitectura](../cimientos/ARQUITECTURA.md) · [estructura](../cimientos/ESTRUCTURA.md) · [fase 20](../fases/20-tablet-puente-de-impresion-e-impresos.md)

## Para qué sirve

Cada pieza, cada rollo y cada bulto lleva su etiqueta con un código de barras que se lee con la cámara o con un lector, así nadie copia folios a mano. Ejemplo: Aduana recibe del taller 58 playeras polo del L-2026-124 para la Tienda 1 y aprieta «Imprimir etiquetas»: salen 58 etiquetas de prenda, talla por talla, cada una con «Playera polo blanca con escudo», «Instituto Juan Pablo II · Talla 8» y las barras del código de esa talla. En el taller, los bultos del L-2026-121 llevan su etiqueta B- y la tablet los abre con la cámara.

## Reglas

1. **Una sola medida para todas:** 2 × 1 pulgadas (50.8 × 25.4 mm), a lo ancho, en las Zebra ZD421 de 203 ppp: 406 × 203 puntos. Así cada Zebra lleva un solo rollo de etiquetas. Cambiar la medida es cambiar los dibujos, no un parámetro.
2. **Todas llevan Code 128** con su código o su folio, y debajo el mismo texto para leerlo a ojo. En la Zebra las barras las dibuja la impresora (`^BC`); en el PDF, bwip-js.
3. **Nunca llevan costos.** El único peso que puede ir es el precio de mostrador en la de prenda, el que ve el cliente, y solo si `catalogo.etiqueta_lleva_precio` lo pide (No, al inicio). Por eso Aduana puede imprimirla aunque en sus pantallas nunca ve pesos.
4. **El contenido sale del módulo dueño** de lo que se etiqueta, con los datos de ese momento; el dibujo vive en un solo lugar (abajo, «Cómo se arman»).
5. **Imprimir es pedir un trabajo** para la Zebra de la ubicación (ver [impresión](../modulos/admin/impresion.md)). Sin impresora conectada, la pantalla ofrece el PDF, que sale igual y se imprime a tamaño real en cualquier impresora.
6. **Reimprimir se puede siempre** y no cambia el estado de lo etiquetado, salvo lo que dice cada acción.

## La etiqueta de prenda

Tipo `prenda`, del módulo `catalogo`. Una por pieza.

- **Lleva:** el nombre de la prenda en negritas (hasta dos renglones; lo que no cabe se corta con «…»); «{escuela o Básico} · Talla {t}»; las barras del código de 6 dígitos de la variante y el código debajo; con `catalogo.etiqueta_lleva_precio`, el precio de mostrador de esa talla (con su recargo si es de pedido especial); y «Pedido especial» si la talla lo es.
- **El dibujo** es el de la vista previa de Catálogo · Etiquetas en la muestra («Así queda la etiqueta de la talla {t}»).
- **Ejemplo:** «Pants deportivo» · «Básico · Talla 10» · barras · «100269».

## La etiqueta de rollo y la de retazo

Tipo `rollo`, del módulo `inventario`. Una por rollo; si el rollo quedó como retazo, sale la del retazo.

- **Rollo:** el folio R- grande con sus barras; la tela; «Partida {P} · {código del proveedor}» (o «Sin partida»); «{metros} m», los que traía al recibirlo; y «{proveedor} · {fecha en que llegó}», o «Carga inicial».
- **Retazo:** «Retazo» y el folio RZ- grande con sus barras; «del {R-}»; la tela y su partida; «{metros} m»; y «Corte {lote} · {fecha}».
- **Ejemplo:** «R-0431» · barras · «Gabardina azul marino» · «Partida P-2224 · 7731-B» · «92 m» · «Textiles Aurora · 7 nov 2026».

## La etiqueta de bulto

Tipo `bulto`, del módulo `produccion`. Una por bulto, al cerrar el corte.

- **Lleva:** el folio B- grande con sus barras (lo que lee la tablet); «{prenda} · Talla {t}»; «{n} piezas»; «{lote} · bulto {n} de {total}»; y «{para quién} · entrega {fecha}».
- **Ejemplo:** «B-2026-121-03» · barras · «Pantalón azul marino · Talla 12» · «24 piezas» · «L-2026-121 · bulto 3 de 9» · «Distribuidora Escolar Zamora · entrega 20 nov 2026».

## Lo que lleva un A- al salir de aduana

Tipo `traspaso`, del módulo `inventario`: todas las etiquetas de un traspaso de un solo golpe.

- **El de un lote o un reproceso:** una etiqueta de prenda por pieza que Aduana contó para ese destino, talla por talla, en el orden de las tallas.
- **El del material de un proveedor:** una de rollo por cada rollo de la tela; los avíos no llevan etiqueta.
- **Los demás traspasos** no llevan etiquetas: `inventario.marcar_etiquetas_impresas` responde `sin_etiquetas` (ver [surtido y despachos](../modulos/inventario/surtido-y-despachos.md#inventariomarcar_etiquetas_impresas)).

## Quién imprime cada una y desde dónde

| Etiqueta | Dónde | Botón | Acción o ruta |
|---|---|---|---|
| De prenda, de variantes nuevas o por variante | Catálogo, en PDF | «PDF de {n} etiquetas» · «Generar PDF» · «Generar PDF · {n} etiquetas» | `catalogo.imprimir_etiquetas` (ver [variantes, códigos y etiquetas](../modulos/catalogo/variantes-codigos-y-etiquetas.md#catalogoimprimir_etiquetas)) |
| De prenda de un lote o un reproceso, y de rollo de un proveedor | Aduana, en su Zebra o en PDF | Cajón Despachar · «Imprimir etiquetas» · «PDF» | `inventario.marcar_etiquetas_impresas`, tipo `traspaso` |
| De rollo o de retazo que regresa del corte | Bodega, en PDF | Materiales · «Regresa del corte» · «Etiqueta» | `GET /v1/etiquetas/rollo/{id}?formato=pdf` |
| De los rollos y retazos de una tela que están en bodega (la carga inicial, o una etiqueta que se maltrató) | Bodega, en PDF | Materiales · la tela · «Etiquetas» | `GET /v1/etiquetas/rollo/{id}?formato=pdf&ids=…` |
| De bulto | Producción, en la Zebra del taller o en PDF | Cajón del lote · «Imprimir etiquetas de bulto» · «PDF» | `produccion.imprimir_etiquetas_bulto` (ver [corte y bultos](../modulos/produccion/corte-y-bultos.md#produccionimprimir_etiquetas_bulto)) |

Pedir un tipo es de los departamentos de esa fila; el puente solo pide las de sus trabajos.

## El ZPL

- **Una etiqueta,** de `^XA` a `^XZ`, con `^CI28` (UTF-8, para acentos y ñ), `^PW406` y `^LL203`. Las copias de la misma etiqueta van con `^PQ`, no repetidas.
- **El texto,** con la letra escalable de la impresora (`^A0N`); el que puede no caber, en un bloque (`^FB`) con su número de renglones.
- **Las barras:** `^BY2` y `^BCN,{alto},Y,N,N,A` (Code 128 en modo automático, con su texto abajo).
- **Lo que viene de los datos** pasa por `^FH`: un `^` o un `~` en el nombre de una prenda se manda en hexadecimal y no rompe la etiqueta.
- **Un trabajo es un solo ZPL** con todas sus etiquetas, en el orden en que se piden.

## El PDF de respaldo

- **Una página por etiqueta,** de 2 × 1 pulgadas (144 × 72 puntos), con el mismo contenido y el mismo orden que el ZPL. Varias del mismo tipo salen en un solo PDF.
- **Las barras** con bwip-js (`code128`), como imagen; el código debajo, en Courier.
- **La letra:** Helvetica y Helvetica negrita, las que trae todo PDF, con acentos y ñ; sin letras descargadas.
- **Se imprime a tamaño real** («100 %»): en una hoja de etiquetas adheribles o en una Zebra conectada a la computadora.

## Cómo se arman

- **Cada módulo registra sus tipos** en su `index.ts`: qué departamentos los piden, la función que junta los datos de cada etiqueta (con el recorte de quien la pide) y el dibujo que usa. El registro es el de [impresión](../modulos/admin/impresion.md#los-tipos-de-etiqueta-y-de-hoja).
- **Los dibujos** viven en `apps/api/src/impresos/` (ver [estructura](../cimientos/ESTRUCTURA.md#la-api-por-dentro)): uno por etiqueta, con su ZPL y su PDF. Reciben datos ya listos y no consultan nada ni deciden nada del negocio, como una pantalla.
- **El tipo `traspaso`** no dibuja nada propio: junta las etiquetas de prenda (pidiendo los datos del tipo `prenda` al registro) o las de rollo de ese A-.

## Cómo se prueba

- **El ZPL de cada dibujo,** contra uno guardado que se revisó en la Zebra: una prueba de foto por etiqueta, con nombres largos, acentos, ñ, un `^` y un `~`.
- **El PDF:** cada página mide 2 × 1 pulgadas, trae el texto esperado, y sus barras se leen otra vez con un lector de códigos en la prueba.
- **Lo que no se ve:** sin `catalogo.etiqueta_lleva_precio`, ninguna etiqueta trae un peso; ninguna trae un costo, la pida quien la pida.
- **Las de un A-:** salen tantas etiquetas de prenda como piezas contó Aduana para ese destino, y una de rollo por rollo.
- **En las Zebra reales:** la [verificación real](../registros/REGISTROS.md#verificación-real-pendiente) de la fase 20, con el lector y con la cámara de la tablet.

## Lo que llega después

- **Con uniformame.mx:** la guía de la paquetería (tipo `guia`) llega hecha en su archivo; el puente la manda igual a la Zebra de Aduana.
- **Con el POS:** la tienda no tiene Zebra: su caja pide con su llave, cuando hay internet, el PDF de la etiqueta de prenda (`formato=pdf`) para reimprimirla.

## Cómo está hecho

**Fase 20, parte 1.**

- **Lo común de los dibujos** (`apps/api/src/impresos/`): `zpl.ts` arma la etiqueta de `^XA` a `^XZ` con `^CI28`, `^PW406` y `^LL203`, el texto con `^A0N` (en bloque `^FB` si puede no caber) y las barras con `^BY2^BCN,{alto},Y,N,N,A`; todo dato pasa por `^FH` con `_` de indicador (`_5E` es `^`, `_7E` es `~`, `_5F` es `_`). Un trabajo es un solo ZPL, y las etiquetas iguales seguidas (las 58 playeras de una talla) van en una con sus copias en `^PQ`. `pdf.ts` arma la página de 144 × 72 con Helvetica, las barras PNG de bwip-js con su margen blanco y su texto en Courier, y repite la página por sus copias; las barras de un código se dibujan una vez. `textos.ts` corta con «…» igual en los dos formatos (decisión 810).
- **Los dibujos** (`etiquetas/prenda.ts`, `rollo.ts` y `bulto.ts`) reciben los datos ya escritos y no consultan ni deciden nada. La de rollo dibuja la de retazo si el dato es de retazo. En la de bulto, «para quién · entrega» va en dos renglones; las letras del PDF son de 6 puntos para que todo quepa en 2 × 1.
- **Los tipos,** en el `impresion.ts` de su módulo, registrados en su `index.ts`:
  - `prenda` (`catalogo`, lo pide Catálogo): la prenda, «{escuela o Básico} · Talla {t}», el código y, solo con `catalogo.etiqueta_lleva_precio`, el precio de la lectura `catalogo.precio_talla` en Mostrador (con su recargo en pedido especial);
  - `rollo` (`inventario`, lo pide Bodega): el rollo con su partida, sus metros y su proveedor con la fecha en que llegó (o «Carga inicial»), o su retazo con el lote y la fecha de su corte;
  - `traspaso` (`inventario`, lo pide Aduana): las variantes de un A-, repetidas por pieza (lo recibido en aduana menos lo repartido a otros A-) y talla por talla (`ordenDeTallas`), que dibuja el tipo `prenda` del registro; o sus rollos. Otro tipo de A- da `422 sin_etiquetas`;
  - `bulto` (`produccion`, lo pide Producción): con «para quién» de `dominio/para-quien.ts`.
- **Las fechas** de las etiquetas son `textoDeDiaConAnio` del paquete compartido («7 nov 2026»).
- **Las pruebas:**
  - los dibujos, en `impresos/etiquetas/prenda.prueba.ts`, `rollo.prueba.ts` y `bulto.prueba.ts`: el ZPL contra su foto (`fotos/*.zpl`) con nombres largos, acentos, ñ, `^` y `~`; el PDF de una página de 2 × 1 por etiqueta y por copia, con su texto; y las barras, que se leen otra vez;
  - con la base, en los mismos archivos: el precio solo con el parámetro y ningún costo, la pida quien la pida; las de rollo de una tela que pide Bodega; las de bulto de un lote cortado; y quién no las puede pedir (`403`);
  - las de un A-, en `modulos/inventario/acciones/marcar-etiquetas-impresas.prueba.ts`.
- **El lector de las pruebas** (`nucleo/pruebas/leer-impresos.ts`): `leerPdf` abre los objetos del PDF, descomprime el flujo de cada página y junta sus textos en WinAnsi; `leerBarras` lee un Code 128 con `barcode-detector` (zxing), con su wasm de `node_modules` y no de internet.
- **La verificación real** con la Zebra (que el ZPL guardado se imprima bien y se lea con el lector y la cámara) sigue pendiente con Bruno.
