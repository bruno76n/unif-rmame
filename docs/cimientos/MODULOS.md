# Módulos

> **Qué cubre:** cómo se escribe un módulo de la API: dueño de sus tablas, una acción es una transacción, el orden en que el núcleo corre cada acción, las acciones internas, las lecturas y las consultas, los eventos, la bitácora y los puntos de extensión entre módulos.
> **Estado:** Decidido.
> **Se construye en:** [fase 3 ●](../fases/03-api-protocolo-e-idempotencia.md).
> **Se conecta con:** [API](API.md) · [estructura](ESTRUCTURA.md) · [base de datos](BASE-DE-DATOS.md) · [idempotencia y concurrencia](IDEMPOTENCIA-Y-CONCURRENCIA.md) · [eventos y trabajos](EVENTOS-Y-TRABAJOS.md) · [autorizaciones](../modulos/direccion/autorizaciones.md) · [bitácora](../modulos/admin/bitacora.md) · [archivos](../modulos/admin/archivos.md) · [folios](../modulos/admin/folios.md) · [reservas](../modulos/inventario/reservas.md) · [alertas e indicadores](../modulos/direccion/alertas-e-indicadores.md)

## Los módulos

Un módulo por área del negocio. Cada tabla tiene un solo módulo dueño, que es el único que la escribe.

| Módulo | Qué es suyo |
|---|---|
| `admin` | Cuentas, sesiones, dispositivos, permisos, bitácora, parámetros, listas, folios, archivos, avisos, eventos, impresión, empresa y respaldos |
| `personal` | Personas, PIN del taller, asistencia y tarifas por operación |
| `direccion` | Autorizaciones (AU-). Sus alertas son consultas |
| `catalogo` | Escuelas, secciones, tipos de prenda, tallas, productos, variantes, listas de precios y precios |
| `patronaje` | Recetas con sus versiones y medidas, y desarrollos (DS-) |
| `compras` | Materiales, proveedores, precios de compra y órdenes de compra (OC-) |
| `ventas` | Clientes externos, pedidos (PE-) con sus versiones, notas de entrega (NV-) y notas de crédito (NC-) |
| `produccion` | Órdenes de producción (OP-), lotes, cortes, bultos, operaciones, flujos, registros de la tablet y cambios de pedido |
| `calidad` | Revisiones, rechazos, reprocesos, defectos y reclamos (RC-) |
| `mantenimiento` | Máquinas, fallas (FM-), servicios (SM-) y técnicos |
| `inventario` | Ubicaciones, el libro de movimientos, existencias, reservas, traspasos, recepciones, despachos, rollos, partidas, retazos, entregas a corte, conteos, ajustes, diferencias, mínimos, reabasto y excepciones |
| `contaduria` | Terceros, crédito de clientes, cuentas por cobrar y por pagar, facturas de proveedor, pagos, anticipos, saldo a favor, deudas, gastos, la confirmación del depósito de los cortes de caja (con el POS), el paquete del contador y la nómina |
| `linea` | Los pedidos en línea (W-) y lo que la fábrica usa de uniformame.mx. Se completa cuando se construya uniformame.mx |

El módulo `tiendas` (lo que suben las cajas: sus ventas, turnos y cortes de caja) llega con el POS. Qué tablas exactas tiene cada uno lo dice el archivo de cada tema en `docs/modulos/`.

## Las reglas

