# Paquete compartido

> **Qué cubre:** lo que comparten la API, la web y la tablet en `packages/compartido`: los contratos Zod, los tipos, los cálculos puros, el dinero en centavos, la hora de México con el día de negocio y las semanas, y el cliente de la API con tipos.
> **Estado:** Decidido.
> **Se construye en:** [fase 1](../fases/01-repositorio-reglas-y-paquete-compartido.md).
> **Se conecta con:** [reglas de código](../../.claude/rules/codigo.md) · [estructura](ESTRUCTURA.md) · [API](API.md) · [precios](../modulos/catalogo/precios.md) · [cuenta de material](../modulos/patronaje/cuenta-de-material.md) · [proyección de material](../modulos/compras/proyeccion-de-material.md) · [corte y bultos](../modulos/produccion/corte-y-bultos.md) · [lotes](../modulos/produccion/lotes.md) · [registros de operación](../modulos/produccion/registros-de-operacion.md) · [idempotencia y concurrencia](IDEMPOTENCIA-Y-CONCURRENCIA.md) · [asistencia](../modulos/personal/asistencia.md) · [la tablet del taller](../apps/tablet.md)

## Para qué sirve

Lo que se calcula mientras alguien escribe en una pantalla tiene que dar exactamente lo mismo que lo que guarda la API. Por eso vive una sola vez, aquí, y lo usan los tres. Ejemplo: al capturar el corte del L-2026-122, la pantalla dice «La tela alcanza · 190 piezas llevan 214 m según la receta» con la misma función que la API vuelve a correr al cerrar el corte.

## Qué va aquí

| Carpeta | Qué lleva | Quién lo usa |
|---|---|---|
| `contratos/<modulo>/` | Un contrato Zod por acción y por consulta: su nombre, su entrada, su salida, quién puede llamarla y qué errores da. Reglas en la [regla de contratos](../../.claude/rules/contratos.md) | La API valida y documenta con él; la web y la tablet validan sus formularios con él |
| `tipos/` | Los tipos que salen de los contratos (`z.infer`) y los tipos base: `Centavos`, `DiaNegocio`, `Momento`, `Uuid` | Todos |
| `calculos/` | Las funciones puras que se ven mientras se escribe y la API repite al guardar | Todos |
| `cliente/` | El cliente de la API con tipos | La web y la tablet |

**Los cálculos que viven aquí** (cada regla está en el archivo de su tema; aquí solo la función):

- dinero, fechas y semanas (abajo);
- la cuenta de material de un lote, en [cuenta de material](../modulos/patronaje/cuenta-de-material.md);
- la proyección de un material (el día en que se acaba, el estado, el pedido sugerido y hasta cuándo alcanza otra cantidad), en [proyección de material](../modulos/compras/proyeccion-de-material.md);
- los avisos «Ojo» de un cambio de precio en la ficha de producto, en [precios](../modulos/catalogo/precios.md) (el precio sugerido de un cliente no: cruza listas y precios por talla, así que la pantalla lo pide a la API);
- lo que alcanza cada tela, los rollos automáticos y lo que queda según la receta en un corte, en [corte y bultos](../modulos/produccion/corte-y-bultos.md);
- la salud de un lote y el tope de un bulto, en [lotes](../modulos/produccion/lotes.md), y «Bultos para ti», en [registros de operación](../modulos/produccion/registros-de-operacion.md): la tablet los calcula sin internet.

Un cálculo nuevo entra aquí solo si una pantalla lo necesita mientras se escribe. Lo que solo calcula la API se queda en su módulo.

## Reglas

1. **Puro.** Sin base de datos, sin red, sin reloj y sin variables de entorno. Lo que necesita lo recibe: «ahora» llega como parámetro, y un valor del negocio llega ya leído de su parámetro.
2. **El mismo resultado en todos lados.** La API siempre recalcula al guardar y nunca confía en lo que calculó la pantalla.
3. **Probado con datos al azar.** Cada cálculo tiene su prueba con fast-check: miles de casos y la misma regla al final (por ejemplo, lo que se reparte suma exactamente el total).
4. **Nada de la API ni de React.** Sin Drizzle, sin Fastify, sin componentes. Si algo los necesita, no va aquí.

## Dinero

