# Pantallas de Administración del sistema

> **Qué cubre:** las pantallas de Administración del sistema (Pendientes, Usuarios y accesos, Dispositivos, Configuración, Bitácora, Respaldos y Pantalla de acceso), la pantalla real de entrada, el cajón Alta de usuario y sus ventanas, cada una con su consulta, sus textos, sus estados y sus botones.
> **Estado:** Decidido.
> **Se construye en:** [fase 19](../../fases/19-web-principal.md).
> **Se conecta con:** [acceso con Google](../../modulos/admin/acceso-con-google.md) · [cuentas](../../modulos/admin/cuentas.md) · [permisos](../../modulos/admin/permisos.md) · [dispositivos](../../modulos/admin/dispositivos.md) · [configuración](../../modulos/admin/configuracion.md) · [bitácora](../../modulos/admin/bitacora.md) · [respaldos](../../modulos/admin/respaldos.md) · [impresión](../../modulos/admin/impresion.md) · [folios](../../modulos/admin/folios.md) · [autorizaciones](../../modulos/direccion/autorizaciones.md) · [personas](../../modulos/personal/personas.md) · [escuelas y secciones](../../modulos/catalogo/escuelas-y-secciones.md) · [mínimos y reabasto](../../modulos/inventario/minimos-y-reabasto.md) · [conteos](../../modulos/inventario/conteos.md) · [libro de movimientos](../../modulos/inventario/libro-de-movimientos.md) · [lo común de las pantallas](../comunes.md) · [el puente de impresión](../../apps/puente-de-impresion.md)

## Para qué sirve

Decidir quién entra al sistema y desde dónde, y cómo se comporta: las cuentas de Google y sus departamentos, los aparatos registrados con su propia llave, las decisiones de operación y los parámetros que fija la dueña, la bitácora de todo lo que pasa y los respaldos. Ejemplo: la oficina pide una cuenta para Gloria Rivas con Calidad; a Carmen, la dueña, le aparece «Alta de usuario · Por confirmar». La revisa, confirma con Google, y Gloria ya puede entrar con su cuenta. Esa misma mañana cambia el día de pago de la nómina a miércoles y queda en la bitácora.

## Quién entra

