# Fase 19: Web principal

> **Etapa:** Interfaz.
> **Estado:** Pendiente.
> **Antes de empezar:** lee la [forma de trabajo](../trabajo/FORMA-DE-TRABAJO.md) y la [revisión de fase](../trabajo/REVISION-DE-FASE.md).
> **Se conecta con:** [fases](FASES.md) · [fase 18](18-tienda-en-linea-direccion-y-contador.md) · [fase 20](20-tablet-puente-de-impresion-e-impresos.md) · [diseño](../interfaz/DISENO.md) · [textos](../interfaz/TEXTOS.md) · [lo común de las pantallas](../interfaz/comunes.md) · [revisor de diseño](../../.claude/agents/revisor-diseno.md) · [trabajador](../../.claude/agents/trabajador.md)

## Objetivo

La web de la fábrica se ve y se usa igual que la muestra, sobre la API que ya existe: el sistema de diseño, el armazón y las pantallas de los 14 departamentos, cada una con su consulta, sus textos, sus estados y sus botones. Ninguna regla del negocio vive en la pantalla: pide, muestra y llama a sus acciones. Es la primera fase en paralelo: después del armazón, cada departamento lo construye un trabajador en su propio worktree.

## Depende de

- [Fase 18](18-tienda-en-linea-direccion-y-contador.md), terminada y en verde: todas las acciones, lecturas y parámetros que llaman las pantallas ya existen.

## Qué se construye

### Parte 1 · Sistema de diseño y armazón

La hace el capataz, solo, antes de repartir.

