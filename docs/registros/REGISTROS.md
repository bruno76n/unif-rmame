# Registros vivos

> **Qué cubre:** lo que crece mientras se construye: lo que falta decidir o investigar, las ideas que no entran ahora, lo que solo se prueba con el servicio real y lo que Claude Code decidió sin preguntar.
> **Estado:** Decidido.
> **Se construye en:** [fase 1](../fases/01-repositorio-reglas-y-paquete-compartido.md).
> **Se conecta con:** [DECISIONES.md](../DECISIONES.md) · [PROYECTO.md](../PROYECTO.md) · [bitácora](BITACORA.md) · [forma de trabajo](../trabajo/FORMA-DE-TRABAJO.md)

Estos registros nunca cuentan como error del código: si les falta algo, se escribe (ver [los registros](../trabajo/FORMA-DE-TRABAJO.md#los-registros)).

## Pendientes

Lo que falta decidir o investigar, y en qué fase se resuelve. Lo del negocio ya tiene su valor inicial configurable, así que ninguno detiene una fase antes de la suya.

Ninguno por ahora.

## Para después

Ninguna idea nueva entra a escondidas.

- **El proyecto del POS** (la caja de las tiendas, en Electron y SQLite): se escribe y se construye cuando la fábrica ya funcione, en este mismo repositorio. Cubre lo que pidió la revisión del punto de venta del 9 de noviembre (decisiones 302 a 315):
  - el módulo `tiendas`: ventas, turnos, cortes de caja, movimientos de caja, apartados, pedidos especiales, sobres, mayoristas de tienda, códigos de tienda, reporte y pendientes del día, y demanda sin atender;
  - la lista cerrada de lo que sube, baja y consulta la caja, `admin.version_minima_caja`, su aviso en pantalla sin conexión, su stack y sus fases;
  - en inventario: las solicitudes S-, los envíos SE- (con fecha límite, urgencia y nota), separar la pieza de un W-, la merma de tienda con sus motivos, y los valores de `inventario.dias_solicitud_atrasada`, `inventario.dias_fecha_limite_se`, `inventario.dias_para_cuando_conteo` y `inventario.dias_historial_pos`;
  - en Catálogo, lo que las clientas piden y no existe, y la talla de un pedido especial que todavía no existe;
  - el historial de ventas del provisional, en una tabla aparte y sin movimientos, y la migración del provisional: apartados, pedidos especiales y sobres abiertos, mayoristas y usuarios;
  - Reportes de tienda en Dirección, el depósito del corte en Contaduría, el fondo de caja por tienda y «Registrar entrada» para quien no abre turno;
  - el aviso cuando una tienda no separa o no manda el mismo día la pieza de un pedido en línea;
  - y lo que se decide al escribirlo: el pago con tarjeta, el encargo de otra ubicación (sería un sexto motivo de reserva) y el código personal de la encargada.
- **uniformame.mx:** después del POS. Con él llegan sus pantallas, su credencial limitada y la pasarela, y «Recoger en tienda».
- **Pago en OXXO o transferencia en uniformame.mx:** si entra, la prenda se aparta con una reserva que vence y no cuenta como vendida hasta el pago. Se arranca solo con pago inmediato.
- **Empaque en línea en Aduana:** se completa con uniformame.mx, que genera la guía.
- **El reproceso en la tablet:** en la primera versión, el reproceso no pasa por la tablet.
- **Lo que la muestra puso en Dirección · «Próximamente»:** qué deja cada prenda (precio menos costo real), efectivo proyectado a 8 a 12 semanas, salud del dinero, calendario comercial por escuela y preguntas al sistema.
- **Lo que la muestra puso en Personal · «Próximamente»:** vacaciones, contratos, IMSS e incidencias.

## Verificación real pendiente

Lo que solo se comprueba con el servicio o el aparato de verdad. Se hace con la autorización de Bruno y con tope de gasto.

| Fase | Qué comprobar | Cómo comprobarlo | Hecha |
|---|---|---|---|
| 4 | El correo sale de verdad | Verificar el dominio en Resend, mandar un aviso a la cuenta de Bruno y ver que llegue | No |
| 4 | Los archivos se guardan en R2 | Subir un comprobante con su enlace firmado, bajarlo y comprobar que el enlace vence | No |
| 5 | Entrar con Google | Bruno crea el cliente en Google Cloud; entrar con la cuenta de la dueña, con una cuenta dada de alta y con una que no lo está | No |
| 20 | Las etiquetas en las Zebra | Instalar el puente en la computadora de Aduana y en la del taller; imprimir una etiqueta de prenda, una de rollo, una de retazo, las de un lote recibido y una de bulto; revisar que el lector y la cámara de la tablet las lean; aprobar el ZPL guardado de cada etiqueta | No |
| 20 | La tablet Android | Instalarla desde Chrome; leer la etiqueta de un bulto con la cámara; quitarle el wifi a media captura, apagarla y prenderla; comprobar que nada se duplica ni se pierde | No |
| 23 | Render y la recuperación | Desplegar con el Blueprint; regresar la base a un momento del pasado en una instancia nueva; restaurar el respaldo semanal fuera de Render | No |
| 23 | El dominio | Apuntar el dominio en Cloudflare y comprobar el certificado | No |

## Decisiones autónomas

Lo que Claude Code decidió sin preguntar, para que Bruno lo revise.

| Fecha | Fase | Qué se decidió | Opciones | Elegida y por qué | Revisada |
|---|---|---|---|---|---|
