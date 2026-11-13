# Pantallas de Ventas a externos

> **Qué cubre:** las pantallas de Ventas a externos (Pendientes, Pedidos, Notas de entrega y Clientes), los cajones Pedido, Pedido nuevo y Modificar pedido, Mandar a producción, Armar nota de entrega, Nota de entrega y Cliente, y sus ventanas, cada una con su consulta, sus textos, sus estados y sus botones.
> **Estado:** Decidido.
> **Se construye en:** [fase 19](../../fases/19-web-principal.md).
> **Se conecta con:** [pedidos](../../modulos/ventas/pedidos.md) · [mandar a producción](../../modulos/ventas/mandar-a-produccion.md) · [notas de entrega](../../modulos/ventas/notas-de-entrega.md) · [notas de crédito](../../modulos/ventas/notas-de-credito.md) · [clientes externos](../../modulos/ventas/clientes.md) · [cuenta de material](../../modulos/patronaje/cuenta-de-material.md) · [tallas y tipos de prenda](../../modulos/catalogo/tallas-y-tipos-de-prenda.md) · [conteos](../../modulos/inventario/conteos.md) · [avisos](../../modulos/admin/avisos.md) · [lo común de las pantallas](../comunes.md) · [pantallas de Aduana](aduana.md) · [pantallas de Contaduría](contaduria.md) · [pantallas de Producción](produccion.md) · [anticipos](../../modulos/contaduria/anticipos.md) · [crédito de clientes](../../modulos/contaduria/credito-de-clientes.md) · [hojas](../../impresos/hojas.md)

## Para qué sirve

Levanta los pedidos de las escuelas y los mayoristas talla por talla, los manda a producción, sigue cada prenda en su hilo y arma las notas de entrega con lo listo en aduana, hasta que el cliente firma y nace la cuenta por cobrar. Ejemplo: Rosa levanta el PE-0150 de Colegio Morelos, 160 piezas, y aprieta «Confirmar y mandar a producción»; la revisión le dice que el piqué alcanza y que se abre la OP-2026-072 con dos lotes. Diez días después ve en Pendientes «PE-0150 · 160 piezas listas en aduana», arma la NV-0153 y Aduana la despacha.

## Quién entra

- Las cuentas con Ventas a externos. Ven precios e importes, el anticipo y si cada nota está pagada; los saldos, solo con Contaduría.
- Los botones con cifra que llevan a Producción, Aduana o Contaduría solo llevan si la cuenta tiene ese departamento.
- **Pastilla del menú:** los renglones de Pendientes; roja si alguno es rojo.
- **Acción principal:** «Nuevo pedido» → el cajón del pedido nuevo, sin cliente.
- **Pestañas:** Pendientes · Pedidos · Notas de entrega · Clientes.

## Pendientes

**Consulta:** `ventas.pendientes` (`grupo`: `todos`, `pedidos`, `entregas` o `clientes`).

| Cifra | Qué dice | Su línea | Lleva a |
|---|---|---|---|
| «Pedidos abiertos» | Los no entregados ni cancelados, con borradores | «{n} en borrador», con la barra por etapa | Pedidos |
| «Piezas por entregar» | Pedidas menos entregadas de los confirmados abiertos | «{n} listas en aduana» (ámbar) o «Ninguna lista en aduana» | Pedidos |
| «Entregas en {n} días» | Los que entregan de hoy a `ventas.dias_entregas_proximas` (7) días; en rojo si hay atrasados | «{n} pedidos atrasados» (rojo) o «Ninguno atrasado» | Pedidos |
| «Notas de entrega» | Por despachar más en camino | «{n} por despachar · {m} en camino», con la barra Entregadas en el mes · Por despachar · En camino | Notas de entrega |
| «Clientes» | Los activos | «{n} detenido por crédito» (rojo), «{n} cerca de su límite» (ámbar) o «Todos al corriente» | Clientes |

