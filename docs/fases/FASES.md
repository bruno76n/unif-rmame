# Las fases

> **Qué cubre:** el mapa de las 23 fases de Unifórmame: qué construye cada una en pocas líneas, si es delicada, su estado y su archivo.
> **Estado:** Decidido.
> **Se construye en:** [fase 1](01-repositorio-reglas-y-paquete-compartido.md).
> **Se conecta con:** [AGENTS.md](../../AGENTS.md) · [CLAUDE.md](../../CLAUDE.md) · [forma de trabajo](../trabajo/FORMA-DE-TRABAJO.md) · [revisión de fase](../trabajo/REVISION-DE-FASE.md) · [proyecto](../PROYECTO.md) · [fase 1](01-repositorio-reglas-y-paquete-compartido.md) · [fase 2](02-base-de-datos-y-pruebas.md) · [fase 3](03-api-protocolo-e-idempotencia.md) · [fase 4](04-servicios-comunes.md) · [fase 5](05-acceso-con-google-cuentas-y-permisos.md) · [fase 6](06-dispositivos-y-sincronizacion.md) · [fase 7](07-autorizaciones-y-personal.md) · [fase 8](08-catalogo.md) · [fase 9](09-inventario-libro-existencias-reservas-y-traspasos.md) · [fase 10](10-patronaje-y-compras.md) · [fase 11](11-aduana-y-bodega.md) · [fase 12](12-produccion.md) · [fase 13](13-calidad-y-mantenimiento.md) · [fase 14](14-inventario-recepcion-del-taller-conteos-ajustes-y-reabasto.md) · [fase 15](15-contaduria-terceros-credito-y-cobranza.md) · [fase 16](16-ventas-a-externos.md) · [fase 17](17-contaduria-por-pagar-facturas-gastos-y-nomina.md) · [fase 18](18-tienda-en-linea-direccion-y-contador.md) · [fase 19](19-web-principal.md) · [fase 20](20-tablet-puente-de-impresion-e-impresos.md) · [fase 21](21-pruebas-de-punta-a-punta.md) · [fase 22](22-seguridad-completa.md) · [fase 23](23-puesta-en-marcha.md)

Una fase es una parte del sistema y se construye de abajo hacia arriba: primero los cimientos, después los módulos en orden de dependencia, la interfaz cuando todo ya existe detrás y al final el lanzamiento. Ninguna fase empieza hasta que la anterior está en verde. Cómo se trabaja cada fase está en la [forma de trabajo](../trabajo/FORMA-DE-TRABAJO.md) y cómo se cierra, en la [revisión de fase](../trabajo/REVISION-DE-FASE.md).

● = fase delicada: varios auditores, uno por tema, y el desmentidor.

**Estado:** Pendiente · En curso · Terminada. Lo cambia el cierre de cada fase.

## Cimientos

| # | Fase | Qué construye | Estado |
|---|---|---|---|
| 1 | [Repositorio, reglas y paquete compartido](01-repositorio-reglas-y-paquete-compartido.md) | El monorepo con sus versiones fijas, los ganchos, el sello y el interruptor de modo; las reglas y los subagentes; el paquete compartido con el dinero y las fechas | Pendiente |
| 2 | [Base de datos y pruebas](02-base-de-datos-y-pruebas.md) | Las convenciones de la base hechas código: columnas comunes, versión, nada se borra, migraciones, siembra y datos de la muestra; la base de las pruebas con Postgres real y simuladores | Pendiente |
| 3 ● | [API: protocolo e idempotencia](03-api-protocolo-e-idempotencia.md) | El protocolo de acciones y consultas, los errores, la clave de idempotencia, el control de pisadas, la forma de un módulo y la documentación de la API | Pendiente |
| 4 | [Servicios comunes](04-servicios-comunes.md) | Lo que usan todos los módulos: eventos y trabajos, folios, configuración, bitácora, avisos, archivos, impresión y respaldos | Pendiente |

## Módulos

