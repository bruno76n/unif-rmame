# Pantallas de Contaduría

> **Qué cubre:** las pantallas de Contaduría (Pendientes con el flujo de los próximos días, Cuentas por cobrar, Cuentas por pagar, Terceros, Gastos, Nómina y Contador externo), los cajones del cliente, Registrar pago y del tercero, y sus ventanas, cada una con su consulta, sus textos, sus estados y sus botones.
> **Estado:** Decidido.
> **Se construye en:** [fase 19](../../fases/19-web-principal.md).
> **Se conecta con:** [crédito de clientes](../../modulos/contaduria/credito-de-clientes.md) · [cuentas por cobrar](../../modulos/contaduria/cuentas-por-cobrar.md) · [pagos y saldo a favor](../../modulos/contaduria/pagos-y-saldo-a-favor.md) · [anticipos](../../modulos/contaduria/anticipos.md) · [terceros y deudas](../../modulos/contaduria/terceros-y-deudas.md) · [cuentas por pagar](../../modulos/contaduria/cuentas-por-pagar.md) · [facturas de proveedor](../../modulos/contaduria/facturas-de-proveedor.md) · [gastos](../../modulos/contaduria/gastos.md) · [nómina](../../modulos/contaduria/nomina.md) · [contador y cuadres](../../modulos/contaduria/contador-y-cuadres.md) · [excepciones](../../modulos/inventario/excepciones.md) · [archivos](../../modulos/admin/archivos.md) · [clientes externos](../../modulos/ventas/clientes.md) · [libro de movimientos](../../modulos/inventario/libro-de-movimientos.md) · [pantallas de Ventas](ventas.md) · [pantallas de Compras](compras.md) · [lo común de las pantallas](../comunes.md)

## Para qué sirve

Cobrar lo que ya se entregó, pagar lo que se debe con las facturas revisadas contra la orden y lo recibido, registrar los gastos, pagar la nómina de la semana y mandar al contador su paquete del mes. Ejemplo: el lunes Martha ve en Pendientes «Textiles Aurora · Factura FP-0042 · OC-0224», «Vence hoy». Aprieta «Pagar», escribe la referencia del SPEI y confirma con Google. Luego registra el depósito de $8,000 de Zamora a la NV-0151, y el martes paga la nómina de la semana.

## Quién entra

- Las cuentas con Contaduría. Ven saldos, pagos y cuentas: es su trabajo.
- **La nómina** solo con `ven_sueldos_y_tarifas` (la dueña siempre). Sin ese permiso, la pestaña Nómina dice «Esta cuenta no tiene acceso a sueldos. Lo decide la dueña en Administración del sistema.», el total de la nómina sale «••••» y su botón no aparece.
- Las consultas del saldo de un cliente, de la ficha de un tercero y de la nómina quedan en la bitácora como sensibles.
- **Pastilla del menú:** las facturas detenidas sin autorización, los depósitos a terceros por aplicar y los pagos vencidos sin detener; roja si un pago sin detener lleva `contaduria.pago_atrasado_rojo_dias` (7) días vencido.
- **Acción principal:** «Registrar pago»: abre el cajón Registrar pago con el primer cliente que tiene algo por pagar.
- **Pestañas:** Pendientes · Cuentas por cobrar · Cuentas por pagar · Terceros · Gastos · Nómina · Contador externo.

## Pendientes

**Consultas:** `contaduria.pendientes` (`grupo`: `todos`, `pagos`, `cobranza`, `nomina`, `contador_externo` o `excepciones`) y `contaduria.flujo_proximos_dias`. La ventana de días es `contaduria.ventana_dias` (7).

| Cifra | Qué dice | Su línea | Lleva a |
|---|---|---|---|
| «Saldo por cobrar» | Lo que deben los clientes en notas entregadas | «{monto} vencido» (rojo) o «Sin saldo vencido», con la barra de los tramos de `contaduria.antiguedad_tramos_dias`: Por vencer · 1 a 15 días · 16 a 30 días · Más de 30 | Cuentas por cobrar |
| «Saldo por pagar» | Lo que se debe a proveedores y acreedores, con lo detenido | «{monto} vencido» (rojo, sin lo detenido) o «Sin saldo vencido», con la barra Vencido · Próximos {n} días · Después | Cuentas por pagar |
| «Flujo neto · {n} días» | Lo que vence por cobrar menos lo que vence por pagar (sin lo detenido) en los próximos {n} días; verde si es positivo, rojo si no | «Entra {monto} · sale {monto}». Lo ya vencido no cuenta | — |
| «Pagos detenidos» | Las facturas detenidas o esperando autorización | «{monto} sin pagar» o «Ninguno», con la barra Por resolver · Esperando autorización | Cuentas por pagar |