| Tipo | Referencia | Fecha · Importe | Estado | Botón |
|---|---|---|---|---|
| «Borrador» | «{PE} · {cliente}»; «{n} piezas · {n} productos · sin confirmar» | Entrega · total | «Borrador» (gris) | «Revisar» → el pedido |
| «Entrega» | «{PE} · {cliente}»; «{n} piezas listas en aduana · faltan {m} del pedido» | Entrega (roja si pasó) · lo que valen las listas | «Por armar nota» (ámbar) o «Atrasado {n} días» (rojo) | «Armar nota» → Armar nota de entrega |
| «Pedido» | «{PE} · {cliente}»; «{n} piezas por mandar», con «· versión {v}» desde la 2 | Entrega · total | «Por mandar a producción» (ámbar) | «Mandar a producción» → la revisión |
| «Pedido» | Sin los anteriores, con alerta roja o ámbar o con un cambio por aplicar: «{estado} · {n} de {m} entregadas» o «Versión {v} · Producción la tiene desde el {fecha}» | Entrega · total | «Atrasado {n} días» (rojo), «En riesgo de atraso» (ámbar) o «Cambio por aplicar» (azul) | «Ver pedido» |
| «Nota de entrega» | «{NV} · {cliente}»; «Pedido {PE} · salió con {D}» | Salida · «{n} pz» | «Por confirmar entrega» (ámbar) | «Confirmar entrega» → ventana |
| «Crédito» | El cliente; «{tipo} en {lugar} · no se le pueden levantar pedidos nuevos» | — | «Detenido por crédito» (rojo) | «Ver cliente» → Pedidos, en su grupo |

Un pedido entregado o cancelado no da renglones; un mismo pedido puede dar «Entrega» y «Pedido».

## Pedidos

**Consulta:** `ventas.pedidos` (`vista`, `buscar`, `etapa`, `mostrar_entregados`).

