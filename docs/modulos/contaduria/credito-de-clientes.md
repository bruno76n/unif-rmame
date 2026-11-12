# Crédito de clientes

> **Qué cubre:** el crédito que Contaduría le da a cada cliente externo: su límite, sus días y su semáforo; el semáforo que sugiere el sistema; y lo que Ventas lee de él, sin montos.
> **Estado:** Decidido.
> **Se construye en:** [fase 15 ●](../../fases/15-contaduria-terceros-credito-y-cobranza.md).
> **Se conecta con:** [cuentas por cobrar](cuentas-por-cobrar.md) · [pagos y saldo a favor](pagos-y-saldo-a-favor.md) · [anticipos](anticipos.md) · [terceros y deudas](terceros-y-deudas.md) · [clientes](../ventas/clientes.md) · [pedidos](../ventas/pedidos.md) · [configuración](../admin/configuracion.md) · [pantallas de Contaduría](../../interfaz/fabrica/contaduria.md) · [pantallas de Ventas](../../interfaz/fabrica/ventas.md) · [alertas e indicadores](../direccion/alertas-e-indicadores.md)

## Para qué sirve

Ventas solo vende a crédito a quien Contaduría se lo dio, y nunca ve cuánto debe. Ejemplo: Distribuidora Escolar Zamora, mayorista, nace sin crédito y con 15 días. Contaduría le pone un límite de $80,000 y Ventas ya puede escoger «Crédito 15 días». Cuando debe $68,000 (85 % de su límite), el sistema sugiere «Cerca del límite»; Contaduría lo pone y Ventas ve «Cerca de su límite de crédito». Si se le vence una nota hace más de 30 días, sugiere «Detenido»; con el semáforo en Detenido, Ventas no confirma sus pedidos hasta que Contaduría lo libere.

## Reglas

1. **Un crédito por cliente,** que nace con el cliente: Ventas lo abre al darlo de alta. Nace sin crédito (límite 0), con los días iniciales de su tipo (`contaduria.credito_dias_mayorista`, 15, si es mayorista; `contaduria.credito_dias_general`, 30, los demás) y «Al corriente».
2. **El límite** va en pesos enteros. 0 es «Sin crédito»: Ventas no deja escoger «Crédito», solo contado o anticipo.
3. **Los días de crédito** se suman a la fecha de entrega cuando el pedido es a crédito. El pedido los congela al guardarse: cambiarlos no toca los pedidos ya guardados.
4. **El semáforo lo pone Contaduría a mano;** el sistema solo lo sugiere:

   | Sugiere | Cuándo |
   |---|---|
   | Detenido | Algo vencido hace más de `contaduria.credito_dias_vencido_detenido` (30) días, o un saldo que pasa su límite |
   | Cerca del límite | Algo vencido de 1 a 30 días, o un saldo que usa más de `contaduria.credito_porcentaje_cerca_limite` (80 %) de su límite |
   | Al corriente | Lo demás |

   Sin crédito, la regla del límite no aplica: solo cuenta lo vencido.
5. **El uso del límite** es el saldo por cobrar del cliente entre su límite: ámbar arriba del 80 %, rojo si pasa el límite.
6. **Ventas solo lee** el semáforo, si tiene crédito, sus días y si está cerca del límite: nunca un monto. Con el semáforo en Detenido, Ventas no confirma sus pedidos (ver [pedidos](../ventas/pedidos.md)).

## Estados del semáforo

| De | A | Qué pasa | Quién |
|---|---|---|---|
| — | `al_corriente` | Nace con el cliente | Ventas |
| Cualquiera | Cualquier otro | «Semáforo de crédito» | Contaduría |

## La tabla `credito_clientes`

| Columna | Tipo | Nulo | Qué es |
|---|---|---|---|
| `id` | uuid | no | Llave |
| `cliente_id` | uuid | no | → `clientes.id`. Único |
| `tercero_id` | uuid | no | → `terceros.id`: el del cliente |
| `limite_centavos` | bigint | no | default 0. CHECK ≥ 0 y en pesos enteros (múltiplo de 100). 0 = sin crédito |
| `dias_credito` | integer | no | CHECK > 0 |
| `semaforo` | text | no | CHECK (`al_corriente`, `cerca_del_limite`, `detenido`). default `al_corriente` |
| `semaforo_cambiado_en` · `semaforo_cambiado_por` | timestamptz · uuid | sí | |
| `limite_cambiado_en` · `limite_cambiado_por` | timestamptz · uuid | sí | |