| # | Fase | Qué construye | Estado |
|---|---|---|---|
| 5 ● | [Acceso con Google, cuentas y permisos](05-acceso-con-google-cuentas-y-permisos.md) | Entrar con Google, las sesiones, «Confirmar con Google», las cuentas, los departamentos y los permisos finos | Pendiente |
| 6 ● | [Dispositivos y sincronización](06-dispositivos-y-sincronizacion.md) | Registrar y revocar aparatos, sus llaves, y la sincronización: subir, bajar, foto y avisos en vivo | Pendiente |
| 7 ● | [Autorizaciones y Personal](07-autorizaciones-y-personal.md) | Las autorizaciones de Dirección, las personas, el PIN del taller, la asistencia y las tarifas | Pendiente |
| 8 | [Catálogo](08-catalogo.md) | Escuelas, tallas, productos, variantes con su código de barras, listas de precios y precios | Pendiente |
| 9 ● | [Inventario: libro, existencias, reservas y traspasos](09-inventario-libro-existencias-reservas-y-traspasos.md) | El libro de movimientos, las existencias con el cuadre de cada noche, las reservas, los traspasos y las excepciones | Pendiente |
| 10 | [Patronaje y Compras](10-patronaje-y-compras.md) | Recetas, cuenta de material y desarrollos; materiales, proveedores, órdenes de compra y la proyección de material | Pendiente |
| 11 | [Aduana y Bodega](11-aduana-y-bodega.md) | Recepciones en Aduana, material en Bodega, surtido y despachos | Pendiente |
| 12 | [Producción](12-produccion.md) | Órdenes de producción, lotes, entregas a corte, corte y bultos, operaciones y flujos, y los registros de la tablet | Pendiente |
| 13 | [Calidad y Mantenimiento](13-calidad-y-mantenimiento.md) | La revisión de lotes, reclamos y devoluciones; máquinas, fallas y servicios | Pendiente |
| 14 ● | [Inventario: recepción del taller, conteos, ajustes y reabasto](14-inventario-recepcion-del-taller-conteos-ajustes-y-reabasto.md) | Lo que Aduana recibe del taller, los conteos, las diferencias, los ajustes, las mermas, los mínimos y el reabasto | Pendiente |
| 15 ● | [Contaduría: terceros, crédito y cobranza](15-contaduria-terceros-credito-y-cobranza.md) | El crédito de clientes, cuentas por cobrar, pagos recibidos, saldo a favor y anticipos | Pendiente |
| 16 | [Ventas a externos](16-ventas-a-externos.md) | Clientes, pedidos con versiones, mandar a producción, cambios de pedido, notas de entrega, notas de crédito, entregas y devoluciones | Pendiente |
| 17 ● | [Contaduría: por pagar, facturas, gastos y nómina](17-contaduria-por-pagar-facturas-gastos-y-nomina.md) | Cuentas por pagar, facturas de proveedor con tres puntas, deudas y compensaciones con terceros, gastos y la nómina semanal | Pendiente |
| 18 | [Tienda en línea, Dirección y contador](18-tienda-en-linea-direccion-y-contador.md) | Los pedidos W- y sus reservas, las alertas e indicadores de Dirección y el paquete del contador | Pendiente |

## Interfaz

| # | Fase | Qué construye | Estado |
|---|---|---|---|
| 19 | [Web principal](19-web-principal.md) | El sistema de diseño, el armazón y las pantallas de los 14 departamentos de la web, igual que la muestra | Pendiente |
| 20 | [Tablet, puente de impresión e impresos](20-tablet-puente-de-impresion-e-impresos.md) | La Puerta del taller sin internet, el programa puente de las Zebra, las etiquetas y las hojas | Pendiente |

## Lanzamiento

| # | Fase | Qué construye | Estado |
|---|---|---|---|
| 21 | [Pruebas de punta a punta](21-pruebas-de-punta-a-punta.md) | Los 11 flujos de la fábrica de principio a fin y una temporada simulada | Pendiente |
| 22 ● | [Seguridad completa](22-seguridad-completa.md) | La revisión de seguridad de todo el sistema: permisos, recorte, secretos, encabezados, intentos y lo que llega de los aparatos | Pendiente |
| 23 ● | [Puesta en marcha](23-puesta-en-marcha.md) | Render, el dominio, Google, R2 y Resend de verdad; la migración de los datos de hoy y la restauración probada | Pendiente |

## Cómo está hecho

*Lo escribe Claude Code al cerrar cada fase: cambia su estado en las tablas de arriba.*
