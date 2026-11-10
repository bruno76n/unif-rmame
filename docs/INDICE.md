# Índice

> **Qué cubre:** todos los archivos de creación de Unifórmame, agrupados, cada uno con una línea de qué cubre.
> **Estado:** Decidido.
> **Se construye en:** [fase 1](fases/01-repositorio-reglas-y-paquete-compartido.md).
> **Se conecta con:** [AGENTS.md](../AGENTS.md) · [CLAUDE.md](../CLAUDE.md) · [reglas para los documentos](../.claude/rules/documentos.md)

Cada línea resume su archivo; el detalle está en el archivo. Un archivo nuevo entra aquí con su línea (ver [reglas para los documentos](../.claude/rules/documentos.md)), y `pnpm docs:revisar` falla si falta alguno.

## Para empezar

- [AGENTS.md](../AGENTS.md) — lo que todo agente necesita para trabajar en este repositorio: qué es Unifórmame, el modo y las órdenes vigentes, cómo se trabaja, dónde está cada cosa, los comandos y las reglas.
- [CLAUDE.md](../CLAUDE.md) — lo que solo usa Claude Code: sus subagentes, sus ganchos, sus reglas por tipo de archivo y los worktrees. Todo lo común está en `AGENTS.md`, que este archivo importa en su primera línea.
- [Proyecto](PROYECTO.md) — qué es Unifórmame, para quién es, qué entra ahora y qué después, el orden en que se construye y los principios que nunca se rompen.
- [Glosario](GLOSARIO.md) — las palabras del negocio que usan las pantallas, el código y los archivos de creación, cada una con lo que significa en Unifórmame y un ejemplo.
- [Decisiones](DECISIONES.md) — todas las decisiones de Unifórmame en una sola tabla con número corrido: las de Bruno desde el 13 de octubre, las de la revisión del diseño, las de integración del esquema y del contrato, las del 8 y 9 de noviembre (nombre, fases, stack, hosting, nombres en español y la forma de trabajar) y las que se tomaron al escribir los archivos de creación.
- [Índice](INDICE.md) — todos los archivos de creación, con una línea de qué cubre cada uno.

## Cómo se trabaja

- [La forma de trabajar](trabajo/FORMA-DE-TRABAJO.md) — cómo se construye Unifórmame: quién hace qué, dónde se trabaja (la nube, su entorno, sus ramas y la Mac), las fases y las partes, el ciclo de cada parte, el bucle de resolución, los registros, los verdes, los modos, el trabajo en paralelo, cómo se escribe el código y las reglas que no cambian.
- [La revisión de fase](trabajo/REVISION-DE-FASE.md) — cómo se audita y se cierra cada fase: quién audita, los seis puntos con su evidencia, cómo se clasifica cada hallazgo, las fases delicadas con varios auditores y el desmentidor, la revisión más ligera de la interfaz y el cierre.
- [Bitácora](registros/BITACORA.md) — una línea por cada parte o sesión de trabajo, con su enlace a la sesión.
- [Registros vivos](registros/REGISTROS.md) — lo que crece mientras se construye: lo que falta decidir o investigar, las ideas que no entran ahora, lo que solo se prueba con el servicio real y lo que Claude Code decidió sin preguntar.

## Las reglas por tipo de archivo

- [Reglas para la base de datos](../.claude/rules/base-de-datos.md) — cómo se escriben las tablas y las migraciones: nombres, tipos, columnas comunes, nada se borra, dueño de cada tabla y migraciones que no se editan.
- [Reglas para el código](../.claude/rules/codigo.md) — cómo se escribe todo archivo de código de Unifórmame: TypeScript estricto, nombres en español, la escalera antes de escribir, estructura, documentación y lo que nunca se recorta.
- [Reglas para los contratos](../.claude/rules/contratos.md) — cómo se escribe el contrato de cada acción y cada consulta: una sola forma, en Zod, que usan la API, la web, la tablet y la documentación.
- [Reglas para los documentos](../.claude/rules/documentos.md) — cómo se escribe y se mantiene cada archivo de creación: el encabezado, lo decidido, un dato en un solo lugar, enlaces que funcionan y «Cómo está hecho».
- [Reglas para las pruebas](../.claude/rules/pruebas.md) — cómo se escribe cada prueba: qué demuestra, contra qué base corre y lo que nunca se hace para llegar al verde.
- [Reglas para las pantallas](../.claude/rules/react.md) — cómo se escribe cada pantalla en React: componentes del sistema de diseño, textos de la guía, todos sus estados y ninguna regla del negocio.

## Los subagentes

- [Auditor de fase](../.claude/agents/auditor.md) — el auditor de cada fase: con contexto limpio, revisa los seis puntos con su evidencia y solo informa; en las fases delicadas revisa el tema que se le da.
- [Desmentidor](../.claude/agents/desmentidor.md) — el que revisa los hallazgos de los auditores en las fases delicadas: intenta desmentir cada uno, y solo lo que queda en pie llega al reporte.
- [Revisor de diseño](../.claude/agents/revisor-diseno.md) — el revisor de las fases de interfaz: abre cada pantalla construida y la misma de la muestra, las compara con capturas, revisa sus textos y sus estados, y entrega un hallazgo por diferencia con su evidencia.
- [Trabajador](../.claude/agents/trabajador.md) — el trabajador que construye una parte en paralelo: corre en su propio worktree, solo toca las carpetas de su parte, pide al capataz lo compartido y entrega su parte en verde.

## Las fases