- Las cuentas con Administración del sistema (la dueña y la oficina). La dueña puede todo; las demás ven lo mismo, pero no cambian accesos, aparatos, decisiones ni parámetros: sus controles salen apagados con «Solo la dueña los cambia».
- Toda acción delicada pide «Confirmar con Google» (ver [lo común](../comunes.md#la-ventana)).
- **Pastilla del menú:** las altas por confirmar (solo a la dueña), los aparatos sin sincronizar y las alertas de seguridad sin revisar; roja si hay una alerta sin revisar.
- **Acción principal:** «Usuarios» (ícono de personas): abre Usuarios y accesos.
- **Pestañas:** Pendientes · Usuarios y accesos · Dispositivos · Configuración · Bitácora · Respaldos · Pantalla de acceso.

## Pendientes

**Consulta:** `admin.pendientes` (`grupo`: `usuarios`, `dispositivos` o `seguridad`).

| Cifra | Qué dice | Su línea | Lleva a |
|---|---|---|---|
| «Usuarios y accesos» | «{n} usuarios» con acceso, sin soporte; ámbar si hay altas por confirmar | «{n} altas por confirmar» (ámbar) o «Acceso con Google» | Usuarios y accesos |
| «Dispositivos» | «{n} registrados», vigentes; rojo si alguno no sincroniza | «Tablet del taller sin sincronizar» o «{n} dispositivos sin sincronizar» (rojo), o «Todos sincronizan» | Dispositivos |
| «Bitácora» | «{n} movimientos hoy» | «{n} alertas» (rojo, hasta 3) y «{n} consultas sensibles» | Bitácora |
| «Respaldos» | «{n} días sin probar»; ámbar desde `admin.restauracion_aviso_dias` | «Respaldo semanal: {fecha}» | Respaldos |

| Tipo | Referencia | Fecha · Tiempo | Estado | Botón |
|---|---|---|---|---|
| «Alta de usuario» (solo a la dueña) | Quien la pidió; abajo lo que pidió («Dar cuenta a Gloria Rivas con Calidad, para revisar lotes en escritorio») | Cuándo se pidió | «Por confirmar» (ámbar) | «Revisar» → el cajón Alta de usuario |
| «Dispositivo» | Su nombre; abajo «{ubicación} · sin sincronizar» | — · «hace {n} h» | «Sin sincronizar» (rojo) | «Ver dispositivo» → Dispositivos, con su renglón marcado |
| «Alerta de seguridad» | Qué pasó («Intentó entrar una cuenta de Google sin acceso: {correo}»); abajo quién, o «—» | «{fecha} · {hora}» | «Por revisar» (rojo) | «Marcar revisada» (la dueña) → `admin.marcar_alerta_revisada` («Alerta revisada») · «Ver bitácora» |
| «Respaldo» | «Prueba de restauración»; abajo «Última prueba hace {n} días» | La de la última prueba | «Por probar» (ámbar) | «Ver respaldos» → Respaldos |

- Un aparato sale aquí cuando lleva `admin.horas_sin_sincronizar_aviso` (4) horas o más sin sincronizar; las alertas, las cinco más recientes sin revisar.
- **Filtros:** «Todos», «Usuarios», «Dispositivos» y «Seguridad» (alertas y respaldo). **Orden:** rojo, ámbar; dentro, por fecha. **Vacío:** «Sin pendientes» (verde).

## Usuarios y accesos

**Consultas:** `admin.usuarios` y, para su ventana, `admin.cuenta_nueva`.

- **Arriba:** «{n} cuentas» y «Cuenta nueva» (la dueña) o «Pedir cuenta nueva» (las demás). Debajo, un aviso por alta pendiente: «{persona} pidió: {lo que pidió}.», con «Revisar» para la dueña.
- **La tabla:** Usuario (iniciales, nombre y correo) · Ubicación («Todas» la dueña; si no, el área de su persona) · Entra con («Google») · Última entrada («hoy 7:58», «ayer 18:20», «Nunca») · Sesiones («{n} abiertas» con «Cerrar», o «Ninguna») · la acción: «Administradora principal» en la dueña; en las demás, «Quitar acceso» (rojo, solo para la dueña).
  - **«Cerrar»** → `admin.cerrar_sesiones` («Sesiones de {nombre} cerradas»). Las de la dueña solo las cierra ella.
  - **El último renglón,** fijo: «Soporte técnico», «Sin dinero ni nómina», «Todo lo que hace queda registrado»; sin botones.
- **«Departamentos de cada quien»:** un renglón por departamento, agrupados como en el menú; una columna por cuenta (sin soporte). Cada casilla es un botón: negro con palomita si la cuenta lo tiene, vacía si no. La columna de la dueña va fija, en gris («La dueña tiene todos los departamentos»); para las demás cuentas, todas apagadas y «Solo la dueña los cambia».
  - Tocar casillas arma un borrador: cada una cambiada con contorno ámbar, y junto al título «{n} cambios sin guardar», «Descartar» y «Guardar cambios» → su ventana. Una cuenta no se queda sin departamentos: «{nombre} se quedaría sin departamentos. Para quitarle todo, usa «Quitar acceso»» (rojo).
  - Abajo: «Cada cambio de accesos queda en la bitácora».

## Dispositivos

**Consultas:** `admin.dispositivos` y, en sus ventanas, `admin.codigo_registro` (`codigo_registro_id`) y `admin.comandos_apartados` (`dispositivo_id`, `incluir_descartados`, `cursor`).

- **«Registrados»,** con «Registrar dispositivo» (la dueña) → su ventana; las demás cuentas ven «Solo la dueña registra y revoca». Columnas: Dispositivo (nombre y «Registrado el {fecha}») · Tipo («Tablet del taller», «Teléfono para escanear», «Programa de impresión») · Ubicación · Última sincronización (punto verde «hace {n} min», rojo pasadas `admin.horas_sin_sincronizar_aviso`; el programa de impresión dice su último contacto) · Llave («k1·a8f2») · versión del programa (y «reloj desfasado» si aplica) · «{n} apartados» (si hay) → su ventana · «Revocar» (rojo, la dueña) → su ventana.
- **«Revocados»,** si hay: Dispositivo (con su llave) · Revocado · Motivo · «{n} llegaron después de revocar», que lleva a la bandeja de excepciones de [Bodega](bodega.md#excepciones), donde la dueña decide si se aplican.
- Abajo: «Cada dispositivo tiene su propia llave: revocar uno no toca a los demás».

## Configuración

**Consultas:** `admin.configuracion` y, en el historial de un valor, `admin.historial_parametro` (`clave`, `ubicacion_id`). Solo la dueña cambia; para las demás cuentas todo sale apagado, con «Solo la dueña puede cambiarlas». Cada valor se guarda al salir de la casilla o al escoger la opción, y su aviso es el texto que queda en la bitácora. Cada renglón tiene «Historial», con sus valores anteriores, desde cuándo y quién.

1. **«Decisiones de operación»:** un renglón por decisión, con su nombre y su línea de explicación a la izquierda y su control a la derecha. Son los parámetros de la sección `decision_operacion` de cada módulo (ver [configuración](../../modulos/admin/configuracion.md#las-tres-secciones)), en su orden, más:
   - **Los mínimos de existencia** de Bodega y de cada tienda, con dos casillas, «Tallas de mayor venta» y «Demás tallas», con los vigentes de `inventario.minimos_vigentes` → `admin.cambiar_minimo` («Mínimo en {ubicación} ({tipo de talla}): {n}»).
   - **Los permisos finos:** «Ven sueldos y tarifas» («Nómina, sueldos y tarifas por pieza») e «Imprimen guías de la paquetería», con una casilla por cuenta y la de la dueña marcada y fija → `admin.cambiar_permiso_fino`, con «Confirmar con Google».
   - «Acceso a cada departamento», con el botón «Usuarios y accesos».
   - Un parámetro → `admin.cambiar_parametro`. Una casilla numérica solo toma dígitos; vacía o en cero, «Escribe un número mayor que cero» y regresa al valor anterior, salvo los que aceptan vacío. Uno «por decidir» lleva su etiqueta ámbar «Por decidir».
2. **«Ubicaciones»,** para leer: Ubicación · Responsable · Qué es (Aduana, Bodega, cada tienda, Taller, Tránsito y En camino a aduana). Debajo: «En línea · Es un apartado de bodega, no un lugar: no se suma al total» y «Clientes externos · Es una salida: lo entregado deja de ser inventario».
3. **«Listas»:** una tarjeta por lista, con sus valores como fichas y su número: las de [configuración](../../modulos/admin/configuracion.md#las-listas-que-hay) (categorías de gasto, tipos de comprobante, cuentas de la fábrica, unidades de material, motivos de ajuste, áreas del taller) y las secciones del catálogo. «Agregar» → su ventana (las demás cuentas ven «Solo la dueña puede agregar»). Nada se quita desde aquí.
4. **«Parámetros»:** los de la sección `parametro`, con su unidad, en el orden de cada módulo, y al final el grupo «Técnicos», plegado. Al cambiar uno: «Parámetro guardado».
5. **«Empresa»:** razón social, nombre comercial, RFC y domicilio, con «Editar» (la dueña) → su ventana · las impresoras de etiquetas (nombre, modelo, ubicación, su programa puente y si está conectado), con «Agregar», «Cambiar» y «Dar de baja» → su ventana · los siguientes folios (PE-, NV-, OC-, G-) y el siguiente código de barras, «fábrica 100001–499999».

## Bitácora

**Consulta:** `admin.bitacora` (`buscar`, `tipo`, `solo_alertas`, `desde`, `hasta`, `cursor`). Solo para leer.

- **Arriba:** el buscador «Persona, departamento o qué pasó» (sin importar acentos ni mayúsculas), las fechas, y los filtros «Todo», «Cambios», «Accesos», «Consultas sensibles» y «Alertas», con su conteo.
- **La tabla,** lo más reciente arriba, con «Ver más»: Cuándo (fecha y hora) · Tipo (punto rojo si es alerta, ámbar si es consulta sensible) · Quién (la persona; un aparato con su persona, «Tablet del taller · Lupita Ramos»; o «Sistema») · Departamento · Qué pasó (y su folio, que abre su documento si la cuenta lo puede ver). Una alerta sin revisar lleva «Marcar revisada» (la dueña).
- **Sin el permiso de sueldos,** lo que lleva montos de sueldos o tarifas sale recortado (ver [bitácora](../../modulos/admin/bitacora.md)).
- **Sin resultados:** «Nada con «{texto}»». Abajo: «La bitácora solo crece: nadie la edita ni la borra, tampoco la dueña».

## Respaldos

**Consulta:** `admin.respaldos`.

1. **«Recuperación a un punto en el tiempo»:** «Activa» (verde) y «Cualquier minuto de los últimos {n} días, en la base del proveedor», o «Sin dato del proveedor».
2. **«Respaldo semanal fuera del proveedor»:** «{fecha} · {hora}» (verde, o rojo si falló), «Cifrado · {tamaño} · si el proveedor desaparece, el negocio no».
3. **«Última restauración probada»:** «{fecha} · hace {n} días» (verde, o ámbar desde `admin.restauracion_aviso_dias`), «Se prueba cada {n} días en el ambiente de pruebas · la siguiente toca a más tardar el {fecha}» (`admin.restauracion_cada_dias`) y «Registrar restauración probada» (la dueña) → su ventana.
- **«Pruebas»:** el historial, con su fecha, qué se restauró, si cuadró y su evidencia.
- Abajo: «Un respaldo que nunca se restauró no es un respaldo».

## Pantalla de acceso

**Consulta:** `admin.pantalla_acceso`. Es la entrada al sistema, antes del armazón; la pestaña la muestra igual, para ver cómo la ve la gente.

- **La entrada:** la marca, «Entrar con Google» → `admin.entrar_con_google`, y abajo «El taller entra con su PIN en la tablet registrada, sin cuenta de Google».
- **Al volver de Google:** con acceso, entra a la primera pestaña de su primer departamento, con el saludo «Hola, {nombre de pila}» y «{puesto} · {n} departamentos. La sesión se cierra sola tras {n} min sin actividad.» (`admin.sesion_inactividad_min`). Sin acceso: candado, «Esta cuenta no tiene acceso», «{correo} no está dada de alta. Solo la dueña da acceso al sistema.» y «Usar otra cuenta»; el intento queda en la bitácora como alerta.
- **La pestaña** agrega abajo «Cuentas con acceso»: iniciales, nombre y correo de cada una.

## Cajones

### Alta de usuario

**Consulta:** `admin.alta_usuario` (`autorizacion_id`). Solo la dueña. Se abre con «Revisar».

- **Encabezado:** «{AU} · Pidió {persona}» y «Alta de usuario».
- **Datos:** Persona · Correo · Departamentos · Ubicación · Para qué.
- **El recuadro:** «Se liga a {E-} · {persona}, {puesto}.» y el aviso «Entra con su cuenta de Google {correo}. Ninguna otra cuenta puede entrar en su lugar.»
- **Botones:** «Cerrar» · «Rechazar» (rojo) → su ventana · «Dar de alta» → «Confirmar con Google» → `direccion.decidir_autorizacion` (`autorizar`, desde Administración): «{persona} dada de alta: ya puede entrar con su cuenta de Google». Abre Usuarios y accesos con su renglón resaltado.

## Ventanas

- **«Cuenta nueva»** (la dueña) o **«Pedir cuenta nueva»** («La cuenta la da la dueña: la solicitud llega a Dirección»): Persona (las activas de Personal sin cuenta, que no son de tienda, «{E-} · {nombre} · {puesto}») · «Correo de Google» · Departamentos (todos menos la Puerta del taller, que entra con PIN) · «Para qué» (opcional, al pedir). «Dar de alta» → «Confirmar con Google» → `admin.crear_cuenta` («{persona} dada de alta: ya puede entrar con su cuenta de Google» y, si tenía PIN, «Su PIN del taller ya no entra»); «Mandar solicitud» → `admin.pedir_cuenta` («Solicitud de cuenta para {persona} enviada a Dirección»).
- **«Rechazar alta»:** el motivo. «Rechazar» → `direccion.decidir_autorizacion` (`rechazar`) («Alta rechazada»).
- **«Cambiar departamentos»:** «Los menús de cada quien cambian en cuanto confirmes.» y por cuenta «{nombre} recibe {…}», «deja {…}» o los dos. «Confirmar con Google» → `admin.cambiar_departamentos` («Departamentos guardados. Los menús ya cambiaron»).
- **«Quitar acceso a {nombre}»:** «Su cuenta de Google deja de entrar y sus sesiones se cierran. Lo que hizo se conserva en la bitácora.» y el motivo (opcional). «Confirmar con Google» (rojo) → `admin.quitar_acceso` («{nombre} ya no entra al sistema»).
- **«Registrar dispositivo»:** «Nombre» (hasta 30), «Dónde se usa» (el Taller: tablet del taller; Aduana o Bodega: teléfono para escanear) y la casilla «Programa de impresión». «Dar código» → «Confirmar con Google» → `admin.generar_codigo_registro`: «Escribe este código en la pantalla de registro del dispositivo nuevo. Vence en {n} minutos.» y el código en grande («K7Q-422»), que no se vuelve a mostrar. Espera el aviso del registro (o lo pregunta con `admin.codigo_registro`): «{nombre} registrado con su propia llave», y el renglón entra resaltado. «Volver» → `admin.cancelar_codigo_registro`.
- **«Revocar {dispositivo}»:** «Deja de entrar en cuanto confirmes.»; si tiene movimientos sin subir, «Tiene {n} movimientos sin subir. Lo que llegue después entra a la bandeja de excepciones de Bodega.»; «Motivo» (de 5 a 60); en la tablet, «¿Se perdió o la pudo usar alguien más?», que anula los PIN del taller. «Confirmar con Google» → `admin.revocar_dispositivo` («{nombre} revocado: ya no entra», y «Los PIN del taller ya no entran: Personal tiene que dar nuevos» si se anularon).
- **«Apartados de {dispositivo}»:** lo que subió el aparato y no se pudo aplicar: cuándo pasó, qué acción, por qué se apartó, la persona y sus reintentos, con «Reintentar» → `admin.reintentar_comando_apartado` y «Descartar» (la dueña, con motivo) → `admin.descartar_comando_apartado`. «Mostrar descartados».
- **«{lista} · Agregar»:** «Nombre» (de 3 a 40; en «Unidades de material», de 1 a 20, con «Se cuenta entera»). «Agregar» → `admin.agregar_a_lista` («{nombre}» agregada a {lista}); en las secciones del catálogo, además «Lleva receta» y el tipo de prenda que propone, → `catalogo.agregar_seccion` («{sección} ya está en Catálogo. Sale en Productos y en el alta»).
- **«Datos de la empresa»:** razón social, nombre comercial, RFC y domicilio. «Guardar» → `admin.editar_empresa` («Datos de la empresa guardados»).
- **«Impresora de etiquetas»:** nombre, modelo, ubicación y su programa puente; o «Dar de baja», con motivo. «Guardar» → `admin.guardar_impresora` («{nombre} guardada» o «{nombre} dada de baja»).
- **«Registrar restauración probada»:** qué se restauró (el respaldo semanal, de los últimos correctos, o un punto en el tiempo), cuándo se probó, si los conteos cuadraron (y los conteos por tabla, opcionales), la evidencia (un archivo, obligatorio) y una nota. «Registrar» → `admin.registrar_restauracion` («Restauración registrada. La siguiente toca el {fecha}», o «La prueba no cuadró: el respaldo sigue por probar.»).

Los mensajes de error de cada acción están en su archivo del módulo.

## Lo que no se copia de la muestra

- Todo lo delicado pasa de verdad por «Confirmar con Google»; nada aplica directo.
- El cambiador de cuenta y la simulación de la pantalla de acceso no se construyen: cada quien entra con su Google.
- Una alerta de seguridad se marca revisada; un aparato sin sincronizar lleva a su renglón.
- Registrar un aparato da un código que vence y espera a que el aparato lo canjee; revocar la tablet puede anular los PIN.
- Los aparatos apartados, la versión del programa y el reloj desfasado son pantallas nuevas.
- Configuración muestra todos los parámetros de cada módulo, con su historial; los datos de la empresa y las impresoras se pueden editar.
- La restauración probada pide su evidencia.
- La computadora de tienda llega con el POS; la credencial y los usuarios del panel de uniformame.mx, con uniformame.mx.

## Cómo está hecho

**Fase 19, parte 15.**

- **Las consultas** están en `apps/api/src/modulos/admin/consultas/`, con sus contratos en `packages/compartido/src/contratos/admin/consultas-*.ts` (y `vistas.ts`, las piezas que comparten), y todas piden Administración del sistema:
  - `pendientes.ts`: `admin.pendientes` y la pastilla del menú (`pastillaAdmin`, en `pastillas` del `index.ts`). Los aparatos sin sincronizar salen de la lectura `admin.aparatos_sin_sincronizar` (la misma regla del trabajo que avisa); las alertas sin revisar son las que no tienen un renglón de `admin.marcar_alerta_revisada` que apunte a ellas; los días sin probar cuentan desde la última restauración que cuadró o, sin ninguna, desde el primer respaldo. Las altas por confirmar solo le llegan a la dueña; a ella su alerta le dice «Marcar revisada», y a las demás cuentas, «Ver bitácora».
  - `usuarios.ts`: `admin.usuarios`, `admin.cuenta_nueva`, `admin.alta_usuario` (solo la dueña) y `admin.pantalla_acceso`. La dueña lleva todos los departamentos sin renglones; soporte va aparte, en su renglón fijo. El saludo de la pantalla de acceso toma el nombre, el puesto y los departamentos de `admin.armazon`; la consulta solo da `admin.sesion_inactividad_min`.
  - `dispositivos.ts`: `admin.dispositivos` (sin la credencial de uniformame.mx; de la llave solo su parte pública, «pr·ueba21»; el reloj desfasado contra `sync.minutos_reloj_desfasado`; el puente dice su último contacto contra `admin.minutos_puente_sin_contacto`), `admin.codigo_registro` (solo la dueña; «vencido» se calcula) y `admin.comandos_apartados` (por páginas).
  - `configuracion.ts`: `admin.configuracion` (los parámetros en el orden del registro de módulos y luego el suyo; el de pesos en `valor_centavos`, que el recorte le quita a soporte; las secciones del catálogo como una lista más, que solo la dueña agrega; si la impresora está conectada lo dice `puenteConectado`, con `contexto.comoAccion`; los folios, de `admin.siguiente_folio`) y `admin.historial_parametro` (con `valorParaLeer` de `admin.cambiar_parametro`).
  - `bitacora.ts`: `admin.bitacora`, por páginas. Busca con `sin_acentos` sobre quién, el departamento y lo que pasó; sin «ven sueldos y tarifas» busca y da la descripción recortada. Los conteos van con lo buscado y las fechas.
  - `respaldos.ts`: `admin.respaldos`. La recuperación del proveedor va «Sin dato del proveedor»: el sistema todavía no lee su estado.
  - `comun.ts` junta las horas en México, la última entrada, quién hizo algo en la bitácora, cuándo una alerta sigue sin revisar y las altas por confirmar; `de-prueba.ts`, lo que siembran las pruebas.
  - `inventario.minimos_vigentes` (`modulos/inventario/consultas/minimos-vigentes.ts`, contrato en `contratos/inventario/minimos-vigentes.ts`) usa la lectura del mismo nombre y solo junta los dos niveles por ubicación.
- **Las pantallas** están en `apps/web/src/rutas/admin/` (una ruta por pestaña; Dispositivos es `/admin/dispositivos`) y `apps/web/src/departamentos/admin/`: `direccion.ts` (el filtro, el cajón `?cajon=alta_usuario&id=…`, `?resaltar=` y la búsqueda de la bitácora), `pagina.tsx` (la acción principal «Usuarios»), `envio.ts`, `pestanas/`, `cajones/alta-usuario.tsx` y `ventanas/`. Cada casilla de Configuración se guarda al salir o al escoger, con su versión; si la acción no la acepta, avisa su mensaje y regresa al valor anterior: la pantalla no revisa ningún valor. El borrador de «Departamentos de cada quien» solo dice qué casillas se tocaron, pregunta antes de salir, y si una cuenta se queda sin departamentos lo dice la acción. «Registrar dispositivo» pregunta a `admin.codigo_registro` cada 3 segundos hasta que el aparato canjea su código.
- **Las pruebas:** `consultas/pendientes.prueba.ts`, `usuarios.prueba.ts`, `dispositivos.prueba.ts`, `configuracion.prueba.ts`, `bitacora.prueba.ts` y `respaldos.prueba.ts`, e `inventario/consultas/minimos-vigentes.prueba.ts` (el departamento, lo que solo es de la dueña, el recorte de sueldos y el de soporte); y `apps/web/src/departamentos/admin/admin.prueba.ts`, en el navegador, con las capturas en `.revision/capturas/admin/`.
- **La evidencia de «Registrar restauración probada»** (`ventanas/registrar-restauracion.tsx`) se escoge con `CampoDeArchivo` y se sube al registrar, una sola vez por archivo escogido, con `useSubidaAlMandar` de lo común (propósito `evidencia_restauracion`); la acción recibe su `evidencia_archivo_id`. Que sea obligatoria lo dice la acción, en su campo («Sube la evidencia de la prueba.»); si la subida falla, el aviso dice por qué y lo capturado se queda. En «Pruebas», la evidencia enlaza a `/v1/archivos/{id}`, que abre `admin.ve_documento`. Lo prueba el último caso de `admin.prueba.ts`, con el almacén de prueba.
- **Al revisar el diseño:** la pestaña Pendientes cuenta todos sus renglones (`conTodoLoPendiente`, con `admin.pendientes` en `pagina.tsx`); los filtros de Pendientes solo salen con renglones, y el escogido; el último contacto de un aparato nunca dice «hace 0 min» (`haceCuanto`, desde 1 min) (decisión 803). Quedan para la fase 20: el departamento de la Bitácora en los cambios de Configuración y de aparatos, el botón «Entrar con Google» blanco con su logo y Configuración en renglones compactos.
- **Lo que falta de lo común:** los conteos por tabla de la ventana «Registrar restauración probada», el renglón resaltado de una tabla y el contorno ámbar de una casilla cambiada, y el enlace del folio de la bitácora a su documento.
- **Lo que corrigió la auditoría (cierre de la fase 19):** cada consulta dice qué botones lleva quien ve, en lugar de que la pantalla lo decida con `es_duena`: `admin.usuarios` manda `puede` (`crear_cuenta`, `revisar_altas`, `quitar_acceso` y `cambiar_departamentos`), `admin.cuenta_nueva` `puede_crear_cuenta`, `admin.dispositivos` `puede` (`registrar` y `revocar`), `admin.comandos_apartados` `puede_descartar` y `admin.respaldos` `puede_registrar_restauracion`. La Bitácora y la ventana de apartados pintan sus estados con `SegunPaginas` de lo común. Lo prueban `usuarios.prueba.ts`, `dispositivos.prueba.ts` y `respaldos.prueba.ts` (la dueña y una cuenta de Administración). Quedan para lo común: la ida a Google de la pantalla de acceso (`comun/confirmar-con-google.ts` solo arma la de confirmar), y `admin.configuracion` y `admin.bitacora` siguen mandando `es_duena`.