1. **Un módulo solo escribe sus tablas.** Si necesita que otro haga algo, llama a la acción interna de ese otro, en la misma transacción.
2. **Una regla vive en un solo módulo.** Si otro módulo necesita saber qué está libre o qué se puede surtir, usa la lectura del dueño; nunca copia la regla.
3. **Una consulta puede leer tablas de otros módulos** para armar su pantalla (con su recorte), pero nunca las escribe.
4. **Ningún dato del negocio en la lógica:** cada valor sale de un parámetro del módulo (ver [configuración](../modulos/admin/configuracion.md)).
5. **El módulo se registra solo,** con su `index.ts` (ver [estructura](ESTRUCTURA.md#un-módulo-por-dentro)).

## Cómo corre una acción

El núcleo corre cada acción pública siempre en este orden. La acción solo escribe su paso 7.

1. **Quién llama:** la sesión o la llave del aparato (ver [acceso y permisos](ACCESO-Y-PERMISOS.md)).
2. **La versión de la app:** si es vieja, `426`.
3. **La forma:** los datos contra su contrato; si no cumplen, `400` con sus campos.
4. **El permiso:** el que dice el contrato (departamento, permiso fino, `solo_duena`, «Confirmar con Google»). Si falta, `403` o `401`.
5. **Abre la transacción.**
6. **Aparta la clave de idempotencia:** si ya estaba, contesta lo mismo que la primera vez (ver [idempotencia](IDEMPOTENCIA-Y-CONCURRENCIA.md)).
7. **La acción hace lo suyo:** revisa sus reglas, escribe sus tablas, llama a las internas de otros módulos, guarda sus eventos y arma su renglón de bitácora y su respuesta.
8. **El renglón de bitácora:** uno por acción, con `admin.escribir_bitacora`; varios, o ninguno, solo cuando el archivo de la acción lo dice (ver abajo).
9. **La respuesta** se guarda en `comandos_recibidos`.
10. **Confirma la transacción** y responde.

Si algo falla en los pasos 5 a 10, no queda nada: ni la clave, ni la bitácora, ni los eventos. Una regla que no se cumple se lanza como error de regla, con su `codigo` y su `mensaje`, y sale como `422`.

**Lo que recibe la acción** (su contexto): la transacción, quién llama, «ahora» (una sola hora para toda la acción), el día de negocio, la lectura de parámetros, las internas y lecturas de los demás módulos, y las funciones para guardar eventos y armar la bitácora.

## Acciones internas

Las que un módulo ofrece a los demás: `inventario.reservar`, `direccion.pedir_autorizacion`, `admin.tomar_folio`.

- Corren **dentro de la transacción** de quien las llama: no abren otra, no apartan clave y no revisan permisos (eso ya lo hizo la acción pública).
- **Sí revisan sus propias reglas** y pueden lanzar su error de regla.
- **No escriben bitácora propia:** lo que cambiaron va en el renglón de la acción que las llamó.
- Pueden guardar sus propios eventos.
- Cada archivo de creación dice quién llama a cada interna, y cada acción dice qué internas llama.

## Lecturas y consultas

- **Una lectura** es una función que un módulo ofrece a otros para leer algo suyo con su regla: `inventario.libres`, `admin.parametro`. No escribe. Si la llama una acción, corre en su transacción.
- **Una consulta** es lo que lee una pantalla: una por pantalla, pestaña o cajón, con lo que esa pantalla necesita y nada más, ya recortada según la cuenta (ver [API](API.md#el-recorte-según-la-cuenta)).

## Eventos

- Cada acción guarda sus eventos de dominio con `admin.guardar_evento`, en su transacción: `pedido.confirmado`, `traspaso.recibido`. El nombre es `{entidad}.{hecho}`, con el hecho en pasado.
- Un evento lleva ids y claves para armar avisos, y la lista de tablas que cambiaron. **Nunca montos, sueldos ni secretos.**
- Después de confirmar, el worker los reparte: avisos en vivo a las pantallas y aparatos, avisos a personas y trabajos que corren fuera de la transacción. Nadie depende del orden entre eventos de transacciones distintas. Ver [eventos y trabajos](EVENTOS-Y-TRABAJOS.md).

## Bitácora

- **Un renglón por acción,** con el texto que dice el archivo de la acción (el de la muestra): «Cambió el parámetro «Lote atorado»: 2 → 3».
- **Uno por documento o por cambio solo cuando el archivo de la acción lo dice:** una acción que cambia varios documentos a la vez (varios productos, varias cuentas), o varias cosas que la bitácora de su departamento muestra por separado (cada precio de una ficha). Todos llevan el mismo `comando_id`.
- **Ninguno solo al guardar un borrador** (de un pedido o de una orden de compra): todavía no es un documento. Lo dice el archivo de la acción.
- `antes` y `despues` llevan solo lo que cambió.
- Lo que trae sueldos o tarifas se marca para que se recorte a quien no tiene el permiso.
- **Nunca** van a la bitácora PIN, llaves, secretos, códigos en claro ni hashes.

El detalle está en [bitácora](../modulos/admin/bitacora.md).

## Puntos de extensión

Las formas fijas en que los módulos se hablan, para que nadie invente otra:

| Para qué | Cómo | Dónde se describe |
|---|---|---|
| Pedir una autorización a Dirección | `direccion.pedir_autorizacion`; cuando Dirección decide, llama a la interna del dueño `{modulo}.aplicar_decision_{tipo}`, en la misma transacción | [autorizaciones](../modulos/direccion/autorizaciones.md) |
| Algo que llegó y no cuadra | `inventario.registrar_excepcion`; se resuelve con `inventario.marcar_excepcion_resuelta` | [excepciones](../modulos/inventario/excepciones.md) |
| Dar un folio | `admin.tomar_folio`, dentro de la transacción del documento | [folios](../modulos/admin/folios.md) |
| Usar un archivo subido | `admin.ligar_archivo` | [archivos](../modulos/admin/archivos.md) |
| Avisar a una persona | `admin.crear_aviso`, o un tipo de aviso ligado a un evento | [avisos](../modulos/admin/avisos.md) |
| Imprimir etiquetas | `admin.mandar_a_imprimir` | [impresión](../modulos/admin/impresion.md) |
| Algo que corre después de la acción o a una hora | Un trabajo del worker | [eventos y trabajos](EVENTOS-Y-TRABAJOS.md) |

**Una llamada a un módulo de una fase posterior** la agrega la fase de ese módulo, en el archivo que llama, y lo anuncia el «Lo que llega después» de ese archivo. Ejemplo: Inventario (fase 9) avisa a Tienda en línea cuando una prenda de un W- va de camino, pero esa llamada la agrega la fase 18.

## Cómo está hecho

**Fase 3.**

- **Un módulo** exporta en su `index.ts` `definirModulo({ nombre, acciones, consultas, internas, lecturas, semillas })` (`apps/api/src/nucleo/modulos.ts`). Una acción se une a su contrato con `implementarAccion(contrato, ejecutar)` y una consulta con `implementarConsulta(contrato, leer)`: los datos y el resultado tienen el tipo del contrato. Las internas y las lecturas van por nombre corto (`contar` se registra como `prueba.contar`).
- **El registro:** `cargarModulos(carpeta)` importa el `index.ts` de cada carpeta y `registrarModulos` junta todo por nombre completo; falla si un `index.ts` no exporta el módulo de su carpeta, si un nombre no empieza con el de su módulo o si se repite. El módulo `admin` ya existe, con `comandos_recibidos`.
- **El corredor** (`apps/api/src/nucleo/acciones/corredor.ts`, `correrAccion`): pasos 5 a 10 dentro de `enTransaccion` (que repite la transacción completa ante `40P01` o `40001`): aparta la clave, corre la acción, revisa que una acción que edita haya tomado su versión, revisa su resultado contra el contrato (un campo de más deshace todo), pide `escribirBitacora` y `guardarEventos` una sola vez con lo que juntó la acción, guarda la respuesta sin secretos y confirma. Los pasos 1 a 4 los hace el servidor (ver [API](API.md#cómo-está-hecho)). Los servicios de bitácora y eventos son de `admin` desde la fase 4; aquí los recibe el servidor.
- **El contexto** de la acción (`ContextoDeAccion`): `transaccion`, `quien`, `ahora` (una sola hora), `diaDeNegocio`, `comandoId`, `interna(nombre, datos)` y `lectura(nombre, datos)` (corren en la misma transacción, con el mismo contexto), `guardarEvento` y `bitacora`. La lectura de parámetros se suma en la fase 4. Que la acción tomó su versión no lo dice el contexto: lo sabe `pisadas.ts` (`tomoSuVersion`), así que una acción no se lo puede marcar sola.
- **Las pisadas** (`apps/api/src/nucleo/acciones/pisadas.ts`): `tomarVersion(contexto, tabla, id, versionLeida, leerVisible)` primero bloquea el renglón (`SELECT version … FOR UPDATE`), así que la versión y lo que se lee son del mismo momento; luego pide a la acción lo que la cuenta ve del registro (ya recortado; `undefined` si no lo puede ver, y entonces `404`, como si no existiera); si la versión no es la que se leyó, lanza `409` con la versión actual y lo que la cuenta ve, y si es, la sube con `nextval(…)` aunque a la tabla le faltara su disparador. Recuerda que la acción tomó su versión: el corredor no guarda una acción con `edita` que no la tomó (decisión 343); `versionActual` da la versión para `resultado.version`. En un agregado se toma la del encabezado.
- **Las pruebas:** `nucleo/acciones/atomica.prueba.ts` (una acción que falla antes de escribir, después de su interna o en la bitácora no deja nada), `nucleo/acciones/pisadas.prueba.ts` y `nucleo/modulos.prueba.ts` (un módulo nuevo en su carpeta se registra solo; uno mal nombrado se rechaza).