- [Las fases](fases/FASES.md) — el mapa de las 23 fases de Unifórmame: qué construye cada una en pocas líneas, si es delicada, su estado y su archivo.
- [Fase 1: Repositorio, reglas y paquete compartido](fases/01-repositorio-reglas-y-paquete-compartido.md) — el monorepo con sus versiones fijas, los ganchos, el sello y el interruptor de modo; las reglas y los subagentes; el paquete compartido con el dinero y las fechas.
- [Fase 2: Base de datos y pruebas](fases/02-base-de-datos-y-pruebas.md) — las convenciones de la base hechas código: columnas comunes, versión, nada se borra, migraciones, siembra y datos de la muestra; la base de las pruebas con Postgres real y simuladores.
- [Fase 3: API: protocolo e idempotencia](fases/03-api-protocolo-e-idempotencia.md) — el protocolo de acciones y consultas, los errores, la clave de idempotencia, el control de pisadas, la forma de un módulo y la documentación de la API.
- [Fase 4: Servicios comunes](fases/04-servicios-comunes.md) — lo que usan todos los módulos: eventos y trabajos, folios, configuración, bitácora, avisos, archivos, impresión y respaldos.
- [Fase 5: Acceso con Google, cuentas y permisos](fases/05-acceso-con-google-cuentas-y-permisos.md) — entrar con Google, las sesiones, «Confirmar con Google», las cuentas, los departamentos y los permisos finos.
- [Fase 6: Dispositivos y sincronización](fases/06-dispositivos-y-sincronizacion.md) — registrar y revocar aparatos, sus llaves, y la sincronización: subir, bajar, foto y avisos en vivo.
- [Fase 7: Autorizaciones y Personal](fases/07-autorizaciones-y-personal.md) — las autorizaciones de Dirección, las personas, el PIN del taller, la asistencia y las tarifas.
- [Fase 8: Catálogo](fases/08-catalogo.md) — escuelas, tallas, productos, variantes con su código de barras, listas de precios y precios.
- [Fase 9: Inventario: libro, existencias, reservas y traspasos](fases/09-inventario-libro-existencias-reservas-y-traspasos.md) — el libro de movimientos, las existencias con el cuadre de cada noche, las reservas, los traspasos y las excepciones.
- [Fase 10: Patronaje y Compras](fases/10-patronaje-y-compras.md) — recetas, cuenta de material y desarrollos; materiales, proveedores, órdenes de compra y la proyección de material.
- [Fase 11: Aduana y Bodega](fases/11-aduana-y-bodega.md) — recepciones en Aduana, material en Bodega, surtido y despachos.
- [Fase 12: Producción](fases/12-produccion.md) — órdenes de producción, lotes, entregas a corte, corte y bultos, operaciones y flujos, y los registros de la tablet.
- [Fase 13: Calidad y Mantenimiento](fases/13-calidad-y-mantenimiento.md) — la revisión de lotes, reclamos y devoluciones; máquinas, fallas y servicios.
- [Fase 14: Inventario: recepción del taller, conteos, ajustes y reabasto](fases/14-inventario-recepcion-del-taller-conteos-ajustes-y-reabasto.md) — lo que Aduana recibe del taller, los conteos, las diferencias, los ajustes, las mermas, los mínimos y el reabasto.
- [Fase 15: Contaduría: terceros, crédito y cobranza](fases/15-contaduria-terceros-credito-y-cobranza.md) — el crédito de clientes, cuentas por cobrar, pagos recibidos, saldo a favor y anticipos.
- [Fase 16: Ventas a externos](fases/16-ventas-a-externos.md) — clientes, pedidos con versiones, mandar a producción, cambios de pedido, notas de entrega, notas de crédito, entregas y devoluciones.
- [Fase 17: Contaduría: por pagar, facturas, gastos y nómina](fases/17-contaduria-por-pagar-facturas-gastos-y-nomina.md) — cuentas por pagar, facturas de proveedor con tres puntas, deudas y compensaciones con terceros, gastos y la nómina semanal.
- [Fase 18: Tienda en línea, Dirección y contador](fases/18-tienda-en-linea-direccion-y-contador.md) — los pedidos W- y sus reservas, las alertas e indicadores de Dirección y el paquete del contador.
- [Fase 19: Web principal](fases/19-web-principal.md) — el sistema de diseño, el armazón y las pantallas de los 14 departamentos de la web, igual que la muestra.
- [Fase 20: Tablet, puente de impresión e impresos](fases/20-tablet-puente-de-impresion-e-impresos.md) — la Puerta del taller sin internet, el programa puente de las Zebra, las etiquetas y las hojas.
- [Fase 21: Pruebas de punta a punta](fases/21-pruebas-de-punta-a-punta.md) — los 11 flujos de la fábrica de principio a fin y una temporada simulada.
- [Fase 22: Seguridad completa](fases/22-seguridad-completa.md) — la revisión de seguridad de todo el sistema: permisos, recorte, secretos, encabezados, intentos y lo que llega de los aparatos.
- [Fase 23: Puesta en marcha](fases/23-puesta-en-marcha.md) — Render, el dominio, Google, R2 y Resend de verdad; la migración de los datos de hoy y la restauración probada.

## Los cimientos

