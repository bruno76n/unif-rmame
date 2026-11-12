# Nómina

> **Qué cubre:** la nómina de cada semana: cuándo nace y para cuándo se paga, quién entra, la cuenta por persona (días, piezas, correcciones y descuentos), lo que no alcanzó a descontarse, pagarla con «Confirmar con Google» y congelarla, el descuento semanal de una persona y la fecha de pago que se mueve con el día de pago.
> **Estado:** Decidido.
> **Se construye en:** [fase 17 ●](../../fases/17-contaduria-por-pagar-facturas-gastos-y-nomina.md).
> **Se conecta con:** [asistencia](../personal/asistencia.md) · [personas](../personal/personas.md) · [tarifas](../personal/tarifas.md) · [registros de operación](../produccion/registros-de-operacion.md) · [configuración](../admin/configuracion.md) · [acceso con Google](../admin/acceso-con-google.md) · [bitácora](../admin/bitacora.md) · [contador y cuadres](contador-y-cuadres.md) · [pantallas de Contaduría](../../interfaz/fabrica/contaduria.md) · [flujo de asistencia y nómina](../../flujos/fabrica/10-asistencia-y-nomina.md) · [pantallas de Personal](../../interfaz/fabrica/personal.md) · [migración](../../MIGRACION.md)

## Para qué sirve

Cada semana se paga lo que cada quien ganó, una sola vez, y lo pagado no se toca. Ejemplo: el sábado 7 de noviembre Personal cierra la semana del 2 al 7 y nace su nómina, por pagar el martes 10. Sergio Gómez cobra $350 por día y vino 5 días y medio: $1,925. Lupita Ramos cobra por pieza: registró 1,240 piezas buenas de «Costados» a $1.20, $1,488; un registro suyo de la semana pasada que Producción canceló después de pagado entra en −$36; y tiene un descuento de $200 por semana por un préstamo: cobra $1,252. El martes Contaduría aprieta «Pagar nómina», confirma con Google y la nómina queda congelada.

## Reglas

1. **Una nómina por semana de asistencia.** Nace por pagar cuando Personal cierra la semana (ver [asistencia](../personal/asistencia.md)), con su fecha de pago: el siguiente `nomina.dia_pago` (martes) después de que termina la semana. Si la semana se reabre y se vuelve a cerrar, sigue siendo la misma nómina; mientras está abierta, no se paga.
2. **Se pagan en orden:** una nómina no se paga mientras una semana anterior siga sin pagar (por pagar, o abierta sin nómina). Lo que pasa a la siguiente y las correcciones dependen de la anterior.
3. **Quiénes entran:** quien cobra por tiempo o mixta y estuvo activo en la semana o se dio de baja dentro de ella; y cualquier persona con piezas por pagar, con correcciones o con algo que pasó de la nómina anterior, aunque se haya dado de baja antes. Se usa su ficha como esté al pagar.
4. **Por tiempo:** sus días de la semana (completo 1, medio 0.5, falta y sin capturar 0, solo entre su ingreso y su baja) por su pago por día, en tiempo y en mixta; 0 en pieza.
5. **Por piezas:** entra cada registro de la tablet de la persona que está vigente, ya tiene tarifa, es de una fecha hasta el fin de la semana y no ha entrado a otra nómina; así entran los atrasados y los que tomaron su tarifa después (ver [tarifas](../personal/tarifas.md)). Se pagan sus buenas, más sus dañadas si `nomina.pagar_piezas_danadas` (no), por la tarifa congelada en el registro. Los registros del corte entran igual. La pieza que Calidad rechaza se paga como se registró. Si la persona cobra por tiempo, el registro entra sin pagarse («cobra por tiempo») para que no vuelva a entrar.
6. **Correcciones:** un registro que ya se pagó y después se canceló entra a la siguiente nómina con lo que se le pagó, en negativo.
7. **Lo que se descuenta.** El bruto es tiempo + piezas + correcciones, y puede quedar negativo. Por descontar es el descuento semanal vigente + lo que pasó de la nómina anterior + lo que el bruto quedó bajo cero. Se descuenta hasta el bruto: descontado = el menor entre lo por descontar y el bruto (0 si es negativo), y total = el bruto (0 si es negativo) − descontado. El total nunca baja de 0.
8. **Lo que no alcanzó** (por descontar − descontado): con `nomina.descuento_mayor_que_lo_ganado` en «Perdonar», se perdona; con «Pasar a la siguiente semana», entra a la siguiente nómina de esa persona.
9. **El descuento semanal** es un monto fijo por semana (un préstamo, un adelanto de sueldo), con su motivo; una persona tiene uno vigente a lo más. Lo pone Contaduría; cambiarlo termina el vigente y crea otro, y 0 lo quita. Vale para cada nómina que se paga mientras está vigente, empezando por la más vieja por pagar.
10. **Pagar** pide «Confirmar con Google» y el total que vio la pantalla: si la cuenta ya no da ese total (llegó un registro o cambió una tarifa), no paga y pide revisarla. Por persona se puede anotar cómo se le pagó (efectivo o transferencia) y su referencia.
11. **Pagada, se congela:** la nómina y sus renglones guardan todo lo que se usó (la ficha, los días, cada registro con su tarifa, el descuento, lo que no alcanzó y las dos opciones) y no cambian. Lo que esté mal se corrige en la siguiente.
12. **Si la dueña cambia el día de pago,** cada nómina por pagar pasa a la siguiente fecha con ese día, a partir de mañana.

