# Fase 20: Tablet, puente de impresión e impresos

> **Etapa:** Interfaz.
> **Estado:** Terminada.
> **Antes de empezar:** lee la [forma de trabajo](../trabajo/FORMA-DE-TRABAJO.md) y la [revisión de fase](../trabajo/REVISION-DE-FASE.md).
> **Se conecta con:** [fases](FASES.md) · [fase 19](19-web-principal.md) · [fase 21](21-pruebas-de-punta-a-punta.md) · [la tablet](../apps/tablet.md) · [pantallas de la tablet](../interfaz/tablet.md) · [puente de impresión](../apps/puente-de-impresion.md) · [etiquetas](../impresos/etiquetas.md) · [hojas](../impresos/hojas.md) · [revisor de diseño](../../.claude/agents/revisor-diseno.md)

## Objetivo

Lo que sale de la pantalla: la Puerta del taller trabaja en la tablet aunque se caiga el internet, sin perder ni duplicar nada; las etiquetas salen solas en la Zebra de Aduana y en la del taller, con su PDF de respaldo; y las hojas de la orden de compra, el pedido, la nota de entrega, el despacho y el lote salen en PDF con lo que cada cuenta puede ver. La lógica ya existe en la API: aquí se construyen la tablet, el puente y los dibujos.

## Depende de

- [Fase 19](19-web-principal.md), terminada y en verde: las pantallas con sus botones de imprimir ya existen, y la API ya tiene la sincronización, los PIN, los registros de operación, las fallas, los consumibles y el mecanismo de impresión.

## Qué se construye

### Parte 1 · Etiquetas

**Construye:** `apps/api/src/impresos/` con lo común del ZPL (`^CI28`, bloques de texto, `^FH`, `^PQ`) y del PDF (la página de 2 × 1 pulgadas y las barras con bwip-js); los dibujos de prenda, de rollo (con el de retazo) y de bulto; los tipos `prenda` (catalogo), `rollo` y `traspaso` (inventario) y `bulto` (produccion) en el registro de impresión; y los botones «Etiqueta» y «Etiquetas» de Bodega · Materiales.