- [Arquitectura](cimientos/ARQUITECTURA.md) — las piezas de Unifórmame y cómo hablan entre sí; el stack con su versión exacta y su documentación oficial; la librería de cada tarea; cómo corre todo en local.
- [Estructura del repositorio](cimientos/ESTRUCTURA.md) — el monorepo `uniformame/`: el árbol completo, dónde va cada cosa, cómo se arma por dentro un módulo de la API y una pantalla, qué carpetas no se crean y los comandos.
- [Módulos](cimientos/MODULOS.md) — cómo se escribe un módulo de la API: dueño de sus tablas, una acción es una transacción, el orden en que el núcleo corre cada acción, las acciones internas, las lecturas y las consultas, los eventos, la bitácora y los puntos de extensión entre módulos.
- [Paquete compartido](cimientos/PAQUETE-COMPARTIDO.md) — lo que comparten la API, la web y la tablet en `packages/compartido`: los contratos Zod, los tipos, los cálculos puros, el dinero en centavos, la hora de México con el día de negocio y las semanas, y el cliente de la API con tipos.
- [Base de datos](cimientos/BASE-DE-DATOS.md) — las convenciones de la base: nombres y tipos, columnas comunes, `version` y `xid_escritura`, estados y cancelaciones, nada se borra, llaves pendientes, candados en orden fijo, migraciones, siembra del sistema y datos de la muestra.
- [API](cimientos/API.md) — el protocolo de la API: acciones y consultas, el cuerpo y la respuesta, los avisos, la paginación, el recorte según la cuenta, la versión de la app, los errores con sus mensajes en español, el cliente con tipos y la documentación OpenAPI que sale sola de los contratos.
- [Idempotencia y concurrencia](cimientos/IDEMPOTENCIA-Y-CONCURRENCIA.md) — la clave de idempotencia de cada acción y la tabla `comandos_recibidos`, el «repetido» con la misma respuesta, `version` y el `409` cuando alguien más cambió el registro, el control por agregado y los reintentos.
- [Acceso y permisos](cimientos/ACCESO-Y-PERMISOS.md) — las formas de entrar (Google, la llave de un aparato, el PIN de la tablet y, después, la credencial de uniformame.mx), cómo se revisa cada llamada (departamento, permiso fino, solo la dueña, «Confirmar con Google», alcance del aparato), el recorte común y de dónde sale la matriz de permisos.
- [Eventos y trabajos](cimientos/EVENTOS-Y-TRABAJOS.md) — la bandeja de salida de cada acción (la tabla `eventos`) y cómo se reparte; los avisos en vivo a pantallas y aparatos (SSE); el worker con Graphile Worker; los trabajos programados con su horario en parámetros, y la lista de todos los trabajos del sistema.
- [Sincronización](cimientos/SINCRONIZACION.md) — cómo trabajan los aparatos sin internet: subir su cola en orden y en tandas (aplicado, repetido, apartado, excepción), bajar sus cambios con cursor sobre `xid_escritura` hasta un tope seguro, la foto completa, el aparato revocado, lo que puede y lo que baja cada aparato, y el reloj de los aparatos.
- [Pruebas](cimientos/PRUEBAS.md) — los niveles de prueba; Postgres real con Testcontainers; los simuladores de Google, correo y almacenamiento con MSW; las pruebas con datos al azar para inventario, dinero y sincronización; las pruebas de lo que sale mal; los datos de la muestra; los flujos de punta a punta y la temporada simulada.
- [Seguridad](cimientos/SEGURIDAD.md) — lo que protege a todo el sistema: la base que nunca se expone, los secretos y las variables de entorno, las cookies, el origen y CORS, los encabezados de seguridad, los límites de peticiones e intentos, lo que se guarda cifrado o como hash, lo que nunca se registra, lo que llega de los aparatos y de fuera, y cómo se revisa todo en la fase 22.
- [Infraestructura](cimientos/INFRAESTRUCTURA.md) — dónde corre el sistema y cuánto cuesta: Render a precio fijo (la API, el worker, Postgres 18 y la web estática, en un Blueprint), el dominio en Cloudflare, los archivos y los respaldos en R2, el correo en Resend y la entrada con Google; las variables de entorno; cómo se despliega; la recuperación y la restauración probada; y la vigilancia que avisa si algo se cae o empieza a fallar.

## Los módulos

### Administración del sistema (`admin`)

- [Acceso con Google](modulos/admin/acceso-con-google.md) — entrar al sistema de la fábrica con la cuenta de Google (OpenID con PKCE), la cuenta sin acceso, las sesiones con sus vencimientos, «Confirmar con Google» de 5 minutos, salir y cerrar sesiones, y los intentos que llevan al `429`.
- [Archivos](modulos/admin/archivos.md) — fotos, comprobantes, facturas, documentos del contador y evidencias: la subida directa a R2 con dirección firmada, los tipos y tamaños que se aceptan, cómo se ligan a su documento y los enlaces que vencen.
- [Avisos](modulos/admin/avisos.md) — los avisos a personas dentro del sistema (la campana) y por correo con Resend: sus tipos, a quién le llegan, cuándo van por correo, leídos y no leídos.
- [Bitácora](modulos/admin/bitacora.md) — quién hizo qué y cuándo, con lo que había antes y lo que quedó; las consultas sensibles; las alertas de seguridad; y el recorte de los sueldos para quien no los puede ver.
- [Configuración](modulos/admin/configuracion.md) — los parámetros del negocio con su historial (las decisiones de operación, los parámetros y los técnicos), las listas que solo crecen y los datos de la empresa que salen en las hojas.
- [Cuentas](modulos/admin/cuentas.md) — las cuentas de Google que entran al sistema: la cuenta nueva que da la dueña, la que pide la oficina, ligadas a su persona por el folio E-; los departamentos de cada cuenta; quitar el acceso; y la cuenta de soporte técnico.
- [Dispositivos](modulos/admin/dispositivos.md) — los aparatos registrados (la tablet del taller, el teléfono para escanear, el programa puente, después la caja de tienda) y la credencial de uniformame.mx: el código de 10 minutos, la llave que hace el propio aparato, revocar, rotar la llave, su última sincronización y los comandos apartados o retenidos.
- [Folios](modulos/admin/folios.md) — los folios de cada documento: sus prefijos, el contador de cada tipo, los folios que nacen en un aparato sin internet y el código de barras de 6 dígitos como folio.
- [Impresión](modulos/admin/impresion.md) — las impresoras de etiquetas registradas, los trabajos de impresión que el programa puente manda a la Zebra en ZPL, la confirmación de lo impreso, y el PDF cuando no hay puente.
- [Permisos](modulos/admin/permisos.md) — los 15 departamentos, los permisos finos (ven sueldos y tarifas, imprimen guías), qué ve cada departamento y qué no, cómo los lee el sistema y que solo la dueña los cambia.
- [Respaldos](modulos/admin/respaldos.md) — el respaldo semanal cifrado fuera de Render con su registro, el recordatorio de probar una restauración, y el registro de cada restauración probada con su evidencia.

### Personal (`personal`)

- [Asistencia](modulos/personal/asistencia.md) — la asistencia de las personas que cobran por tiempo: la semana de lunes a sábado, los días completo, medio y falta, cerrar la semana para que Contaduría pague, reabrirla, y el trabajo que la abre cada semana.
- [Personas](modulos/personal/personas.md) — quién trabaja en la fábrica o en las tiendas, tenga o no cuenta (folio E-): darla de alta, editar su ficha, darla de baja y reactivarla; su área, su forma de pago y lo que baja a los aparatos.
- [PIN del taller](modulos/personal/pin-del-taller.md) — el PIN de 4 cifras con el que una persona del Taller entra a la tablet: asignarlo, restablecerlo, el bloqueo a los 5 intentos y el desbloqueo, cuándo se anula solo, cómo se guarda y lo que baja a la tablet.
- [Tarifas](modulos/personal/tarifas.md) — la tarifa por pieza de cada operación de un flujo, con su historia: quién la pone (Personal, con el permiso de sueldos), desde cuándo vale, la operación sin tarifa y cómo se congela en cada registro de la tablet.

