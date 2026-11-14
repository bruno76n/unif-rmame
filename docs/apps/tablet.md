# La tablet del taller

> **Qué cubre:** la app de la Puerta del taller: una web instalable en el Chrome de una tablet Android, cómo se registra con su código, su copia local y su cola sin internet (Dexie), cómo sube y baja, el PIN que revisa ella misma con su bloqueo, el lector de etiquetas con la cámara y cómo se actualiza.
> **Estado:** Decidido.
> **Se construye en:** [fase 20](../fases/20-tablet-puente-de-impresion-e-impresos.md).
> **Se conecta con:** [pantallas de la tablet](../interfaz/tablet.md) · [sincronización](../cimientos/SINCRONIZACION.md) · [dispositivos](../modulos/admin/dispositivos.md) · [PIN del taller](../modulos/personal/pin-del-taller.md) · [personas](../modulos/personal/personas.md) · [tarifas](../modulos/personal/tarifas.md) · [registros de operación](../modulos/produccion/registros-de-operacion.md) · [lotes](../modulos/produccion/lotes.md) · [corte y bultos](../modulos/produccion/corte-y-bultos.md) · [operaciones y flujos](../modulos/produccion/operaciones-y-flujos.md) · [máquinas, fallas y servicios](../modulos/mantenimiento/maquinas-fallas-y-servicios.md) · [materiales](../modulos/compras/materiales.md) · [productos](../modulos/catalogo/productos.md) · [paquete compartido](../cimientos/PAQUETE-COMPARTIDO.md) · [arquitectura](../cimientos/ARQUITECTURA.md) · [API](../cimientos/API.md) · [eventos y trabajos](../cimientos/EVENTOS-Y-TRABAJOS.md) · [etiquetas](../impresos/etiquetas.md) · [infraestructura](../cimientos/INFRAESTRUCTURA.md) · [fase 20](../fases/20-tablet-puente-de-impresion-e-impresos.md)

## Para qué sirve

La gente del taller registra lo que hace aunque se caiga el internet, y nada se pierde ni se duplica. Ejemplo: a las 11 se va el wifi. Lupita entra con su PIN (la tablet lo revisa sola), escanea el B-2026-121-03 con la cámara y registra 24 «Costados»; la tablet le baja el tope a ese bulto, le suma a «Hoy llevas» y marca el registro «guardada aquí». A la una regresa la red: la tablet sube sus tres registros en una tanda, el servidor los aplica con la hora en que pasaron y Producción ve el lote avanzar.

## Reglas

