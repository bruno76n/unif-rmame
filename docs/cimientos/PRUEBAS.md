# Pruebas

> **Qué cubre:** los niveles de prueba; Postgres real con Testcontainers; los simuladores de Google, correo y almacenamiento con MSW; las pruebas con datos al azar para inventario, dinero y sincronización; las pruebas de lo que sale mal; los datos de la muestra; los flujos de punta a punta y la temporada simulada.
> **Estado:** Decidido.
> **Se construye en:** [fase 2](../fases/02-base-de-datos-y-pruebas.md).
> **Se conecta con:** [regla de pruebas](../../.claude/rules/pruebas.md) · [forma de trabajo](../trabajo/FORMA-DE-TRABAJO.md) · [base de datos](BASE-DE-DATOS.md) · [API](API.md) · [flujo 01](../flujos/fabrica/01-pedido-externo.md) · [flujo 02](../flujos/fabrica/02-cambios-en-produccion.md) · [flujo 03](../flujos/fabrica/03-producto-nuevo.md) · [flujo 04](../flujos/fabrica/04-compra-de-material.md) · [flujo 05](../flujos/fabrica/05-reabasto-y-surtido-a-tiendas.md) · [flujo 06](../flujos/fabrica/06-pedido-en-linea.md) · [flujo 07](../flujos/fabrica/07-calidad-y-reclamos.md) · [flujo 08](../flujos/fabrica/08-diferencias-y-ajustes.md) · [flujo 09](../flujos/fabrica/09-autorizaciones.md) · [flujo 10](../flujos/fabrica/10-asistencia-y-nomina.md) · [flujo 11](../flujos/fabrica/11-falla-de-maquina.md) · [fase 21](../fases/21-pruebas-de-punta-a-punta.md)

## Para qué

Una fase se cierra solo en verde, y cada criterio de terminado tiene la prueba que lo demuestra. La revisión completa no pide un porcentaje de cobertura: pide que cada criterio tenga su prueba y que la prueba demuestre ese criterio.

## Los niveles

| Nivel | Qué prueba | Con qué | Dónde |
|---|---|---|---|
| **Cálculos** | Funciones puras: dinero, fechas, cuenta de material, precio sugerido | Vitest y fast-check, sin base | Junto al código, `*.prueba.ts` |
| **Acciones y consultas** | Cada acción y cada consulta por el núcleo, contra la base: lo que escribe, sus eventos, su bitácora, sus permisos, su recorte y lo que sale mal | Vitest contra Postgres real | Junto a la acción o consulta |
| **API** | Lo de HTTP: la sesión y la llave, el formato de los errores, `426`, el `Origin`, la sincronización por tandas | Vitest con `inject()` de Fastify | Junto al núcleo |
| **Pantallas** (fase 19) | Cada pantalla contra la muestra (capturas en escritorio y teléfono) y que cada botón llame a su acción | Playwright | Junto a la pantalla |
| **Punta a punta** (fase 21) | Los flujos de la fábrica de principio a fin y la temporada simulada | Playwright y Vitest contra la API completa | `pruebas/` |

## Postgres real

Nada que toque la base se prueba con una base de mentira.

1. Al empezar la corrida, Testcontainers levanta un Postgres 18, la misma versión que producción.
2. Se aplican las migraciones y la siembra del sistema en una base plantilla.
3. Cada archivo de pruebas trabaja en su propia base, copiada de la plantilla (`CREATE DATABASE … TEMPLATE`): es rápido y nadie pisa a nadie.
4. Cada prueba deja la base como la encontró: corre dentro de una transacción que se deshace al final, o, si necesita confirmar (las que prueban dos transacciones a la vez, los permisos o el disparador), trabaja en la base copia de su archivo, que nadie más usa.

Las pruebas usan el rol de la app, no el dueño: así también se prueba que la base no deja borrar. El dueño solo prepara lo que la prueba necesita (sus tablas de prueba).

## Simuladores de los servicios de fuera

Ninguna prueba llama a un servicio real. Cada uno tiene su simulador con MSW, sobre su interfaz oficial:

| Servicio | Qué simula |
|---|---|
| **Google** (OpenID) | El documento de descubrimiento, el intercambio del código, el `id_token` firmado con una llave de prueba y sus llaves públicas. Cuentas de prueba: la dueña, una cuenta dada de alta y una que no existe |
| **Resend** (correo) | El envío: guarda cada correo para que la prueba lo revise |
| **R2** (almacenamiento) | La subida con dirección firmada, la revisión de que el objeto llegó y la bajada |