### Dirección (`direccion`)

- [Alertas e indicadores](modulos/direccion/alertas-e-indicadores.md) — las alertas cruzadas de Dirección: de dónde sale cada una, cuándo se prende y cuándo desaparece; el trabajo que avisa solo las nuevas y la memoria que guarda para eso; y de dónde salen los indicadores de Dirección.
- [Autorizaciones](modulos/direccion/autorizaciones.md) — lo que un departamento no puede resolver solo y espera la decisión de Dirección (folio AU-): cómo se pide, cómo se decide una sola vez, el efecto que aplica el módulo de origen, «Pedida por ti» y la cancelación cuando el documento se cancela.

### Catálogo (`catalogo`)

- [Escuelas y secciones](modulos/catalogo/escuelas-y-secciones.md) — las escuelas con modelos propios (agregarlas, editarlas, darlas de baja, reactivarlas y la que nace al dar de alta un cliente escuela) y las secciones del catálogo, que agrega la dueña.
- [Listas de precios](modulos/catalogo/listas-de-precios.md) — las listas Mostrador, Mayoreo y En línea, la lista de cada cliente externo con su porcentaje de básicos y de especiales, las categorías de mayoreo (Básico, Especial, Accesorio y Sin descuento) y qué productos salen en cada lista.
- [Precios](modulos/catalogo/precios.md) — el precio de cada producto en cada lista, con su precio base y el propio de una talla, y su historial; el precio de una talla, el precio sugerido de un cliente externo, el cambio de precios en bloque, el precio en línea y los avisos de la ficha.
- [Productos](modulos/catalogo/productos.md) — qué es un producto y para quién es, dónde se vende, su alta (desde cero, a partir de otro, desde un pedido o desde un desarrollo), «Aplicar cambios» de la ficha, la foto de referencia, descontinuar y reactivar.
- [Tallas y tipos de prenda](modulos/catalogo/tallas-y-tipos-de-prenda.md) — los grupos de tallas con sus tallas; agregar, descontinuar, reactivar y dar de baja la talla de un producto; y los tipos de prenda, con sus medidas iniciales por talla y su flujo por omisión.
- [Variantes, códigos y etiquetas](modulos/catalogo/variantes-codigos-y-etiquetas.md) — cada talla de un producto con su código de barras para siempre: el rango de la fábrica y el de las tiendas, el estado de su etiqueta, imprimir etiquetas, el aviso cuando quedan pocos códigos y lo que baja a la tablet.

### Patronaje (`patronaje`)

- [Cuenta de material](modulos/patronaje/cuenta-de-material.md) — la única cuenta de tela y avíos de todo el sistema: cuánto lleva un corte o un pedido, material por material y en la unidad en que se guarda, con el desperdicio de la prenda; y cómo sale ese desperdicio de los cortes.
- [Desarrollos](modulos/patronaje/desarrollos.md) — el desarrollo de un producto nuevo (DS-): la solicitud, la muestra, los cambios, la aprobación del cliente o de Dirección, el descarte y el alta en catálogo, con su historial.
- [Recetas](modulos/patronaje/recetas.md) — la receta de cada prenda: sus medidas en centímetros, la tela en metros por talla y los avíos en su unidad; guardarla como versión, copiarla del producto base, verificarla en el corte, y saber si cubre unas tallas.

### Compras (`compras`)

- [Materiales](modulos/compras/materiales.md) — las telas, los avíos y los consumibles del taller: en qué unidad se guardan, cómo los captura Patronaje y cómo los toma la tablet, su alta con su proveedor y su costo, cómo se piden, su baja y su reactivación.
- [Órdenes de compra](modulos/compras/ordenes-de-compra.md) — la orden de compra OC-, una por proveedor: levantarla en borrador, editarla, enviarla con su PDF, recibirla en parte o completa, cerrarla con faltante, cancelarla o descartarla, y cerrarla cuando se paga; lo que está en camino y cuándo se espera.
- [Proveedores y precios de compra](modulos/compras/proveedores-y-precios.md) — los proveedores y su ficha ligada al tercero, qué materiales surte cada uno y su último precio, el proveedor habitual, el historial de precios de compra donde la nota del proveedor manda, el plazo real de cada proveedor y el costo de un material.
- [Proyección de material](modulos/compras/proyeccion-de-material.md) — la cuenta de cada material que alimenta Por pedir: lo que hay, lo comprometido con los lotes por cortar, lo que viene en camino, el consumo por día según el mes, el día en que se acaba, el plazo del proveedor, el estado y cuánto pedir.

### Ventas a externos (`ventas`)

- [Clientes externos](modulos/ventas/clientes.md) — el cliente externo (escuela, mayorista, empresa u otro): su alta con su tercero, su crédito, su lista de precios y su escuela; sus cambios, su baja y su reactivación; y lo que otros módulos leen de él.
- [Mandar a producción](modulos/ventas/mandar-a-produccion.md) — la revisión antes de mandar un pedido a producción: primero se surte de bodega lo que hay libre, y lo que falta va a los lotes del pedido, con los avisos de receta y de material que no detienen nada.
- [Notas de crédito](modulos/ventas/notas-de-credito.md) — la nota de crédito NC-, la corrección de una nota de entrega ya entregada: Ventas la pide con qué pasó, de cuánto y qué piezas regresan; Dirección la autoriza; y entonces baja el saldo por cobrar y Aduana espera las piezas que regresan.
- [Notas de entrega](modulos/ventas/notas-de-entrega.md) — la nota de entrega NV- con que sale de aduana lo listo de un pedido: armarla con el precio del pedido y su anticipo, cancelarla antes de que salga, su paso a en camino cuando Aduana la despacha, confirmar la entrega con quién firmó, y pasar a bodega lo listo que el cliente ya no quiere.
- [Pedidos y sus versiones](modulos/ventas/pedidos.md) — el pedido PE- de un cliente externo, talla por talla: el borrador, la confirmación con el precio congelado, las versiones cuando cambia después, la cancelación, su avance (entregado, en nota, listo, de bodega, en producción, por mandar), su etapa y su alerta, y lo que otros módulos leen de él.

