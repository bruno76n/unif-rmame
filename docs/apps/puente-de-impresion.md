# El puente de impresión

> **Qué cubre:** el programa chico que corre en la computadora de Aduana y en la del taller: cómo se instala y se registra con su código, cómo se entera de sus trabajos, manda el ZPL a su Zebra por la red local y confirma cada uno; su configuración, su diario, su llave y cómo se actualiza.
> **Estado:** Decidido.
> **Se construye en:** [fase 20](../fases/20-tablet-puente-de-impresion-e-impresos.md).
> **Se conecta con:** [impresión](../modulos/admin/impresion.md) · [etiquetas](../impresos/etiquetas.md) · [dispositivos](../modulos/admin/dispositivos.md) · [eventos y trabajos](../cimientos/EVENTOS-Y-TRABAJOS.md) · [API](../cimientos/API.md) · [sincronización](../cimientos/SINCRONIZACION.md) · [arquitectura](../cimientos/ARQUITECTURA.md) · [pantallas de Administración](../interfaz/fabrica/administracion.md) · [infraestructura](../cimientos/INFRAESTRUCTURA.md) · [fase 20](../fases/20-tablet-puente-de-impresion-e-impresos.md)

## Para qué sirve

Las etiquetas salen solas en la Zebra que está junto a quien las pidió, sin abrir archivos ni escoger impresora. Ejemplo: en Aduana, Javier aprieta «Imprimir etiquetas» del A- del L-2026-124. La API guarda el trabajo y avisa en vivo al puente de la computadora de Aduana; el puente pide sus trabajos, baja el ZPL de las 58 etiquetas, lo manda a la Zebra ZD421 por la red y confirma. Javier ve «Etiquetas impresas en Zebra de aduana». Si la Zebra se quedó sin etiquetas, ve «No se imprimió en Zebra de aduana: Sin etiquetas en la impresora. Usa el PDF.».

## Reglas