Cada simulador se puede poner a fallar (sin respuesta, error del servidor, lentitud) para probar qué hace el sistema cuando el servicio se cae. Viven en `pruebas/simuladores/`. Lo que solo se comprueba con el servicio real va a «Verificación real pendiente» de `REGISTROS.md`.

## Pruebas con datos al azar

Donde un error cuesta dinero o piezas, no bastan unos cuantos casos. Con fast-check se generan miles de casos y al final se revisa la misma regla:

| Tema | La regla que se revisa |
|---|---|
| **Inventario** | Para cualquier serie de movimientos, la existencia es igual a la suma del libro y cada pieza está en una sola ubicación |
| **Dinero** | Lo que se reparte suma exactamente el total; lo pagado más lo pendiente es lo facturado; ningún centavo aparece ni desaparece |
| **Sincronización** | Con cualquier orden de reintentos, respuestas perdidas y tandas cortadas, el resultado es el mismo que sin fallas, y nada se duplica ni se pierde |

Cuando fast-check encuentra un caso que falla, ese caso se agrega como prueba fija.

## Lo que sale mal

Cada acción se prueba con lo que le toca de esta lista, además del camino feliz:

- la misma acción dos veces con la misma clave (contesta lo mismo), y dos veces al mismo tiempo;
- la misma clave con otros datos (`clave_usada`);
- una versión vieja (`409 conflicto_version`);
- una cuenta sin el departamento o sin el permiso fino (`403`), y un registro que la cuenta no debe ver (`404`);
- sin «Confirmar con Google» reciente, si la acción lo pide (`401 reautenticar`);
- una app con versión vieja (`426`);
- valores en cero, vacíos o fuera de su rango;
- desde un aparato: la tanda cortada a la mitad, la respuesta perdida, el aparato revocado y lo que llega horas después.

## Cómo se escribe cada prueba

- **Cada caso dice qué criterio demuestra,** con el texto del criterio del archivo de la fase: `it('Un reintento con la misma clave contesta lo mismo y no escribe dos veces', …)`.
- **Primero en rojo,** y se ve fallar por la razón correcta.
- **Los datos que necesita los crea ella,** con los ayudantes que cada módulo ofrece junto a sus pruebas, que usan sus propias acciones.
- **Nunca trampa:** no se salta, no se debilita y no se borra una prueba para llegar al verde.

## Datos de la muestra