Lleva las columnas comunes (ver [base de datos](../../cimientos/BASE-DE-DATOS.md#columnas-comunes)). **Índices:** único (`cliente_id`) · (`tercero_id`) · (`semaforo`) donde no es `al_corriente`. `cliente_id` lleva su `@llavePendiente` hasta la fase 16. Su renglón es también el candado del dinero del cliente: lo toma quien va a leer y cambiar su saldo a favor (ver [pagos y saldo a favor](pagos-y-saldo-a-favor.md#reglas)).

## El semáforo sugerido

Vive como función pura en `modulos/contaduria/dominio/`: recibe el límite, el saldo y el vencimiento de cada cuenta por cobrar del cliente, el día de hoy y los dos parámetros, y regresa el uso del límite y el semáforo sugerido (reglas 4 y 5). La usan `contaduria.cambiar_limite_credito`, `contaduria.credito_de_cliente` y las consultas de Contaduría (fase 19).

## Acciones

Todas son de la web, con el departamento Contaduría.

### `contaduria.cambiar_limite_credito`

| | |
|---|---|
| **Pantalla** | Contaduría · cajón del cliente · «Cambiar límite» → ventana Límite de crédito · «Guardar límite» |
| **Recibe** | `cliente_id` · `limite_centavos` (≥ 0, en pesos enteros; 0 = sin crédito) · `version` del crédito |
| **Reglas y errores** | `400` en `limite_centavos`: «Escribe el límite en pesos, sin centavos.»<br>El mismo límite: responde bien sin escribir nada |
| **Escribe** | El límite, quién y cuándo. El semáforo no cambia solo |
| **Regresa** | El semáforo sugerido nuevo. «Límite de crédito de {cliente}: {monto}» (si antes era 0, sigue «. Ventas ya le puede vender a crédito») o «{cliente} queda sin crédito: de contado o con anticipo» |
| **Eventos** | `credito.limite_cambiado` |
| **Bitácora** | «Límite de crédito de {cliente}: {antes} → {nuevo}», con el límite en `antes` y `despues` |

### `contaduria.cambiar_dias_credito`

| | |
|---|---|
| **Pantalla** | Ventana Límite de crédito · «Días de crédito» (campo nuevo) |
| **Recibe** | `cliente_id` · `dias_credito` (entero > 0) · `version` del crédito |
| **Reglas y errores** | `400` en `dias_credito`: «Escribe los días de crédito.»<br>Aviso que no detiene: «Los pedidos ya guardados conservan sus días» |
| **Escribe** | Los días. Los pedidos ya guardados no cambian (regla 3) |
| **Regresa** | «Crédito de {cliente}: {n} días» |
| **Eventos** | `credito.dias_cambiados` |
| **Bitácora** | «Días de crédito de {cliente}: {antes} → {nuevo}» |

### `contaduria.cambiar_semaforo_credito`

| | |
|---|---|
| **Pantalla** | Contaduría · Cuentas por cobrar · Antigüedad de saldos por cliente · selector «Semáforo de crédito» |
| **Recibe** | `cliente_id` · `semaforo` (`al_corriente`, `cerca_del_limite` o `detenido`) · `version` del crédito |
| **Reglas y errores** | El mismo semáforo: responde bien sin escribir nada |
| **Escribe** | El semáforo, quién y cuándo |
| **Regresa** | «Semáforo de crédito de {cliente}: {nuevo, en minúsculas}» |
| **Eventos** | `credito.semaforo_cambiado`: en vivo a Ventas («Detenido por crédito», «Cerca de su límite de crédito») |
| **Bitácora** | «Semáforo de {cliente}: {antes} → {nuevo}» |

## Acciones internas

### `contaduria.abrir_credito_cliente`

| | |
|---|---|
| **La llama** | `ventas.crear_cliente`, después de crear el cliente (ver [clientes](../ventas/clientes.md)) |
| **Recibe** | `cliente_id` · `tercero_id` · `tipo_cliente` (`escuela`, `mayorista` o `empresa_otro`) |
| **Reglas** | Si el cliente ya tiene crédito, regresa el que hay y no escribe nada |
| **Escribe** | El crédito de la regla 1 |
| **Regresa** | `credito_cliente_id` |
| **Eventos** | `credito.abierto` |

La bitácora es el renglón del alta del cliente, que dice «sin crédito, {n} días».

## Lecturas

### `contaduria.credito_de_cliente(cliente)`

| | |
|---|---|
| **La usa** | Ventas: el pedido nuevo, confirmar un pedido, la lista de clientes y sus pendientes |
| **Regresa** | El semáforo, si tiene crédito (límite mayor que 0), sus días de crédito y si está cerca del límite (regla 5). Sin montos |

## Parámetros

Los cambia solo la dueña, en Configuración (ver [configuración](../admin/configuracion.md)). Todos van en «Parámetros».

| Parámetro | Valor inicial | Para qué |
|---|---|---|
| `contaduria.credito_dias_mayorista` | 15 días | Los días de crédito con que nace un cliente mayorista |
| `contaduria.credito_dias_general` | 30 días | Los días de crédito con que nacen los demás clientes |
| `contaduria.credito_porcentaje_cerca_limite` | 80 % | El uso del límite que sugiere «Cerca del límite» y pinta la barra en ámbar |
| `contaduria.credito_dias_vencido_detenido` | 30 días | Los días de vencido que sugieren «Detenido» |

## Permisos

- Cambiar el crédito: Contaduría.
- El límite, el uso y los saldos los ve solo quien tiene Contaduría. Ventas lee la lectura de arriba, sin montos.

## Eventos

`credito.abierto` · `credito.limite_cambiado` · `credito.dias_cambiados` · `credito.semaforo_cambiado`.

## Lo que llega después

- **Fase 16:** Ventas abre el crédito al dar de alta un cliente y lo lee al guardar y al confirmar un pedido; y ya no se cambia el crédito de un cliente dado de baja (`cliente_dado_de_baja`: «{cliente} está dado de baja»), con `ventas.estado_cliente`.
- **Fase 18:** la alerta de Dirección del cliente que concentra el saldo por cobrar (ver [alertas e indicadores](../direccion/alertas-e-indicadores.md)).
- **Fase 19:** el cajón del cliente, la ventana Límite de crédito y Antigüedad de saldos con su selector.

## Cómo está hecho

**Fase 15, parte 1.** En `modulos/contaduria/`:

- **La tabla** `credito_clientes` (migración `0048`, junto con `cuentas_por_cobrar`, decisión 662), con sus CHECK: el límite ≥ 0 en pesos enteros, los días > 0 y los tres semáforos. `cliente_id` lleva su `@llavePendiente`. Los cuatro parámetros están en `parametros.ts`.
- **El semáforo sugerido** es `semaforoSugerido` (`dominio/semaforo-sugerido.ts`), una función pura: suma los saldos, toma el vencido más viejo con saldo y compara contra el límite con `aplicarPorcentaje`; sin crédito, el límite no cuenta. «Cerca del límite» incluye pasarlo (decisión 663). `dominio/credito.ts` lee el crédito con el nombre de su tercero y le pasa las cuentas con saldo del cliente y los parámetros.
- **`abrir_credito_cliente`** (`internas/credito.ts`) inserta con `ON CONFLICT DO NOTHING` sobre `cliente_id`: dos a la vez dejan uno, y la segunda regresa el que hay.
- **Las tres acciones** (`acciones/credito.ts`, contratos en `packages/compartido/src/contratos/contaduria/credito.ts`) revisan la versión del crédito (su renglón queda bloqueado) y, con el mismo valor, responden con `sinBitacora` sin subir la versión. El límite regresa el semáforo sugerido con el límite nuevo y nunca toca el semáforo.
- **`credito_de_cliente`** (`lecturas/credito.ts`) regresa solo el semáforo, `tiene_credito`, los días y `cerca_del_limite`. `credito_clientes` avisa en vivo a Contaduría y a Ventas (decisión 664).
- **Pruebas:** `internas/abrir-credito-cliente.prueba.ts`, `dominio/semaforo-sugerido.prueba.ts` (el ejemplo y fast-check), `acciones/cambiar-limite-credito.prueba.ts`, `acciones/cambiar-dias-credito.prueba.ts`, `acciones/cambiar-semaforo-credito.prueba.ts` y `lecturas/credito-de-cliente.prueba.ts`. Las ayudas, en `nucleo/pruebas/contaduria-de-prueba.ts`.
