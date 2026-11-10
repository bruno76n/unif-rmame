# Fase 21: Pruebas de punta a punta

> **Etapa:** Lanzamiento.
> **Estado:** Pendiente.
> **Antes de empezar:** lee la [forma de trabajo](../trabajo/FORMA-DE-TRABAJO.md) y la [revisión de fase](../trabajo/REVISION-DE-FASE.md).
> **Se conecta con:** [fases](FASES.md) · [fase 20](20-tablet-puente-de-impresion-e-impresos.md) · [fase 22](22-seguridad-completa.md) · [pruebas](../cimientos/PRUEBAS.md) · [flujo 01](../flujos/fabrica/01-pedido-externo.md) · [flujo 02](../flujos/fabrica/02-cambios-en-produccion.md) · [flujo 03](../flujos/fabrica/03-producto-nuevo.md) · [flujo 04](../flujos/fabrica/04-compra-de-material.md) · [flujo 05](../flujos/fabrica/05-reabasto-y-surtido-a-tiendas.md) · [flujo 06](../flujos/fabrica/06-pedido-en-linea.md) · [flujo 07](../flujos/fabrica/07-calidad-y-reclamos.md) · [flujo 08](../flujos/fabrica/08-diferencias-y-ajustes.md) · [flujo 09](../flujos/fabrica/09-autorizaciones.md) · [flujo 10](../flujos/fabrica/10-asistencia-y-nomina.md) · [flujo 11](../flujos/fabrica/11-falla-de-maquina.md)

## Objetivo

La fábrica completa funciona de principio a fin, como la va a usar la gente: los 11 flujos corren contra la API completa, el worker, la web, la tablet y el puente, con lo que sale mal en el camino, y una temporada simulada de varias semanas termina con el inventario y el dinero cuadrados. Aquí no se construye nada nuevo del negocio: lo que un flujo descubre se corrige en su módulo, con su prueba.

## Depende de

- [Fase 20](20-tablet-puente-de-impresion-e-impresos.md), terminada y en verde: la web, la tablet, el puente y los impresos ya existen.

## Qué se construye

### Parte 1 · El arnés de los flujos

La hace el capataz, solo, antes de repartir.

**Construye:** `pruebas/flujos/arnes/`: arrancar la API, el worker y la web contra un Postgres de Testcontainers con los datos de la muestra; los simuladores de Google, Resend y R2; la Zebra de mentira con su puente; la tablet en un Chrome emulado; la credencial del sitio; las cuentas de la muestra con «Confirmar con Google» simulado; un reloj que se adelanta para los trabajos y el cuadre de la noche; y las revisiones de lo que tiene que cuadrar: la existencia contra el libro, el cuadre sin residuo, las reservas, el dinero y la bitácora.