1. **Una web instalable,** no una app de tienda: se instala desde Chrome en una tablet Android con servicios de Google (decisión 161), abre a pantalla completa y en horizontal, y trabaja sin red con su service worker (el suyo, decisión 813) y su copia local en IndexedDB (Dexie). Vive en `apps/tablet/`.
2. **Una tablet registrada por taller.** Sin registro solo muestra su pantalla de registro.
3. **Todo lo que hace la persona pasa primero por la cola local,** con su clave de idempotencia y su hora, y de ahí sube. La pantalla nunca espera al servidor para seguir.
4. **La tablet calcula como el servidor:** el tope de cada bulto, la salud de cada lote, la semana y «Bultos para ti» salen de las mismas funciones del [paquete compartido](../cimientos/PAQUETE-COMPARTIDO.md) que usa la API, sobre su copia local.
5. **Nunca guarda ni enseña** precios, costos ni sueldos. Las tarifas, solo si `produccion.tarifa_visible_tablet` lo dice; entonces bajan solas (ver [tarifas](../modulos/personal/tarifas.md#lo-que-baja-a-la-tablet)).
6. **Lo apartado no se reintenta a ciegas:** queda marcado en la tablet, Administración del sistema lo ve en Dispositivos y la cola sigue.
7. **Los textos de cada pantalla** están en [pantallas de la tablet](../interfaz/tablet.md); este archivo dice cómo funciona por dentro.

## El registro

1. La tablet nueva abre «Registrar esta tablet» y pide el código de 6 caracteres que dio la dueña (ver [dispositivos](../modulos/admin/dispositivos.md)).
2. Hace su secreto (32 bytes con `crypto.getRandomValues`, en base64url) y llama a `admin.canjear_codigo` con el código, su tipo (`tablet_taller`), el secreto, el aparato («Android 14 · Samsung») y su versión. Si el código no sirve, muestra el mensaje que regresa la acción.
3. Guarda su `llave_id`, su secreto, su folio DV- y su ubicación, y pide su foto completa.
4. Desde ahí cada llamada lleva `Authorization: Llave {llave_id}.{secreto}`, `X-App-Version` y `X-Pendientes` (ver [API](../cimientos/API.md#quién-llama)).
5. **El secreto y los hashes de los PIN** se guardan cifrados con Web Crypto: AES-GCM con una llave que no se puede exportar, guardada en IndexedDB. El navegador no deja sacar esa llave, así que quien copie la base de la tablet no tiene el secreto en claro.
6. **Cambiar la llave:** cuando la bajada responde `rotar_llave`, la tablet hace un secreto nuevo y llama a `admin.rotar_llave`. Si no supo si se aplicó, prueba primero la nueva y luego la vieja, dentro de la gracia.
7. **Revocada:** con `revocado` al subir, el aviso en vivo `dispositivo_revocado` o un `401 llave_revocada`, deja de bajar, muestra la pantalla de revocada y sigue subiendo su cola hasta vaciarla. Después solo enseña esa pantalla (ver [sincronización](../cimientos/SINCRONIZACION.md#el-aparato-revocado)).

## La copia local

Cada módulo dice en «Lo que baja a la tablet» qué tablas suyas bajan, con su filtro y sus columnas. La tablet las guarda tal cual en Dexie:

| Tabla local | Su dueño | Para qué |
|---|---|---|
| `productos` · `variantes` · `tallas` | [productos](../modulos/catalogo/productos.md#lo-que-baja-a-la-tablet) · [variantes](../modulos/catalogo/variantes-codigos-y-etiquetas.md#lo-que-baja-a-la-tablet) · [tallas](../modulos/catalogo/tallas-y-tipos-de-prenda.md#lo-que-baja-a-la-tablet) | «{prenda} · talla {t}» de cada bulto |
| `lotes` · `lote_tallas` | [lotes](../modulos/produccion/lotes.md#lo-que-baja-a-la-tablet) | Para quién, entrega, salud y tallas |
| `bultos` | [corte y bultos](../modulos/produccion/corte-y-bultos.md#lo-que-baja-a-la-tablet) | Escanear y abrir el bulto |
| `flujos` · `flujo_operaciones` · `operaciones` | [operaciones y flujos](../modulos/produccion/operaciones-y-flujos.md#lo-que-baja-a-la-tablet) | Qué operación sigue y quién la hace de base |
| `registros_operacion` | [registros de operación](../modulos/produccion/registros-de-operacion.md#lo-que-baja-a-la-tablet) | El tope, «Hoy llevas», la semana y los últimos |
| `personas` · `pines` | [personas](../modulos/personal/personas.md#lo-que-baja-a-la-tablet) · [PIN del taller](../modulos/personal/pin-del-taller.md#lo-que-baja-a-la-tablet) | «¿Quién eres?» y revisar el PIN |
| `tarifas_operacion` | [tarifas](../modulos/personal/tarifas.md#lo-que-baja-a-la-tablet) | La tarifa, solo si la dueña decidió mostrarla |
| `maquinas` · `fallas` · `motivos_falla` | [máquinas, fallas y servicios](../modulos/mantenimiento/maquinas-fallas-y-servicios.md#lo-que-baja-a-la-tablet) | «¿Qué máquina?», sus fallas abiertas y «¿Qué le pasa?» |
| `materiales` | [materiales](../modulos/compras/materiales.md#lo-que-baja-a-la-tablet) | Los consumibles de «¿Qué tomas?», con su unidad de la tablet |
| `parametros` | [configuración](../modulos/admin/configuracion.md) | Los que dicen que bajan a la tablet |
| `dispositivo` | [dispositivos](../modulos/admin/dispositivos.md) | Su propio renglón |
| `cola` | La tablet | Lo que falta subir, en el orden en que pasó |
| `sincronizacion` | La tablet | El cursor, la última tanda, la última bajada completa y los apartados |

Lo que nace en la tablet (un registro, una falla, un consumible tomado, un bloqueo de PIN) se escribe en su tabla local y en la cola en la misma transacción de Dexie, marcado «guardada aquí» hasta que el servidor lo contesta.

## Cómo sube

1. Con red, manda su cola en tandas de hasta `sync.tanda_max_comandos`, en el orden en que pasó, y no manda la siguiente hasta tener la respuesta (ver [sincronización](../cimientos/SINCRONIZACION.md#subir--post-v1syncsubir)). Cada comando lleva su clave, su acción, sus datos, su `ocurrido_en` y la persona que estaba adentro.
2. Por cada respuesta: `aplicado`, `repetido` o `excepcion` → sale de la cola y su renglón local deja de estar «guardada aquí»; `apartado` → sale de la cola y su renglón queda marcado como apartado. Con `detenido`, vuelve a mandar desde el primero sin respuesta.
3. Sin red, con un `503` o con un error de la red, se queda con su cola y lo intenta otra vez al volver la conexión, con las mismas claves.
4. Al vaciar la cola después de estar sin red, avisa cuántas capturas mandó.

## Cómo baja

1. Al arrancar, con cada aviso en vivo `cambios` y, si no llega ninguno, cada `sync.intervalo_segundos`. Escucha `GET /v1/eventos` con su llave (ver [eventos y trabajos](../cimientos/EVENTOS-Y-TRABAJOS.md#avisos-en-vivo--get-v1eventos)).
2. Pide páginas de `GET /v1/sync/bajar` desde su cursor y aplica cada página en una transacción de Dexie: `cambio` reemplaza el renglón y `quitar` lo borra (si no lo tenía, lo ignora). Revisa sus llaves locales al terminar la ventana, no a media página.
3. Con `requiere_foto` o el aviso `resincronizar`, baja la foto completa y reemplaza esas tablas sin tocar su cola ni lo que nació en ella y todavía no regresa.
4. Un registro suyo que regresa del servidor reemplaza al local con lo que dice el servidor (por ejemplo, cancelado por Producción).

## El PIN sin internet

- La persona escoge su nombre y escribe 4 cifras. La tablet calcula Argon2id con hash-wasm, con la sal y los parámetros que trae el hash de esa persona, y los compara (ver [PIN del taller](../modulos/personal/pin-del-taller.md#cómo-se-guarda)).
- **Los intentos** los cuenta la tablet por persona; un PIN correcto los regresa a cero. Un PIN equivocado suelto no sube.
- **Al llegar a `personal.pin_intentos_bloqueo` (5),** la tablet la bloquea en ese momento y manda `produccion.registrar_bloqueo_pin` por su cola. Sigue bloqueada mientras no baje un desbloqueo posterior a ese bloqueo.
- **Un PIN anulado** o de una persona que ya no baja no entra: la persona sale de «¿Quién eres?» en cuanto baja el cambio.
- **La sesión** de la persona se cierra con «Salir» o sola a los `personal.tablet_inactividad_seg` (90) sin tocar la pantalla.
- Que Argon2id tarde menos de un segundo en la tablet real se mide en la fase 20.

## El lector de etiquetas

- **La cámara:** `BarcodeDetector` del navegador, con el polyfill `barcode-detector` si no lo trae, leyendo Code 128, el formato de las [etiquetas](../impresos/etiquetas.md). Al leer un folio de bulto, vibra y busca el bulto.
- **Sin cámara o sin permiso:** la misma casilla acepta el folio escrito o un lector de mano que escribe como teclado y manda Enter.
- Busca el bulto en su copia local, sin importar mayúsculas: no necesita red.

## Cómo se actualiza

- El service worker baja la versión nueva en segundo plano y la aplica cuando no hay nadie adentro y la cola está vacía.
- Con `426` o el aviso `actualizar`, deja de subir, muestra la pantalla de actualizar y se actualiza en cuanto puede; su cola no se pierde (`admin.version_minima_tablet`, ver [API](../cimientos/API.md#la-versión-de-la-app)).
- Un cambio en la forma de la copia local sube la versión de Dexie con su migración; un esquema de sincronización nuevo pide foto.

## Cómo se prueba

- **El cálculo** (tope, salud, semana, «Bultos para ti»): las pruebas de las funciones del paquete compartido, con fast-check.
- **La cola y la sincronización:** Playwright con la tablet en un Chrome de Android emulado contra la API real: sin red registra y con red sube; la tanda cortada a la mitad, el `detenido`, la foto a media cola, el aparato revocado con su cola y el `426`.
- **El PIN:** sin red, con el hash que bajó; el bloqueo sube con su hora y Personal lo ve.
- **En la tablet real** (la [verificación real](../registros/REGISTROS.md#verificación-real-pendiente)): instalarla, leer con su cámara las etiquetas de la Zebra y medir Argon2id.

## Cómo está hecho

**Fase 20, parte 4: por dentro.** La tablet vive en `apps/tablet/`: Vite con React y Tailwind, y el proxy de `/v1` a la API. En las pruebas, el proxy manda el `Origin` del taller (`UNIFORMAME_ORIGEN_TALLER`), como lo haría la tablet servida desde su dominio.

- **La base** (`copia/base.ts`, Dexie): una tabla por cada tabla que baja, con el nombre que manda el servidor (su propio renglón llega en `dispositivos`), y además:
  - `cola` (`++orden`, la clave única);
  - `sincronizacion` (el estado del aparato, el cursor, la última bajada y la última subida);
  - `aparato` (su llave, con el secreto cifrado);
  - `llaves` (la de cifrado);
  - `intentos_pin`.

  Lo que nace en la tablet lleva `_local`, «guardada» o «apartado», hasta que baja su renglón del servidor.
- **El cifrado** (`registro/cifrado.ts`): AES-GCM de 256 bits con una llave `extractable: false` guardada en IndexedDB. Van cifrados el secreto (también el nuevo mientras cambia la llave) y el `pin_hash` de cada PIN, que se cifra antes de abrir la transacción.
- **El registro** (`registro/registro.ts`): canjea en `POST /v1/dispositivos/canjear` con un secreto de `crypto.getRandomValues`; si se corta, repite con la misma clave y el mismo secreto.
- **La copia** (`copia/copia.ts`):
  - cada página que baja se aplica en una transacción;
  - la foto se junta completa y reemplaza todo en una sola transacción, dejando lo `_local` y sin tocar la cola;
  - los bultos guardan `folio_mayusculas` para buscarlos sin importar mayúsculas;
  - los parámetros se leen de la copia (`copia/parametros.ts`), sin valores escritos en la tablet: nadie entra antes de la foto.
- **La cola** (`cola/cola.ts`): el comando y sus renglones locales en la misma transacción.
- **La API** (`sincronizacion/api.ts`): la llave descifrada solo para cada llamada, con `X-App-Version` y `X-Pendientes`. Sin red, un `503` o una respuesta que no es de la API cuentan como sin internet; el `426` pide actualizar y `llave_revocada`, revocada. El cambio de llave usa `conLaLlaveQueVale` del paquete compartido, la misma del puente.
- **Subir** (`sincronizacion/subir.ts`): tandas de `sync.tanda_max_comandos`; cada respuesta saca su comando de la cola y marca sus renglones, y cada tanda anota su hora como la última subida; con `detenido` se para y la siguiente vez manda desde el primero sin respuesta.
- **Bajar** (`sincronizacion/bajar.ts`): páginas desde el cursor; `requiere_foto` baja la foto; `rotar_llave` cambia la llave al quedar al día. Al terminar la foto, la tablet queda lista solo si estaba preparándola: una revocada que baja no vuelve a lista. No revisa llaves foráneas: guarda lo que baja y las pantallas no muestran lo que no encuentran.
- **El motor** (`sincronizacion/motor.ts`):
  - una vuelta a la vez; sube y baja al arrancar, con cada aviso en vivo (leídos con `escucharEventos` del paquete compartido, como el puente), al volver la red y cada `sync.intervalo_segundos` leído de la copia (antes de la foto, el que dio el canje);
  - un error al subir que no es de red no le quita la bajada; un error que no espera se anota en la consola y el motor sigue en la siguiente vuelta;
  - lleva el estado de las pantallas;
  - revocada, solo sube;
  - con versión vieja no hace nada y, al arrancar otra vez, vuelve a intentar.
- **El PIN** (`pin/pin.ts`): `argon2Verify` de hash-wasm con el hash descifrado. Los intentos y el bloqueo van en `intentos_pin`, y el bloqueo sube por la cola con su hora. Solo un `desbloqueado_en` posterior al bloqueo deja entrar otra vez.
- **El lector** (`lector/lector.ts`): `barcode-detector/polyfill`, que solo se instala si el navegador no trae `BarcodeDetector`, con el wasm de `zxing-wasm` servido por la tablet. `buscarBulto` revisa la forma del folio y lo busca en la copia.
- **El service worker** (`service-worker/`): lo arma un plugin de Vite en la construcción, con la lista de todo lo armado y lo de `public/` (el manifiesto y el ícono). Se registra solo en la tablet construida, y la versión nueva espera hasta que la tablet la aplica (decisión 813).
- **Las pruebas,** con Playwright en un Chrome que emula una Galaxy Tab S4 en horizontal, contra la API real con la muestra (`pruebas/tablet-de-prueba.ts`). Las pruebas por dentro abren `pruebas/vacia.html`, que deja los módulos en `window.porDentro`:
  - `registro/registro.prueba.ts`: el secreto y los hashes cifrados, la llave que no se exporta y el código que no sirve;
  - `copia/copia.prueba.ts`: nada de dinero, ni con las tarifas visibles;
  - `sincronizacion/subir.prueba.ts`: sin red, la respuesta perdida y `detenido`;
  - `sincronizacion/bajar.prueba.ts`: las páginas, el cambio, el quitar, la foto con cola y el registro cancelado;
  - `pin/pin.prueba.ts`;
  - `sincronizacion/aparato.prueba.ts`: la revocada, el `426` y un error que no espera, que no detiene al motor;
  - `sincronizacion/llave.prueba.ts`: el cambio de llave aplicado y el que no se supo si se aplicó;
  - `service-worker/plugin.prueba.ts`.
