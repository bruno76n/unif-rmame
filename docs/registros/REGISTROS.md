# Registros vivos

> **Qué cubre:** lo que crece mientras se construye: lo que falta decidir o investigar, las ideas que no entran ahora, lo que solo se prueba con el servicio real y lo que Claude Code decidió sin preguntar.
> **Estado:** Decidido.
> **Se construye en:** [fase 1](../fases/01-repositorio-reglas-y-paquete-compartido.md).
> **Se conecta con:** [DECISIONES.md](../DECISIONES.md) · [PROYECTO.md](../PROYECTO.md) · [bitácora](BITACORA.md) · [forma de trabajo](../trabajo/FORMA-DE-TRABAJO.md)

Estos registros nunca cuentan como error del código: si les falta algo, se escribe (ver [los registros](../trabajo/FORMA-DE-TRABAJO.md#los-registros)).

## Pendientes

Lo que falta decidir o investigar, y en qué fase se resuelve. Lo del negocio ya tiene su valor inicial configurable, así que ninguno detiene una fase antes de la suya.

- **Que cada tabla de negocio lleve su disparador** (fase 6, con la sincronización): nada revisa que una tabla con `version` tenga el disparador `columnas_comunes`, ni que una con `xid_escritura` lo lleve con `baja_a_aparatos`; sin eso, la app podría poner `xid_escritura` a mano. Una revisión en `scripts/migraciones.ts` o una prueba sobre el catálogo de la base.
- **La app puede cambiar sus propios valores de sesión** (fase 22): `uniformame_app` puede hacer `SET idle_in_transaction_session_timeout = 0` o `ALTER ROLE … SET`. El límite de un minuto es el valor por omisión, no una garantía.
- **`enTransaccionDeshecha` arma su propio Drizzle** (fase 3): si `crearBase` recibe opciones (un `schema`), la ayuda de pruebas tiene que usar las mismas.
- **Lo que lleva el `409` y la posición del cursor dependen de cada módulo** (fase 22, con la revisión de cada consulta): `tomarVersion` manda lo que le da la acción (`leerVisible`), sin revisar que venga recortado, y `cursorDe` guarda los campos que le pasa la consulta. Una revisión que compare el `409` y el cursor con los `recortables` de la consulta que lee ese registro.
- **Una acción puede tomar la versión de otro registro** (fase 22): el corredor sabe que se tomó una versión, no cuál. Revisar que la versión tomada sea la del documento que la acción dice que tocó (`entidad`).
- **El formato de los parámetros de texto** (fase 19, con la pantalla de Configuración): `admin.cambiar_parametro` revisa que un texto no venga vacío, pero no su forma (los días de trabajo, una versión). Decidir si cada definición lleva su patrón.
- **El nombre y el puesto de una cuenta** (fase 7, con Personal): hoy los mensajes y la bitácora de las cuentas usan el correo y «Esa persona» (decisión 373).
- **El nivel de `pnpm audit`** (fase 22): SEGURIDAD dice que solo una vulnerabilidad alta o crítica detiene la revisión, pero `pnpm revision` corre `pnpm audit` sin nivel y se detiene con cualquiera. Se intentó alinearlo y el permiso del entorno lo negó; Bruno decide si la revisión pide `--audit-level high` o si SEGURIDAD dice «cualquiera».
- **Un rol solo para el respaldo** (fase 22): hoy el worker vuelca con el rol dueño (decisión 368). Revisar si Render deja un rol de lectura que salte la seguridad por renglón de Graphile Worker.
- **La lectura `admin.datos_de_aparato`** (fase 6): el tipo, si está revocado, el nombre, el último contacto y la versión de un aparato; sin ella, la impresión solo corre en las pruebas. También `rotar_llave` en `admin.trabajos_impresion`.
- **Qué módulos puede usar un aparato al subir un archivo** (fase 6, con el alcance de cada aparato): hoy `POST /v1/archivos/subida` deja a un aparato subir a cualquier módulo.
- **Abrir un archivo desde una liga del navegador** (fase 19, con las pantallas): `GET /v1/archivos/{id}` pide `X-App-Version` como toda ruta fija, y un `<img>` o un `<a>` no la manda. Decidir si esa ruta revisa la versión o si la pantalla pide la dirección con una llamada.
- **El worker con dos procesos de Graphile Worker** (fase 21, con la temporada simulada): la bandeja se probó con dos llamadas a la vez y las colas se revisaron leyendo el código.
- **Un `\u0000` en la entrada o en la respuesta** (fase 22): Postgres no lo guarda en `text` ni en `jsonb`, y sale `500` en lugar de `400`. Rechazarlo en la validación del protocolo.
- **El tipo del cliente no pide `version` cuando el contrato edita** (fase 19, con las pantallas): `definirAccion` tendría que conservar `edita` como literal para que el cliente lo exija; hoy el servidor responde `400`.
- **La prueba al azar de la idempotencia corre 150 series contra Postgres** (fase 21, con la temporada simulada): la regla de pruebas pide miles; con la base real cada serie cuesta, y la temporada simulada es donde se corren muchas más.
- **Un commit de solo registros no corre `docs:revisar`** (fase 22): el encabezado de la bitácora o de `REGISTROS.md` se puede romper ahí y solo lo ve la siguiente revisión completa. Se decide al revisar la seguridad completa si el gancho también revisa esos dos encabezados.
- **La red del entorno «Unifórmame»** (antes de la fase 2): Claude Code lo creó con red limitada (`nodejs.org` y los registros de paquetes); la [forma de trabajo](../trabajo/FORMA-DE-TRABAJO.md#el-entorno-de-la-nube) pide «Trusted», que también deja pasar las documentaciones oficiales y Docker Hub. Bruno lo cambia en Settings → Environments y abre las sesiones que siguen en ese entorno.

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
| 4 | El respaldo semanal llega a R2 por partes con su suma | Correr el trabajo con la credencial que solo escribe y la llave pública de Bruno; bajarlo con otra credencial, descifrarlo con `age -d` y restaurarlo | No |
| 5 | Entrar con Google | Bruno crea el cliente en Google Cloud; entrar con la cuenta de la dueña, con una cuenta dada de alta y con una que no lo está | No |
| 20 | Las etiquetas en las Zebra | Instalar el puente en la computadora de Aduana y en la del taller; imprimir una etiqueta de prenda, una de rollo, una de retazo, las de un lote recibido y una de bulto; revisar que el lector y la cámara de la tablet las lean; aprobar el ZPL guardado de cada etiqueta | No |
| 20 | La tablet Android | Instalarla desde Chrome; leer la etiqueta de un bulto con la cámara; quitarle el wifi a media captura, apagarla y prenderla; comprobar que nada se duplica ni se pierde | No |
| 23 | Render y la recuperación | Desplegar con el Blueprint; regresar la base a un momento del pasado en una instancia nueva; restaurar el respaldo semanal fuera de Render | No |
| 23 | El dominio | Apuntar el dominio en Cloudflare y comprobar el certificado | No |

## Decisiones autónomas

Lo que Claude Code decidió sin preguntar, para que Bruno lo revise.

| Fecha | Fase | Qué se decidió | Opciones | Elegida y por qué | Revisada |
|---|---|---|---|---|---|
| 10 nov 2026 | 1 | Cómo empezar con el repositorio vacío y la sesión en el entorno «Default» (decisión 324) | Esperar a que Bruno suba `main` y abra otra sesión · subir el `.zip` como primer commit de la rama de la fase y correr el script del entorno en la sesión | La segunda: Bruno pidió no esperar, y el script es el mismo de la forma de trabajo | No |
| 10 nov 2026 | 1 | `@types/node` en el stack (decisión 325) | Sin tipos de Node (los scripts no compilan con `strict`) · `@types/node` 26.6.6 | La segunda: es la única forma de tipar `node:fs` y los demás módulos de Node | No |
| 10 nov 2026 | 1 | Cómo cuenta y avisa el gancho de fin (decisión 326) | Solo avisar · no dejar terminar en rojo y pedir el protocolo al tercer intento | La segunda: cada intento queda contado y el protocolo llega dentro del turno | No |
| 10 nov 2026 | 1 | La mitad en los negativos (decisión 327) | Hacia +∞ (−0.5 → 0) · lejos del cero (−0.5 → −1) | Lejos del cero: una devolución regresa exactamente lo que se cobró y la pantalla coincide con lo que se guarda | No |
| 10 nov 2026 | 1 | Cómo encontrar las credenciales de R2 (decisión 328) | Por formato (hexadecimal de 32 y 64) · por su variable con valor | Por su variable: por formato confundiría cualquier hash | No |
| 10 nov 2026 | 2 | Ningún script al instalar (decisión 330) | Aprobarlos · negarlos | Negarlos: ninguno hace falta y es lo más seguro | No |
| 10 nov 2026 | 2 | La rama de las fases siguientes (decisión 332) | Pedir otra rama · seguir en la de la sesión | Seguir: es la única que la nube deja empujar | No |
| 10 nov 2026 | 2 | Docker en la nube (decisión 333) | Pedirlo en el script del entorno · arrancarlo en el gancho de inicio | El gancho: el script del entorno no debe dejar daemons, y el gancho ya es solo de la nube | No |
| 10 nov 2026 | 2 | La base de las pruebas antes (decisión 334) | Probar las partes 1 a 3 sin base · traer la base de pruebas a la parte 1 | Traerla: las pruebas piden Postgres real | No |
| 10 nov 2026 | 2 | El rol de la app y su clave (decisión 335) | Clave en la migración · rol sin entrada y clave por máquina | Sin entrada: ningún secreto en el código | No |
| 10 nov 2026 | 2 | Tres avisos moderados de `pnpm audit` en dependencias indirectas (decisión 336) | Bajar el nivel del audit · `overrides` con las versiones corregidas | `overrides`: bajar el nivel sería debilitar la revisión | No |
| 10 nov 2026 | 2 | El tercer proyecto de Vitest (decisión 337) | Crearlo vacío · que entre con la API | Con la API: un proyecto sin pruebas no demuestra nada | No |
| 10 nov 2026 | 2 | El disparador y los objetos temporales (decisión 338) | Solo el `REVOKE TEMPORARY` · solo el `search_path` · los dos, con la migración fallando si no pudo quitar el permiso | Los dos: una base restaurada o copiada pierde el permiso, y el `search_path` sigue cuidando | No |
| 10 nov 2026 | 3 | La API sin CSP (decisión 339) | CSP estricta · sin CSP en la API | Sin CSP: la API no sirve páginas, salvo la documentación local | No |
| 10 nov 2026 | 3 | El `Origin` de los aparatos (decisión 340) | Pedirlo siempre · aceptarlo ausente o el de la tablet | El segundo: un aparato que no es navegador no lo manda | No |
| 10 nov 2026 | 3 | Dónde va `secreto_entregado` (decisión 341) | Dentro del resultado · junto a `ok` | Junto a `ok`: el resultado sigue cumpliendo su contrato | No |
| 10 nov 2026 | 3 | Adelantar el recorte vigilado, el registro técnico limpio y el permiso en la documentación (decisión 342) | Dejarlos a las fases 5 y 22 · hacerlos ya | Ya: son baratos y cierran fugas reales | No |
| 10 nov 2026 | 3 | `tomarVersion` con lo que la cuenta ve y la exigencia del corredor (decisión 343) | Dejarlo a cada acción · que el núcleo lo exija | Que el núcleo lo exija: no depende de que alguien se acuerde | No |
| 10 nov 2026 | 3 | La huella y la clave de otra cuenta (decisión 344) | Huella sobre lo transformado · sobre lo que llegó | Sobre lo que llegó: siempre es JSON plano | No |
| 10 nov 2026 | 4 | Quién instala el esquema de Graphile Worker (decisión 345) | El worker al arrancar · `base:migrar` con el dueño | El dueño: la app nunca crea objetos | No |
| 10 nov 2026 | 4 | Cómo se sabe que una vuelta ya corrió (decisión 346) | Solo la clave de Graphile Worker · una tabla `trabajos_vueltas` | La tabla: la clave se libera al terminar la tarea | No |
| 10 nov 2026 | 4 | Las particiones por mes (decisión 347) | Meses de México · meses de UTC con una de respaldo | UTC, con respaldo: es técnico y nunca falla una escritura | No |
| 10 nov 2026 | 4 | El sistema como quien escribe (decisión 348) | Un usuario «sistema» · un tipo `sistema` en el contexto | El tipo: no inventa cuentas | No |
| 10 nov 2026 | 4 | La versión en los avisos en vivo (decisión 349) | Pedir `X-App-Version` · mandarla en `hola` | En `hola`: un `EventSource` no manda encabezados | No |
| 10 nov 2026 | 4 | Cómo se guardan los días de trabajo (decisión 350) | Un booleano por día · texto con los días ISO | Texto: un solo parámetro y su historial | Sí |
| 10 nov 2026 | 4 | El mismo valor en una acción que edita (decisión 351) | Subir la versión · solo revisarla | Solo revisarla: no se escribe nada | No |
| 10 nov 2026 | 4 | La plantilla de los folios con alcance (decisión 352) | Que cada acción pase el año · ponerlo solo | Ponerlo solo, con el día de negocio | No |
| 10 nov 2026 | 4 | Dónde se revisa `solo_duena_agrega` (decisión 353) | Un contrato por lista · en la acción | En la acción: depende de la lista | No |
| 10 nov 2026 | 4 | El historial de la siembra de parámetros (decisión 354) | Aparte · en la misma siembra | En la misma: solo para los recién creados | No |
| 10 nov 2026 | 4 | Un renglón de bitácora por acción, exigido (decisión 355) | Confiar en cada acción · que el corredor lo exija | Que lo exija, con `sinBitacora` para las excepciones | No |
| 10 nov 2026 | 4 | Los sueldos en la bitácora (decisión 356) | Dos descripciones · una plantilla | La plantilla | No |
| 10 nov 2026 | 4 | Los permisos de las particiones (decisión 357) | Por omisión · solo por la madre | Solo por la madre | No |
| 10 nov 2026 | 4 | Quitar `deepmerge` del correo (decisión 358) | Bajar el nivel de `pnpm audit` · los componentes sueltos y sin `@react-email/render` | Los componentes sueltos: el permiso para bajar el nivel se negó, y así no entra el paquete | No |
| 10 nov 2026 | 4 | Las cuentas de los avisos antes de la fase 5 (decisión 359) | Una tabla provisional · dos lecturas que dará `usuarios` | Las dos lecturas | No |
| 10 nov 2026 | 4 | Los reintentos del correo (decisión 360) | Que el reloj los encole · que el trabajo se encole solo | Que se encole solo | No |
| 10 nov 2026 | 4 | El almacén de `pnpm local` (decisión 361) | MinIO · LocalStack · versitygw | versitygw, probado aquí | No |
| 10 nov 2026 | 4 | Las rutas fijas de los módulos (decisión 362) | En `servidor.ts` · registradas por su módulo | Por su módulo | No |
| 10 nov 2026 | 4 | Quién abre un archivo ligado (decisión 363) | Un permiso por propósito · la lectura `ve_documento` del dueño | La lectura del dueño | No |
| 10 nov 2026 | 4 | El puente antes de la fase 6 (decisión 364) | Una columna provisional · la lectura `admin.datos_de_aparato` | La lectura | No |
| 10 nov 2026 | 4 | La versión de `guardar_impresora` (decisión 365) | Dos acciones · la versión en los datos | En los datos | No |
| 10 nov 2026 | 4 | Lo que se manda en vivo por cada evento (decisión 366) | Un canal por tema · `enVivo` en cada módulo | `enVivo` | No |
| 10 nov 2026 | 4 | Los tipos de etiqueta (decisión 367) | Una lista en `admin` · cada módulo registra los suyos | Cada módulo | No |
| 10 nov 2026 | 4 | Con qué rol se vuelca el respaldo (decisión 368) | El de la app · uno de lectura · el dueño | El dueño: es el único que lee todo sin ser superusuario | Sí |
| 10 nov 2026 | 4 | Si se reintenta un respaldo que falló (decisión 369) | Cada minuto · una vez, con el recordatorio diario | Una vez | No |
| 10 nov 2026 | 4 | Cómo sabe la bitácora qué es un sueldo (decisión 370) | Por el nombre · una lista que declara cada módulo | La lista de cada módulo | No |
| 10 nov 2026 | 5 | Cómo nacen las cuentas de la muestra y de las pruebas (decisión 371) | Con `admin.crear_cuenta` · directo con el rol dueño | Directo: la dueña y soporte nacen con la siembra y las demás piden una persona | No |
| 10 nov 2026 | 5 | Si el encargado del taller de la muestra lleva la Puerta del taller | Como la pinta la muestra · sin ella | Sin ella: la regla dice que la Puerta se entra con PIN | No |
| 10 nov 2026 | 5 | Quién cuida `es_duena` y `es_soporte` (decisión 372) | El código · un disparador en la base | El disparador | No |
| 10 nov 2026 | 5 | Cómo se nombra una cuenta antes de Personal (decisión 373) | Esperar a la fase 7 · el correo | El correo | No |