**Construye:** `packages/interfaz` con los tokens y los componentes de la tabla de [diseño](../interfaz/DISENO.md#los-componentes); el armazón (menú con pastillas, barra superior, «¿Dónde está?», avisos de la cuenta y «Mis sesiones»), la página de un departamento, el cajón, la ventana, «Confirmar con Google», el aviso de abajo, los estados de una pantalla y el hilo, con sus consultas: `admin.armazon`, `inventario.pastillas_menu`, `admin.mis_sesiones`, `admin.mis_avisos`, `admin.historial_entidad`, `inventario.donde_esta` y `produccion.hilo_pedido`; la pantalla de entrada (`rutas/acceso.tsx`); la convención de la dirección para pestañas, filtros y cajones; el script que revisa las carpetas de cada trabajador; y la muestra en `docs/interfaz/muestra/sistema-alameda.html` lista para que el revisor la abra.

**Leer:**
- [diseño](../interfaz/DISENO.md) y [textos](../interfaz/TEXTOS.md) — todo.
- [lo común de las pantallas](../interfaz/comunes.md) — todo.
- [regla de pantallas](../../.claude/rules/react.md) y [estructura](../cimientos/ESTRUCTURA.md#las-pantallas-por-dentro) — dónde va cada cosa.
- [forma de trabajo](../trabajo/FORMA-DE-TRABAJO.md#trabajo-en-paralelo) — cómo se reparte.
- [acceso con Google](../modulos/admin/acceso-con-google.md) — la entrada, las sesiones y «Confirmar con Google».

### Parte 2 · Dirección

**Construye:** las pantallas de [Dirección](../interfaz/fabrica/direccion.md) y sus consultas.

**Leer:**
- [pantallas de Dirección](../interfaz/fabrica/direccion.md) — todo.
- [autorizaciones](../modulos/direccion/autorizaciones.md) y [alertas e indicadores](../modulos/direccion/alertas-e-indicadores.md) — lo que llaman sus botones y lo que leen sus consultas.

### Parte 3 · Compras

**Construye:** las pantallas de [Compras](../interfaz/fabrica/compras.md) y sus consultas.

**Leer:**
- [pantallas de Compras](../interfaz/fabrica/compras.md) — todo.
- [materiales](../modulos/compras/materiales.md), [proveedores y precios](../modulos/compras/proveedores-y-precios.md), [órdenes de compra](../modulos/compras/ordenes-de-compra.md) y [proyección de material](../modulos/compras/proyeccion-de-material.md) — sus acciones y sus reglas.

### Parte 4 · Catálogo

**Construye:** las pantallas de [Catálogo](../interfaz/fabrica/catalogo.md) y sus consultas.

**Leer:**
- [pantallas de Catálogo](../interfaz/fabrica/catalogo.md) — todo.
- [productos](../modulos/catalogo/productos.md), [precios](../modulos/catalogo/precios.md), [listas de precios](../modulos/catalogo/listas-de-precios.md), [tallas y tipos de prenda](../modulos/catalogo/tallas-y-tipos-de-prenda.md), [escuelas y secciones](../modulos/catalogo/escuelas-y-secciones.md) y [variantes, códigos y etiquetas](../modulos/catalogo/variantes-codigos-y-etiquetas.md) — sus acciones.

### Parte 5 · Patronaje

**Construye:** las pantallas de [Patronaje](../interfaz/fabrica/patronaje.md) y sus consultas.

**Leer:**
- [pantallas de Patronaje](../interfaz/fabrica/patronaje.md) — todo.
- [recetas](../modulos/patronaje/recetas.md), [cuenta de material](../modulos/patronaje/cuenta-de-material.md) y [desarrollos](../modulos/patronaje/desarrollos.md) — sus acciones y la cuenta que corre mientras se escribe.

### Parte 6 · Ventas a externos

**Construye:** las pantallas de [Ventas](../interfaz/fabrica/ventas.md) y sus consultas.

**Leer:**
- [pantallas de Ventas](../interfaz/fabrica/ventas.md) — todo.
- [clientes](../modulos/ventas/clientes.md), [pedidos](../modulos/ventas/pedidos.md), [mandar a producción](../modulos/ventas/mandar-a-produccion.md), [notas de entrega](../modulos/ventas/notas-de-entrega.md) y [notas de crédito](../modulos/ventas/notas-de-credito.md) — sus acciones, el avance y la alerta.

### Parte 7 · Tienda en línea

**Construye:** las pantallas de [Tienda en línea](../interfaz/fabrica/tienda-en-linea.md) y sus consultas, con `linea.pendientes`.

**Leer:**
- [pantallas de Tienda en línea](../interfaz/fabrica/tienda-en-linea.md) — todo.
- [pedidos en línea](../modulos/linea/pedidos-en-linea.md) y [reservas](../modulos/inventario/reservas.md) — el W-, su cancelación y la promesa.

### Parte 8 · Producción

**Construye:** las pantallas de [Producción](../interfaz/fabrica/produccion.md) y sus consultas, con la captura del corte.

**Leer:**
- [pantallas de Producción](../interfaz/fabrica/produccion.md) — todo.
- [lotes](../modulos/produccion/lotes.md), [corte y bultos](../modulos/produccion/corte-y-bultos.md), [órdenes de producción](../modulos/produccion/ordenes-de-produccion.md), [operaciones y flujos](../modulos/produccion/operaciones-y-flujos.md), [registros de operación](../modulos/produccion/registros-de-operacion.md) y [cambios a pedido](../modulos/produccion/cambios-a-pedido.md) — sus acciones, la salud y el tope.
- [cuenta de material](../modulos/patronaje/cuenta-de-material.md) — la cuenta del corte en el paquete compartido.

### Parte 9 · Calidad

**Construye:** las pantallas de [Calidad](../interfaz/fabrica/calidad.md) y sus consultas.

**Leer:**
- [pantallas de Calidad](../interfaz/fabrica/calidad.md) — todo.
- [revisión de lotes](../modulos/calidad/revision-de-lotes.md) y [reclamos y devoluciones](../modulos/calidad/reclamos-y-devoluciones.md) — sus acciones.

### Parte 10 · Mantenimiento

**Construye:** las pantallas de [Mantenimiento](../interfaz/fabrica/mantenimiento.md) y sus consultas.

**Leer:**
- [pantallas de Mantenimiento](../interfaz/fabrica/mantenimiento.md) — todo.
- [máquinas, fallas y servicios](../modulos/mantenimiento/maquinas-fallas-y-servicios.md) — sus acciones y el paro.

### Parte 11 · Aduana

**Construye:** las pantallas de [Aduana](../interfaz/fabrica/aduana.md) y sus consultas.

**Leer:**
- [pantallas de Aduana](../interfaz/fabrica/aduana.md) — todo.
- [traspasos](../modulos/inventario/traspasos.md), [recepciones en aduana](../modulos/inventario/recepciones-en-aduana.md), [recepción del taller](../modulos/inventario/recepcion-del-taller.md) y [surtido y despachos](../modulos/inventario/surtido-y-despachos.md) — sus acciones y lo que no sale.

### Parte 12 · Bodega

**Construye:** las pantallas de [Bodega](../interfaz/fabrica/bodega.md) y sus consultas.

**Leer:**
- [pantallas de Bodega](../interfaz/fabrica/bodega.md) — todo.
- [existencias y cuadre](../modulos/inventario/existencias-y-cuadre.md), [entregas a corte](../modulos/inventario/entregas-a-corte.md), [mínimos y reabasto](../modulos/inventario/minimos-y-reabasto.md), [conteos](../modulos/inventario/conteos.md), [diferencias, ajustes y mermas](../modulos/inventario/diferencias-ajustes-y-mermas.md), [excepciones](../modulos/inventario/excepciones.md) y [entregas y devoluciones de clientes](../modulos/inventario/entregas-y-devoluciones-de-clientes.md) — sus acciones y sus cuentas.

### Parte 13 · Contaduría

**Construye:** las pantallas de [Contaduría](../interfaz/fabrica/contaduria.md) y sus consultas, con `contaduria.flujo_proximos_dias`.

**Leer:**
- [pantallas de Contaduría](../interfaz/fabrica/contaduria.md) — todo.
- [crédito de clientes](../modulos/contaduria/credito-de-clientes.md), [cuentas por cobrar](../modulos/contaduria/cuentas-por-cobrar.md), [pagos y saldo a favor](../modulos/contaduria/pagos-y-saldo-a-favor.md), [anticipos](../modulos/contaduria/anticipos.md), [terceros y deudas](../modulos/contaduria/terceros-y-deudas.md), [cuentas por pagar](../modulos/contaduria/cuentas-por-pagar.md), [facturas de proveedor](../modulos/contaduria/facturas-de-proveedor.md), [gastos](../modulos/contaduria/gastos.md), [nómina](../modulos/contaduria/nomina.md) y [contador y cuadres](../modulos/contaduria/contador-y-cuadres.md) — sus acciones, sus recortes y la cuenta de la nómina.

### Parte 14 · Personal

**Construye:** las pantallas de [Personal](../interfaz/fabrica/personal.md) y sus consultas.

**Leer:**
- [pantallas de Personal](../interfaz/fabrica/personal.md) — todo.
- [personas](../modulos/personal/personas.md), [asistencia](../modulos/personal/asistencia.md), [PIN del taller](../modulos/personal/pin-del-taller.md) y [tarifas](../modulos/personal/tarifas.md) — sus acciones y lo que se recorta sin el permiso de sueldos.

### Parte 15 · Administración del sistema

**Construye:** las pantallas de [Administración del sistema](../interfaz/fabrica/administracion.md) y sus consultas.

**Leer:**
- [pantallas de Administración del sistema](../interfaz/fabrica/administracion.md) — todo.
- [cuentas](../modulos/admin/cuentas.md), [permisos](../modulos/admin/permisos.md), [dispositivos](../modulos/admin/dispositivos.md), [configuración](../modulos/admin/configuracion.md), [bitácora](../modulos/admin/bitacora.md), [respaldos](../modulos/admin/respaldos.md) e [impresión](../modulos/admin/impresion.md) — sus acciones.

## Cómo se construye

- **Primero la parte 1, con un solo agente.** Hasta que el armazón y los componentes están en verde y juntos, no se reparte nada.
- **Las partes 2 a 15 van en paralelo,** una por [trabajador](../../.claude/agents/trabajador.md), cada uno en su worktree, de cuatro en cuatro. Cada parte es dueña de `apps/web/src/rutas/<depto>/`, de `apps/web/src/departamentos/<depto>/` y de los archivos de sus consultas: la consulta, su contrato en `packages/compartido/src/contratos/<modulo>/` y sus pruebas.
- **Lo compartido solo lo toca el capataz:** `packages/interfaz`, `apps/web/src/comun/`, las dependencias y lo que cambie en una acción. Si un trabajador necesita un componente o un cambio en una acción, se lo pide al capataz y espera.
- **Un cajón de otro departamento se abre por su dirección** (la pestaña, el filtro y el cajón van en la dirección, ver [regla de pantallas](../../.claude/rules/react.md)): «Ver pedido» en Producción es un enlace a la dirección del cajón del pedido de Ventas, y nadie importa el componente de otro.
- **Cada consulta vive en la carpeta del módulo de su nombre,** aunque la defina el archivo de la pantalla: `inventario.disponibilidad_linea` va en `modulos/inventario/consultas/`. Lee las tablas de otros módulos solo para leer; nunca escribe.
- **Cada parte entrega con sus pruebas de pantalla en verde** (Playwright contra los datos de la muestra, en escritorio y en teléfono) y con «Cómo está hecho» de su archivo escrito.
- **El capataz junta de una en una,** con la revisión rápida y el script de las carpetas después de cada una.
- No va en esta fase: la Puerta del taller, las etiquetas y las hojas (fase 20).

## Excepciones permitidas

- Las consultas de esta fase las define el archivo de cada pantalla, no el de su módulo; su acción y sus reglas siguen en el módulo.
- Lo que cada archivo de pantalla dice en «Lo que no se copia de la muestra» manda sobre la muestra.
- Lo que llega con el POS (Solicitudes, Cortes de caja, «Pedir a una tienda», la computadora de tienda) y con uniformame.mx (Productos, Devoluciones, Clientes y Pasarela en línea, el empaque y la guía, el panel) no se construye.
- «Imprimir» y «PDF» llaman a la acción y a la ruta de etiquetas que ya existen; las etiquetas y las hojas de verdad se prueban en la fase 20.

## Criterios de terminado

| Criterio | Prueba que lo demuestra |
|---|---|
| Cada componente del sistema de diseño tiene las medidas, los colores y los estados de la muestra, también en tema y en teléfono | `packages/interfaz/src/muestra/componentes.prueba.ts`, con capturas |
| El menú solo muestra los departamentos de la cuenta, cada pastilla cuenta lo que dice su archivo, y una dirección de un departamento ajeno lleva a «No tienes acceso a esta pantalla» | `apps/web/src/comun/armazon.prueba.ts` |
| «¿Dónde está?» encuentra por código o por prenda y talla, con las piezas de cada ubicación | `apps/web/src/comun/donde-esta.prueba.ts` |
| Cada pantalla tiene sus estados: cargando, vacío, error, sin permiso, sin conexión y choque de versión | `apps/web/src/comun/estados.prueba.ts` y las pruebas de cada departamento |
| Un cajón con cambios sin guardar pregunta antes de cerrarse, de cambiar de pestaña o de salir por el menú | `apps/web/src/comun/cajon.prueba.ts` |
| «Confirmar con Google» abre la ventana de Google y, al volver, repite la acción con su misma clave | `apps/web/src/comun/confirmar-con-google.prueba.ts` |
| Cada pantalla de cada departamento se ve como la muestra en escritorio y en teléfono, salvo lo que su archivo dice que no se copia | `apps/web/src/departamentos/<depto>/<depto>.prueba.ts`, con capturas |
| Cada botón llama a su acción con lo que dice su archivo, y el aviso de abajo dice el texto que regresa | Las mismas pruebas de cada departamento |
| Cada consulta revisa el departamento y el permiso fino en el servidor y no manda lo que la cuenta no debe ver: precios a Aduana y Bodega, saldos sin Contaduría, sueldos y tarifas sin su permiso | `apps/api/src/modulos/<modulo>/consultas/<consulta>.prueba.ts` |
| Las consultas sensibles (el saldo de un cliente, la ficha de un tercero o de una persona, la nómina, las tarifas) dejan su renglón en la bitácora | `contaduria/consultas/cliente.prueba.ts`, `contaduria/consultas/nomina-semana.prueba.ts`, `personal/consultas/persona.prueba.ts` y `personal/consultas/tarifas.prueba.ts` |
| Lo que la pantalla calcula mientras se escribe (la tela del corte, la cuenta de la receta) sale del paquete compartido y da lo mismo que la acción al guardar | `apps/web/src/departamentos/produccion/corte.prueba.ts` y `departamentos/patronaje/receta.prueba.ts` |
| Lo que se ve en la nómina es lo que se paga, y si cambió mientras se veía no se paga | `apps/web/src/departamentos/contaduria/nomina.prueba.ts` |
| Ningún trabajador tocó carpetas que no son suyas | El script de las carpetas, en la revisión rápida |

## Revisión de fase

Interfaz: el [revisor de diseño](../../.claude/agents/revisor-diseno.md) compara cada pantalla con la muestra y un [auditor](../../.claude/agents/auditor.md) revisa que ninguna pantalla tenga reglas del negocio, que ninguna consulta mande lo que la cuenta no debe ver y que el código siga su estructura, sin desmentidor (ver [revisión de fase](../trabajo/REVISION-DE-FASE.md#tres-tamaños-de-revisión)).