### Producción (`produccion`)

- [Cambios a un pedido en producción](modulos/produccion/cambios-a-pedido.md) — lo que pasa en Producción cuando una versión del pedido quita piezas que ya están en producción: el cambio que nace para Producción, cómo «Aplicar a lotes» resta de los lotes sin cortar o manda a Bodega lo ya cortado, y los lotes y las órdenes que quedan cancelados.
- [Corte y bultos](modulos/produccion/corte-y-bultos.md) — el corte de un lote, que se captura ya cerrado en la web y sin medir tela: sin receta no se corta; los rollos de cada tela, lo que se usó según la receta, lo que quedó y a dónde va; las piezas por talla; quién cortó y sus registros; los bultos B- que arma el servidor y sus etiquetas.
- [Lotes](modulos/produccion/lotes.md) — el lote L-, lo que se corta junto y avanza junto: una prenda con sus tallas, su etapa, su avance por operación, su salud (atorado, atrasado, en riesgo), lo que un pedido tiene en producción y el costo del lote.
- [Operaciones y flujos](modulos/produccion/operaciones-y-flujos.md) — las operaciones del taller y el flujo de cada prenda: en qué orden pasan las piezas y quién hace cada operación de base; crear un flujo, agregar y quitar operaciones, y el candado que no deja cambiar un flujo con lotes en proceso.
- [Órdenes de producción](modulos/produccion/ordenes-de-produccion.md) — la orden OP- que manda fabricar: de un pedido de Ventas, de temporada, para una tienda o desde una sugerencia de Bodega; cómo nacen sus lotes con sus fechas de corte y de entrega, y qué le pasa cuando el pedido crece, cambia de fecha o se cancela.
- [Registros de operación](modulos/produccion/registros-de-operacion.md) — lo que sube la tablet del taller: las piezas buenas y dañadas de una operación en un bulto, con su tarifa congelada; cancelar un registro; la tarifa que llega después; los consumibles que se toman; y el aviso de un PIN bloqueado.

### Calidad (`calidad`)

- [Reclamos y devoluciones](modulos/calidad/reclamos-y-devoluciones.md) — lo que regresa del cliente: el reclamo RC-, que va del código de la prenda al lote, la operación, la persona y la partida de tela; y la revisión de una devolución con defecto, que decide si sirve y pasa a Bodega o es merma.
- [Revisión de lotes](modulos/calidad/revision-de-lotes.md) — Calidad revisa cada lote terminado: aprueba por talla y regresa a reproceso lo que tiene defecto, a la operación y la persona que lo causó; aprueba el reproceso cuando Aduana ya recibió el lote; y el catálogo de defectos con las operaciones que suelen causarlos.

### Mantenimiento (`mantenimiento`)

- [Máquinas, fallas y servicios](modulos/mantenimiento/maquinas-fallas-y-servicios.md) — todo Mantenimiento: las máquinas con su folio por tipo, quién la trae y su baja; las fallas FM- que llegan de la tablet o de Mantenimiento; mandar a reparación, la nota de seguimiento y el servicio SM- que resuelve la falla o se hace suelto; los técnicos; las horas de paro y lo que cuestan.

### Inventario (`inventario`)

- [Conteos y carga inicial](modulos/inventario/conteos.md) — el conteo ciego de Bodega y de Aduana (por sección o de una diferencia), con lo que decía el sistema a la hora de contar y el ajuste que pide si no cuadra; y la carga inicial: la existencia de arranque de las prendas y del material.
- [Diferencias, ajustes y mermas](modulos/inventario/diferencias-ajustes-y-mermas.md) — la diferencia DF- que explica un hueco (lo que no llegó, lo que llegó de más, un avío que no alcanzó, un negativo del cuadre) y cómo se cierra; el ajuste AJ- que mueve la diferencia vista cuando Dirección lo autoriza; y la merma de producción que llega de la tablet.
- [Entregas a corte](modulos/inventario/entregas-a-corte.md) — la tela y los avíos que Bodega entrega al taller para un lote: los rollos sugeridos y apartados de cada tela de la receta en orden de fecha de corte, entregar al corte, lo que el corte usó y lo que regresa, recibir del corte y devolver la entrega de un lote que se quitó.
- [Entregas y devoluciones de clientes](modulos/inventario/entregas-y-devoluciones-de-clientes.md) — lo que Inventario hace por un pedido externo: pasar a bodega lo listo que el cliente ya no quiere, sacar del inventario lo que el cliente firmó de recibido, esperar las piezas que regresan con una nota de crédito y aplicar lo que Calidad decide de ellas.
- [Excepciones](modulos/inventario/excepciones.md) — lo que el servidor aceptó y no cuadra: los tipos de excepción, quién las abre, la bandeja de Bodega (y la de Contaduría), cómo se resuelven y cómo se cierra la de un aparato revocado.
- [Existencias y cuadre](modulos/inventario/existencias-y-cuadre.md) — las existencias como cuenta del libro (por ubicación y variante, y el material por rollo), las cuentas que salen de ellas (libres, disponible en bodega, comprometido, libre total), sus lecturas y el cuadre de cada noche.
- [Libro de movimientos](modulos/inventario/libro-de-movimientos.md) — el inventario como suma de movimientos: las siete ubicaciones con su responsable, los 30 tipos de movimiento con su origen y su destino, los renglones con su lote y su traspaso, y cómo se escribe y se revierte un movimiento.
- [Material en bodega](modulos/inventario/material-en-bodega.md) — la tela rollo por rollo, con su etiqueta R-, su partida P- y su costo; los retazos RZ- que sirven; los avíos por cantidad; y los consumibles que toma el taller.
- [Mínimos y reabasto](modulos/inventario/minimos-y-reabasto.md) — los dos mínimos de existencia de Bodega y de cada tienda, la meta y la cuenta del reabasto (cuánto mover de Bodega y cuánto mandar a fabricar); mover de Bodega a una tienda con su RB-; y la sugerencia de fabricar que Producción levanta en una orden.
- [Recepción del taller](modulos/inventario/recepcion-del-taller.md) — cómo entra a Aduana lo que termina el taller: el lote revisado y el reproceso aprobado, contados a ciegas; el reparto por talla y destino en sus A-; el consumo de los avíos; y lo que se queda en el Taller cuando no cuadra.
- [Recepciones en aduana](modulos/inventario/recepciones-en-aduana.md) — recibir en Aduana lo que llega de un proveedor, lo que viene en camino de Bodega o de una tienda y lo que regresa un cliente; «Llegó completo» o «con diferencias»; la recepción de más y lo que regresa al proveedor; y el papel que deja cada recepción.
- [Reservas](modulos/inventario/reservas.md) — las piezas apartadas para un documento: quién tiene derecho a ellas, cómo nacen, cómo viajan con la pieza, cómo se liberan, se transfieren y vencen, y cómo cambian las piezas libres.
- [Surtido y despachos](modulos/inventario/surtido-y-despachos.md) — Bodega surte a aduana lo que le piden; Aduana junta lo que va al mismo destino en un despacho D- y lo saca; recordar al destino; anotar las etiquetas impresas; y recibir el despacho del otro lado.
- [Traspasos](modulos/inventario/traspasos.md) — el traspaso A-, el único documento que lleva una partida de su origen a su destino pasando por aduana: sus tipos, sus estados, lo que dijo cada lado, repartir sin mover, lo que queda en cada tramo y quién responde, y la partida en aduana como vista.