1. **Un programa de Node sin pantalla** (`apps/puente/`), que corre de fondo en la computadora junto a la Zebra y arranca solo al prenderla.
2. **Un puente atiende una impresora:** la Zebra cuya dirección tiene en su configuración. La dueña liga cada impresora con su puente en Configuración · Empresa (ver [impresión](../modulos/admin/impresion.md)).
3. **Solo sale hacia dos lados:** a la API, con su llave (`Authorization: Llave {llave_id}.{secreto}` y `X-App-Version`), y a la Zebra, por la red local al puerto 9100. No abre ningún puerto ni recibe llamadas.
4. **Solo puede lo de su tipo** (`puente_impresion`): pedir sus trabajos, bajar las etiquetas de esos trabajos y confirmarlos (ver [sincronización](../cimientos/SINCRONIZACION.md#lo-que-puede-cada-aparato)).
5. **Ningún trabajo se pierde:** lo que recibió lo termina aunque se apague a la mitad. Si se apaga entre imprimir y anotarlo, al arrancar lo vuelve a mandar: una etiqueta repetida se tira; una que falta detiene la mercancía.
6. **No guarda datos del negocio:** solo su configuración, su llave y su diario de trabajos.

## La instalación

1. **El programa:** un solo ejecutable (single executable application de Node, para Windows y Linux) que arma `pnpm puente:empaquetar`. Quien instala lo copia a la computadora.
2. **El código:** la dueña lo da en Administración del sistema · Dispositivos · «Registrar dispositivo», con «Dónde se usa» igual a la ubicación de la impresora (ver [dispositivos](../modulos/admin/dispositivos.md)).
3. **Registrar:** `uniformame-puente registrar` pide el código y la dirección de la Zebra en la red (por ejemplo, `192.168.1.50`; el puerto 9100 si no se escribe otro). Hace su secreto (32 bytes de `crypto.randomBytes`, en base64url) y llama a `admin.canjear_codigo` con el tipo `puente_impresion`. Si el código no sirve, escribe el mensaje que regresa la acción.
4. **Probar:** manda a la Zebra una etiqueta de prueba hecha ahí mismo, sin pasar por la API: «Unifórmame · prueba de impresión · {fecha} {hora}». Si no sale, revisar la dirección antes de seguir.
5. **Ligar:** la dueña escoge ese puente en la impresora (Configuración · Empresa · «Impresora de etiquetas»).
6. **Que arranque solo:** `uniformame-puente instalar` lo deja como tarea programada al iniciar la sesión de su usuario en Windows (así lee su configuración, que solo ese usuario puede leer), o como servicio de systemd en Linux, que corre como ese usuario y se reinicia si se cae (decisión 812).

## La configuración

- `puente.json`, en la carpeta de datos del usuario del sistema que lo corre: la dirección de la API, su `llave_id`, su secreto y la dirección y el puerto de la Zebra. Solo ese usuario puede leerlo.
- **Cambiar la dirección de la Zebra** sin volver a registrar: `uniformame-puente impresora 192.168.1.60`.
- El secreto nunca sale de ese archivo: ni al registro, ni a la API en claro fuera del encabezado, ni a ningún otro lado.

## Cómo trabaja

1. **Al arrancar,** termina lo que quedó a medias en su diario y se conecta a `GET /v1/eventos` con su llave (ver [eventos y trabajos](../cimientos/EVENTOS-Y-TRABAJOS.md#avisos-en-vivo--get-v1eventos)).
2. **Pide sus trabajos** (`admin.trabajos_impresion`) al conectarse, con cada aviso `impresion` y, aunque no llegue ninguno, cada `sync.intervalo_segundos` (60). Esa llamada es también su señal de vida: su impresora cuenta como conectada mientras el puente dé señales dentro de `admin.minutos_puente_sin_contacto` (5 minutos).
3. **Cada trabajo,** en el orden en que llegó:
   1. lo anota en su diario como recibido;
   2. baja su ZPL de la ruta que trae el trabajo (`GET /v1/etiquetas/{tipo}/{id}?formato=zpl`, con sus copias);
   3. le pregunta a la Zebra su estado con `~HS`: sin etiquetas, con la tapa abierta o en pausa no imprime y queda en `fallo` con «Sin etiquetas en la impresora», «La tapa de la impresora está abierta» o «La impresora está en pausa»;
   4. manda el ZPL por TCP al puerto de la Zebra y cierra la conexión;
   5. lo anota impreso y lo confirma con `admin.confirmar_impresion`: `impreso`, o `fallo` con su error (hasta 200 letras). Confirmado, lo borra del diario.
4. **Si la Zebra no contesta** en 10 segundos: `fallo`, «La impresora no contesta: revisa que esté prendida y conectada».
5. **Sin internet** no pide trabajos; lo que ya bajó lo imprime y lo confirma al volver la red. Confirmar dos veces el mismo trabajo recibe la misma respuesta (ver [impresión](../modulos/admin/impresion.md#reglas), regla 4).

## El diario

- Un archivo local, un renglón por paso de cada trabajo: recibido, impreso y confirmado, con su hora.
- Al arrancar: lo recibido sin imprimir se imprime; lo impreso sin confirmar se confirma.
- No guarda el ZPL: si hace falta, lo vuelve a bajar.

## La llave

- **Cambia sola** cada `admin.dias_rotar_llave` (90): cuando la respuesta de sus trabajos trae `rotar_llave`, hace un secreto nuevo, llama a `admin.rotar_llave` y lo guarda en su configuración. Si no supo si se aplicó, prueba primero la nueva y luego la vieja, dentro de la gracia (ver [dispositivos](../modulos/admin/dispositivos.md#adminrotar_llave)).
- **Revocado:** con `401 llave_revocada` deja de pedir trabajos y escribe en su registro «Este aparato fue revocado: ya no entra.». Para volver a imprimir se registra otra vez con un código nuevo.

## Cómo se actualiza

- Con `426` o el aviso `actualizar`, deja de pedir trabajos y escribe en su registro «Hay una versión nueva. Actualiza para seguir.». Su impresora deja de contar como conectada y las pantallas ofrecen el PDF (`admin.version_minima_puente`, ver [API](../cimientos/API.md#la-versión-de-la-app)).
- Se reemplaza el ejecutable por el de la versión nueva y se vuelve a arrancar; su configuración, su llave y su diario se quedan.

## Su registro

- Un archivo de texto con lo que hace: arranques, cada trabajo con su resultado y cada error, sin el contenido de las etiquetas. Guarda lo de los últimos 30 días.
- Lo que importa se ve también en el sistema: su último contacto y su versión en Dispositivos, y si su impresora está conectada en Configuración · Empresa (ver [pantallas de Administración](../interfaz/fabrica/administracion.md)).

## Cómo se prueba

- **Con una Zebra de mentira:** un servidor TCP local que guarda lo que recibe y contesta `~HS` con papel, sin papel, con la tapa abierta o en pausa. Lo recibido tiene que ser el ZPL del trabajo, byte por byte.
- **Contra la API real** (Postgres de testcontainers), con un puente registrado: el aviso llega, el trabajo pasa a `mandado`, el ZPL llega a la Zebra de mentira y el trabajo queda `impreso`; sin papel, `fallo` con su texto; la red se cae después de imprimir y al volver confirma una vez.
- **Apagado a la mitad:** al arrancar termina lo de su diario.
- **Sin avisos en vivo:** igual imprime con la pregunta de cada minuto, y la impresora no deja de contar como conectada.
- **En la Zebra real:** la [verificación real](../registros/REGISTROS.md#verificación-real-pendiente) de la fase 20.

## Cómo está hecho

**Fase 20, parte 3.** El puente vive en `apps/puente/`, un archivo por pieza (decisión 812):

- **`principal.ts`,** la entrada: sin orden corre; `registrar` (con `--api`, `--codigo` y `--zebra`, o preguntándolos), `impresora {dirección}`, `instalar` y `version`.
- **`registrar.ts`:** hace su secreto con `randomBytes(32)` en base64url y canjea en `POST /v1/dispositivos/canjear`; si se corta, repite con la misma clave y el mismo secreto. Después del registro, `principal.ts` manda la etiqueta de prueba de `zebra.ts` (`etiquetaDePrueba`).
- **`configuracion.ts`:** `puente.json` en `UNIFORMAME_PUENTE_DATOS`, o en `%APPDATA%\Uniformame Puente` o `~/.config/uniformame-puente`. Se escribe de un jalón (`archivos.ts`: un archivo temporal que llega al disco con `datasync` y luego se renombra, y en Linux también la carpeta se baja al disco) con permisos `0600` en una carpeta `0700`. La dirección de la Zebra lleva el 9100 si no dice otro puerto.
- **`api.ts`:** usa el cliente con tipos del paquete compartido, con su llave en `Authorization` y su versión (`version.ts`). `426` y `401 llave_revocada` lo detienen. El cambio de llave guarda primero `secreto_nuevo`; si no supo si se aplicó, la siguiente llamada prueba la nueva y, si la API no la conoce, usa la vieja (`conLaLlaveQueVale` del paquete compartido, la misma de la tablet).
- **`trabajos.ts`:** en cada vuelta termina el diario, pide sus trabajos, los anota y los imprime uno por uno. Pide los trabajos con una clave que anota antes en el diario (`pidiendo`): si la respuesta se pierde, la siguiente vuelta repite la misma clave y recibe los mismos trabajos, que ya quedaron marcados como enviados. Confirma cada uno con la clave guardada en el diario, así que un reintento recibe la misma respuesta. Si la API ya no deja confirmar uno (`403`, `404` o `422`: la impresora es de otro puente o se dio de baja, o el trabajo ya no existe), lo anota en el registro y lo saca del diario; un `401` de la llave no cuenta, y lo del diario espera a que vuelva a entrar; si ya no puede bajar su etiqueta, lo confirma como fallo con «La etiqueta ya no se puede imprimir aquí». Cuando le toca, cambia su llave.
- **`zebra.ts`:** pregunta `~HS` y lee los tres textos (sin etiquetas, la cabeza levantada, la pausa). Manda el ZPL por `node:net` y cierra. A los 10 segundos sin respuesta, «La impresora no contesta…».
- **`diario.ts`:** un renglón JSON por paso, escrito hasta el disco con `datasync`: `pidiendo` y `pedido` con la clave de cada pedida, y los de cada trabajo. Un renglón cortado por un apagón se ignora, y el siguiente empieza en uno nuevo. Al confirmar un trabajo y al llegar la respuesta de una pedida, el diario se reescribe sin lo que ya no hace falta, así que no crece mientras no hay qué imprimir. Mientras una pedida siga sin respuesta, recuerda los trabajos ya confirmados: si la repite y le vuelven a llegar, no los imprime otra vez.
- **`senal.ts`:** una sola vuelta a la vez. Escucha `GET /v1/eventos` con la llave y lee sus eventos con `escucharEventos` del paquete compartido, porque `EventSource` no manda encabezados. Pregunta cada `intervalo_segundos` y se vuelve a conectar a los 5 segundos. `hola` con una mínima mayor, `actualizar`, `dispositivo_revocado`, `426` y `401 llave_revocada` lo detienen y lo anotan.
- **`registro.ts`:** un renglón con su hora por cada arranque, trabajo y error; al arrancar quita lo de más de 30 días.
- **`instalar.ts`:** en Linux, la unidad `uniformame-puente.service` con `User=` y `Restart=on-failure`; en Windows, `schtasks` con `ONLOGON`.
- **`pnpm puente:empaquetar`** (`scripts/empaquetar.ts`): Vite junta todo en `dist/puente.cjs` y `node --build-sea` arma `dist/uniformame-puente` con el Node que lo corre. Para Windows, arma `uniformame-puente.exe` con el `node.exe` que se le dé en `--node-windows`.
- **Las pruebas,** contra la API real escuchando en un puerto y la Zebra de mentira (`pruebas/simuladores/zebra.ts`), con el arnés `src/de-prueba.ts`:
  - `trabajos.prueba.ts`: el orden, el ZPL byte por byte, lo de otra impresora, una confirmación por trabajo, la red que se cae después de imprimir, la respuesta de los trabajos que se pierde, la impresora dada de baja con un trabajo en el diario, la confirmación que da `403`, la llave que da `401` y el cambio de llave, aplicado o no;
  - `diario.prueba.ts`: el apagado a la mitad, el renglón cortado, la pedida sin anotar con un trabajo ya confirmado y las vueltas sin trabajos;
  - `zebra.prueba.ts`: sin papel, la tapa, la pausa, callada y lo que ve quien lo pidió;
  - `senal.prueba.ts`: sin avisos, con avisos, la versión vieja y el revocado;
  - `registrar.prueba.ts`, `instalar.prueba.ts` y `scripts/empaquetar.prueba.ts`;
  - la llave que cambia, en `packages/compartido/src/cliente/llave.prueba.ts`.
- **Pendiente con Bruno:** la Zebra real, el ejecutable de Windows (necesita el `node.exe` de la misma versión) y la instalación en las dos computadoras, en la [verificación real](../registros/REGISTROS.md#verificación-real-pendiente).