**Leer:**
- [etiquetas](../impresos/etiquetas.md) — todo.
- [impresión](../modulos/admin/impresion.md) — el registro de tipos, los trabajos y la ruta que los sirve.
- [variantes, códigos y etiquetas](../modulos/catalogo/variantes-codigos-y-etiquetas.md) — el código, el precio en la etiqueta y `catalogo.imprimir_etiquetas`, que desde aquí genera el PDF real.
- [material en bodega](../modulos/inventario/material-en-bodega.md), [surtido y despachos](../modulos/inventario/surtido-y-despachos.md) y [recepción del taller](../modulos/inventario/recepcion-del-taller.md) — los rollos, los retazos, lo que lleva un A- y `inventario.marcar_etiquetas_impresas`.
- [corte y bultos](../modulos/produccion/corte-y-bultos.md) — los bultos y `produccion.imprimir_etiquetas_bulto`.
- [pantallas de Bodega](../interfaz/fabrica/bodega.md#materiales) — los botones de las etiquetas de rollo.

### Parte 2 · Hojas

**Construye:** los dibujos de las hojas con React-PDF (encabezado con la empresa, pie, tablas que se parten) y los tipos `orden_compra` (compras), `pedido` y `nota_entrega` (ventas), `despacho` (inventario) y `lote` (produccion); `compras.marcar_orden_enviada` guarda el PDF real; los botones «PDF» de Ventas y «Hoja del lote» de Producción.

**Leer:**
- [hojas](../impresos/hojas.md) — todo.
- [órdenes de compra](../modulos/compras/ordenes-de-compra.md), [pedidos](../modulos/ventas/pedidos.md), [notas de entrega](../modulos/ventas/notas-de-entrega.md), [surtido y despachos](../modulos/inventario/surtido-y-despachos.md) y [lotes](../modulos/produccion/lotes.md) — los datos de cada hoja.
- [configuración](../modulos/admin/configuracion.md#la-tabla-empresa) — los datos de la empresa del encabezado.
- [pantallas de Ventas](../interfaz/fabrica/ventas.md), [de Producción](../interfaz/fabrica/produccion.md#lote-ancho) y [de Aduana](../interfaz/fabrica/aduana.md) — dónde está cada botón.

### Parte 3 · Puente de impresión

**Construye:** `apps/puente/`: registrarse con su código, la configuración local, los avisos en vivo y la pregunta de cada minuto, pedir y confirmar sus trabajos, el estado de la Zebra con `~HS`, mandar el ZPL al puerto 9100, el diario, cambiar su llave, el `426`, su registro, dejarlo arrancando solo y `pnpm puente:empaquetar`.

**Leer:**
- [puente de impresión](../apps/puente-de-impresion.md) — todo.
- [impresión](../modulos/admin/impresion.md) — `admin.trabajos_impresion`, `admin.confirmar_impresion` y cuándo una impresora está conectada.
- [dispositivos](../modulos/admin/dispositivos.md) — el código, la llave y su cambio.
- [eventos y trabajos](../cimientos/EVENTOS-Y-TRABAJOS.md#avisos-en-vivo--get-v1eventos) y [API](../cimientos/API.md#la-versión-de-la-app) — los avisos en vivo y la versión.

### Parte 4 · La tablet por dentro

**Construye:** `apps/tablet/` como web instalable: el registro con su código, la copia local en Dexie con lo que baja de cada módulo, la cola, subir, bajar y la foto, los avisos en vivo, el aparato revocado, el `426`, el secreto y los hashes cifrados con Web Crypto, el PIN con Argon2id y su bloqueo, y el lector con BarcodeDetector y su polyfill.

**Leer:**
- [la tablet](../apps/tablet.md) — todo.
- [sincronización](../cimientos/SINCRONIZACION.md) — subir, bajar, la foto y el aparato revocado.
- [dispositivos](../modulos/admin/dispositivos.md) y [PIN del taller](../modulos/personal/pin-del-taller.md) — el registro, la llave, el PIN y su bloqueo.
- [paquete compartido](../cimientos/PAQUETE-COMPARTIDO.md) — el tope, la salud, la semana y «Bultos para ti» que se calculan aquí con las mismas funciones.
- «Lo que baja a la tablet» de [productos](../modulos/catalogo/productos.md#lo-que-baja-a-la-tablet), [variantes](../modulos/catalogo/variantes-codigos-y-etiquetas.md#lo-que-baja-a-la-tablet), [tallas](../modulos/catalogo/tallas-y-tipos-de-prenda.md#lo-que-baja-a-la-tablet), [lotes](../modulos/produccion/lotes.md#lo-que-baja-a-la-tablet), [corte y bultos](../modulos/produccion/corte-y-bultos.md#lo-que-baja-a-la-tablet), [operaciones y flujos](../modulos/produccion/operaciones-y-flujos.md#lo-que-baja-a-la-tablet), [registros de operación](../modulos/produccion/registros-de-operacion.md#lo-que-baja-a-la-tablet), [personas](../modulos/personal/personas.md#lo-que-baja-a-la-tablet), [tarifas](../modulos/personal/tarifas.md#lo-que-baja-a-la-tablet), [máquinas](../modulos/mantenimiento/maquinas-fallas-y-servicios.md#lo-que-baja-a-la-tablet) y [materiales](../modulos/compras/materiales.md#lo-que-baja-a-la-tablet) — qué guarda la copia.

### Parte 5 · Las pantallas de la tablet

**Construye:** las pantallas de [la tablet](../interfaz/tablet.md): el encabezado, entrar con nombre y PIN, el inicio de cada persona, registrar una operación, escanear bulto, falla de máquina, tomar consumible, sin internet y las pantallas del aparato.

**Leer:**
- [pantallas de la tablet](../interfaz/tablet.md) — todo.
- [registros de operación](../modulos/produccion/registros-de-operacion.md), [máquinas, fallas y servicios](../modulos/mantenimiento/maquinas-fallas-y-servicios.md) y [lotes](../modulos/produccion/lotes.md#reglas) — lo que manda cada botón, el tope y la salud.
- [diseño](../interfaz/DISENO.md) y [textos](../interfaz/TEXTOS.md) — los componentes, los colores de la salud y los textos.

## Cómo se construye

- **Un solo agente, una parte a la vez,** en este orden: las etiquetas y las hojas primero, porque el puente imprime lo que ellas arman.
- **La tablet usa el sistema de diseño** de `packages/interfaz` y el cliente con tipos del paquete compartido; sus pantallas no calculan nada que no salga del paquete compartido.
- **La tablet se prueba** con Playwright en un Chrome que emula una tablet Android, contra la API real con los datos de la muestra, quitándole la red a media captura (`setOffline`).
- **El puente se prueba** con una Zebra de mentira: un servidor TCP local que guarda lo que recibe y contesta `~HS`.
- **Los PDF se prueban** por lo que recibe su dibujo (los datos ya recortados) y por el PDF que sale: una página por etiqueta, del tamaño de su medida.
- **Las pantallas de la fase 19** solo se tocan para los botones de sus hojas y etiquetas que dice esta fase.

## Excepciones permitidas

- La tablet y las Zebra de verdad se comprueban con Bruno en la [verificación real](../registros/REGISTROS.md#verificación-real-pendiente): la fase cierra con el Chrome emulado y la Zebra de mentira.
- El ZPL guardado de cada etiqueta lo aprueba quien la ve impresa en la verificación real; hasta entonces, se revisa contra su archivo.

## Criterios de terminado

| Criterio | Prueba que lo demuestra |
|---|---|
| Cada etiqueta lleva lo que dice su archivo, en ZPL y en PDF, con acentos, ñ, nombres largos y un `^` o un `~` en los datos | `apps/api/src/impresos/etiquetas/prenda.prueba.ts`, `rollo.prueba.ts` y `bulto.prueba.ts` |
| Ninguna etiqueta trae un costo, y el precio de mostrador solo con `catalogo.etiqueta_lleva_precio`, la pida quien la pida | `apps/api/src/impresos/etiquetas/prenda.prueba.ts` |
| Las etiquetas de un A- son una de prenda por pieza contada para ese destino, o una de rollo por rollo; «Imprimir etiquetas» manda el trabajo a la Zebra de Aduana y «PDF» lo abre, y los dos las anotan impresas | `apps/api/src/modulos/inventario/acciones/marcar-etiquetas-impresas.prueba.ts` |
| Cada hoja lleva lo que dice su archivo; la nota que pide Aduana no trae ningún peso; la del despacho y la del lote nunca traen precios | `apps/api/src/impresos/hojas/*.prueba.ts` |
| El PDF de la orden de compra se guarda al enviarla y no cambia después | `apps/api/src/modulos/compras/acciones/marcar-orden-enviada.prueba.ts` |
| El puente imprime lo que le toca, en orden, confirma cada trabajo una vez, y lo que quedó a medias al apagarse lo termina al arrancar | `apps/puente/src/trabajos.prueba.ts` y `diario.prueba.ts` |
| Sin papel, con la tapa abierta, en pausa o sin contestar, el trabajo queda en `fallo` con su texto y quien lo pidió lo ve | `apps/puente/src/zebra.prueba.ts` |
| Sin avisos en vivo, el puente igual imprime y su impresora no deja de contar como conectada; con versión vieja, deja de contar | `apps/puente/src/senal.prueba.ts` |
| La tablet registrada guarda su secreto y los hashes cifrados, y nada de lo guardado tiene precios, costos ni sueldos | `apps/tablet/src/registro/registro.prueba.ts` y `apps/tablet/src/copia/copia.prueba.ts` |
| Sin internet se registra, se reporta y se toma; al volver la red sube todo una vez, en orden, aunque se corte a media tanda o llegue `detenido` | `apps/tablet/src/sincronizacion/subir.prueba.ts`, con Playwright |
| La bajada aplica cambios y quitados por página, la foto no toca la cola, y un registro cancelado en Producción se ve cancelado | `apps/tablet/src/sincronizacion/bajar.prueba.ts` |
| El PIN se revisa sin red; a los intentos del parámetro la persona queda bloqueada, el bloqueo sube con su hora y solo un desbloqueo posterior la deja entrar | `apps/tablet/src/pin/pin.prueba.ts` |
| Revocada, la tablet deja de bajar y sube su cola hasta vaciarla; con `426` se actualiza sin perder su cola | `apps/tablet/src/sincronizacion/aparato.prueba.ts` |
| El tope, «Bultos para ti» y la salud dan en la tablet lo mismo que en la API | `apps/tablet/src/pantallas/inicio.prueba.ts` y las pruebas del paquete compartido |
| Cada pantalla de la tablet se ve como la muestra, salvo lo que su archivo dice que no se copia, y cada botón manda a su cola lo que dice su archivo con su aviso | `apps/tablet/src/pantallas/*.prueba.ts`, con capturas |
| La sesión de la persona se cierra sola a los segundos del parámetro | `apps/tablet/src/pantallas/encabezado.prueba.ts` |

## Revisión de fase

Interfaz: el [revisor de diseño](../../.claude/agents/revisor-diseno.md) compara las pantallas de la tablet con la muestra y cada etiqueta y cada hoja con su archivo, y un [auditor](../../.claude/agents/auditor.md) revisa que nada se pierda ni se duplique sin internet, que la tablet y el puente no guarden ni enseñen lo que no deben, y que el código siga su estructura, sin desmentidor (ver [revisión de fase](../trabajo/REVISION-DE-FASE.md#tres-tamaños-de-revisión)).