Las pruebas de pantallas y de punta a punta arrancan con los datos de la muestra (`pnpm base:sembrar`; ver [base de datos](BASE-DE-DATOS.md#siembra-del-sistema-y-datos-de-la-muestra)). Así una captura se puede comparar con la muestra: el mismo pedido PE-0145, el mismo lote L-2026-122, las mismas cifras.

## Flujos de punta a punta y temporada simulada

En la fase 21 se prueban los 11 flujos de la fábrica, cada uno con su archivo en `docs/flujos/fabrica/`: el pedido externo, los cambios en producción, el producto nuevo, la compra de material, el reabasto y surtido a tiendas, el pedido en línea, calidad y reclamos, las diferencias y ajustes, las autorizaciones, la asistencia y la nómina, y la falla de máquina. Cada flujo dice sus datos de arranque, sus pasos, lo que tiene que cuadrar al final y lo que sale mal.

**La temporada simulada** corre semanas de trabajo generadas al azar (pedidos, cortes, registros de la tablet, recepciones, surtidos, pedidos en línea, pagos y nóminas) y, al final de cada día simulado, el cuadre de la noche. Al terminar: el cuadre sin residuo, la existencia igual al libro y el dinero cuadrado.

## Cómo está hecho

**Fase 4.** La prueba del respaldo semanal corre `pg_dump` y `pg_restore` dentro del contenedor de Postgres 18 de las pruebas (`docker exec`, con el `contenedor` que reparte el arranque), y pide `age` y `age-keygen` en la máquina: están en el entorno de la nube y en la imagen del worker; en una Mac se instalan con Homebrew. El simulador de R2 también acepta la subida por partes.


**Fase 2.**

- **Vitest** (`vitest.config.ts`) tiene tres proyectos, con `*.prueba.ts` y `*.prueba.tsx`: `calculos` (`packages/**` y `scripts/**`, sin base), `base` (`apps/api/src/nucleo/base/**` y `pruebas/**`) y, desde la fase 3, `api` (lo demás de `apps/**`). Los dos últimos corren, cada uno una vez por corrida, el arranque `apps/api/src/nucleo/base/plantilla-de-pruebas.ts`.
- **El arranque:** levanta `postgres:18` con Testcontainers (`@testcontainers/postgresql`), con el rol dueño y la base `plantilla`; aplica ahí las migraciones y la siembra (`migrarYSembrar`), le da entrada al rol de la app y le pasa a cada archivo, con `provide("baseDePruebas")`, dónde quedó el Postgres. Al terminar, apaga el contenedor.
- **La base de cada archivo** (`pruebas/base/base-de-prueba.ts`, paquete `@uniformame/pruebas`): `crearBaseDePrueba()` hace `CREATE DATABASE … TEMPLATE plantilla` con un nombre al azar (y repite el `REVOKE TEMPORARY` de la migración `0001`, porque Postgres no copia los permisos de la base) y regresa dos conexiones, `app` (el rol de la app, con el que trabaja la prueba) y `dueno` (para crear tablas de prueba), y `borrar()`. `enTransaccionDeshecha(pool, prueba)` le da a la prueba una transacción de Drizzle y la deshace al final, pase lo que pase; lo que la prueba corra adentro con transacciones (también `enTransaccion`) queda en `SAVEPOINT`s y se deshace también.
- **En la nube** las pruebas de la base piden Docker corriendo: lo arranca el gancho de inicio.
- **Los simuladores** (`pruebas/simuladores/`, con MSW 3; en cada prueba, `setupServer(...simulador.manejadores)` con `onUnhandledFrame: "error"`), cada uno con `ponerAFallar("sin_respuesta" | "error_del_servidor" | "demasiadas_peticiones" | "lento" | "ninguna")` (`fallas.ts`; lento son 3 segundos):
  - **Google** (`google.ts`): el documento de descubrimiento, el punto de tokens (un código sirve una vez; revisa el `client_id` y el `client_secret` —`401 invalid_client`—, la `redirect_uri` con que se emitió —`400 redirect_uri_mismatch`— y el verificador PKCE S256 —`400 invalid_grant`—) y las llaves públicas; el `id_token` va firmado con RS256 por una llave que nace con el simulador, con `iss`, `aud`, `sub`, `email`, `email_verified`, `nonce` y una hora de vencimiento. Las cuentas: `duena`, `dadaDeAlta` y `noExiste`, con correos `.invalid`.
  - **Resend** (`resend.ts`): `POST https://api.resend.com/emails` con la llave en `Authorization` (sin ella, `401 missing_api_key`; con otra forma, `403 invalid_api_key`), los campos obligatorios, `Idempotency-Key` (el mismo cuerpo da el mismo id; otro, `409`) y los errores con `statusCode`, `name` y `message` (`429 rate_limit_exceeded` con demasiadas peticiones). Guarda cada correo en `correos`.
  - **R2** (`r2.ts`): `PUT`, `HEAD` y `GET` en `https://<cuenta>.r2.cloudflarestorage.com/<cubo>/<llave>`, con dirección firmada (revisa su forma y que no haya vencido, con una hora que la prueba fija) o con `Authorization` SigV4; si la firma incluye `x-amz-checksum-sha256`, la subida tiene que mandar la suma y el contenido darla (si no, `400`); `HEAD` regresa el tamaño, la suma y el `ETag` (el MD5); los errores son los XML de S3 (`AccessDenied`, `NoSuchKey`, `BadDigest`, `InternalError`, `SlowDown`). La firma de verdad solo la revisa R2.
- **Playwright** (`playwright.config.ts`, para las fases 19 y 21): los archivos se llaman `*.navegador.ts`, con los proyectos `escritorio` y `telefono`, y sin trazas. Si existe `CHROMIUM_EJECUTABLE`, usa ese Chromium; en la nube lo deja el gancho de inicio, porque la máquina trae el suyo.
- **fast-check** ya estaba desde la fase 1, en el paquete compartido.

**Las pruebas de la base de pruebas:** `pruebas/simuladores/google.prueba.ts`, `resend.prueba.ts` y `r2.prueba.ts` (cada uno responde como su servicio y falla como él) y `pruebas/base.prueba.ts` (cada copia es otra base con las migraciones; lo que escribe una no se ve en la otra; una prueba en su transacción deshecha deja la base igual, aunque falle).
