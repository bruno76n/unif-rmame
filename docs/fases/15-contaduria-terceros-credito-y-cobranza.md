# Fase 15: Contaduría: terceros, crédito y cobranza ●

> **Etapa:** Módulos.
> **Estado:** Terminada.
> **Antes de empezar:** lee la [forma de trabajo](../trabajo/FORMA-DE-TRABAJO.md) y la [revisión de fase](../trabajo/REVISION-DE-FASE.md).
> **Se conecta con:** [fases](FASES.md) · [fase 14](14-inventario-recepcion-del-taller-conteos-ajustes-y-reabasto.md) · [fase 16](16-ventas-a-externos.md)

## Objetivo

Contaduría sabe cuánto le debe cada cliente y desde cuándo, cobra sin pasarse de lo que se debe y lleva al centavo el anticipo de cada pedido y el saldo a favor de cada cliente. Ventas solo ve el semáforo de crédito y si una nota ya se pagó. Todo queda listo para que Ventas lo llame en la fase 16.

## Depende de

- [Fase 14](14-inventario-recepcion-del-taller-conteos-ajustes-y-reabasto.md), terminada y en verde.

## Qué se construye

### Parte 1 · Crédito de clientes

**Construye:** la tabla `credito_clientes`; la interna `contaduria.abrir_credito_cliente`; `contaduria.cambiar_limite_credito`, `contaduria.cambiar_dias_credito` y `contaduria.cambiar_semaforo_credito`; la lectura `contaduria.credito_de_cliente`; y el semáforo sugerido en `modulos/contaduria/dominio/`.

**Leer:**
- [crédito de clientes](../modulos/contaduria/credito-de-clientes.md) — todo.
- [configuración](../modulos/admin/configuracion.md) — cómo se declaran los parámetros.

### Parte 2 · Cuentas por cobrar y pagos

**Construye:** las tablas `cuentas_por_cobrar`, `pagos`, `aplicaciones_pago` y `saldo_favor_movimientos`, y la lista «Cuentas de la fábrica» con su siembra; las internas `contaduria.crear_cuenta_por_cobrar` y `contaduria.aplicar_nota_credito`; `contaduria.registrar_pago_recibido` a una nota, en efectivo o en una cuenta de la fábrica; `contaduria.cancelar_pago`, con lo que regresa en las cuentas por cobrar; las lecturas `contaduria.estado_pago_notas` y `contaduria.saldo_por_cobrar_de_cliente`; y la antigüedad y el saldo por cobrar en `modulos/contaduria/dominio/`.

**Leer:**
- [cuentas por cobrar](../modulos/contaduria/cuentas-por-cobrar.md) — todo.
- [pagos y saldo a favor](../modulos/contaduria/pagos-y-saldo-a-favor.md) — las reglas, las tres tablas, registrar y cancelar un pago.
- [autorizaciones](../modulos/direccion/autorizaciones.md) — el efecto de la nota de crédito corre dentro de la decisión de Dirección.

### Parte 3 · Anticipos y saldo a favor

**Construye:** la tabla `anticipos`; las internas `contaduria.aplicar_anticipo_a_nota`, `contaduria.regresar_anticipo_a_pedido` y `contaduria.pasar_anticipo_a_favor`; la lectura `contaduria.anticipo_del_pedido`; `contaduria.aplicar_saldo_a_favor` a una nota y `contaduria.devolver_saldo_a_favor`; y lo que cancelar un pago cancela de su anticipo y de su saldo a favor.

**Leer:**
- [anticipos](../modulos/contaduria/anticipos.md) — todo.
- [pagos y saldo a favor](../modulos/contaduria/pagos-y-saldo-a-favor.md) — el saldo a favor, aplicarlo y devolverlo.

## Cómo se construye

- Un solo agente, una parte a la vez.
- Ventas todavía no existe: las pruebas usan clientes, pedidos, notas de entrega y notas de crédito de prueba, con sus llaves pendientes, y llaman directo las internas que Ventas llamará.
- Los saldos se prueban con datos al azar y con varias conexiones al mismo tiempo: pagos, notas de crédito, saldo a favor y cancelaciones nunca dejan un saldo fuera de su lugar.
- No va en esta fase: las pantallas y las consultas de Contaduría (fase 19). Los datos de la muestra de cobranza se cargan en la fase 16, con los clientes y las notas.

## Excepciones permitidas