- **Siempre en centavos enteros.** El tipo `Centavos` es un número entero seguro (`Number.isSafeInteger`); nunca un número con decimales. En la base es `bigint` y Drizzle lo lee como número (modo `number`), que alcanza de sobra para cualquier monto del negocio.
- **Funciones:**

  | Función | Qué hace |
  |---|---|
  | `pesosACentavos` | Lee lo que escribió la persona («1,250», «1250.50») y lo vuelve centavos; rechaza lo que no es dinero |
  | `centavosATexto` | Lo muestra con `Intl.NumberFormat` de México. Las pantallas muestran pesos sin decimales, salvo donde se aceptan centavos (efectivo contado, fondo y movimientos de caja) |
  | `aPesoEntero` | Redondea a peso entero. Lo usa todo precio que sale de un porcentaje, como el de mayoreo: mostrador × (1 − % ÷ 100) |
  | `aplicarPorcentaje` | Saca un porcentaje de un monto y lo redondea al centavo |
  | `repartir` | Reparte un monto entre renglones en proporción, sin perder ni sobrar un centavo (por ejemplo, el IVA proporcional de lo recibido) |

- **Redondeo:** al más cercano; la mitad, hacia arriba en los positivos y lejos del cero en los negativos, así un negativo da exactamente el contrario de su positivo (123.50 → 124 y −123.50 → −124; decisión 327). Al mostrar sin centavos se redondea igual.
- **Porcentajes y metros sin decimales sueltos.** Un porcentaje (`numeric(6,3)`, 12.5 = 12.5 %) se convierte a milésimas enteras antes de multiplicar. Los metros y las demás unidades de material (`numeric(12,3)`) se suman en milésimas enteras. Así nada se pierde por redondeos de punto flotante.

## Fechas y horas

- **Momentos** (`timestamptz`, terminan en `_en`): viajan en ISO 8601, en UTC, y se manejan como `Temporal.Instant`.
- **El día de negocio** es la fecha en hora de México (`America/Mexico_City`) de cuando pasó: el `ocurrido_en` de un aparato, o la hora del servidor en la web. Una venta de las 11:30 de la noche es de ese día, no del siguiente.
- **Fechas** (`date`): viajan como `AAAA-MM-DD` y se manejan como `Temporal.PlainDate`.
- **Horarios** (la hora de un trabajo programado): `Temporal.PlainTime`, en hora de México.
- **Semanas:** empiezan en lunes y se nombran por su lunes. La semana de asistencia lleva los días de trabajo (ver [asistencia](../modulos/personal/asistencia.md)).
- **Días hábiles:** se cuentan con los días de trabajo del parámetro `general.dias_de_trabajo` (lunes a sábado al inicio), como el «lote atorado» de 2 días hábiles.
- **El año de un folio** (OP-2026-, L-2026-) es el del día de negocio.
- **Nunca** `new Date()` en la lógica del negocio ni la hora local del servidor: la hora entra como parámetro y la zona es siempre la de México.

Todo esto usa Temporal con `temporal-polyfill` (ver [arquitectura](ARQUITECTURA.md)).

## El cliente de la API

El cliente es el SDK de Unifórmame: sale de los contratos y lo usan la web y la tablet. Nadie llama a la API a mano.

- **Una llamada por contrato,** con sus tipos: `cliente.accion('ventas.confirmar_pedido', { datos, version })` y `cliente.consulta('ventas.pedidos', parametros)`. Un nombre o un dato que no existe no compila.
- **La clave de idempotencia** nace cuando la persona aprieta el botón y se reusa en cada reintento de esa misma intención. Ver [idempotencia](IDEMPOTENCIA-Y-CONCURRENCIA.md).
- **Lo de cada llamada:** la cookie de sesión (o la llave del aparato) y `X-App-Version`.
- **Los errores con tipo:** cada error de la API llega como un objeto con `error`, `codigo`, `mensaje` y, si aplica, `campos`. El cliente no inventa mensajes: muestra el de la API.
- **Tres respuestas que el cliente atiende solo:** `401 reautenticar` (abre «Confirmar con Google» y repite con la misma clave), `426 actualizar` (recarga la app) y `409 conflicto_version` (entrega los datos nuevos a la pantalla para que la persona revise).

El protocolo completo está en [API](API.md).

## Cómo está hecho

**Fase 1.** `packages/compartido` es el paquete `@uniformame/compartido` del workspace; depende solo de `temporal-polyfill` (y de `fast-check` para sus pruebas). Cada archivo se importa por su ruta (`@uniformame/compartido/calculos/dinero`), sin archivos que solo reexportan.

**Los tipos base** (`src/tipos/base.ts`):

- `Centavos` y `Uuid` llevan una marca de tipo: un número cualquiera no pasa por centavos. Se obtienen con `esCentavos(n)` (entero seguro), `centavos(n)` (igual, pero falla con `RangeError`) y `esUuid(texto)` (uuid v7 en minúsculas).
- `DiaNegocio` es `Temporal.PlainDate` y `Momento` es `Temporal.Instant`, del polyfill.

**El dinero** (`src/calculos/dinero.ts`), todo con enteros y `BigInt` donde un producto puede pasar de un entero seguro:

| Función | Cómo |
|---|---|
| `pesosACentavos(texto)` | Acepta signo, `$`, pesos con comas de miles bien puestas o sin comas, y hasta dos decimales; regresa `null` con cualquier otra cosa o si no cabe en un entero seguro |
| `centavosATexto(monto, { conCentavos })` | `Intl.NumberFormat("es-MX", MXN)` con el monto como texto decimal exacto: «$1,250» o «$1,250.50». Sin centavos, primero redondea con `aPesoEntero`, así la pantalla dice el mismo peso que se guarda (y falla igual que él cerca del entero seguro más grande) |
| `aPesoEntero(monto)` | Al múltiplo de 100 más cercano, la mitad lejos del cero (123.50 → 124 y −123.50 → −124); falla con `RangeError` si el resultado ya no cabe en un entero seguro |
| `aplicarPorcentaje(monto, porcentaje)` | El porcentaje (`12.5` o `"12.500"`) se pasa a milésimas enteras; monto × milésimas ÷ 100 000, al centavo y con la mitad lejos del cero. Un porcentaje negativo o con más de tres decimales es `RangeError` |
| `repartir(total, proporciones)` | Restos mayores: cada renglón recibe la parte entera de su proporción, y los centavos que faltan van a los restos más grandes (en empate, al primero). Un total negativo se reparte igual, con su signo. Sin renglones, con un peso que no es entero de cero en adelante, o con todos en cero y algo que repartir, es `RangeError` |

**Las fechas** (`src/calculos/fechas.ts`): `zonaDelNegocio` es `America/Mexico_City`; `diaDeNegocio(momento)` es la fecha del reloj de México; `inicioDeSemana(dia)` es su lunes; `diasHabilesEntre(desde, hasta, diasDeTrabajo)` cuenta los días de trabajo después de `desde` y hasta `hasta`, incluido; `sumarDiasHabiles(dia, n, diasDeTrabajo)` avanza `n` días de trabajo. Los días de trabajo llegan como números ISO (1 lunes … 7 domingo), ya leídos de `general.dias_de_trabajo`.

**Las pruebas**, con fast-check y casos fijos: `src/calculos/dinero.prueba.ts` (lo repartido suma exactamente el total y cada parte queda a menos de un centavo de la exacta; `aPesoEntero` da múltiplos de 100 a menos de medio peso y es simétrico con los negativos; `pesosACentavos` lee de vuelta cualquier monto y rechaza un monto echado a perder de ocho formas distintas; el porcentaje queda a menos de medio centavo del exacto y es simétrico; sin centavos se muestra el peso de `aPesoEntero`), `src/calculos/fechas.prueba.ts` (las 23:30 de México son de ese día aunque en UTC sea el siguiente, también en el verano de 2021, con horario de verano, y de 2026; el lunes de cada semana; los días hábiles con cualquier juego de días de trabajo) y `src/tipos/base.prueba.ts`.

**Fase 3 · los contratos y el cliente.**

- **Los contratos** (`src/contratos/definir.ts`): `definirAccion({ nombre, descripcion, entrada, salida, permiso, errores, edita, secretos })` y `definirConsulta({ …, recortables })`. La entrada y la salida quedan estrictas; el resultado de una acción siempre lleva `mensaje` y, si edita, `version`. `parametrosDePagina(maximo)` y `paginaDe(renglon)` dan la forma de las consultas que paginan. `src/contratos/protocolo.ts` tiene el cuerpo y las respuestas, la tabla de errores con su estado y su mensaje y `respuestaDeError`; `src/contratos/versiones.ts`, la versión mínima de cada app según el código y cómo comparar versiones.
- **El cliente** (`src/cliente/cliente.ts`): `crearCliente({ acciones, consultas }, { urlBase, versionApp, alReautenticar, alActualizar, encabezados, credenciales })` regresa `accion(nombre, { datos, version })` y `consulta(nombre, parametros)`, con los tipos de cada contrato. La clave (uuid v7) se hace una vez por llamada y se reusa en sus reintentos: sin red, si la respuesta se corta mientras llega, o con `500`, `502`, `503` o `504`, hasta 4 veces con espera de 0.5, 1, 2 y 4 segundos (`ErrorSinRed` al final, también si un error no se puede leer). Todo error del cliente lleva la `clave` de la intención: si la persona vuelve a intentar, la pantalla la pasa como tercer argumento de `accion`. Ante `401 reautenticar` llama a `alReautenticar(proposito)` y repite una vez; ante `426` llama a `alActualizar(version_minima)`; ante `409` lanza `ErrorDeConflicto` con `version` y `datos`; ante cualquier otro error, `ErrorDeLaApi` con el mensaje de la API, sin reintentar.
- **Su prueba:** `src/cliente/cliente.prueba.ts`, con un `fetch` de mentira y pruebas de tipos (`@ts-expect-error` y `expectTypeOf`) que revisa `pnpm tipos`.