| Tipo | Referencia | Fecha · Importe | Estado | Botón |
|---|---|---|---|---|
| «Pago a proveedor» o «Pago a acreedor» | El beneficiario; abajo «Factura {FP} · {OC}», o la deuda con «mensualidad {n} de {m}» | El vencimiento (rojo si pasó) · el saldo | «Vencido» (rojo) · «Vence hoy» o «Vence en {n} días» (ámbar) | «Pagar» (negro si venció) → la ventana Pagar |
| «Pago detenido» | El proveedor; abajo «{FP} · {motivo}» | El vencimiento · el saldo | «Detenido · no cuadra» (rojo) o «Esperando autorización» (ámbar) | A cargo de Contaduría: «Pagar lo recibido» → `contaduria.pedir_pago_lo_recibido` («Solicitud enviada a Dirección: pago por lo recibido»); a cargo de Aduana: «Revisar» → Cuentas por pagar |
| «Depósito a tercero» | El cliente; abajo «{PG} · depositado a {tercero}» | La fecha del pago · lo que queda sin aplicar | «Por aplicar» (ámbar) | «Aplicar» → Cuentas por cobrar, en su tabla |
| «Cobranza» | El cliente; abajo «{n} notas vencidas · NV-…» (hasta 3 folios) | El vencimiento más viejo · lo vencido | «Vencido hace más de 30 días» (rojo, pasado el último tramo) o «Vencido» (ámbar) | «Ver cliente» → su cajón |
| «Saldo a favor» | El cliente; abajo «{monto} a favor sin usar» | Desde cuándo · el monto | «Por aplicar» (ámbar) | «Ver cliente» → su cajón |
| «Nómina» | «Semana del {semana}»; abajo «{n} personas» | El día de pago · el total («••••» sin el permiso) | «Asistencia sin cerrar» (gris) o «Por pagar» (ámbar) | Sin cerrar: «Ver nómina» → Nómina. Por pagar, con el permiso: «Pagar nómina» (negro) → «Confirmar con Google», con el total que se ve |
| «Contador externo» | «Paquete de {mes}»; abajo «Ingresos, egresos, nómina y gastos» | La fecha límite · «—» | «Por enviar» (ámbar); pasada la fecha, «Vencido» (rojo) | «Preparar paquete» → su ventana |
| «Excepción» | Lo de dinero que llegó y no cuadró («Los totales no cuadran», «Pago de un pedido cancelado»); abajo su documento | Cuándo se detectó · — | «Por resolver» (rojo) | «Resolver» → la ventana Resolver excepción |

- **Qué sale:** los pagos que vencen en los próximos {n} días o ya vencieron, sin lo detenido; los detenidos; los depósitos sin aplicar; la cobranza vencida, uno por cliente; los saldos a favor sin usar; la nómina más vieja por pagar; el paquete por enviar; y las excepciones de dinero (ver [excepciones](../../modulos/inventario/excepciones.md)).
- **Filtros:** «Todos», «Pagos», «Cobranza» (cobranza, depósitos a terceros y saldos a favor), «Nómina», «Contador externo» y «Excepciones», con su conteo; solo los que tienen renglones.
- **Orden:** rojo, ámbar, sin color; dentro, por fecha. **Vacío:** «Sin pendientes» (verde).

**«Flujo de los próximos {n} días»,** debajo: una columna por día, de hoy en adelante («dom 11», hoy en negritas); arriba de la línea, en verde, lo que vence por cobrar ese día; abajo, en ámbar, lo que vence por pagar sin lo detenido, cada barra con su monto («+$74k», «−$15k»). Al pasar el puntero: «Entra {monto}» o «Sale {monto}». Lo vencido no sale.

## Cuentas por cobrar

**Consultas:** `contaduria.antiguedad_saldos` (`desde` y `hasta`, el mes en curso al abrir; `semanas`, 8; `cursor`) y `contaduria.pagos_recibidos` (`cliente_id`, `desde`, `hasta`, `incluir_cancelados`, `cursor`).

1. **Dos tarjetas:**
   - «Saldo por cobrar» {total}: la barra por tramo con su leyenda y sus montos; abajo «Cobranza por forma de recepción» del mes: «Cuenta de la fábrica» · «Efectivo» · «Cuenta de un tercero».
   - «Cobrado por semana» {monto} «la semana del {lunes}»: las últimas 8 semanas, con la actual resaltada.
2. **«Antigüedad de saldos por cliente»,** con la leyenda de los tramos: los clientes con saldo y los de semáforo distinto de «Al corriente», del que más debe al que menos. Columnas:
   - Cliente (y «{n} notas · {municipio}»).
   - Antigüedad: la barra por tramo, a escala del que más debe («{tramo}: {monto}» al pasar el puntero); abajo «{monto} con más de 30 días» (rojo) o «{monto} vencido» (ámbar).
   - Saldo.
   - Límite de crédito: la barra de uso (verde; ámbar desde `contaduria.credito_porcentaje_cerca_limite` (80 %); roja si lo pasa) y «{n}% de {límite}», o «Sin crédito».
   - Semáforo: el selector «Al corriente» · «Cerca del límite» · «Detenido» → `contaduria.cambiar_semaforo_credito` («Semáforo de crédito de {cliente}: {nuevo}»), y abajo «Sugerido: {semáforo}» cuando el sistema sugiere otro (ver [crédito de clientes](../../modulos/contaduria/credito-de-clientes.md)). Tocar el selector no abre el cajón.
   - El renglón abre el cajón del cliente.