### Contaduría (`contaduria`)

- [Anticipos](modulos/contaduria/anticipos.md) — el dinero que un cliente adelanta a un pedido: el libro de anticipos y su disponible, cómo se descuenta de una nota, cómo regresa si la nota se cancela, y cómo pasa a favor del cliente cuando el pedido se cancela o termina sin usarlo.
- [Contador y cuadres](modulos/contaduria/contador-y-cuadres.md) — el paquete de cada mes para el contador externo (qué lleva, cuándo nace, cómo se congela al mandarlo y su archivo), los documentos que el contador regresa, lo que el paquete mandado ya no deja cambiar, el cuadre de saldos de cada noche y el resumen de saldos que lee Dirección.
- [Crédito de clientes](modulos/contaduria/credito-de-clientes.md) — el crédito que Contaduría le da a cada cliente externo: su límite, sus días y su semáforo; el semáforo que sugiere el sistema; y lo que Ventas lee de él, sin montos.
- [Cuentas por cobrar](modulos/contaduria/cuentas-por-cobrar.md) — lo que nos debe un cliente por cada nota entregada: cómo nace al confirmar la entrega, su saldo y su estado con cada aplicación, la nota de crédito que la corrige, su vencimiento y su antigüedad, y lo que Ventas ve de sus notas.
- [Cuentas por pagar](modulos/contaduria/cuentas-por-pagar.md) — lo que la fábrica le debe a un proveedor por cada factura y a un acreedor por cada mensualidad: su vencimiento, su saldo, cuándo está detenida, cómo se paga con «Confirmar con Google», y «Pagar lo recibido» cuando la factura no cuadra y decide Dirección.
- [Facturas de proveedor](modulos/contaduria/facturas-de-proveedor.md) — la factura o nota FP- de un proveedor, tal como llegó, y sus tres puntas: lo pedido, lo recibido y lo facturado; cuándo queda conciliada o detenida y quién responde; los precios de la nota que corrigen la orden; cancelarla; la nota de crédito del proveedor que aclara la diferencia; y lo que Compras lee de la facturación de su orden.
- [Gastos](modulos/contaduria/gastos.md) — el gasto de operación G-, con su categoría, dónde se gastó, de dónde salió el dinero y su comprobante; el que entra solo por un servicio de Mantenimiento con costo; cancelarlo; y las listas de categorías y de tipos de comprobante.
- [Nómina](modulos/contaduria/nomina.md) — la nómina de cada semana: cuándo nace y para cuándo se paga, quién entra, la cuenta por persona (días, piezas, correcciones y descuentos), lo que no alcanzó a descontarse, pagarla con «Confirmar con Google» y congelarla, el descuento semanal de una persona y la fecha de pago que se mueve con el día de pago.
- [Pagos y saldo a favor](modulos/contaduria/pagos-y-saldo-a-favor.md) — el pago PG- que Contaduría recibe de un cliente, a una nota o como anticipo de un pedido; sus aplicaciones, de donde salen los saldos; cancelarlo; el depósito que un cliente hace a la cuenta de un tercero; y el saldo a favor de un cliente: cómo entra, cómo se aplica y cómo se devuelve.
- [Terceros y deudas](modulos/contaduria/terceros-y-deudas.md) — la ficha común de quien nos debe o a quien le debemos (cliente, proveedor o acreedor, o varios a la vez), cómo nace y se liga sin duplicarse; las compensaciones entre lo que nos debe y lo que le debemos; y las deudas PR- con sus mensualidades.

### Tienda en línea (`linea`)

- [Pedidos en línea](modulos/linea/pedidos-en-linea.md) — el pedido W- de la tienda en línea, lo mínimo que la fábrica necesita desde la primera versión: recibirlo pagado o con pago pendiente, confirmar el pago, apartar sus prendas, seguirlas hasta aduana, cancelarlo y vencerlo; y la credencial de uniformame.mx que lo manda.

## La interfaz

