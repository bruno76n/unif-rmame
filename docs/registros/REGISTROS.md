# Registros vivos

> **Qué cubre:** lo que crece mientras se construye: lo que falta decidir o investigar, las ideas que no entran ahora, lo que solo se prueba con el servicio real y lo que Claude Code decidió sin preguntar.
> **Estado:** Decidido.
> **Se construye en:** [fase 1](../fases/01-repositorio-reglas-y-paquete-compartido.md).
> **Se conecta con:** [DECISIONES.md](../DECISIONES.md) · [PROYECTO.md](../PROYECTO.md) · [bitácora](BITACORA.md) · [forma de trabajo](../trabajo/FORMA-DE-TRABAJO.md)

Estos registros nunca cuentan como error del código: si les falta algo, se escribe (ver [los registros](../trabajo/FORMA-DE-TRABAJO.md#los-registros)).

## Pendientes

Lo que falta decidir o investigar, y en qué fase se resuelve. Lo del negocio ya tiene su valor inicial configurable, así que ninguno detiene una fase antes de la suya.

- **Pasar de pieza a tiempo entre el cierre de la semana y su pago** (fase 17): la nómina usa la ficha como esté al pagar (`nomina.md`), así que los registros de esa semana entrarían como de quien cobra por tiempo, sin pagarse y sin poder volver a entrar. Decidir si la nómina congela la forma de pago al cerrar la semana.
- **En qué paso se redondea medio día** (fase 17): medio día con un pago por día impar da medio centavo. La regla de redondeo ya está en el paquete compartido; falta decir en `nomina.md` si se redondea por día o por semana.
- **La app puede cambiar sus propios valores de sesión** (fase 22): `uniformame_app` puede hacer `SET idle_in_transaction_session_timeout = 0` o `ALTER ROLE … SET`. El límite de un minuto es el valor por omisión, no una garantía.
- **`enTransaccionDeshecha` arma su propio Drizzle** (fase 3): si `crearBase` recibe opciones (un `schema`), la ayuda de pruebas tiene que usar las mismas.
- **Lo que lleva el `409` y la posición del cursor dependen de cada módulo** (fase 22, con la revisión de cada consulta): `tomarVersion` manda lo que le da la acción (`leerVisible`), sin revisar que venga recortado, y `cursorDe` guarda los campos que le pasa la consulta. Una revisión que compare el `409` y el cursor con los `recortables` de la consulta que lee ese registro.
- **Una acción puede tomar la versión de otro registro** (fase 22): el corredor sabe que se tomó una versión, no cuál. Revisar que la versión tomada sea la del documento que la acción dice que tocó (`entidad`).
- **El formato de los parámetros de texto** (fase 19, con la pantalla de Configuración): `admin.cambiar_parametro` revisa que un texto no venga vacío, pero no su forma (los días de trabajo, una versión). Decidir si cada definición lleva su patrón.
- **La IP de verdad detrás de Render y Cloudflare** (fase 22, con la seguridad completa, antes de desplegar): los intentos y la bitácora usan la IP que ve Fastify; detrás de un proxy hace falta `trustProxy` con exactamente los saltos de confianza (no `true`), o todas las entradas contarían como una sola IP y diez fallas de cualquiera dejarían a toda la fábrica sin entrar. Con lo mismo se decide si se cree `cf-ipcity`: hoy lo puede poner quien llama, y entra al texto de la alerta de aparato nuevo.
- **Las variables que la API pide en producción** (fase 23, con la puesta en marcha): `entorno.ts` deja opcionales `GOOGLE_*` y `COOKIE_SECRETO` (el worker no las usa); sin ellas la API arranca sin entrada con Google. Revisar al arrancar la API en producción que estén y que el emisor sea el de Google.
- **Montos en los textos y en las etiquetas para soporte** (fases 19 y 20): el recorte común quita campos, no textos; un `mensaje` o una descripción con un monto ya escrito («Pagó $1,250.00») le llegaría a soporte.
- **El correo de «sin acceso» en el historial del navegador** (fase 19): la pantalla de acceso lee `#correo=` y lo quita con `history.replaceState`.
- **La ruta de regreso en la web** (fase 19): la API redirige a la ruta tal como llegó, con `%2f` codificado si lo trae; la web no la decodifica para navegar con ella como dirección.
- **Las rutas fijas y el recorte común** (fase 20, con las etiquetas y los impresos): las respuestas JSON de las rutas fijas y lo que dibuja una etiqueta no pasan por `recorteComun`; cada tipo de etiqueta recibe los datos ya recortados por su módulo.
- **El teléfono para escanear y la credencial de uniformame.mx con su llave** (fases 11 y 18): hoy entran con llave la tablet y el puente; el teléfono entra con la sesión de quien escanea más su llave, y la credencial nace con uniformame.mx.
- **El tope detenido solo ve las transacciones del rol de la app y de su base** (fase 22, con la seguridad completa): `pg_stat_activity` no le enseña al rol de la app el inicio de las del dueño (una migración, alguien en psql), ni se miran las de otras bases ni las transacciones preparadas, aunque el tope es de todo el servidor. El respaldo no frena el tope (solo lee). Decidir si el worker lee con `pg_read_all_stats` o si se guarda el tope visto de cada minuto.
- **Un CHECK para `falta_documento`** (fase 22): que la base exija `espera_entidad_id` cuando el motivo es `falta_documento`; hoy lo cumple solo el código.
- **`permiso.cola` en las acciones de la tablet** (fases 12 y 20): lo que su archivo dice «Quién: La tablet, por su cola» tiene que llevar `cola: true` en su contrato; si no, la subida lo aparta con `fuera_de_alcance`. Nada lo compara todavía.
- **El recorte de los aparatos** (fase 12, con las acciones de la tablet): `recorteComun` no le quita nada a un aparato. La tablet nunca recibe precios, costos ni sueldos, y las tarifas solo según `produccion.tarifa_visible_tablet`: definir su recorte, con su prueba, con la primera acción de la tablet que regrese montos.
- **La misma carrera del `429` en la entrada con Google** (fase 22): `entrada:{ip}` revisa el bloqueo antes y cuenta la falla después, como el canje antes de la decisión 408.
- **Los errores de los avisos en vivo van con `console.error`** (fase 22): `anotarError` de `api.ts` no pasa por `errorParaElRegistro`; un error de la base trae sus valores.
- **El comando que siempre falla por el servidor** (fase 21, con la temporada simulada): deja la cola del aparato `detenido` sin renglón; solo lo delata el aviso de aparato sin sincronizar. Decidir si después de varios intentos se aparta con su carga y se avisa a soporte.
- **Lo que viaja de más a un aparato** (con el POS): los `cambios` en vivo llevan ids de otros aparatos y de parámetros que no le bajan, y la bajada manda `quitar` de todo lo que cambió fuera de su filtro. Solo ids; con las cajas de dos tiendas, revisar que una no vea el movimiento de la otra.
- **La prueba al azar de la subida corre 60 series contra Postgres** (fase 21, con la temporada simulada): como la de la idempotencia, cada serie cuesta varias tandas contra la base real.
- **El nombre y el puesto de una cuenta** (fase 7, con Personal): hoy los mensajes y la bitácora de las cuentas usan el correo y «Esa persona» (decisión 373).
- **El nivel de `pnpm audit`** (fase 22): SEGURIDAD dice que solo una vulnerabilidad alta o crítica detiene la revisión, pero `pnpm revision` corre `pnpm audit` sin nivel y se detiene con cualquiera. Se intentó alinearlo y el permiso del entorno lo negó; Bruno decide si la revisión pide `--audit-level high` o si SEGURIDAD dice «cualquiera».
- **Un rol solo para el respaldo** (fase 22): hoy el worker vuelca con el rol dueño (decisión 368). Revisar si Render deja un rol de lectura que salte la seguridad por renglón de Graphile Worker.
- **Abrir un archivo desde una liga del navegador** (fase 19, con las pantallas): `GET /v1/archivos/{id}` pide `X-App-Version` como toda ruta fija, y un `<img>` o un `<a>` no la manda. Decidir si esa ruta revisa la versión o si la pantalla pide la dirección con una llamada.
- **El worker con dos procesos de Graphile Worker** (fase 21, con la temporada simulada): la bandeja se probó con dos llamadas a la vez y las colas se revisaron leyendo el código.
- **Un `\u0000` en la entrada o en la respuesta** (fase 22): Postgres no lo guarda en `text` ni en `jsonb`, y sale `500` en lugar de `400`. Rechazarlo en la validación del protocolo.
- **El tipo del cliente no pide `version` cuando el contrato edita** (fase 19, con las pantallas): `definirAccion` tendría que conservar `edita` como literal para que el cliente lo exija; hoy el servidor responde `400`.
- **La prueba al azar de la idempotencia corre 150 series contra Postgres** (fase 21, con la temporada simulada): la regla de pruebas pide miles; con la base real cada serie cuesta, y la temporada simulada es donde se corren muchas más.
- **Un commit de solo registros no corre `docs:revisar`** (fase 22): el encabezado de la bitácora o de `REGISTROS.md` se puede romper ahí y solo lo ve la siguiente revisión completa. Se decide al revisar la seguridad completa si el gancho también revisa esos dos encabezados.
- **La red del entorno «Unifórmame»** (antes de la fase 2): Claude Code lo creó con red limitada (`nodejs.org` y los registros de paquetes); la [forma de trabajo](../trabajo/FORMA-DE-TRABAJO.md#el-entorno-de-la-nube) pide «Trusted», que también deja pasar las documentaciones oficiales y Docker Hub. Bruno lo cambia en Settings → Environments y abre las sesiones que siguen en ese entorno.
- **Los tipos de aviso de cada módulo en el CHECK de `avisos.tipo`** (antes de la fase 9): Catálogo reescribió el CHECK con la lista completa (decisión 454), y el esquema de Drizzle de `admin` sigue con los del núcleo. Cada módulo que sume un tipo tiene que repetir la lista; falta decidir si los módulos declaran sus tipos de aviso en su registro y una prueba compara el CHECK con ellos.

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
| 10 nov 2026 | 5 | Si entrar deja la sesión confirmada con Google (decisión 377) | Sí, con el `auth_time` de la entrada · no, solo «Confirmar con Google» | No: la confirmación es explícita | No |
| 10 nov 2026 | 5 | Dónde lleva el correo la pantalla de «sin acceso» (decisión 376) | En la búsqueda · en el fragmento | En el fragmento, que no llega a ningún servidor | No |
| 10 nov 2026 | 5 | Si una cuenta puede llamar lo que solo nombra aparatos (decisión 382) | Sí · no | No: `403 fuera_de_alcance` | No |
| 10 nov 2026 | 5 | Dónde se quitan los montos a soporte y los sueldos a quien no los ve (decisión 383) | En cada consulta · un recorte común en el servidor | El recorte común, y cada monto de un resultado es opcional | No |
| 10 nov 2026 | 5 | Si el servidor marca usada la cookie de la ida a Google (decisión 385) | Una tabla de `state` usados · no | No: httpOnly, el código sirve una vez y el archivo pide «sin tabla» | No |
| 10 nov 2026 | 5 | Cómo se corta una conexión en vivo cuya sesión ya no vale (decisión 386) | Que la pantalla la cierre · que el servidor la revise en cada latido y tras los eventos de la cuenta | El servidor | No |
| 10 nov 2026 | 5 | Si las acciones y el `409` dicen `recortado` | Sí, cambiando el protocolo · no, y API.md lo dice | No: la lista va en las consultas | No |
| 10 nov 2026 | 6 | Cómo se canjea el código sin sesión ni llave (decisión 387) | Una acción sin quien llama · una ruta abierta con el cuerpo de una acción | La ruta abierta, con su clave en `comandos_recibidos` | No |
| 10 nov 2026 | 6 | Un campo `rotar_llave` que la revisión de los contratos tomaba por secreto (decisión 388) | Cambiarle el nombre · que un booleano no cuente | Que un booleano no cuente | No |
| 10 nov 2026 | 6 | Dónde se registra un programa de impresión (decisión 389) | En cualquier ubicación · donde haya una impresora | Donde haya una impresora | No |
| 10 nov 2026 | 6 | Qué cuenta en la huella de un comando de aparato y cuándo se guarda su carga (decisión 390) | Solo acción y datos · también la hora, la persona y el código | También la hora, la persona y el código; la carga en apartados y excepciones | No |
| 10 nov 2026 | 6 | Dónde queda marcado el reloj desfasado (decisión 391) | En cada comando · en el aparato | En el aparato | No |
| 10 nov 2026 | 6 | Qué errores de una acción apartan el comando (decisión 392) | Todos · `FaltaDocumento`, regla y `404` | `FaltaDocumento`, regla y `404`; lo demás corta la tanda | No |
| 10 nov 2026 | 6 | Cuándo se reintentan solos los que esperan un documento (decisión 393) | Al aplicarse el documento · también cuando llega repetido | También repetido, en cadena | No |
| 10 nov 2026 | 6 | Con qué acción se anota la clave repetida con otros datos (decisión 394) | La del comando · `admin.subir` | `admin.subir` | No |
| 10 nov 2026 | 6 | De dónde sale el id de la excepción antes de la fase 9 (decisión 395) | Esperar · de la salida de la acción | De la salida de la acción | No |
| 10 nov 2026 | 6 | Cómo corre `admin.reintentar_comando_apartado` la acción de otro módulo (decisión 396) | Una acción especial del núcleo · el registro en el contexto | El registro en el contexto | No |
| 10 nov 2026 | 6 | De dónde sale la llave de los cursores (decisión 397) | Una variable nueva · al azar al arrancar · HKDF de `COOKIE_SECRETO` | HKDF de `COOKIE_SECRETO` | No |
| 10 nov 2026 | 6 | Cómo se versiona el esquema de sincronización (decisión 398) | A mano · de la forma de sus tablas | De la forma de sus tablas | No |
| 10 nov 2026 | 6 | Cómo sabe la bajada que se pidió la foto después del cursor (decisión 399) | Comparando horas · el cursor guarda la petición que vio | El cursor guarda la petición que vio | No |
| 10 nov 2026 | 6 | Qué responde una parte de la foto que no sirve (decisión 400) | Empezar sola · `400` | `400`, «Empieza la foto otra vez.» | No |
| 10 nov 2026 | 6 | Quién dice qué parámetro decide un filtro de la bajada (decisión 401) | El parámetro · la tabla que baja | La tabla que baja | No |
| 10 nov 2026 | 6 | Cómo se guarda lo retenido antes de la tabla de excepciones (decisión 402) | Esperar a la fase 9 · `excepcion` con `dispositivo_revocado`, sin aplicar | `excepcion` con `dispositivo_revocado`, sin aplicar | No |
| 10 nov 2026 | 6 | Si se reintenta lo de un aparato revocado (decisión 403) | Sí, a mano · no | No: `dispositivo_revocado` | No |
| 10 nov 2026 | 6 | De dónde sale el aviso `resincronizar` (decisión 404) | De `parametro.cambiado` · de un evento `dispositivo.foto_pedida` | De `dispositivo.foto_pedida` | No |
| 10 nov 2026 | 6 | Cómo se sabe que el tope está detenido (decisión 405) | Guardar el tope cada minuto · la transacción abierta más vieja | La transacción abierta más vieja, una vez por episodio | No |
| 10 nov 2026 | 6 | Qué sube un aparato por su cola (decisión 406) | Todo lo de su alcance · lo que el contrato marca con `permiso.cola` | `permiso.cola`: rotar la llave y lo del puente quedan solo en línea | No |
| 10 nov 2026 | 6 | Cómo se guarda la carga de un comando de aparato (decisión 407) | Como llegó · sin campos con nombre de secreto | Sin campos con nombre de secreto | No |
| 10 nov 2026 | 6 | Cómo cuenta el canje los códigos equivocados (decisión 408) | Contar antes cada intento · un candado por IP | Un candado por IP | No |
| 10 nov 2026 | 6 | Qué pasa si falla el reintento solo de los apartados (decisión 409) | Dejar sin respuesta al comando · contestarlo y reintentar al empezar cada subida | Contestarlo y reintentar al empezar cada subida | No |
| 10 nov 2026 | 6 | Cómo cuenta la alerta de un revocado (decisión 410) | Desde la alerta anterior por hora o id · todo lo llegado menos lo ya alertado | Todo lo llegado menos lo ya alertado, con candado | No |
| 10 nov 2026 | 6 | Qué entra en la versión del esquema (decisión 411) | Tablas, orden y columnas · también el filtro y sus parámetros | También el filtro y sus parámetros | No |
| 10 nov 2026 | 6 | Cuándo revisa la tablet sus llaves foráneas (decisión 412) | Al terminar cada ventana · cuando queda al día | Cuando queda al día | No |
| 10 nov 2026 | 6 | Qué guarda un apartado que se vuelve a apartar por otro motivo (decisión 413) | Nada · el motivo nuevo y lo que espera | El motivo nuevo y lo que espera | No |
| 10 nov 2026 | 7 | Dónde se registra el efecto de cada tipo de autorización (decisión 414) | Una tabla en Dirección · cada módulo en su `index.ts` | Cada módulo, en `efectosDeAutorizacion` | No |
| 10 nov 2026 | 7 | Cómo se asegura un solo renglón de bitácora al decidir (decisión 415) | Confiar en cada efecto · un contexto que no deja escribirla | Un contexto que no deja escribirla | No |
| 10 nov 2026 | 7 | Qué responde la dueña que decide desde la pantalla equivocada (decisión 416) | `403` · `422 no_se_decide_aqui` | `422 no_se_decide_aqui` | No |
| 10 nov 2026 | 7 | Cuándo nace la consulta de la pantalla de Autorizaciones (decisión 417) | Fase 19 · fase 7 | Fase 7 | No |
| 10 nov 2026 | 7 | Una cuenta de prueba de Dirección (decisión 418) | Sesión de verdad en cada prueba · en la base plantilla | En la base plantilla | No |
| 10 nov 2026 | 7 | Qué dice «Entra al sistema» de alguien de la oficina sin cuenta (decisión 419) | Nada · «Sin cuenta» | «Sin cuenta» | No |
| 10 nov 2026 | 7 | Cuándo nace el listado `personal.personas` (decisión 420) | Con las personas · con las tarifas | Con las tarifas (parte 5) | No |
| 10 nov 2026 | 7 | Si sin el permiso se puede pasar a por pieza o desde por pieza (decisión 421) | Sí · no: cambia el sueldo | No: `403 sin_permiso_fino` | No |
| 10 nov 2026 | 7 | Las personas de la muestra y de las cuentas de prueba (decisión 422) | Con la acción de alta · directo en la base, con los ids de las cuentas | Directo en la base | No |
| 10 nov 2026 | 7 | Qué pasa con la persona de un comando de aparato (decisión 423) | Rechazar · apartar la que no existe y avisar de la vieja | Apartar la que no existe y avisar de la vieja | No |
| 10 nov 2026 | 7 | Cómo bajan las iniciales de la persona (decisión 424) | Una columna · la tablet · un campo calculado de la bajada | Un campo calculado en SQL: nada guardado dos veces | No |
| 10 nov 2026 | 7 | Cómo anota la bitácora el PIN anulado en la baja (decisión 425) | Un campo `pin` · `acceso_quitado` | `acceso_quitado`: `pin` parece secreto y la bitácora lo rechaza | No |
| 10 nov 2026 | 7 | Cuándo se quita la persona de la tablet al anular su PIN (decisión 426) | En la misma ventana · en la siguiente | En la misma: sin la persona nadie la escoge | No |
| 10 nov 2026 | 7 | La baja de la cuenta sin Google cuando se da de baja la persona (decisión 427) | Una columna · el CHECK con el motivo «Baja de la persona» | El CHECK con el motivo: la regla queda en la base | No |
| 10 nov 2026 | 7 | El nombre de una cuenta (decisión 428) | El correo · el de su persona | El de su persona | No |
| 10 nov 2026 | 7 | Revocar la tablet sin decir si se perdió (decisión 429) | Tomarlo como no · `400` | `400`: es obligatorio en la tablet | No |
| 10 nov 2026 | 7 | Cómo leen las cuentas a la persona (decisión 430) | Directo · con la lectura de Personal y `FOR SHARE` | Con la lectura de Personal | No |
| 10 nov 2026 | 7 | El texto de `persona_no_valida` de una dada de baja (decisión 431) | El de tienda · «{persona} está dada de baja.» | El propio | No |
| 10 nov 2026 | 7 | La versión de capturar un día y de poner una tarifa (decisión 432) | Dos acciones · la versión opcional en `datos` | Opcional en `datos` | No |
| 10 nov 2026 | 7 | Cómo probar la nómina pagada antes de la fase 17 (decisión 433) | Esperar · un módulo `contaduria` de prueba | El módulo de prueba, que se quita en la fase 17 | No |
| 10 nov 2026 | 7 | Cómo se nombra la operación antes de los flujos (decisión 434) | Su id · «La operación» | «La operación» | No |
| 10 nov 2026 | 7 | Qué semana es la de un día si la dueña cambia los días de trabajo (decisión 435) | El inicio de hoy · su semana de lunes a domingo | Su semana de lunes a domingo: una cerrada nunca cambia | No |
| 11 nov 2026 | 8 | Cuándo llegan los candados de los productos (decisión 436) | Parte 1 · parte 3 | Parte 3, con los productos | No |
| 11 nov 2026 | 8 | Cómo se escoge el color de una escuela (decisión 437) | Un contador · cuántas hay | Cuántas hay, con candado | No |
| 11 nov 2026 | 8 | La talla que vuelve con el nombre de una quitada (decisión 438) | Otra talla · la misma, reactivada | La misma | No |
| 11 nov 2026 | 8 | Renombrar al cliente a un nombre de otra lista (decisión 439) | Que choque en la base · `lista_repetida` | `lista_repetida` | No |
| 11 nov 2026 | 8 | Quién da el alta de un producto (decisión 440) | Dos acciones · el contrato sin departamento y la revisión en la acción | La revisión en la acción | No |
| 11 nov 2026 | 8 | Cómo revisa Catálogo la foto (decisión 441) | Leer `archivos` · una lectura de Administración | La lectura `admin.datos_de_archivo` | No |
| 11 nov 2026 | 8 | El alta desde un desarrollo antes de la fase 10 (decisión 442) | Aceptarla · `400` | `400` | No |
| 11 nov 2026 | 8 | Cómo cuida la base que un precio solo se cierre (decisión 443) | El permiso por columna · y un disparador | Los dos | No |
| 11 nov 2026 | 8 | Los únicos con un vacío (decisión 444) | El índice a mano · `coalesce` | `coalesce` | No |
| 11 nov 2026 | 8 | Qué precios de talla copia el alta a partir de otro (decisión 445) | Todos · los de las listas con precio base | Los de las listas con precio base | No |
| 11 nov 2026 | 8 | Dónde viven las cuentas de los precios (decisión 446) | La API · el paquete compartido | El paquete compartido | No |
| 11 nov 2026 | 8 | Los productos que el bloque deja igual (decisión 447) | Saltarlos · revisar su versión | Revisar su versión | No |
| 11 nov 2026 | 8 | Cómo se deciden las etiquetas por reimprimir (decisión 448) | Una regla por cambio · comparar el precio de cada talla | Comparar | No |
| 11 nov 2026 | 8 | El precio en línea de un descontinuado (decisión 449) | Cambiarlo · `canal_en_linea_apagado` | `canal_en_linea_apagado` | No |
| 11 nov 2026 | 8 | Quitar el precio de un canal apagado (decisión 450) | Rechazarlo · dejarlo | Dejarlo | No |
| 11 nov 2026 | 8 | Con qué tipo de etiqueta se prueba la impresión de prendas (decisión 451) | Dibujar con `prueba` · registrar `prenda` en el módulo de prueba | `prenda` en el módulo de prueba: la acción queda como será | No |
| 11 nov 2026 | 8 | Dónde se revisa «una de las dos listas» de etiquetas (decisión 452) | En el contrato · en la acción | En la acción: la regla entre campos no llega a la validación del contrato | No |
| 11 nov 2026 | 8 | Qué cuenta para «uno por semana» del aviso de códigos (decisión 453) | Solo sin leer · cualquiera de los últimos 7 días | Cualquiera: leerlo no trae otro al día siguiente | No |
| 11 nov 2026 | 8 | Cómo entra `codigos_por_acabarse` al CHECK de avisos (decisión 454) | En la lista del núcleo · en la migración de Catálogo | En la migración de Catálogo, como pide su archivo | No |
| 11 nov 2026 | 8 | Cuándo sale «Ya se pueden recibir en las tiendas» (decisión 455) | Siempre · las pendientes de un producto | Las pendientes de un producto | No |
| 11 nov 2026 | 8 | Cómo cargar la muestra del catálogo con las acciones (decisión 456) | Insertar directo · las acciones con una sesión de carga | Las acciones, como Rosa, en una sesión sin token que se cierra | No |
| 11 nov 2026 | 8 | Productos con escuela marcados en línea en la muestra (decisión 457) | Saltarse la regla · quitarles el canal | Quitarles el canal: manda la regla | No |
| 11 nov 2026 | 8 | Las etiquetas impresas de la muestra (decisión 458) | Todas por imprimir · marcarlas directo | Marcarlas directo hasta la fase 20 | No |
| 11 nov 2026 | 8 | Los eventos de la muestra en la base de pruebas (decisión 459) | Que cada prueba los ignore · procesarlos en la plantilla | Procesarlos en la plantilla, como el worker | No |
| 11 nov 2026 | 8 | Parámetros de dinero que no son de pesos enteros (decisión 460) | Un paso en Configuración · llevarlos a peso al usarlos | Llevarlos a peso al usarlos | No |
| 11 nov 2026 | 8 | Qué copia el alta a partir de otro (decisión 461) | Tallas y canales en el servidor · tallas en el servidor y canales de la pantalla | Tallas en el servidor, canales de la pantalla | No |
| 11 nov 2026 | 8 | El mensaje del tope del precio (decisión 462) | Fijo · armado con el parámetro | Armado con el parámetro | No |
| 11 nov 2026 | 8 | Lo que rechaza el cambio en bloque (decisión 463) | Nada más · repetidos, lista de baja y descontinuados | Repetidos, lista de baja y descontinuados | No |
| 11 nov 2026 | 8 | Candados del alta y de las etiquetas (decisión 464) | La llave foránea · `FOR SHARE` y un orden fijo | `FOR SHARE` y un orden fijo | No |
| 11 nov 2026 | 8 | Qué se revisa del tipo de prenda (decisión 465) | La misma sección · que exista y que la sección lleve receta | Que exista y que la sección lleve receta | No |
| 11 nov 2026 | 9 | El candado de la variante en cada movimiento (decisión 466) | Solo los renglones que existen · la variante y luego los renglones | La variante y luego los renglones | No |
| 11 nov 2026 | 9 | Un movimiento con una clave ya usada (decisión 467) | Fallar · regresar el que estaba | Regresar el que estaba | No |
| 11 nov 2026 | 9 | De dónde sale la clave del movimiento (decisión 468) | Del contexto · del comando de la acción | Del comando de la acción | No |
| 11 nov 2026 | 9 | 30 o 31 tipos de movimiento (decisión 469) | 30 · los 31 de la tabla | Los 31 de la tabla | No |
| 11 nov 2026 | 9 | El origen de `consumible_tomado` antes de su parámetro (decisión 470) | Bodega · Bodega, Taller o Aduana | Bodega, Taller o Aduana | No |
| 11 nov 2026 | 9 | Cómo se suma el material (decisión 471) | En JavaScript · en Postgres | En Postgres | No |
| 11 nov 2026 | 9 | El `actualizado_en` del libro (decisión 472) | Vacío con otro disparador · el del disparador común | El del disparador común | No |
| 10 nov 2026 | 5 | La pantalla del Google de desarrollo | Una propia para escoger cuenta · la de desarrollo de oidc-provider, que pide el correo | La de oidc-provider; `pnpm local` escribe los correos de la muestra al arrancar | No |