- **Arriba:** «Por cliente» / «Por estado»; el buscador «Folio, prenda, nota o cliente» (todas las palabras); «Mostrar entregados» (apagado); filtros por etapa con su conteo y su color (tocar el activo lo quita). Los cancelados no salen en ninguna vista: quedan en la bitácora con su motivo.
- **Por cliente:** un grupo por cliente, con su color, «{tipo} en {lugar} · {n} pedidos», su crédito («Crédito al corriente», «Cerca del límite de crédito», «Detenido por crédito», «Sin crédito») y «Nuevo pedido» (no sale si está detenido; en su lugar la franja «Detenido por crédito · No se le pueden levantar pedidos nuevos»). Columnas: Pedido (y «versión {v}») · Prendas · Piezas · Entrega («hace {n} días» en rojo, «hoy», «mañana», «en {n} días», ámbar a `ventas.dias_en_riesgo` (3) o menos; «Entregado») · Avance (la barra de etapas y «{n} de {m} entregadas»; en borrador «Sin confirmar») · Estado (la etapa con su alerta abajo) · Notas («{n} notas» y los dos últimos folios) · Total; con más de uno, su renglón de suma. Los entregados al final; los demás por entrega. Sin pedidos: «Sin pedidos abiertos».
- **Por estado:** una columna por etapa con su conteo; tarjetas por entrega con el cliente, el folio, «{n} pz · {total}», la barra (no en borrador) y la alerta o «Entrega el {fecha}». Columna vacía: «Ninguno».
- **Vacío con filtros:** «No hay pedidos con esos filtros», con «Quitar filtros».
- Las etapas, la alerta y el avance (y sus colores) salen de [pedidos](../../modulos/ventas/pedidos.md#el-avance-la-etapa-y-la-alerta); la pantalla no los calcula.

## Notas de entrega

**Consulta:** `ventas.notas_entrega` (`buscar`, `estado`, `pedido_id`).

- **Arriba:** buscador «Nota, pedido, prenda o cliente»; si se llegó desde un pedido, el filtro «Pedido {PE}» con su ×; filtros «Todas», «Por despachar» (morado), «En camino» (ámbar), «Entregada» (verde), con conteos que no cambian con el buscador ni con el pedido; las canceladas no salen.
- **Columnas:** Nota (folio y su fecha) · Pedido (abre el pedido; «nota {i} de {n}») · Cliente · Prendas · Piezas · Estado · Pago (entregada: «Sin pagar», «Pagada en parte» o «Pagada», de `contaduria.estado_pago_notas`; si no, «Se cobra al entregar») · Total. Por despachar, en camino y entregadas; dentro, la más nueva primero.
- **Vacío:** «Sin notas con esos filtros».

## Clientes

**Consulta:** `ventas.clientes`.

- **Arriba:** «{n} clientes» y «Nuevo cliente».
- **Una ficha por cliente,** con la franja de su color: nombre, «{tipo} en {lugar}, cliente desde {año}», «{contacto} · {teléfono} · Editar datos» y su crédito; tres cifras, «{n} pedidos abiertos» («+{n} en borrador»), «{n} piezas por entregar» y la «próxima entrega»; «{n} modelos propios» · «{n} productos en su lista» y «Precios de la {lista}»; botones «Ver sus pedidos» y «Nuevo pedido» (o la etiqueta roja «Sin pedidos nuevos» si está detenido).
- **«Dados de baja»,** abajo: Cliente · Desde · Motivo · «Reactivar» → `ventas.reactivar_cliente` («{cliente} vuelve a estar activo»).

## Cajones

### Pedido (ancho)

**Consulta:** `ventas.pedido` (`pedido_id`). Se abre desde Ventas, desde Producción y Aduana («Ver pedido», si la cuenta tiene Ventas) y desde los anticipos de Contaduría (solo lectura).

- **Encabezado:** «{PE} · Pedido» (y «· versión {v}»), el cliente con su color.
- **Botones con cifra:** «{n} lotes» («en producción», «ya en aduana», «ya entregados», «nada en producción», «sin confirmar») → Producción · «{n} listas en aduana» → Aduana · «{n} notas de entrega» → Notas de entrega filtradas · «{monto} anticipo recibido» (o «sin anticipo») → Contaduría · el crédito del cliente (sin enlace).
- **Avance:** «{n} de {m} piezas entregadas», la etapa con su alerta y la barra con su leyenda. **Datos:** Entrega · Forma de pago (con sus días de crédito) · Levantó · Total.
- **Avisos,** en este orden: azul «Versión {v} por aplicar en Producción: {prenda}, talla {t}: {n} de más» · ámbar «{n} piezas por mandar a producción», con «Mandar a producción» · verde «{n} piezas listas en aduana», con «Armar nota de entrega» · rojo «Cliente detenido por crédito · No se le pueden levantar pedidos nuevos».
- **Prendas** («{n} productos · {m} piezas»): foto, nombre, «{escuela o Básico} · {Lista {corta}, {n}% sobre mostrador o Mayoreo} {precio}» o «Precio dado {precio} · sugerido {precio}», «· especiales {precio}»; el importe y las piezas; el **hilo** (ver [lo común](../comunes.md#el-hilo-del-pedido)); y la tabla por talla con los renglones que tienen piezas: Pedido · Entregado · En nota · Listo en aduana · De bodega · En producción · En reproceso · Por mandar a producción.
- **Notas de entrega** («{n} notas · {m} piezas»): Nota · Fecha · Prendas · Piezas · Estado · Total. Sin notas: «Sin notas todavía». **Historial,** lo más nuevo arriba.
- **El pie,** según la etapa:

| Etapa | Botones |
|---|---|
| Borrador | «Cancelar con motivo» · «Editar» · «Confirmar pedido» → `ventas.confirmar_pedido` («{PE} confirmado. El precio quedó congelado») |
| Confirmado, En producción, Listo en aduana, Entrega parcial | «Cancelar con motivo» (solo sin notas) · «Pasar a bodega» (con algo listo en aduana) · «PDF» · «Modificar pedido» · «Armar nota de entrega» (apagado sin nada listo) |
| Entregado | «PDF» |

- **«Pasar a bodega»** abre la ventana del mismo nombre. **«PDF»** abre la hoja del pedido (ver [hojas](../../impresos/hojas.md#el-pedido)): de ahí se imprime o se manda.

### Pedido nuevo y Modificar pedido (ancho)

**Consultas:** `ventas.editor_pedido` (`pedido_id`, `cliente_id`), `ventas.buscar_prendas` (`cliente_id`, `buscar`) y `ventas.precio_sugerido` (`cliente_id`, `producto_id`).

- **Encabezado:** «Pedido nuevo {PE}», «Modificar pedido {PE} · pasa a versión {v+1}» o «Modificar pedido {PE}»; el cliente o «¿Para qué cliente?».
- **Campos:** Cliente («Escoge un cliente»; los detenidos apagados, «{cliente}, detenido por crédito»; «Cliente nuevo» abre su cajón y regresa; no cambia al modificar ni con prendas agregadas) · Entrega (desde hoy) · Forma de pago («Contado», «Anticipo» al abrir (`ventas.forma_pago_inicial`), «Crédito», apagado sin crédito: «Sin crédito: de contado o con anticipo hasta que Contaduría le ponga límite.») · y, si está cerca de su límite, el aviso ámbar «Cerca de su límite de crédito».
- **Prendas:** por prenda, nombre, «{escuela o Básico} · Sugerido {precio} · {origen}» o, en rojo, «Sin precio para este cliente»; «Precio» con el sugerido, que Ventas cambia en el momento («Sugerido {precio}» si es otro); importe y piezas; × para quitarla (apagada con «Ya tiene piezas entregadas o en aduana»); una casilla por talla vigente (las especiales dicen «especial»; al modificar, «mín. {n}» abajo), hasta `ventas.piezas_max_talla`. «Agregar prenda» abre el buscador.
- **El buscador:** «Buscar prenda, escuela o sección» y «Listo»; grupos «Modelos de {cliente}», «En la lista de {lista}», «Básicos y generales de la fábrica» y «Modelos de otras escuelas»; cada producto con «{escuela} · tallas {rango}», su precio y su origen («su lista», «{n}% sobre mostrador», «mayoreo», «mostrador») o «Sin precio», y «Agregar» o «Agregado». Sin cliente: «Primero escoge el cliente». Sin resultados: «Ninguna prenda se llama así». Al final, «¿Modelo nuevo para {cliente}?» con «Crear a partir de otro producto» → el alta de Catálogo que regresa al pedido (ver [Catálogo](catalogo.md#nuevo-producto-ancho)).
- **«Cambios de esta versión»** (al modificar un confirmado): «{prenda}: talla {t} de {a} a {b}», «agregó talla {t} ({n})», «quitó talla {t} ({n})», «+{n} piezas», «Entrega: del {fecha} al {fecha}», «Forma de pago: de {a} a {b}»; y, si sobran en producción, el aviso azul «Sobran {n} piezas en producción: Producción ajusta sus lotes».
- **Totales:** Piezas · Total.
- **El pie:** nuevo, «Descartar» · «Guardar borrador» → `ventas.guardar_borrador_pedido` · «Guardar y confirmar» → `ventas.confirmar_pedido` · «Confirmar y mandar a producción» (negro; confirma y abre la revisión). Al modificar: «Descartar cambios» · «Guardar cambios» (borrador) · «Guardar versión {v+1}» → `ventas.guardar_version_pedido` · «Guardar y mandar a producción» (si quedan piezas por mandar). Los avisos y los errores de cada uno están en [pedidos](../../modulos/ventas/pedidos.md); el primero sale en el aviso ámbar y el cursor va a su campo.

### Mandar a producción (ancho)

**Consulta:** `ventas.revision_mandar` (`pedido_id`). Si no queda nada por mandar no se abre: «Todo el pedido ya está en producción».

- **Encabezado:** «{PE} · Mandar a producción» y el cliente. **Arriba:** «Se va a producción · {n} piezas de {m} prendas» y la entrega. **El hilo del envío:** Pedido «hoy», Corte «se corta el {fecha}» o «falta la receta», Entrega «para el {fecha}».
- **Los avisos** (rojo sin receta o falta material; ámbar si algo llega después del corte) y **por prenda** sus tallas y piezas, «Bodega tiene libres: {talla}: {n} · …» con «Surtir de bodega · {n}» → `ventas.surtir_de_bodega`, la línea del lote («Lote nuevo {L} · se corta el {fecha}» o «Se suman al lote {L}, que se corta el {fecha}») y el material (verde «{material}: usa {cantidad} · hay {cantidad} libres», ámbar «… · llega el {fecha} con {OC}» y «· el corte espera a que llegue», rojo «{material}: faltan {cantidad} · Compras tiene que pedirla», verde «Avíos completos», o rojo «Sin receta: no se corta hasta que Patronaje la capture»). Los textos salen de [textos](../TEXTOS.md#la-revisión-antes-de-mandar-a-producción).
- **Botones:** «Regresar al pedido» · «Mandar a producción» → `ventas.mandar_a_produccion`. Los avisos no detienen nada.

### Armar nota de entrega (ancho)

**Consulta:** `ventas.armar_nota` (`pedido_id`). Sin nada listo no se abre: «Nada listo en aduana para este pedido».

- «Nota de entrega nueva {NV} · Del pedido {PE}» y el cliente. **Datos:** «Entrega del pedido» · «Forma de pago» · «Notas anteriores» · «Anticipo disponible».
- **«Qué sale en esta nota»:** por prenda, «{n} listas en aduana · faltan {m} del pedido», «Todas» / «Ninguna» y una casilla por talla con todo lo listo y «de {n}» abajo.
- **Totales:** Piezas · Importe · «Anticipo aplicado» (−; Ventas lo puede bajar) · «Por cobrar».
- **Botones:** «Cancelar» · «Crear nota {NV}» → `ventas.armar_nota_entrega` («{NV} lista: {n} piezas por despachar en aduana»). Errores: «Hay {n}» · «Número entero» · «Escoge al menos una pieza.»

### Nota de entrega (ancho)

**Consulta:** `ventas.nota_entrega` (`nota_id`). Aduana la abre desde En tránsito con su recorte: sin precios, importes ni anticipo.

- «{NV} · Nota de entrega {i} de {n}» y el cliente. **Botones con cifra:** «{PE} · pedido · {etapa}» · «En aduana · por despachar», «{D} · en camino» o «{D} · despacho» → Aduana · el pago («Sin pagar», «Pagada en parte», «Pagada», o «— · se cobra al entregar») → Contaduría.
- **Cabecera:** «Armada el», «Salió el» o «Entregada el»; «{n} piezas · {total}» y su estado. **Datos:** Pedido · «nota {i} de {n}» · Forma de pago · Armó · Salió · y, entregada, Recibió y Vence (en rojo si venció sin pagarse).
- **Prendas:** Prenda · Tallas · Piezas · Precio · Importe. **Totales:** Subtotal · Anticipo aplicado · «Nota de crédito {NC}» (−) · «Por cobrar» o «Saldo»; sin Contaduría, en lugar del saldo, el pago.
- **Botones:** por despachar, «Cancelar nota» → ventana con motivo → `ventas.cancelar_nota_entrega` («{NV} cancelada: sus piezas regresan a lo listo del pedido {PE}»); en camino, «Confirmar entrega» → ventana; entregada, «Nota de crédito» → ventana (o «{AU} · esperando autorización de Dirección» si ya se pidió). Menos cancelada, siempre «PDF»: la hoja de la nota, sin precios si la abre Aduana (ver [hojas](../../impresos/hojas.md#la-nota-de-entrega)).

### Cliente nuevo y Datos del cliente

**Consulta:** `ventas.cliente` (`cliente_id`; vacío para el alta).

- «Cliente nuevo» (y «· Regresa al pedido») o «Datos del cliente · {tipo}»; el nombre que se escribe.
- **Campos:** Nombre · Tipo («Escuela», «Mayorista», «Empresa u otro») · su escuela, si es escuela (una que no es cliente, o nueva) · Municipio · Dirección de entrega · Contacto · Teléfono · Correo (opcional) · RFC (opcional). Al dar de alta: «Compra con precios de mayoreo hasta que Catálogo le ponga su lista. Nace sin crédito: el límite lo pone Contaduría.»; al editar, su lista y su crédito.
- **Botones:** «Dar de alta» o «Dar de alta y usar en el pedido» → `ventas.crear_cliente` · «Guardar cambios» → `ventas.editar_cliente` · «Dar de baja» (rojo, al editar) → ventana con motivo → `ventas.dar_baja_cliente`. Los mensajes de cada campo y los candados de la baja (pedidos abiertos, saldo) están en [clientes externos](../../modulos/ventas/clientes.md).

## Ventanas

- **«Cancelar {PE}»:** «Sus {n} lotes pasan a temporada: lo que se produzca va a bodega.» si aplica, y el motivo. «Cancelar pedido» → `ventas.cancelar_pedido` («{PE} cancelado. Queda en el historial con su motivo»).
- **«Pasar a bodega»:** lo listo en aduana del pedido por talla, cuánto pasa y su motivo. «Pasar a bodega» → `ventas.pasar_a_bodega`.
- **«Confirmar entrega de {NV}»:** «{cliente} · {n} piezas · {total}» (sin total desde Aduana) y «Quién recibió». «Confirmar entrega» → `ventas.confirmar_entrega` («{NV} entregada a {cliente}. Contaduría ya la cobra»).
- **«Nota de crédito para {NV}»:** el cliente y el total; «Qué pasó» · «De cuánto» · «Piezas que regresan» (por talla, opcional). «Mandar a Dirección» → `ventas.pedir_nota_credito` («Nota de crédito para {NV} enviada a Dirección»).
- **«Cancelar {NV}»:** el motivo. «Cancelar nota».
- **«Dar de baja a {cliente}»:** el motivo y «Ya no sale para pedidos nuevos. Sus pedidos, notas y pagos se conservan.» «Dar de baja» («{cliente} dado de baja. Su historial se conserva»).

## Lo que no se copia de la muestra

- Cerrar un cajón de captura con cambios (pedido nuevo, modificación, nota en armado) pregunta antes.
- Un cliente detenido no confirma su borrador ni suma piezas con una versión: lo para la acción.
- Cancelar una nota por despachar pide motivo.
- Una versión también cambia la fecha o la forma de pago, y sale en sus cambios y en el historial.
- El historial dice quién confirmó la entrega, desde Ventas o desde Aduana: «{persona} confirmó la entrega de {NV} · recibió {nombre}».
- Desde Aduana, la nota y la ventana «Confirmar entrega» no muestran precios ni importes.
- «Pasar a bodega» es pantalla nueva: la muestra no la tiene.
- «Imprimir» y «Mandar PDF» son un solo botón, «PDF»: la hoja se abre y de ahí se imprime o se manda.

## Cómo está hecho

**Fase 19, parte 6.**

- **Las consultas** están en `apps/api/src/modulos/ventas/consultas/`, una por archivo, con sus contratos en `packages/compartido/src/contratos/ventas/` (`consultas-pedidos.ts`, `consultas-notas.ts`, `consultas-clientes.ts` y las piezas comunes en `vistas.ts`): `ventas.pendientes`, `ventas.pedidos`, `ventas.pedido`, `ventas.editor_pedido`, `ventas.precio_sugerido`, `ventas.buscar_prendas`, `ventas.revision_mandar`, `ventas.notas_entrega`, `ventas.nota_entrega`, `ventas.armar_nota`, `ventas.clientes` y `ventas.cliente`. `contaduria.estado_pago_notas` está en `modulos/contaduria/consultas/` con su contrato en `contratos/contaduria/estado-pago-notas.ts`, sobre la lectura del mismo nombre. Se registran en el `index.ts` de su módulo, y la pastilla de Ventas (`pastillas: { ventas }`) cuenta los mismos renglones que Pendientes y va roja si alguno es rojo.
- **Ninguna regla en la pantalla:** la etapa, la alerta, el avance y lo que falta mandar salen de `ventas.avance_pedido` (las funciones de `dominio/avance.ts`); el crédito, de `contaduria.credito_de_cliente` (el semáforo, sin montos); el precio sugerido, de `catalogo.precio_sugerido`; el material de la revisión, de `patronaje.calcular_material` y `compras.cuenta_material`; el lote al que se suma, con la misma regla de Producción (el lote por cortar del pedido sin tela entregada). Las consultas mandan los textos ya armados con su color de la guía (`consultas/comun.ts`); lo que pide «lo puede hacer» (confirmar, cancelar, armar nota…) también lo dice la consulta.
- **Lo que no viaja:** `ventas.nota_entrega` le quita a quien no tiene Ventas, Contaduría ni Dirección (Aduana) los precios, los importes y el anticipo, y el saldo a quien no tiene Contaduría (`recortado`); `contaduria.estado_pago_notas` da el saldo solo a Contaduría. `ventas.pedido` lo leen Contaduría y Dirección sin botones que escriben; Aduana y Bodega no lo piden.
- **La web** está en `apps/web/src/rutas/ventas/` (una ruta por pestaña) y `apps/web/src/departamentos/ventas/`: `pestanas/`, `cajones/` (el pedido, el editor del pedido nuevo y de Modificar pedido, la revisión, el armado de la nota, la nota y el cliente; el historial es el común) y `ventanas/` (cancelar con motivo, pasar a bodega, confirmar entrega y nota de crédito). La pestaña, los filtros y el cajón abierto van en la dirección (`direccion.ts`: `?cajon=pedido&id=…`), así otro departamento abre un cajón de Ventas con un enlace. `envio.ts` manda las acciones con `useAccion`, pone los errores en su campo y avisa el choque de versión en el cajón; los estados mientras llega una consulta los pinta `SegunConsulta`, de lo común; el precio unitario, el total y el anticipo aplicado salen de `calculos/ventas.ts`, como en las acciones.
- **Las capturas** (el pedido nuevo, la modificación y la nota en armado) preguntan antes de cerrarse y antes de salir por el menú (`usePreguntarAntesDeSalir`), y revisan lo capturado con el esquema del contrato de su acción antes de mandarlo.
- **Pruebas:** cada consulta con la suya en `modulos/ventas/consultas/*.prueba.ts` y `modulos/contaduria/consultas/estado-pago-notas.prueba.ts` (el departamento, lo que no viaja a Aduana, el saldo solo a Contaduría, la pastilla); las pantallas en `apps/web/src/departamentos/ventas/ventas.prueba.ts`, con Playwright contra la muestra, en escritorio y en teléfono, con sus capturas en `.revision/capturas/ventas/`: cada botón llama a su acción y el aviso de abajo dice el texto que regresa, el cajón con cambios pregunta antes de cerrarse y el choque de versión se avisa.
