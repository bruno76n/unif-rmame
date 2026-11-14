# Pantallas de la tablet

> **Qué cubre:** las pantallas de la Puerta del taller, cada una con lo que lee de su copia local, sus textos, sus estados y sus botones: el encabezado, entrar con nombre y PIN, el inicio de cada persona, registrar una operación, escanear bulto, falla de máquina, tomar consumible, sin internet, y las del aparato (registrar, revocada y actualizar).
> **Estado:** Decidido.
> **Se construye en:** [fase 20](../fases/20-tablet-puente-de-impresion-e-impresos.md).
> **Se conecta con:** [la tablet](../apps/tablet.md) · [registros de operación](../modulos/produccion/registros-de-operacion.md) · [PIN del taller](../modulos/personal/pin-del-taller.md) · [tarifas](../modulos/personal/tarifas.md) · [corte y bultos](../modulos/produccion/corte-y-bultos.md) · [lotes](../modulos/produccion/lotes.md) · [operaciones y flujos](../modulos/produccion/operaciones-y-flujos.md) · [máquinas, fallas y servicios](../modulos/mantenimiento/maquinas-fallas-y-servicios.md) · [materiales](../modulos/compras/materiales.md) · [dispositivos](../modulos/admin/dispositivos.md) · [textos](TEXTOS.md) · [diseño](DISENO.md) · [lo común de las pantallas](comunes.md) · [etiquetas](../impresos/etiquetas.md) · [fase 20](../fases/20-tablet-puente-de-impresion-e-impresos.md)

## Para qué sirve

Es la tablet de la pared del taller. Cada persona entra con su nombre y su PIN y registra las piezas que hizo de cada bulto (buenas y dañadas), reporta una falla de su máquina o toma consumibles. De aquí salen el avance de cada lote operación por operación, la producción de cada persona y la nómina por pieza. Ejemplo: Juana toca su nombre, escribe su PIN y ve «Hoy llevas 96 piezas». En «Bultos para ti» le espera el B-2026-121-03 con «Costados · 24 listas para ti», en rojo porque el lote está atrasado. Lo toca, deja «Buenas» en 24 y aprieta «Registrar 24 piezas»: «24 de Costados registradas en B-2026-121-03».

## Quién entra