- [Sistema de diseño](interfaz/DISENO.md) — el sistema de diseño de las pantallas sobre Tailwind y shadcn/ui: los colores, la paleta de escuelas, la tipografía, las medidas, los componentes, los estados en cuadro sólido y los íconos; la muestra (versión 36) como referencia visual y lo que no se construye de ella.
- [Textos de pantalla](interfaz/TEXTOS.md) — cómo se escribe todo texto de pantalla (títulos, pestañas, columnas, estados, botones y avisos): el tono, los nombres fijos, las siete formas de los estados con su color, y los textos de los pedidos, el hilo, la receta y el corte.
- [Lo común de las pantallas](interfaz/comunes.md) — lo que comparten todas las pantallas de la fábrica: el armazón (menú, barra superior, cuenta y campana de avisos) y qué ve cada cuenta, la página de un departamento con su Pendientes, los cajones y las ventanas, los estados de una pantalla, la búsqueda «¿Dónde está?» y el hilo del pedido, cada uno con su consulta.
- [Pantallas de Administración del sistema](interfaz/fabrica/administracion.md) — las pantallas de Administración del sistema (Pendientes, Usuarios y accesos, Dispositivos, Configuración, Bitácora, Respaldos y Pantalla de acceso), la pantalla real de entrada, el cajón Alta de usuario y sus ventanas, cada una con su consulta, sus textos, sus estados y sus botones.
- [Pantallas de Aduana](interfaz/fabrica/aduana.md) — las pantallas de Aduana (Andén, Recepción, En camino a aduana, Despacho, Inventario en aduana, En tránsito, Empaque en línea e Historial), los cajones Recibir del taller, Recibir material, Recibir lo que viene en camino y Despachar, y la ventana Devolver al proveedor, cada una con su consulta, sus textos, sus estados y sus botones.
- [Pantallas de Bodega](interfaz/fabrica/bodega.md) — las pantallas de Bodega (Pendientes con «Variantes en cero», Existencias, Materiales, Reabasto, Diferencias, Conteos y ajustes y Excepciones), los cajones Variante, Entrega al corte, Llegada de aduana, Nuevo conteo o Conteo de diferencia y Carga inicial, y sus ventanas, cada una con su consulta, sus textos, sus estados y sus botones.
- [Pantallas de Calidad](interfaz/fabrica/calidad.md) — las pantallas de Calidad (Pendientes, Por revisar con la revisión de un lote, Defectos y Reclamos con su rastreo) y las ventanas Reclamo nuevo, Resolver reclamo, Defecto nuevo y Revisar devolución, cada una con su consulta, sus textos, sus estados y sus botones.
- [Pantallas de Catálogo](interfaz/fabrica/catalogo.md) — las pantallas de Catálogo (Pendientes, Productos, Listas de precios, Etiquetas, Escuelas y tallas y Bitácora), los cajones Ficha de producto y Nuevo producto (también desde un pedido o un desarrollo) y sus ventanas, cada una con su consulta, sus textos, sus estados y sus botones.
- [Pantallas de Compras](interfaz/fabrica/compras.md) — las pantallas de Compras (Pendientes, Por pedir, Órdenes de compra, Materiales, Proveedores y Conciliación de facturas) y sus cajones (Levantar orden, «por qué» de un material, Orden de compra, Material y Proveedor) y ventanas, cada una con su consulta, sus textos, sus estados y sus botones.
- [Pantallas de Contaduría](interfaz/fabrica/contaduria.md) — las pantallas de Contaduría (Pendientes con el flujo de los próximos días, Cuentas por cobrar, Cuentas por pagar, Terceros, Gastos, Nómina y Contador externo), los cajones del cliente, Registrar pago y del tercero, y sus ventanas, cada una con su consulta, sus textos, sus estados y sus botones.
- [Pantallas de Dirección](interfaz/fabrica/direccion.md) — las pantallas de Dirección (Pendientes, Autorizaciones, Indicadores y Alertas cruzadas), cada una con su consulta, sus textos, sus estados y sus botones, y la ventana «Rechazar».
- [Pantallas de Mantenimiento](interfaz/fabrica/mantenimiento.md) — las pantallas de Mantenimiento (Pendientes, Máquinas, Fallas, Servicios y Costo por máquina), los cajones Falla y Máquina, y las ventanas Reportar falla, Máquina nueva, Mandar a reparación, Nota de seguimiento, Reparación o Registrar servicio, Cambiar quién la trae y Dar de baja, cada una con su consulta, sus textos, sus estados y sus botones.
- [Pantallas de Patronaje](interfaz/fabrica/patronaje.md) — las pantallas de Patronaje (Pendientes, Recetas con la página de la receta, Rendimiento y Desarrollo de producto), los cajones Rendimiento y del desarrollo, y sus ventanas, cada una con su consulta, sus textos, sus estados y sus botones.
- [Pantallas de Personal](interfaz/fabrica/personal.md) — las pantallas de Personal (Asistencia con sus pendientes, Personas, PIN del taller y Tarifas), el cajón de la persona y el de «Nueva persona», y las ventanas PIN, Dar de baja y Reabrir semana, cada una con su consulta, sus textos, sus estados y sus botones.
- [Pantallas de Producción](interfaz/fabrica/produccion.md) — las pantallas de Producción (Pendientes, Lotes, Órdenes de producción, Corte, Operaciones y Producción por persona), el cajón del lote y las ventanas Orden de producción nueva, Flujo nuevo, Operación nueva, Resolver excepción y Cancelar registro, cada una con su consulta, sus textos, sus estados y sus botones.
- [Pantallas de Tienda en línea](interfaz/fabrica/tienda-en-linea.md) — las pantallas de Tienda en línea en la primera versión (Pendientes, Pedidos y Disponibilidad), el cajón del pedido en línea con dónde está cada prenda y la ventana para cancelarlo, cada una con su consulta, sus textos, sus estados y sus botones.
- [Pantallas de Ventas a externos](interfaz/fabrica/ventas.md) — las pantallas de Ventas a externos (Pendientes, Pedidos, Notas de entrega y Clientes), los cajones Pedido, Pedido nuevo y Modificar pedido, Mandar a producción, Armar nota de entrega, Nota de entrega y Cliente, y sus ventanas, cada una con su consulta, sus textos, sus estados y sus botones.
- [Pantallas de la tablet](interfaz/tablet.md) — las pantallas de la Puerta del taller, cada una con lo que lee de su copia local, sus textos, sus estados y sus botones: el encabezado, entrar con nombre y PIN, el inicio de cada persona, registrar una operación, escanear bulto, falla de máquina, tomar consumible, sin internet, y las del aparato (registrar, revocada y actualizar).
- [La muestra](interfaz/muestra/sistema-alameda.html) — la muestra de la fábrica (versión 36): la referencia visual de cada pantalla.

## Las apps