3. **«Depósitos a terceros por aplicar»,** si hay, con «{n} · {suma}»: Pago (folio; «{fecha} · hace {n} días») · Cliente (y su nota) · Cuenta destino (el tercero y la referencia) · Monto (y lo que queda) · el selector «Deuda» (sus deudas abiertas no detenidas, «{documento} · {saldo}») y «Aplicar» → `contaduria.aplicar_deposito_a_tercero` («{PG} aplicado a {deuda} de {tercero}» y, si sobra, «. Quedan {monto} a favor con {tercero}»). Sin deudas: «Sin deuda abierta».
4. **«Saldos a favor»,** si hay: el cliente y su monto; el renglón abre su cajón.
5. **«Pagos recibidos»,** con «Registrar pago» y «Mostrar cancelados»: Pago · Fecha · Cliente · Documento (la nota, o «anticipo · {PE}») · Dónde se recibió («Efectivo», «Cuenta de la fábrica» o «Cuenta de {tercero}»; abajo la referencia y «· aplicado a {deuda}» o «· sin aplicar» en ámbar) · Monto · Registró · «Cancelar pago» → su ventana. El más reciente arriba, con «Ver más»; un cancelado sale tachado.
6. **«Anticipos de pedidos»,** si hay: Pedido · Cliente · Estado del pedido · Anticipo · Aplicado a notas · Total del pedido. El renglón abre [el cajón del pedido](ventas.md#pedido-ancho), solo para leer.

## Cuentas por pagar

**Consultas:** `contaduria.cuentas_por_pagar` (`cursor`, de «Posteriores») y `contaduria.conciliacion_facturas` (`proveedor_id`, `orden_compra_id`, `estado`, `cursor`).

1. **«Pagos programados por semana»** {total sin lo detenido} «sin incluir {n} detenidos»: barras de Proveedores (negro) y Acreedores (gris) en «Vencido» · «Próximos {n} días» · «+1 sem.» · «+2 sem.» · «+3 sem.» · «+4 sem.», con su total arriba.
2. **«Pagos detenidos»,** si hay, con «Orden, recepción y factura no coinciden»: una tarjeta por factura con el proveedor y el saldo; «Factura {FP} · {folio del proveedor} · {OC}»; por orden, los tres cuadros Orden → Recepción → Factura con su dato («500 m a $78», «500 m · 28 sep», «Sin recibir»), verde lo que cuadra, rojo lo que no, gris lo que falta; el motivo; «Responsable: Contaduría» o «Responsable: Aduana»; y los botones: «Pagar lo recibido» (a cargo de Contaduría) o, ya pedido, «Esperando autorización de Dirección · {AU}»; y «Cancelar factura» → su ventana.
3. **El calendario,** sin lo detenido, en «Vencidos» (rojo), «Vencen en los próximos {n} días» (ámbar) y «Posteriores» (gris, con «Ver más»), cada uno con «{n} · {suma}»: Beneficiario («Proveedor» o «Acreedor») · Documento («Factura {FP} · {OC}» o la deuda con su mensualidad; abajo «{monto} pagados por {cliente}» o «Autorizado por Dirección») · Vencimiento («hace {n} días», «en {n} días») · Saldo · «Pagar» → su ventana.
4. **«Facturas de proveedor»,** con «Capturar factura» → su ventana: Factura (FP- y el folio del proveedor; abajo sus órdenes) · Proveedor (y su motivo en rojo si tiene diferencias) · Orden · Recepción · Factura (cada una con su punto) · Total · Estado: «Lista para pagar», «Pagada», «Autorizada por Dirección» (con «Se paga {monto} · {diferencia} por aclarar con el proveedor» y «Llegó su nota de crédito» → su ventana, o ya aclarada «Aclarada con {folio}»), «Espera a Dirección» o «Cancelada». Una conciliada sin pagos lleva «Cancelar factura». Al final, un renglón por orden recibida sin factura: «Esperando factura», con lo recibido y su valor. Las detenidas sin autorización van en «Pagos detenidos», no aquí.

## Terceros

**Consulta:** `contaduria.terceros` (`buscar`, `rol`, `cursor`).

- **Arriba:** el buscador «Nombre», el filtro «Todos», «Clientes», «Proveedores» o «Acreedores», y «Registrar deuda» → su ventana.
- **La tabla:** Tercero · Relación («Cliente», «Proveedor», «Acreedor»; puede tener varias) · Por cobrar · Por pagar · Saldo neto («A favor {monto}» verde, «En contra {monto}» ámbar o «Saldado»). Primero los que nos deben y les debemos; luego del monto mayor al menor. El renglón abre el cajón del tercero.
- **«Compensaciones»,** si hay: fecha · «{tercero}: Su compra se descontó de lo que le debemos» · monto · «Cancelar» → su ventana. Una cancelada sale tachada.

## Gastos

**Consulta:** `contaduria.gastos` (`mes`, el actual al abrir; `cursor`).

- **Arriba:** el mes (se puede cambiar) y «Registrar gasto» → su ventana.
- **«Gasto por categoría»:** por categoría, dos barras con su monto: «{mes}, al día {d}» (negro) y «{mes anterior} completo» (gris).
- **«Registro de gastos · {mes}»,** el más reciente arriba, con «Ver más»: Gasto (G-, o el SM- de su servicio) · Fecha · Categoría (los de un servicio dicen «Reparación de máquinas · máquina {folio}, de mantenimiento») · Dónde · Salió de · Monto · Comprobante («Adjunto», que lo abre, o «Sin comprobante» en ámbar) · «Cancelar gasto» → su ventana. El de un servicio no se cancela aquí: «Se corrige desde Mantenimiento». Un cancelado sale tachado.

## Nómina

**Consulta:** `contaduria.nomina_semana` (`asistencia_semana_id`: al abrir, la nómina por pagar más vieja o, si no hay, la semana que corre; `semanas`, 8). Sin `ven_sueldos_y_tarifas`, solo el candado y su texto.

- **El encabezado:** «Semana» {del 2 al 7 de noviembre}, con anterior y siguiente · «Se paga» {fecha} · «Total» {monto}, y a la derecha «Pagada el {fecha}» (verde), «Asistencia sin cerrar» (gris) o «Pagar nómina».
- **«Nómina por semana · Por tiempo y por pieza»:** barras apiladas Por tiempo (negro) y Por pieza (verde) de 8 semanas, con la actual resaltada.
- **El aviso** «La consulta de la nómina queda registrada en la bitácora», y la línea de las opciones con que se calcula: «Piezas dañadas: no se pagan · Descuento mayor que lo ganado: se perdona» (las de Configuración, o las congeladas si está pagada).
- **«Descuento semanal»,** mientras no esté pagada → su ventana.
- **Un grupo por área y por tienda** (Taller, Oficina, Aduana y bodega, Tienda 1, Tienda 2), con «{n} · {total}». Columnas: Persona (y su puesto) · Forma («Por tiempo», «Por pieza» o «Mixta») · Base («{n} días · {monto}», «{n} piezas · {monto}», o las dos unidas con «+») · Correcciones («−{monto}»: lo pagado de un registro que se canceló después) · Descuentos (el descontado, con su motivo y, si hay, «+{monto} de la semana anterior») · Total · Cómo se le paga (mientras está por pagar: «Efectivo» o «Transferencia» y su referencia, opcional).
- **El aviso de un renglón,** si algo no alcanzó: «No alcanzó {monto}: se perdona» o «No alcanzó {monto}: pasa a la siguiente semana»; y «Cobra por tiempo: sus piezas no se pagan aparte» cuando aplica. La cuenta es la de [nómina](../../modulos/contaduria/nomina.md#la-cuenta-de-la-nómina): lo que se ve es lo que se paga.
- **«Pagar nómina»** → «Confirmar con Google» («Semana del {semana}. Se paga en cuanto confirmes.») → `contaduria.pagar_nomina`, con el total que se ve y cómo se le paga a cada quien («Nómina del {semana} pagada»). Si la cuenta cambió mientras se veía, no paga y se vuelve a cargar con lo nuevo. Pagada, todo queda congelado.

## Contador externo

**Consultas:** `contaduria.contador_externo` (`cursor`, de los documentos) y `contaduria.paquete_mes` (`paquete_contador_id`), para su ventana.

- **«Paquete del mes»:** «{mes} {año}» · «Ingresos, egresos, nómina y gastos por categoría · a más tardar el {fecha}» (el día `contaduria.contador_dia_limite` (17) del mes siguiente) y «Preparar paquete» → su ventana. Ya mandado: «Al día · El último paquete ya se mandó».
- **«Paquetes»:** el mes · enviado el (o «—») · «Por enviar» (ámbar) o «Enviado» (verde) · «Archivo», que baja su ZIP cuando está armado.
- **«Documentos del contador»,** con «Adjuntar documento» (PDF, imagen, XML o ZIP, con su tipo y su mes, opcionales) → `contaduria.adjuntar_documento_contador` («Documento guardado»): Documento (lo abre) · Tipo · Mes · Llegó, el más nuevo arriba, con «Ver más».

## Cajones

### El cliente (ancho)

**Consulta:** `contaduria.cliente` (`cliente_id`), que deja en la bitácora «Consultó el saldo de {cliente}». Se abre desde Antigüedad de saldos, Saldos a favor y «Ver cliente».

- **Encabezado:** «{tipo} · {municipio}» y el nombre.
- **Botones con cifra:** «{n} pedidos abiertos» → Ventas · Pedidos · «{n} notas con saldo» · «{n} pagos registrados» · «{monto} por pagar» → el cajón del tercero (o «—»).
- **Cifras:** por cobrar · límite de crédito y sus días («Sin crédito») · el semáforo que ve Ventas (con el sugerido si es otro) · saldo a favor.
- **«Notas con saldo»:** Nota · Entregada · Vence («{fecha} · hace {n} días», «hoy», «en {n} días»; rojo si venció) · Saldo. Vacío: «Sin saldo».
- **«Pagos»:** fecha · «{nota o pedido} · {dónde se recibió}» (o «a {tercero}») · monto · «Cancelar pago». Vacío: «Sin pagos registrados».
- **«Saldo a favor»,** si hay: sus movimientos (entró, aplicado, devuelto) y el total, con «Aplicar» y «Devolver», cada uno a su ventana.
- **El pie:** «Consultas de este saldo quedan en la bitácora». «Cerrar» · «Cambiar límite» → su ventana · «Registrar pago» → el cajón Registrar pago, con este cliente.

### Registrar pago

**Consulta:** `contaduria.registrar_pago_opciones` (`cliente_id`, `tercero_deposito_id`). Se abre con la acción principal, desde Pagos recibidos y desde los cajones del cliente y del tercero.

- **Cliente:** los que tienen algo por pagar. Al cambiarlo se escoge su primer documento y el monto se llena con su saldo.
- **«Nota o pedido»:** «{NV} · {saldo} · vence {fecha}» por nota entregada con saldo, y «{PE} · {lo que le falta} · anticipo del pedido» por pedido confirmado y abierto.
- **Monto:** pesos enteros, hasta lo que dice el documento; con centavos solo el saldo exacto (decisión 674).
- **«Dónde se recibió»:** «Efectivo» · «Cuenta de la fábrica» (al abrir; con más de una, cuál) · «Cuenta de un tercero», con «Cuenta de quién» (los proveedores y acreedores a quienes se les debe, sin el mismo cliente).
- **«Referencia del depósito»** (no en efectivo): de 3 a 30, «SPEI, folio o ficha».
- **«Aplicarlo a lo que le debemos»,** con un tercero: «Ahora» (al abrir), con su «Deuda» y el aviso azul «Un solo movimiento: baja lo que nos debe {cliente} y lo que le debemos a {tercero}.»; o «Después»: «Queda en «sin aplicar» hasta que se ligue a una deuda.»
- **«Registrar pago»** → `contaduria.registrar_pago_recibido`: «{PG}: {monto} de {cliente}», con «, aplicado a {deuda}» o «. Queda sin aplicar a {tercero}». La misma referencia y el mismo monto avisan «Ya hay un pago con la referencia {referencia}: {PG}», sin detener. Cierra y marca un momento los renglones del cliente. Los errores salen en su campo y el primero en el aviso ámbar.

### El tercero (ancho)

**Consulta:** `contaduria.tercero` (`tercero_id`), que deja en la bitácora «Consultó la ficha de {tercero}». Se abre desde Terceros y desde «{monto} por pagar».

- **Encabezado:** la relación («Cliente y Acreedor») y el nombre. **Cifras:** por cobrar · por pagar · neto a favor, en contra o saldado.
- **«Por cobrar»:** nota · vence · saldo. **«Por pagar»:** documento (en un préstamo, «· saldo total del préstamo {monto}») · vence · saldo (y «Detenida» si lo está).
- **«Deudas»:** cada PR- con su descripción, su estado y sus mensualidades; sin pagos, «Cancelar deuda» → su ventana.
- **«Pagos a su cuenta»:** «{cliente} depositó a {tercero}» · «aplicado a {deuda}» o «sin aplicar» · monto (y «{monto} a favor»). **«Compensaciones»,** con su «Cancelar».
- **El pie:** «Consultas de esta ficha quedan en la bitácora». «Cerrar» · «Compensar» (si nos debe y le debemos) → su ventana · «Registrar pago» (si nos debe) → Registrar pago, con ese cliente.

## Ventanas

- **«Límite de crédito de {cliente}»:** el límite de hoy («Sin crédito» si es 0) y cuánto debe; «Límite nuevo, en pesos» (entero; 0 lo deja sin crédito) y «Días de crédito» (entero mayor que 0). «Guardar» manda cada campo que cambió, primero el límite: `contaduria.cambiar_limite_credito` («Límite de crédito de {cliente}: {monto}», «. Ventas ya le puede vender a crédito» si no tenía, o «{cliente} queda sin crédito: de contado o con anticipo») y `contaduria.cambiar_dias_credito` («Crédito de {cliente}: {n} días»).
- **«Aplicar saldo a favor»:** a qué (una nota con saldo o un pedido abierto) y el monto, hasta el saldo a favor y el del documento. «Aplicar» → `contaduria.aplicar_saldo_a_favor` («{monto} a favor aplicados a {folio}»).
- **«Pagar a {cliente}»** (devolver el saldo a favor): Monto · «Sale de» (Cuenta de la fábrica o Efectivo) · Referencia. «Confirmar con Google y pagar» → `contaduria.devolver_saldo_a_favor` («{monto} devueltos a {cliente}»).
- **«Cancelar {PG}»:** el motivo. «Confirmar con Google y cancelar» → `contaduria.cancelar_pago` («{PG} cancelado»): regresan los saldos y lo que aplicó.
- **«Compensar con {tercero}»:** «Lo que nos debe se descuenta de lo que le debemos. No se mueve dinero.»; las cifras «Por cobrar {antes} → {después}» · «Por pagar {antes} → {después}» · «Saldo neto {monto} · no cambia», que cambian al escribir; Monto (lleno con el máximo). «Compensar» → `contaduria.compensar` («Compensación registrada: {monto} con {tercero}»).
- **«Cancelar compensación»,** **«Cancelar {PR}»,** **«Cancelar {FP}»** y **«Cancelar {G}»:** el motivo y su botón → `contaduria.cancelar_compensacion`, `contaduria.cancelar_deuda`, `contaduria.cancelar_factura_proveedor` y `contaduria.cancelar_gasto` («Compensación con {tercero} cancelada», «{PR} cancelada», «{FP} cancelada», «{G} cancelado»).
- **«Registrar deuda»:** «¿A quién le debemos?» (un tercero, o «Otro: darlo de alta» con Nombre y «Es»: Persona, Banco o Empresa; si se parece a uno que ya existe, «¿Es el mismo?») · «De qué es» · «Monto por pagar» · «Mensualidades» (1 al abrir) · «Primer vencimiento» y, con más de una, la tabla de mensualidades con su fecha y su importe, que se pueden cambiar. «Registrar deuda» → `contaduria.registrar_deuda` («{PR} registrada: {monto} a {acreedor}, vence el {fecha}»).
- **«Pagar a {beneficiario}»:** «{documento} · vence {fecha}»; Monto (lleno con el saldo; se puede pagar una parte) · «Sale de» (Cuenta de la fábrica, y cuál si hay más de una, o Efectivo) · Referencia (de 3 a 30, «SPEI o recibo»). «Confirmar con Google y pagar» → `contaduria.pagar_cuenta_por_pagar` («{monto} pagados a {beneficiario}»).
- **«Capturar nota o factura»,** con `contaduria.capturar_factura_opciones` (`proveedor_id`, `orden_compra_id`); también desde la orden en [Compras](compras.md), con su orden ya puesta:
  - Proveedor y sus órdenes, una o varias (no en borrador ni canceladas; propone la recibida que espera factura), cada una con lo que le toca sin IVA.
  - Folio del proveedor («Como viene en su factura») · Fecha de la factura (opcional) · Subtotal · IVA · Total (subtotal + IVA) · UUID del CFDI, XML y PDF o foto (opcionales).
  - Por orden con algo recibido, la tabla Material · Recibido · Orden (su precio) · «En la nota» (lleno con el precio vigente); si cambia, «Sube {n} % · antes {precio}» o «Baja…», en ámbar desde `compras.umbral_cambio_precio_pct` (15 %).
  - El recuadro que cambia al escribir: «Orden {total} · recibido {valor recibido}» y «· factura {subtotal} → cuadra» (verde) o «→ no cuadra: el pago se detiene» (rojo).
  - «Guardar» → `contaduria.capturar_factura_proveedor`: «{FP} conciliada con la orden y la recepción» o «{FP} registrada con diferencias: pago detenido», con «. Precio nuevo: {material} a {precio}» si cambió alguno. Las tres puntas están en [facturas de proveedor](../../modulos/contaduria/facturas-de-proveedor.md).
- **«Llegó su nota de crédito»:** «{FP} · {diferencia} por aclarar»; el folio de la nota (de 3 a 20) y su archivo (opcional). «Guardar» → `contaduria.registrar_nota_credito_proveedor` («Diferencia de {FP} aclarada con {folio}»).
- **«Registrar gasto»:** Categoría (la lista «Categorías de gasto», sin «Reparación de máquinas») · Monto (pesos enteros) · Dónde (la Fábrica al abrir, el Taller, una tienda o En línea) · Fecha (hoy o antes) · «Salió de» (Efectivo o una cuenta de la fábrica) · Comprobante (imagen, PDF o XML, opcional) y su tipo. «Registrar gasto» → `contaduria.registrar_gasto` («{G} registrado»).
- **«Descuento semanal»:** Persona (las activas, con su área; si ya tiene, «Hoy: {monto} por semana · {motivo}») · «Descuento por semana» (pesos enteros; 0 lo quita) · «Por qué» (con monto). «Guardar descuento» → `contaduria.guardar_descuento_semanal` («{persona}: {monto} de descuento cada semana, desde esta nómina» o «{persona} ya no tiene descuento semanal»).
- **«Paquete de {mes}»:** «Lo que recibe el contador.» y la cuenta del mes, en vivo mientras no se manda y congelada después: Concepto · Monto (con su signo) · Documentos, y «de meses anteriores» en lo que llegó tarde (ver [contador y cuadres](../../modulos/contaduria/contador-y-cuadres.md)). Sin `ven_sueldos_y_tarifas`, la nómina dice «••••». «Va con los comprobantes de cada gasto y las facturas de proveedor del mes.» «Marcar como enviado» → `contaduria.marcar_paquete_enviado` («Paquete de {mes} enviado al contador»).
- **«Resolver excepción»:** qué pasó y «Qué se hizo» (5 letras o más). «Resolver» → `inventario.resolver_excepcion` («Excepción resuelta: queda en Resueltas»).

Los mensajes de error de cada acción están en su archivo del módulo.

## Lo que no se copia de la muestra

- Cortes de caja llega con el POS, y Pasarela en línea con uniformame.mx: no son pestañas de la primera versión.
- Los pagos, de entrada y de salida, se confirman con Google y guardan de dónde salió el dinero y su referencia.
- Pagos, compensaciones, deudas, facturas y gastos se cancelan con motivo; cancelar un pago pide además «Confirmar con Google».
- El saldo a favor del cliente, con «Aplicar» y «Devolver», y los días de crédito son pantallas nuevas.
- Una factura cubre una o varias órdenes y lleva subtotal, IVA y su CFDI; la diferencia autorizada se aclara con «Llegó su nota de crédito».
- La nómina sale de la cuenta real: cada registro con la tarifa de su operación, las correcciones, el descuento semanal con su ventana y lo que no alcanzó; la gráfica y el paquete, con datos reales.
- Los tramos, la ventana de días y los rojos salen de sus parámetros, no de números fijos.
- El selector del semáforo no abre el cajón del cliente.
- Las listas largas se paginan.

## Cómo está hecho

**Fase 19, parte 13.**

- **Las consultas** están en `apps/api/src/modulos/contaduria/consultas/`, una por archivo, con sus contratos en `packages/compartido/src/contratos/contaduria/` (`consultas-pendientes.ts`, `consultas-cobrar.ts`, `consultas-pagar.ts`, `consultas-terceros.ts`, `consultas-gastos-contador.ts`, `consultas-nomina.ts` y las piezas comunes en `vistas.ts`): `contaduria.pendientes` (con la pastilla del menú, `pastillas: { contaduria }`), `contaduria.flujo_proximos_dias`, `contaduria.antiguedad_saldos`, `contaduria.pagos_recibidos`, `contaduria.cliente`, `contaduria.registrar_pago_opciones`, `contaduria.cuentas_por_pagar`, `contaduria.conciliacion_facturas`, `contaduria.capturar_factura_opciones`, `contaduria.terceros`, `contaduria.tercero`, `contaduria.gastos`, `contaduria.nomina_semana`, `contaduria.contador_externo` y `contaduria.paquete_mes`. Lo que leen todas (las cuentas por cobrar con saldo, las cuentas por pagar que se deben con su documento, los depósitos a terceros, los saldos a favor, las cuentas de la fábrica y los textos de los tramos) está en `consultas/comun.ts`.
- **Ninguna regla dos veces:** la antigüedad y sus tramos son `saldoPorTramo` y `leerTramos`; el semáforo sugerido y el uso del límite, `semaforoSugerido`; lo programado y el flujo, `antiguedadPorPagar` y `flujoDeLosProximosDias`; lo que le falta a un pedido, `pedidoQueRecibe`; el valor de lo recibido, `valorDeMilesimos`; la nómina, `cuentaDeLaNomina` (la misma de `contaduria.pagar_nomina`, así lo que se ve es lo que se paga); el paquete, `cuentaDelPaquete`. Las tres puntas de un pago detenido y las órdenes que esperan factura son las de la conciliación de Compras (`renglonesDeConciliacion` y `ordenesResumidas`, en `compras/dominio/`); lo que lleva el mes que no se ha mandado es `lecturaDelPaquete` sin candado, la misma de «Marcar como enviado». Las funciones que reciben el contexto de una acción corren con `contexto.comoAccion`. Los valores de una lista (cuentas de la fábrica, categorías, tipos de comprobante) salen de `admin.valores_de_lista`, y las listas largas paginan con el cursor opaco del núcleo (decisión 783).
- **Lo que no viaja:** solo Contaduría pide estas consultas (también lo comprueba `nucleo/acceso/permisos.prueba.ts`); `contaduria.nomina_semana` pide además «ven sueldos y tarifas», y sin él la pestaña ni la pide: muestra el candado. La nómina de Pendientes y la del paquete viajan en `total_nomina_centavos`, un campo de sueldo: sin el permiso no viajan (`recortado`) y la pantalla pinta «••••». Todo monto va en su `*_centavos`, opcional. `contaduria.cliente`, `contaduria.tercero` y `contaduria.nomina_semana` dejan su renglón de consulta sensible en la bitácora.
- **La web** está en `apps/web/src/rutas/contaduria/` (una ruta por pestaña) y `apps/web/src/departamentos/contaduria/`: `pestanas/` (las siete), `cajones/` (el cliente, Registrar pago y el tercero) y `ventanas/` (Pagar, cancelar con motivo, límite de crédito, aplicar y devolver saldo a favor, compensar, registrar deuda, capturar nota o factura, nota de crédito del proveedor, registrar gasto, descuento semanal, paquete del mes y resolver excepción). La pestaña, los filtros, el cajón (`?cajon=cliente&id=…`) y la ventana que abre Compras (`?ventana=capturar_factura&orden_compra_id=…`) van en la dirección (`direccion.ts`). `envio.ts` manda las acciones con `useEnvioConCampos` de lo común (los errores en su campo y el choque de versión); las listas largas («Ver más») son `usePaginas` de lo común, y `comun.tsx` arma «Sale de». Los montos se leen con `pesosACentavos` y se escriben en su campo con `centavosACampo`, del paquete compartido. Registrar pago pregunta antes de cerrarse con algo capturado.
- **Los archivos:** el comprobante de «Registrar gasto» (`comprobante`), el XML y el PDF o la foto de «Capturar nota o factura» y el archivo de «Llegó su nota de crédito» (`factura_proveedor`), y el documento de «Adjuntar documento» (`ventanas/adjuntar-documento.tsx`, `documento_contador`, con su tipo y su mes, opcionales) se escogen con `CampoDeArchivo` y se suben al mandar, no al escoger, con `useSubidaAlMandar` de lo común (`comun/subida.ts`, sobre `subirArchivo`); la acción manda después su `archivo_id`. El mismo archivo escogido se sube una sola vez, así que volver a mandar tras una falla lleva el mismo `archivo_id` con la misma clave. Si la subida falla, el aviso dice por qué (el mensaje de la regla, o «El archivo no se subió. Intenta otra vez.») y lo capturado se queda; el error de la acción sobre el archivo sale en su campo. Los tipos que ofrece cada selector de archivos (`aceptaDe`) solo ayudan a escoger: los revisa la API por su propósito.
- **Abrir lo subido:** «Adjunto» de Gastos, el documento del contador y el «Archivo» del paquete enlazan a `/v1/archivos/{id}`. La lectura `contaduria.ve_documento` (`lecturas/ve-documento.ts`) dice quién los abre: el comprobante del gasto, los archivos de la factura de proveedor y los documentos del contador, quien tiene Contaduría; el ZIP del paquete, que lleva la nómina del mes en su relación, solo con «ven sueldos y tarifas» además, y sin ese permiso `contaduria.contador_externo` ni siquiera manda su `archivo_id` (decisión 799); cualquier otro documento, nadie.
- **Pruebas:** cada consulta con la suya en `modulos/contaduria/consultas/*.prueba.ts` (el departamento, el permiso fino, lo que no viaja, la bitácora de `cliente.prueba.ts`, `tercero.prueba.ts` y `nomina-semana.prueba.ts`, y la pastilla en `pendientes.prueba.ts`); las pantallas en `apps/web/src/departamentos/contaduria/contaduria.prueba.ts`, con Playwright contra la muestra, en escritorio y en teléfono, con sus capturas en `.revision/capturas/contaduria/`: cada botón llama a su acción y el aviso dice lo que regresa, el candado de la nómina y el choque de versión; y `nomina.prueba.ts`: el total que se ve es el que paga `contaduria.pagar_nomina`, y si la cuenta cambió mientras se veía no se paga y la pantalla vuelve a leer lo nuevo. Los archivos, en `contaduria.prueba.ts` con el almacén de prueba (`levantarPantalla({ conArchivos: true })`): cada subida llega a su acción con su `archivo_id`, queda ligada a su documento y su enlace la abre; y si la subida no se acepta, el aviso dice por qué, la acción no se manda y lo capturado se queda. Quién abre cada archivo, en `lecturas/ve-documento.prueba.ts`.
- **Al revisar el diseño:** la pestaña Pendientes cuenta todos sus renglones (`conTodoLoPendiente`, con `contaduria.pendientes` en `pagina.tsx`); las cifras y los títulos dicen «Por cobrar · Por pagar», como la guía de textos, y las frases de las ventanas («Lo que nos debe se descuenta de lo que le debemos») quedan; Terceros pone «—» donde no hay saldo y «En contra» en negritas, como «A favor» (decisión 803). Quedan para la fase 20: el mes del paquete con mayúscula como título y el signo menos (−) en los montos en contra.
- **Lo que falta de lo compartido:** la tabla editable de mensualidades de «Registrar deuda» y el veredicto «cuadra / no cuadra» de la factura mientras se escribe esperan a que el capataz los lleve a lo común; hasta entonces no se muestran.
- **Lo que corrigió la auditoría (cierre de la fase 19):** las listas que paginan (Gastos, Terceros, Contador externo, Pagos recibidos, el calendario y las facturas de Cuentas por pagar) pintan sus estados con `SegunPaginas` de lo común (`comun/segun-paginas.tsx`: cargando, sin conexión, sin permiso y error, y su «Ver más»). «Resolver excepción» es la ventana con motivo común, la misma de Bodega; el cajón del cliente pregunta por Ventas con `useTieneDepartamento`. La pestaña Nómina no decide quién ve sueldos: lo dice `ve_sueldos` de `contaduria.pendientes`. `contaduria.antiguedad_saldos` manda la suma de los depósitos por aplicar (`depositos_queda_centavos`) y `contaduria.gastos` el día de negocio (`hoy`) con que abre «Registrar gasto». Lo que depende de lo escogido se cuenta con el paquete compartido, en enteros: `sumarCentavos` (las órdenes de una factura), `hastaElMenor` (lo que se propone aplicar del saldo a favor) y `montoCorto` (las barras del flujo). El monto de «Aplicar saldo a favor» se revisa con el campo del contrato. Las fechas en hora de México de las consultas salen de `zonaDelNegocio`. Lo prueban `consultas/pendientes.prueba.ts` (`ve_sueldos`), `antiguedad-saldos.prueba.ts`, `gastos.prueba.ts` y `calculos/dinero.prueba.ts`.