## Estados

| De | A | Qué pasa | Quién |
|---|---|---|---|
| — | `por_pagar` | Personal cierra la semana de asistencia | Personal |
| `por_pagar` | `por_pagar` | Cambia el día de pago: se mueve su fecha de pago | La dueña, en Configuración |
| `por_pagar` | `pagada` | «Pagar nómina», con «Confirmar con Google» | Contaduría |

El descuento semanal: nace `vigente` y pasa a `terminado` cuando se cambia o se quita.

## La cuenta de la nómina

Vive como función pura en `modulos/contaduria/dominio/`: recibe lo que dicen las tablas de abajo y las lecturas, y regresa cada renglón con su aviso y los totales (reglas 3 a 8). La usan `contaduria.pagar_nomina` y la consulta de Nómina (fase 19): lo que ve la pantalla es lo que se paga.

| Dato | De dónde sale |
|---|---|
| La semana, si está cerrada, las semanas anteriores todavía abiertas, quién lleva asistencia y sus días | `personal.asistencia_para_nomina(semana)` (ver [asistencia](../personal/asistencia.md#lecturas)) |
| La ficha de cada persona: área, puesto, forma de pago, pago por día, ingreso y baja | `personal.fichas_para_nomina(personas)` (ver [personas](../personal/personas.md#lecturas)) |
| Los registros nuevos y los cancelados después de pagados | `produccion.registros_para_nomina(desde, hasta)`, desde el inicio de la semana de la última nómina pagada (desde el principio, en la primera) hasta ahora; de ellos cuentan los que todavía no tienen su renglón `pago` o `correccion` (ver [registros de operación](../produccion/registros-de-operacion.md#lecturas)) |
| Lo que pasó de la nómina anterior | El renglón de esa persona en la última nómina pagada, si lo que no alcanzó se fue a la siguiente semana |
| El descuento y las dos opciones | El descuento vigente de cada persona y los parámetros de abajo |

## La tabla `nominas`

| Columna | Tipo | Nulo | Qué es |
|---|---|---|---|
| `id` | uuid | no | Llave |
| `asistencia_semana_id` | uuid | no | → `asistencia_semanas.id`. Único: una nómina por semana |
| `fecha_inicio` · `fecha_fin` | date | no | Los de la semana |
| `fecha_pago` | date | no | Regla 1; la mueve la regla 12 |
| `estado` | text | no | CHECK (`por_pagar`, `pagada`). default `por_pagar` |
| `total_tiempo_centavos` · `total_piezas_centavos` · `total_correcciones_centavos` · `total_descontado_centavos` · `total_centavos` | bigint | sí | La suma de sus renglones, al pagarla |
| `personas` | integer | sí | Cuántos renglones, al pagarla |
| `regla_piezas_danadas` · `regla_descuento_mayor` | boolean · text | sí | Las dos opciones con que se pagó |
| `pagada_en` · `pagada_por` · `confirmado_con_google_en` | timestamptz · uuid · timestamptz | sí | `pagada_por` → `usuarios.id` |

CHECK: en `pagada`, todo lo de arriba lleno. Lleva las columnas comunes (ver [base de datos](../../cimientos/BASE-DE-DATOS.md#columnas-comunes)). **Índices:** único (`asistencia_semana_id`) · (`estado`, `fecha_inicio`).

## La tabla `nomina_lineas`

El renglón de una persona en una nómina pagada, con todo lo que se usó, congelado.

| Columna | Tipo | Nulo | Qué es |
|---|---|---|---|
| `id` | uuid | no | Llave |
| `nomina_id` | uuid | no | → `nominas.id` |
| `persona_id` | uuid | no | → `personas.id`. Único con `nomina_id` |
| `area` · `ubicacion_id` · `puesto` · `forma_pago` | text · uuid · text · text | no · sí · no · no | Copiados de su ficha al pagar; la ubicación, si es de una tienda |
| `baja_en` | date | sí | Copiada, si está dada de baja |
| `dias` | numeric(3,1) | no | default 0 (regla 4) |
| `pago_dia_centavos` | bigint | sí | Copiado. Vacío en `pieza` |
| `importe_tiempo_centavos` | bigint | no | Regla 4 |
| `piezas` · `importe_piezas_centavos` | integer · bigint | no | Las pagadas y su importe (regla 5) |
| `correcciones_centavos` | bigint | no | CHECK ≤ 0 (regla 6) |
| `bruto_centavos` | bigint | no | Tiempo + piezas + correcciones. Puede ser negativo |
| `descuento_nomina_id` · `descuento_centavos` · `descuento_motivo` | uuid · bigint · text | sí · no · sí | El descuento semanal vigente al pagar, copiado; 0 sin descuento |
| `arrastre_centavos` | bigint | no | Lo que pasó de la nómina anterior |
| `descontado_centavos` | bigint | no | Regla 7 |
| `no_alcanzo_centavos` · `destino_no_alcanzo` | bigint · text | no · sí | Regla 8. El destino, CHECK (`perdonado`, `siguiente_semana`), lleno si algo no alcanzó |
| `total_centavos` | bigint | no | CHECK ≥ 0 (regla 7) |
| `medio_pago` · `referencia_pago` | text | sí | CHECK (`efectivo`, `transferencia`); la referencia, de 3 a 30 |

Lleva las columnas comunes. **Índices:** único (`nomina_id`, `persona_id`) · (`persona_id`).

## La tabla `nomina_linea_piezas`

Cada registro de la tablet que entró a una nómina, con su tarifa congelada: así un registro se paga una sola vez y se corrige una sola vez.

| Columna | Tipo | Nulo | Qué es |
|---|---|---|---|
| `id` | uuid | no | Llave |
| `nomina_linea_id` | uuid | no | → `nomina_lineas.id` |
| `registro_operacion_id` | uuid | no | → `registros_operacion.id`. Único con `tipo` |
| `tipo` | text | no | CHECK (`pago`, `correccion`) |
| `fecha` · `flujo_operacion_id` · `piezas_buenas` · `piezas_danadas` | | no | Copiados del registro |
| `piezas_pagadas` | integer | no | Regla 5; en `correccion`, las que se pagaron |
| `tarifa_centavos` | bigint | no | La congelada en el registro |
| `importe_centavos` | bigint | no | Pagadas × tarifa, 0 si no se paga; en `correccion`, lo que se pagó, en negativo |
| `se_paga` | boolean | no | Falso si la persona cobra por tiempo |
| `motivo_no_pago` | text | sí | CHECK (`cobra_por_tiempo`). Lleno si `se_paga` es falso |

Lleva las columnas comunes. **Índices:** único (`registro_operacion_id`, `tipo`) · (`nomina_linea_id`).

## La tabla `descuentos_nomina`

| Columna | Tipo | Nulo | Qué es |
|---|---|---|---|
| `id` | uuid | no | Llave |
| `persona_id` | uuid | no | → `personas.id` |
| `monto_semanal_centavos` | bigint | no | CHECK > 0, en pesos enteros |
| `motivo` | text | no | De `general.largo_minimo_motivo` (5) letras o más |
| `estado` | text | no | CHECK (`vigente`, `terminado`). default `vigente` |
| `terminado_en` · `terminado_por` | timestamptz · uuid | sí | CHECK: llenos en `terminado` |

Lleva las columnas comunes; `creado_en` dice desde cuándo vale. **Índices:** único (`persona_id`) donde está `vigente`.

## Acciones

Las dos son de la web, con el departamento Contaduría y el permiso «ven sueldos y tarifas».

### `contaduria.guardar_descuento_semanal`

| | |
|---|---|
| **Pantalla** | Nómina · «Descuento semanal» → ventana Descuento semanal · «Guardar descuento» |
| **Quién** | Contaduría · «ven sueldos y tarifas» |
| **Recibe** | `persona_id` · `monto_semanal_centavos` (en pesos enteros; 0 lo quita) · `motivo`, si hay monto · `version` del vigente, si tiene |
| **Reglas y errores** | `400`: «Escoge a la persona.» · «Escribe el descuento en pesos; 0 lo quita.» · «Escribe por qué se le descuenta.»<br>`422 persona_de_baja`: «{persona} está dada de baja.» (al poner un monto)<br>`422 sin_descuento`: «{persona} no tiene descuento semanal.» (0 sin vigente) |
| **Escribe** | El vigente, `terminado`, con quién y cuándo; y, si hay monto, el nuevo `vigente` |
| **Llama** | `personal.fichas_para_nomina` |
| **Regresa** | «{persona}: {monto} de descuento cada semana, desde esta nómina» o «{persona} ya no tiene descuento semanal» |
| **Eventos** | `descuento_nomina.cambiado` |
| **Bitácora** | «Descuento semanal de {persona}: {antes} → {después} · {motivo}», con `sensible_sueldos` |

### `contaduria.pagar_nomina`

| | |
|---|---|
| **Pantalla** | Nómina · «Pagar nómina» y Pendientes · Nómina · «Pagar nómina», sin ventana → «Confirmar con Google» («Semana del {semana}. Se paga en cuanto confirmes.») |
| **Quién** | Contaduría · «ven sueldos y tarifas» · «Confirmar con Google» |
| **Recibe** | `nomina_id` · `total_visto_centavos`: el total que mostró la pantalla · `renglones`, opcional: `persona_id`, `medio_pago` (`efectivo` o `transferencia`) y `referencia_pago` · `version` de la nómina |
| **Reglas y errores** | `400`: «La referencia lleva de 3 a 30 letras»<br>`422 asistencia_sin_cerrar`: «Asistencia sin cerrar: Personal tiene que cerrar la semana del {semana}»<br>`422 nomina_pagada`: «La nómina del {semana} ya está pagada»<br>`422 semana_anterior_sin_pagar`: «Primero paga la nómina del {semana anterior}» (regla 2)<br>`422 persona_fuera_de_nomina`: «{persona} no está en esta nómina.»<br>`422 nomina_cambio`: «La nómina cambió desde que la abriste: ahora suma {total}. Revísala y vuelve a pagar»<br>Aviso por persona, si algo no alcanzó: «{persona}: se perdonan {monto}» o «{persona}: pasan {monto} a la siguiente semana» |
| **Escribe** | La cuenta, congelada (regla 11): la nómina `pagada`, con sus totales, cuántas personas, quién, cuándo, la confirmación y las dos opciones; un renglón por persona; y por cada registro nuevo un renglón `pago` (también los que no se pagan), y por cada uno cancelado después de pagado, uno `correccion` |
| **Llama** | `personal.asistencia_para_nomina` · `personal.fichas_para_nomina` · `produccion.registros_para_nomina` |
| **Regresa** | «Nómina del {semana} pagada» |
| **Eventos** | `nomina.pagada` |
| **Bitácora** | «Pagó la nómina del {semana} · confirmado con Google», con `sensible_sueldos` y la confirmación; los totales en `despues` |

Pagar toma un solo candado para toda la nómina: dos pagos nunca corren a la vez. El único de `nomina_linea_piezas` asegura además que un registro no se pague dos veces.

## Acciones internas

### `contaduria.crear_nomina_semana`

| | |
|---|---|
| **La llama** | `personal.cerrar_semana_asistencia` (ver [asistencia](../personal/asistencia.md)) |
| **Recibe** | `asistencia_semana_id` · `fecha_inicio` · `fecha_fin` |
| **Reglas** | Si la semana ya tiene nómina (se reabrió y se volvió a cerrar), regresa esa |
| **Escribe** | La nómina, `por_pagar`, con las fechas de la semana y su fecha de pago (regla 1) |
| **Regresa** | `nomina_id` · `fecha_pago` |
| **Eventos** | `nomina.lista_para_pagar`: el pendiente de Contaduría pasa a «Por pagar» |

La bitácora es el renglón «Cerró la asistencia del {semana}» de Personal.

### `contaduria.mover_fecha_pago_nomina`

| | |
|---|---|
| **La llama** | `admin.cambiar_parametro`, al cambiar `nomina.dia_pago` (ver [configuración](../admin/configuracion.md)) |
| **Recibe** | `dia_pago`: el nuevo |
| **Escribe** | Cada nómina `por_pagar`, con la siguiente fecha con ese día a partir de mañana (regla 12) |
| **Regresa** | Las nóminas que cambiaron, con su fecha de antes y la nueva |
| **Eventos** | `nomina.fecha_pago_cambiada` |

La bitácora es el renglón de Configuración y, con la misma clave, uno por nómina que se movió: «Fecha de pago de la nómina del {semana}: {antes} → {después}».

## Lecturas

### `contaduria.estado_nomina_semana(semana)`

| | |
|---|---|
| **La usa** | Personal, al reabrir una semana (`nomina_pagada`, ver [asistencia](../personal/asistencia.md)) |
| **Regresa** | Si la semana tiene nómina, su estado y su fecha de pago |

## Parámetros

Los cambia solo la dueña, en Configuración (ver [configuración](../admin/configuracion.md)). Los tres van en «Decisiones de operación».

| Parámetro | Valor inicial | Para qué |
|---|---|---|
| `nomina.dia_pago` | Martes (una opción de domingo a sábado) | El día en que se paga la nómina de la semana que terminó |
| `nomina.pagar_piezas_danadas` | No | Si las piezas dañadas se pagan como las buenas |
| `nomina.descuento_mayor_que_lo_ganado` | Perdonar (o «Pasar a la siguiente semana») | Qué pasa con lo que no alcanzó a descontarse |

Usa también `general.largo_minimo_motivo`.

## Permisos

- Pagar la nómina y poner descuentos: Contaduría con «ven sueldos y tarifas»; pagar pide además «Confirmar con Google».
- Sin «ven sueldos y tarifas» no viajan montos de nómina, descuentos, pagos por día ni tarifas: viajan vacíos con `oculto` y la pantalla pinta «••••». La bitácora de la nómina lleva `sensible_sueldos` (ver [bitácora](../admin/bitacora.md)).

## Eventos

`nomina.lista_para_pagar` · `nomina.fecha_pago_cambiada` · `nomina.pagada` · `descuento_nomina.cambiado`.

## Lo que llega después

- **Fase 18:** la nómina pagada del mes en el paquete del contador, con cuántas semanas, y el aviso «La nómina del {semana} sigue por pagar: no entra en este paquete» (ver [contador y cuadres](contador-y-cuadres.md)).
- **Fase 19:** Nómina, con su gráfica, sus grupos por área y la ventana Descuento semanal, y la nómina en Pendientes de Contaduría.
- **Fase 21:** el [flujo de asistencia y nómina](../../flujos/fabrica/10-asistencia-y-nomina.md), de punta a punta.

## Cómo está hecho

**Fase 17, parte 4.**

- **Las tablas** `nominas`, `nomina_lineas`, `nomina_linea_piezas` y `descuentos_nomina` están en `apps/api/src/modulos/contaduria/tablas.ts` (migración `0061`), con sus CHECK. Los renglones y sus piezas solo crecen. Cada renglón cuadra con su bruto, lo descontado, lo que no alcanzó y su total, que nunca baja de 0. El único (`registro_operacion_id`, `tipo`) hace que un registro se pague y se corrija una sola vez.
- **La cuenta** es `contarNomina` (`dominio/cuenta-nomina.ts`), una función pura con las reglas 3 a 8. Medio día con un pago impar se redondea una vez, al total de la semana (decisión 711). Quien cobra por tiempo registra sus piezas sin cobrar («cobra por tiempo»).
- **Lo que junta** `cuentaDeLaNomina` (`dominio/nomina.ts`):
  - de Personal, `personal.asistencia_para_nomina` y `personal.fichas_para_nomina`; se usa la ficha como está al pagar (decisión 713);
  - de Producción, `produccion.registros_para_nomina`, desde el inicio de la semana de la última nómina pagada hasta ahora, con un día de holgura (decisión 712);
  - de sus tablas, lo ya pagado o corregido, lo que pasó de la anterior y los descuentos vigentes;
  - las dos opciones, de sus parámetros.
- **Las acciones** (`acciones/nomina.ts`, contratos en `packages/compartido/src/contratos/contaduria/nomina.ts`), las dos con «ven sueldos y tarifas»:
  - `pagar_nomina` toma un candado para toda la nómina y la fila con su versión, y revisa la semana cerrada, el orden y el total visto. Escribe la cuenta congelada y deja la bitácora como plantilla con los totales en campos de sueldo (`camposDeSueldo` de Contaduría), así queda `sensible_sueldos`.
  - `guardar_descuento_semanal` toma un candado por persona y la versión del vigente; lo termina y crea el nuevo. Su bitácora tapa los montos.
- **Las internas** (`internas/nomina.ts`):
  - `crear_nomina_semana` la llama `personal.cerrar_semana_asistencia`, con su fecha de pago (`fechaDePago`);
  - `mover_fecha_pago_nomina` la llama `admin.cambiar_parametro` y regresa el renglón de bitácora de cada nómina que movió;
  - la lectura `estado_nomina_semana` la usa `personal.reabrir_semana_asistencia`.
- **Los parámetros** `nomina.dia_pago`, `nomina.pagar_piezas_danadas` y `nomina.descuento_mayor_que_lo_ganado` están en `contaduria/parametros.ts`.
- **Pruebas:**
  - `dominio/cuenta-nomina.prueba.ts`: el ejemplo del archivo, las reglas y, con fast-check, el total y cada registro una vez;
  - `acciones/pagar-nomina.prueba.ts`: Google, el total visto, el orden, la semana cerrada, dos a la vez, congelada, los tardíos y las correcciones, sin permiso y la bitácora;
  - `acciones/guardar-descuento-semanal.prueba.ts`;
  - `internas/mover-fecha-pago-nomina.prueba.ts`;
  - `nomina.azar.prueba.ts`: varias semanas al azar con registros tardíos, tarifas después y cancelaciones.
  - Las ayudas están en `nucleo/pruebas/nomina-de-prueba.ts`. La cuenta de prueba `contaduria_sueldos` tiene «ven sueldos y tarifas». El módulo `contaduria` de prueba se quitó (decisión 714).