- [La tablet del taller](apps/tablet.md) — la app de la Puerta del taller: una web instalable en el Chrome de una tablet Android, cómo se registra con su código, su copia local y su cola sin internet (Dexie), cómo sube y baja, el PIN que revisa ella misma con su bloqueo, el lector de etiquetas con la cámara y cómo se actualiza.
- [El puente de impresión](apps/puente-de-impresion.md) — el programa chico que corre en la computadora de Aduana y en la del taller: cómo se instala y se registra con su código, cómo se entera de sus trabajos, manda el ZPL a su Zebra por la red local y confirma cada uno; su configuración, su diario, su llave y cómo se actualiza.

## Los impresos

- [Etiquetas](impresos/etiquetas.md) — las etiquetas que imprimen las Zebra en ZPL, con su PDF de respaldo: la de prenda con el Code 128 de su variante, la de rollo R- (y la de retazo RZ-), la de bulto B- y las que lleva un A- al salir de aduana; su medida, su contenido, quién las imprime y desde dónde, y cómo se arman.
- [Hojas](impresos/hojas.md) — las hojas en PDF que arma la API con React-PDF: la orden de compra, el pedido, la nota de entrega (con precios y sin precios), la hoja del despacho D- y la hoja del lote; lo que lleva cada una, quién la saca y desde dónde.

## Los flujos de punta a punta

- [Flujo 01 · Pedido externo](flujos/fabrica/01-pedido-externo.md) — el pedido de un cliente externo de punta a punta, de la venta al cobro: confirmar, anticipo, mandar a producción, entregar tela, cortar, la tablet, Calidad, Aduana, la nota, el despacho, la entrega y el pago; lo que tiene que cuadrar al final y lo que sale mal.
- [Flujo 02 · Cambios en producción](flujos/fabrica/02-cambios-en-produccion.md) — los cambios a un pedido que ya está en producción: una versión que agrega y quita piezas y cambia la entrega, mandar lo nuevo, aplicar el cambio a los lotes, lo ya cortado que va a Bodega, y cancelar un pedido; lo que tiene que cuadrar al final y lo que sale mal.
- [Flujo 03 · Producto nuevo](flujos/fabrica/03-producto-nuevo.md) — una prenda nueva de punta a punta: el desarrollo con su muestra y la aprobación de Dirección, el alta en Catálogo a partir de otra prenda, la receta copiada y corregida, sus etiquetas, la primera orden y el primer corte que verifica la receta; lo que tiene que cuadrar al final y lo que sale mal.
- [Flujo 04 · Compra de material](flujos/fabrica/04-compra-de-material.md) — la compra de material de punta a punta, de la orden al pago: levantar y enviar la orden con su PDF, recibir en Aduana rollo por rollo, las etiquetas de los rollos, el despacho a Bodega, la factura con sus tres puntas, el pago y el cierre de la orden; con la recepción de más, la factura que no cuadra y la nota que cobra otro precio.
- [Flujo 05 · Reabasto y surtido a tiendas](flujos/fabrica/05-reabasto-y-surtido-a-tiendas.md) — el reabasto de Bodega del mínimo a la sugerencia, la orden y el lote que la llena, y el surtido a una tienda sin caja: «Mandar a {tienda}», la recepción en Aduana, el despacho y la entrega con la firma de su encargada; lo que tiene que cuadrar al final y lo que sale mal.
- [Flujo 06 · Pedido en línea](flujos/fabrica/06-pedido-en-linea.md) — el pedido W- que manda el sitio, de que llega pagado a «Listo para empacar»: sus reservas y su promesa, el surtido de Bodega, la recepción en Aduana, el pago pendiente que vence, la prenda que no está, y la cancelación; lo que tiene que cuadrar al final y lo que sale mal.
- [Flujo 07 · Calidad y reclamos](flujos/fabrica/07-calidad-y-reclamos.md) — la revisión de un lote con rechazos por talla, el reproceso que regresa al taller y vuelve aprobado, el reclamo de un cliente rastreado desde el código de la prenda, la nota de crédito con piezas que regresan, la revisión de esa devolución y el reclamo resuelto; lo que tiene que cuadrar al final y lo que sale mal.
- [Flujo 08 · Diferencias y ajustes](flujos/fabrica/08-diferencias-y-ajustes.md) — cómo nace y se cierra cada diferencia de inventario: la de una recepción que no cuadró y su aclaración, la de una pieza que Bodega no encuentra, el conteo ciego con su ajuste y la autorización de Dirección, la diferencia del cuadre de la noche y la de un avío que no alcanzó; lo que tiene que cuadrar al final y lo que sale mal.
- [Flujo 09 · Autorizaciones](flujos/fabrica/09-autorizaciones.md) — los seis tipos de autorización de Dirección de punta a punta: quién la pide, cómo llega, quién decide con «Confirmar con Google», qué pasa al autorizar y al rechazar en el módulo de origen, la que pide y decide la misma persona, la que se cancela porque su documento se canceló, y el alta de usuario que solo da la dueña; lo que tiene que cuadrar al final y lo que sale mal.
- [Flujo 10 · Asistencia y nómina](flujos/fabrica/10-asistencia-y-nomina.md) — una semana de trabajo hasta su pago: las piezas de la tablet con su tarifa congelada, la operación nueva que todavía no tiene tarifa, el registro cancelado, la asistencia, el cierre de la semana, el descuento semanal, pagar la nómina y la corrección de algo ya pagado en la siguiente; lo que tiene que cuadrar al final y lo que sale mal.
- [Flujo 11 · Falla de máquina](flujos/fabrica/11-falla-de-maquina.md) — una falla de punta a punta: el reporte desde la tablet (también sin internet), la máquina parada que atora un lote, mandarla a reparación, la nota de seguimiento, registrar la reparación con su costo y sus horas de paro, el gasto que nace en Contaduría y el lote que deja de estar atorado; lo que tiene que cuadrar al final y lo que sale mal.

## El arranque

- [Migración](MIGRACION.md) — el arranque con los datos de hoy: qué entra y qué no, los archivos que se llenan, el orden y los tres tiempos de la carga, cómo se ensaya y cómo se revisa, los códigos de barras de hoy, las existencias por conteo, los pedidos y los lotes que están a medias el día del arranque, lo que se termina como hoy, y las tiendas mientras no tienen su caja.