**Leer:**
- [pruebas](../cimientos/PRUEBAS.md) — los niveles, los simuladores, los datos de la muestra y la temporada simulada.
- [eventos y trabajos](../cimientos/EVENTOS-Y-TRABAJOS.md) — el reloj y los trabajos programados.
- [existencias y cuadre](../modulos/inventario/existencias-y-cuadre.md#el-cuadre-de-la-noche) — lo que revisa el cuadre.
- [forma de trabajo](../trabajo/FORMA-DE-TRABAJO.md#trabajo-en-paralelo) — cómo se reparte.

### Parte 2 · Flujo 01 · Pedido externo

**Construye:** `pruebas/flujos/01-pedido-externo.prueba.ts`.

**Leer:**
- [flujo 01](../flujos/fabrica/01-pedido-externo.md) — todo.
- [pedidos](../modulos/ventas/pedidos.md), [mandar a producción](../modulos/ventas/mandar-a-produccion.md), [notas de entrega](../modulos/ventas/notas-de-entrega.md), [anticipos](../modulos/contaduria/anticipos.md) y [cuentas por cobrar](../modulos/contaduria/cuentas-por-cobrar.md) — lo que pasa con el pedido y su dinero.
- [entregas a corte](../modulos/inventario/entregas-a-corte.md), [corte y bultos](../modulos/produccion/corte-y-bultos.md), [revisión de lotes](../modulos/calidad/revision-de-lotes.md) y [recepción del taller](../modulos/inventario/recepcion-del-taller.md) — el camino del lote.

### Parte 3 · Flujo 02 · Cambios en producción

**Construye:** `pruebas/flujos/02-cambios-en-produccion.prueba.ts`.

**Leer:**
- [flujo 02](../flujos/fabrica/02-cambios-en-produccion.md) — todo.
- [cambios a pedido](../modulos/produccion/cambios-a-pedido.md), [pedidos](../modulos/ventas/pedidos.md#el-avance-la-etapa-y-la-alerta) y [órdenes de producción](../modulos/produccion/ordenes-de-produccion.md) — las versiones, el cambio y el paso a temporada.

### Parte 4 · Flujo 03 · Producto nuevo

**Construye:** `pruebas/flujos/03-producto-nuevo.prueba.ts`.

**Leer:**
- [flujo 03](../flujos/fabrica/03-producto-nuevo.md) — todo.
- [desarrollos](../modulos/patronaje/desarrollos.md), [productos](../modulos/catalogo/productos.md), [variantes, códigos y etiquetas](../modulos/catalogo/variantes-codigos-y-etiquetas.md) y [recetas](../modulos/patronaje/recetas.md) — el alta, los códigos y la receta.

### Parte 5 · Flujo 04 · Compra de material

**Construye:** `pruebas/flujos/04-compra-de-material.prueba.ts`.

**Leer:**
- [flujo 04](../flujos/fabrica/04-compra-de-material.md) — todo.
- [órdenes de compra](../modulos/compras/ordenes-de-compra.md), [recepciones en aduana](../modulos/inventario/recepciones-en-aduana.md), [facturas de proveedor](../modulos/contaduria/facturas-de-proveedor.md) y [cuentas por pagar](../modulos/contaduria/cuentas-por-pagar.md) — las tres puntas y el pago.

### Parte 6 · Flujo 05 · Reabasto y surtido a tiendas

**Construye:** `pruebas/flujos/05-reabasto-y-surtido-a-tiendas.prueba.ts`.

**Leer:**
- [flujo 05](../flujos/fabrica/05-reabasto-y-surtido-a-tiendas.md) — todo.
- [mínimos y reabasto](../modulos/inventario/minimos-y-reabasto.md), [surtido y despachos](../modulos/inventario/surtido-y-despachos.md) y [migración](../MIGRACION.md#las-tiendas-sin-caja) — la cuenta, el RB- y la tienda sin caja.

### Parte 7 · Flujo 06 · Pedido en línea

**Construye:** `pruebas/flujos/06-pedido-en-linea.prueba.ts`.

**Leer:**
- [flujo 06](../flujos/fabrica/06-pedido-en-linea.md) — todo.
- [pedidos en línea](../modulos/linea/pedidos-en-linea.md) y [reservas](../modulos/inventario/reservas.md) — el W-, sus reservas y su promesa.

### Parte 8 · Flujo 07 · Calidad y reclamos

**Construye:** `pruebas/flujos/07-calidad-y-reclamos.prueba.ts`.

**Leer:**
- [flujo 07](../flujos/fabrica/07-calidad-y-reclamos.md) — todo.
- [revisión de lotes](../modulos/calidad/revision-de-lotes.md), [reclamos y devoluciones](../modulos/calidad/reclamos-y-devoluciones.md) y [notas de crédito](../modulos/ventas/notas-de-credito.md) — el reproceso, el rastreo y la devolución.

### Parte 9 · Flujo 08 · Diferencias y ajustes

**Construye:** `pruebas/flujos/08-diferencias-y-ajustes.prueba.ts`.

**Leer:**
- [flujo 08](../flujos/fabrica/08-diferencias-y-ajustes.md) — todo.
- [diferencias, ajustes y mermas](../modulos/inventario/diferencias-ajustes-y-mermas.md) y [conteos](../modulos/inventario/conteos.md) — cómo nace y se cierra cada una.

### Parte 10 · Flujo 09 · Autorizaciones

**Construye:** `pruebas/flujos/09-autorizaciones.prueba.ts`.

**Leer:**
- [flujo 09](../flujos/fabrica/09-autorizaciones.md) — todo.
- [autorizaciones](../modulos/direccion/autorizaciones.md) y [cuentas](../modulos/admin/cuentas.md) — los seis tipos y sus efectos.

### Parte 11 · Flujo 10 · Asistencia y nómina

**Construye:** `pruebas/flujos/10-asistencia-y-nomina.prueba.ts`.

**Leer:**
- [flujo 10](../flujos/fabrica/10-asistencia-y-nomina.md) — todo.
- [nómina](../modulos/contaduria/nomina.md), [asistencia](../modulos/personal/asistencia.md), [tarifas](../modulos/personal/tarifas.md) y [registros de operación](../modulos/produccion/registros-de-operacion.md) — la cuenta de cada persona.

### Parte 12 · Flujo 11 · Falla de máquina

**Construye:** `pruebas/flujos/11-falla-de-maquina.prueba.ts`.

**Leer:**
- [flujo 11](../flujos/fabrica/11-falla-de-maquina.md) — todo.
- [máquinas, fallas y servicios](../modulos/mantenimiento/maquinas-fallas-y-servicios.md), [lotes](../modulos/produccion/lotes.md#reglas) y [gastos](../modulos/contaduria/gastos.md) — el paro, el atorado y el gasto.

### Parte 13 · La temporada simulada

La hace el capataz, al final, con los once flujos en verde.

**Construye:** `pruebas/temporada/`: semanas de trabajo generadas al azar con fast-check (pedidos y sus versiones, cortes, registros de la tablet con cortes de red, recepciones, surtidos, pedidos en línea, pagos, asistencias y nóminas), con el cuadre de la noche al final de cada día simulado.

**Leer:**
- [pruebas](../cimientos/PRUEBAS.md#flujos-de-punta-a-punta-y-temporada-simulada) — qué tiene que cuadrar al terminar.

## Cómo se construye

- **Primero la parte 1, con un solo agente.** Hasta que el arnés está en verde con un flujo de humo (un pedido que se confirma y se manda a producción), no se reparte nada.
- **Las partes 2 a 12 van en paralelo,** una por [trabajador](../../.claude/agents/trabajador.md), cada uno en su worktree, de cuatro en cuatro. Cada una es dueña de su archivo en `pruebas/flujos/`.
- **El arnés es del capataz.** Si un flujo necesita algo más del arnés, se lo pide y espera.
- **Cada flujo usa lo que usaría la gente:** la API con las cuentas de la muestra, la tablet y el puente; nunca escribe en la base por su lado ni llama a una función por dentro.
- **Lo que un flujo descubre no lo corrige el trabajador:** lo dice al capataz con su paso, su dato y lo que esperaba. El capataz lo corrige en su módulo con el bucle de resolución, y agrega la prueba de esa acción que lo demuestra; el flujo solo lo vuelve a correr.
- **Un flujo no cambia su archivo para pasar:** si lo que dice el archivo está mal, se dice y se decide antes de cambiarlo.
- **La temporada al final:** cuando encuentra un caso que falla, ese caso se vuelve prueba fija, como dice [pruebas](../cimientos/PRUEBAS.md#pruebas-con-datos-al-azar).

## Excepciones permitidas

- Lo que llega con el POS o con uniformame.mx no se prueba aquí: la tienda con caja, el empaque, la guía y la entrega en línea.
- Los servicios de fuera son sus simuladores; lo de verdad es de la [fase 23](23-puesta-en-marcha.md).
- Esta fase puede tocar el código de cualquier módulo, solo para corregir lo que descubre un flujo, con su prueba.

## Criterios de terminado

| Criterio | Prueba que lo demuestra |
|---|---|
| Cada flujo corre completo, con cada paso y su resultado como dice su archivo | `pruebas/flujos/01-pedido-externo.prueba.ts` a `11-falla-de-maquina.prueba.ts` |
| Al terminar cada flujo cuadra lo que dice su archivo: la existencia es la suma del libro, el cuadre de la noche no deja residuo y el dinero da exacto | Las revisiones del arnés, al final de cada flujo |
| Cada variante de «Lo que sale mal» de cada flujo responde como dice su archivo y no deja nada a medias | Los mismos archivos, un caso por variante |
| Ninguna cuenta recibió en ningún paso lo que no debe ver | Las revisiones del arnés sobre cada respuesta |
| Los flujos pasan tres veces seguidas, en cualquier orden | La corrida de la revisión completa con el orden al azar |
| Ocho semanas simuladas terminan sin residuo en el cuadre, con la existencia igual al libro, cada pieza en un solo lugar y el dinero cuadrado | `pruebas/temporada/temporada.prueba.ts` |
| Cada falla que encontró un flujo o la temporada tiene su prueba en su módulo | La revisión de fase, contra la bitácora de la fase |

## Revisión de fase

Normal: un [auditor](../../.claude/agents/auditor.md) con contexto limpio revisa los seis puntos de la [revisión de fase](../trabajo/REVISION-DE-FASE.md), y además que cada flujo pruebe lo que dice su archivo y no se haya cambiado ningún archivo de flujo para llegar al verde.