- **La tablet registrada del Taller** (tipo `tablet_taller`, ver [dispositivos](../modulos/admin/dispositivos.md)). En la web no existe: la Puerta del taller no está en el menú de nadie.
- **Las personas del Taller con PIN** (activo o bloqueado), sin cuenta de Google (ver [PIN del taller](../modulos/personal/pin-del-taller.md)).
- **Sin barra superior, menú, pestañas, cajones ni ventanas:** cada paso ocupa la pantalla completa y se regresa con «Volver», «Otra máquina» o «Salir».
- **Lee solo de su copia local** (ver [la tablet](../apps/tablet.md#la-copia-local)); no tiene consultas. Todo lo que escribe va por su cola.
- **Nunca muestra** precios, costos ni sueldos. La tarifa por pieza, solo con `produccion.tarifa_visible_tablet` (abajo, en Registrar).
- **Cómo se ve:** como la Puerta del taller de la muestra: horizontal, letras y botones grandes para usar con el dedo. La muestra es la referencia de medidas y colores (ver [diseño](DISENO.md)).

## El encabezado

En todas las pantallas, sobre fondo oscuro:

- A la izquierda, la marca «UA» y «Puerta del taller».
- **La red:** «Conectada»; o «Sin internet» y, si hay algo en la cola, «· {n} captura(s) guardada(s) aquí». Sin internet, el encabezado lleva su línea ámbar abajo.
- **La hora** de la tablet, «{hh:mm}», al minuto.
- **Con alguien adentro,** a la derecha: su avatar con iniciales, su nombre de pila y «Salir».

| Botón | Qué pasa | A dónde lleva | Aviso |
|---|---|---|---|
| «Salir» | Cierra la sesión de la persona | ¿Quién eres? | — |

A los `personal.tablet_inactividad_seg` (90) segundos sin tocar la pantalla, la sesión se cierra sola y regresa a «¿Quién eres?», sin guardar lo que estaba a medias.

## Entrada con nombre y PIN

**Lee:** `personas` y `pines`.

- **«¿Quién eres?»:** un botón grande por cada persona con PIN, con su avatar y su nombre, por nombre. Una bloqueada dice «Bloqueado» y no abre su PIN.
- **Al escoger:** «{nombre}, tu PIN», cuatro puntos que se llenan al teclear, una línea para el error, «No soy {nombre}» y el teclado: 1 a 9, 0 y borrar.
- **Al cuarto dígito,** la tablet lo revisa sola (ver [la tablet](../apps/tablet.md#el-pin-sin-internet)): si es el de esa persona, entra a su inicio; si no, «PIN equivocado · {n} intentos más» y el PIN se borra.
- **Al llegar a `personal.pin_intentos_bloqueo` (5) equivocados:** «Bloqueado: pide al encargado que lo desbloquee en Personal». La tablet manda `produccion.registrar_bloqueo_pin` por su cola y la persona queda «Bloqueado» en «¿Quién eres?» hasta que baje su desbloqueo.
- **Vacío:** «Nadie tiene PIN todavía. Personal lo asigna en PIN del taller.»

| Botón | Qué pasa | A dónde lleva | Aviso |
|---|---|---|---|
| Un nombre | Escoge a la persona | Su PIN | — |
| «No soy {nombre}» | Regresa sin contar nada | ¿Quién eres? | — |
| Un número | Agrega el dígito (hasta 4) y borra el error | Al cuarto, su inicio si es su PIN | En la pantalla: «PIN equivocado · {n} intentos más» o «Bloqueado: pide al encargado que lo desbloquee en Personal» |
| Borrar | Quita el último dígito y borra el error | — | — |

## Inicio de cada persona

**Lee:** sus `registros_operacion` vigentes; `lotes`, `lote_tallas`, `bultos`, `flujo_operaciones` y `operaciones` para «Bultos para ti»; `productos`, `variantes` y `tallas` para los nombres.

**A la izquierda, su producción.** Solo cuentan las buenas de sus registros vigentes:

- «Hoy llevas», la cifra grande y «piezas»: las de hoy, por el día de negocio de cada registro.
- «{n} esta semana»: de su lunes a hoy (ver [paquete compartido](../cimientos/PAQUETE-COMPARTIDO.md#fechas-y-horas)).
- **Barras por hora,** con sus piezas arriba: una por hora, de la primera hora en que registró hoy a la hora actual.
- **Sus últimos tres registros:** «{n} {operación} · {bulto}»; con «guardada aquí» (ámbar) si sigue en la cola, «Cancelado» si Producción lo canceló y «No entró: avisa al encargado» (rojo) si el servidor lo apartó.
- **Si todavía no tiene registros:** en su lugar, «Tus operaciones»: las que hace de base, separadas por «·» («Hombros · Entrepierna · Canesú y hombros»).

**A la derecha, lo que puede hacer:** tres botones grandes, «Escanear bulto» (el principal), «Falla de máquina» y «Tomar consumible»; y **«Bultos para ti»**:

- Los bultos de lotes en proceso donde le toca una operación que hace de base y que tiene piezas listas para ella (tope mayor que 0), hasta `produccion.bultos_para_ti_max` (6). Primero los de lotes atorados o atrasados, luego en riesgo de atraso; dentro, por fecha de entrega y por el orden de la operación. Lo calcula la función del paquete compartido (ver [registros de operación](../modulos/produccion/registros-de-operacion.md#lo-que-baja-a-la-tablet)).
- Cada uno: el folio del bulto, «{prenda} · talla {t}», la operación y «{n} lista(s) para ti», con el color de la salud de su lote (rojo atorado o atrasado, ámbar en riesgo; ver [textos](TEXTOS.md#las-etapas-de-pedidos-notas-y-lotes)).
- **Vacío:** «Ningún bulto espera tu operación ahorita».

| Botón | Qué pasa | A dónde lleva | Aviso |
|---|---|---|---|
| «Escanear bulto» | — | Escanear bulto | — |
| «Falla de máquina» | — | ¿Qué máquina? | — |
| «Tomar consumible» | Empieza con todo en cero | ¿Qué tomas? | — |
| Un bulto de «Bultos para ti» | Abre esa operación con «Buenas» igual a las listas y «Dañadas» en 0 | Registrar una operación | — |

## Registrar una operación

**Lee:** el bulto, su lote, el flujo del lote y los registros de ese bulto. El tope lo calcula la función del paquete compartido (ver [lotes](../modulos/produccion/lotes.md#reglas), regla 8).

- «Volver»; el folio del bulto; «{prenda} · talla {t}»; «{para quién} · {lote}»; a la derecha «Operación», su nombre y «Cambiar».
- **«Tope»** y la cifra, con «salieron de {operación anterior}» o, en la primera después del corte, «piezas del bulto». El tope es lo que hizo la operación anterior en ese bulto (o las piezas del bulto) menos lo que esta operación ya registró ahí.
- **Dos contadores** con «−» y «+»: «Buenas» (empieza en el tope) y «Dañadas» (empieza en 0). Ninguno baja de 0.
- **Si buenas más dañadas pasan del tope:** «No puede pasar de {tope}: es lo que salió de la operación anterior», y el botón se apaga.
- **Con `produccion.tarifa_visible_tablet`:** debajo de la operación, «{tarifa} por pieza», o «Sin tarifa todavía».
- **«Registrar {n} pieza(s)»:** buenas más dañadas; apagado en 0 o arriba del tope.
- **«Cambiar»** abre la lista de las operaciones de ese bulto con piezas listas: primero las que hace de base esa persona, luego las demás en su orden; cada una con «{n} listas». Escoger una regresa a Registrar con esa operación.

| Botón | Qué pasa | A dónde lleva | Aviso |
|---|---|---|---|
| «Volver» | No registra nada | Inicio | — |
| «Cambiar» · una operación | Cambia la operación y vuelve a poner sus contadores | Registrar | — |
| «−» / «+» | Resta o suma una pieza | — | — |
| «Registrar {n} pieza(s)» | Guarda `produccion.registrar_operacion` en la cola; baja el tope del bulto, suma a «Hoy llevas» y a la semana, y queda en sus últimos registros | Inicio | Con internet: «{buenas} de {operación} registradas en {bulto}» y, si hubo dañadas, «, {n} dañadas». Sin internet (ámbar): «{buenas} de {operación} guardadas en la tablet. Se envían al volver el internet» |

Si el registro pasa del tope porque llegó otro antes, el servidor lo aplica igual y Producción ve la excepción (ver [registros de operación](../modulos/produccion/registros-de-operacion.md#reglas)): la tablet no dice nada.

## Escanear bulto

**Lee:** `bultos` y lo que necesita Registrar.

- «Volver»; la vista de la cámara; la casilla «Código del bulto», lista para escribir o para un lector de mano; y una línea para el error.
- **Al leer un código o con Enter,** busca el bulto por su folio, sin importar mayúsculas:
  - No es de un bulto: «Esa etiqueta no es de un bulto».
  - No está en la tablet: «No hay un bulto con ese código».
  - Existe: abre Registrar en la primera operación que hace de base esa persona con piezas listas en ese bulto; si no tiene ninguna, en la primera operación del bulto con piezas listas, sea de quien sea.
  - Ya no tiene piezas listas en ninguna operación: «Ese bulto ya pasó todas sus operaciones».
- **Sin permiso de la cámara:** la vista dice «Sin cámara: escribe el código o usa el lector» y la casilla sigue sirviendo.

| Botón | Qué pasa | A dónde lleva | Aviso |
|---|---|---|---|
| «Volver» | — | Inicio | — |
| Un código leído, o Enter | Busca el bulto | Registrar, o se queda con el error | En la pantalla, los de arriba |

## Falla de máquina

**Lee:** `maquinas`, sus `fallas` abiertas y `motivos_falla`.

**«¿Qué máquina?»:** «Volver» y las máquinas activas, primero las que trae esa persona. Cada una: su nombre y su folio; abajo, «La tuya» o, si tiene falla abierta, «{Reportada | En reparación} desde el {fecha}», marcada en rojo si la detuvo.

**«{máquina}: ¿qué le pasa?»:** «Otra máquina» y un botón por cada motivo vigente, en su orden («No prende», «Rompe el hilo», «Salta puntada», «Hace ruido», «Tira aceite», «Otra cosa» al inicio). Si la máquina ya tiene falla abierta, en lugar de los motivos: «Ya está reportada: {lo que le pasa}, {reportada | en reparación} desde el {fecha}».

| Botón | Qué pasa | A dónde lleva | Aviso |
|---|---|---|---|
| «Volver» | — | Inicio | — |
| Una máquina | — | ¿Qué le pasa? | — |
| «Otra máquina» | — | ¿Qué máquina? | — |
| Un motivo | Guarda `mantenimiento.reportar_falla` en la cola y la máquina queda «Reportada desde hoy» en la tablet | Inicio | Con internet: «Falla de {máquina} enviada a Mantenimiento: {lo que le pasa}». Sin internet (ámbar): «Falla de {máquina} guardada en la tablet; llega a Mantenimiento al volver el internet» |

Si al llegar la máquina ya tenía otra falla abierta, el servidor no crea otra (ver [máquinas, fallas y servicios](../modulos/mantenimiento/maquinas-fallas-y-servicios.md#reglas), regla 4). El folio FM- se ve en Mantenimiento.

## Tomar consumible

**Lee:** `materiales` (los consumibles activos, con su unidad de la tablet).

- **«¿Qué tomas?»:** «Volver» y un renglón por consumible, con su nombre, su contador «−» y «+» de 0 a `produccion.consumible_max_por_vez` (20) y su unidad de la tablet («agujas», «cuartos de litro», «bandas»). Un consumible nuevo de Compras sale solo.
- **«Tomar»,** apagado mientras todo está en 0.
- **Vacío:** «No hay consumibles dados de alta en Compras.»

| Botón | Qué pasa | A dónde lleva | Aviso |
|---|---|---|---|
| «Volver» | No descuenta nada | Inicio | — |
| «−» / «+» | Resta o suma uno | — | — |
| «Tomar» | Guarda `produccion.tomar_consumible` en la cola, con lo que lleva más de 0 | Inicio | «Tomaste {n} {unidad} y {n} {unidad}. Se descuenta del taller» |

El servidor lo pasa a la unidad del inventario y lo descuenta con quién lo tomó (ver [registros de operación](../modulos/produccion/registros-de-operacion.md#producciontomar_consumible)).

## Sin internet

- La tablet sigue igual: se entra con PIN, se registra, se reporta y se toman consumibles.
- **El encabezado** dice «Sin internet · {n} captura(s) guardada(s) aquí», con su línea ámbar.
- **Lo guardado** sale «guardada aquí» en sus últimos registros, y las fallas como «Reportada desde hoy».
- **Al volver la conexión** sube la cola sola y avisa «{n} captura(s) enviada(s) al volver el internet».

## Las pantallas del aparato

Antes de que alguien entre, según el estado de la tablet (ver [la tablet](../apps/tablet.md)):

- **«Registrar esta tablet»:** «Escribe el código que te dio la dueña», la casilla de 6 caracteres (con o sin guion) y «Registrar» → `admin.canjear_codigo`. El error sale debajo, con el mensaje de la acción (ver [dispositivos](../modulos/admin/dispositivos.md#admincanjear_codigo)).
- **«Preparando la tablet…»:** mientras baja su foto completa, con su avance. Nadie entra hasta que termina.
- **Revocada:** «Este aparato fue revocado: ya no entra.» y, mientras le quede cola, «Enviando {n} captura(s) guardada(s)…».
- **Actualizar:** «Hay una versión nueva. Actualiza para seguir.» y «Actualizar». La cola espera y no se pierde.

## Lo que no se copia de la muestra

- La franja «Muestra» (pantalla, orientación, quitar el internet, salir) y los PIN de prueba no existen.
- En la web la Puerta del taller no está en el menú: solo vive en la tablet.
- Registrar deja escoger la operación con «Cambiar»: la persona escoge su operación (ver [registros de operación](../modulos/produccion/registros-de-operacion.md#para-qué-sirve)).
- Las máquinas y los motivos salen de Mantenimiento: ni doce máquinas ni seis motivos fijos.
- Una máquina con falla abierta no muestra los motivos: dice que ya está reportada.
- La falla sin internet llega a Mantenimiento al volver la conexión y cuenta en lo guardado, igual que los consumibles y los bloqueos de PIN.
- El consumible tomado queda con quién lo tomó.
- Las barras van de la primera hora con registro a la hora actual, no de las 8 a las 13.
- El bulto sale con su folio completo, como en su etiqueta (B-2026-121-03).
- La tarifa por pieza sale si la dueña lo decide; la muestra nunca la enseñaba.
- Un registro apartado o cancelado se ve en los últimos registros.
- Escanear lee la etiqueta con la cámara y avisa si la etiqueta no es de un bulto.

## Cómo está hecho

**Fase 20, parte 5.** Las pantallas viven en `apps/tablet/src/pantallas/`, con los componentes de la tablet del sistema de diseño (`packages/interfaz/src/tablet/`):

- **`tablet.tsx`:** la tablet entera. Escoge la pantalla por el estado del aparato (el motor de [la tablet](../apps/tablet.md#cómo-está-hecho)) y, ya lista, por la persona adentro y su paso. Los pasos van en el estado de React, sin rutas: nada de la tablet se enlaza desde fuera (decisión 814). Cada captura va por la cola (`cola/capturas.ts`), y el aviso dice el texto con internet o el de «guardada en la tablet» según la red.
- **Por paso:**
  - `aparato.tsx` (registrar, preparando, revocada y actualizar);
  - `entrada.tsx` («¿Quién eres?» y el PIN);
  - `inicio.tsx`;
  - `registrar.tsx` (con «Cambiar»);
  - `escanear.tsx` (la cámara con el lector, y sin cámara, la casilla);
  - `falla.tsx`;
  - `consumible.tsx`.
- **Lo que leen** (`copia/lecturas.ts`, de la copia con los esquemas de `copia/esquemas.ts`, y que se vuelve a leer al cambiar con `liveQuery` de Dexie):
  - las personas con PIN;
  - la producción (hoy, la semana desde su lunes con `inicioDeSemana`, las barras por hora y los últimos tres);
  - el tope de cada operación de un bulto (`topeDelBulto`; en la primera después del corte, las piezas del bulto);
  - «Bultos para ti» (`bultosParaTi` del paquete compartido) con la salud de cada lote (`saludDeLote`). Para la salud, el último avance es su último registro y la última sincronización es la última bajada de la tablet; no cuenta días sin subir ni cuello de botella; sí lo atorado por una máquina parada de quien hace una operación con piezas esperando. `general.dias_de_trabajo` baja a la tablet para eso;
  - las máquinas con su falla abierta, los motivos y los consumibles. Un consumible sin unidad de la tablet sale en su unidad de inventario, como dice [materiales](../modulos/compras/materiales.md).
- **El encabezado** dice la red y lo guardado; la hora va al minuto. La sesión se cierra a los `personal.tablet_inactividad_seg` sin tocar la pantalla.
- **La prueba** es `pantallas/tablet.prueba.ts`: con Playwright en el Chrome de tablet contra la API real, recorre cada pantalla y cada botón, y deja sus capturas en `.revision/capturas/tablet/` para el [revisor de diseño](../../.claude/agents/revisor-diseno.md).