- Los clientes, los pedidos, las notas de entrega y las notas de crédito llegan en la fase 16: sus llaves llevan `@llavePendiente`.
- El pago a un pedido y el saldo a favor aplicado a un pedido se construyen en la fase 16, con la lectura de Ventas del pedido; también `cliente_dado_de_baja` en el crédito.
- El depósito a la cuenta de un tercero (`medio = cuenta_tercero` y `contaduria.aplicar_deposito_a_tercero`), lo que un pago cancelado regresa en cuentas por pagar, las compensaciones y las deudas se construyen en la fase 17, con las cuentas por pagar ([terceros y deudas](../modulos/contaduria/terceros-y-deudas.md) es de esa fase).
- La regla del paquete del contador al cancelar un pago llega en la fase 18.

## Criterios de terminado

| Criterio | Prueba que lo demuestra |
|---|---|
| Un cliente nace sin crédito, con los días de su tipo y al corriente; abrirlo dos veces no duplica | `modulos/contaduria/internas/abrir-credito-cliente.prueba.ts` |
| El semáforo sugerido sigue sus reglas: lo vencido, el uso del límite y, sin crédito, solo lo vencido | `modulos/contaduria/dominio/semaforo-sugerido.prueba.ts`, con fast-check |
| Cambiar el límite, los días o el semáforo guarda quién y cuándo, no escribe si no cambió, y el semáforo nunca cambia solo | `cambiar-limite-credito.prueba.ts`, `cambiar-dias-credito.prueba.ts` y `cambiar-semaforo-credito.prueba.ts` |
| Ventas nunca recibe un monto: ni del crédito ni de las cuentas | `modulos/contaduria/lecturas/credito-de-cliente.prueba.ts` y `estado-pago-notas.prueba.ts` |
| La cuenta por cobrar nace con su vencimiento y su importe sin el anticipo; con importe 0 nace pagada; una sola por nota | `modulos/contaduria/internas/crear-cuenta-por-cobrar.prueba.ts` y, con el anticipo, `aplicar-anticipo-a-nota.prueba.ts` |
| Un pago a una nota baja su saldo y cambia su estado; nunca pasa del saldo, aun con dos pagos al mismo tiempo; un monto con centavos no entra, salvo el que liquida exacto el saldo (decisión 674) | `modulos/contaduria/acciones/registrar-pago-recibido.prueba.ts`, con dos conexiones |
| Con pagos, notas de crédito, saldo a favor y cancelaciones al azar, el saldo guardado de cada cuenta es su importe menos sus aplicaciones vigentes y nunca sale de 0 al importe | `modulos/contaduria/saldos.azar.prueba.ts`, con fast-check |
| Una nota de crédito baja la cuenta hasta su saldo, lo demás entra a favor del cliente, y no se aplica dos veces | `modulos/contaduria/internas/aplicar-nota-credito.prueba.ts` |
| Cancelar un pago pide «Confirmar con Google», regresa saldos y estados y cancela su anticipo y lo que dejó a favor; no se cancela si su anticipo ya se aplicó o lo que dejó a favor ya se usó | `modulos/contaduria/acciones/cancelar-pago.prueba.ts` |
| El anticipo disponible nunca queda negativo, aun con dos notas al mismo tiempo; regresarlo y pasarlo a favor siguen sus reglas | `aplicar-anticipo-a-nota.prueba.ts`, `regresar-anticipo-a-pedido.prueba.ts` y `pasar-anticipo-a-favor.prueba.ts` |
| El saldo a favor se aplica y se devuelve sin pasar de lo que hay, aun con dos acciones al mismo tiempo; devolverlo es un pago emitido con «Confirmar con Google» | `aplicar-saldo-a-favor.prueba.ts` y `devolver-saldo-a-favor.prueba.ts` |

## Revisión de fase

Delicada ●: tres [auditores](../../.claude/agents/auditor.md), cada uno con su tema, y el [desmentidor](../../.claude/agents/desmentidor.md):

- **dinero** (los saldos, los centavos, las aplicaciones, las cancelaciones, el anticipo y el saldo a favor);
- **permisos y recorte** (solo Contaduría ve montos, Ventas solo sus lecturas, «Confirmar con Google» donde se pide);
- **concurrencia e idempotencia** (los candados de las cuentas, del saldo a favor y del anticipo, y una acción repetida que no cobra dos veces).
