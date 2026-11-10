# Pantallas de Dirección

> **Qué cubre:** las pantallas de Dirección (Pendientes, Autorizaciones, Indicadores y Alertas cruzadas), cada una con su consulta, sus textos, sus estados y sus botones, y la ventana «Rechazar».
> **Estado:** Decidido.
> **Se construye en:** [fase 19](../../fases/19-web-principal.md).
> **Se conecta con:** [autorizaciones](../../modulos/direccion/autorizaciones.md) · [alertas e indicadores](../../modulos/direccion/alertas-e-indicadores.md) · [existencias y cuadre](../../modulos/inventario/existencias-y-cuadre.md) · [diferencias, ajustes y mermas](../../modulos/inventario/diferencias-ajustes-y-mermas.md) · [conteos](../../modulos/inventario/conteos.md) · [excepciones](../../modulos/inventario/excepciones.md) · [libro de movimientos](../../modulos/inventario/libro-de-movimientos.md) · [lo común de las pantallas](../comunes.md)

## Para qué sirve

Es la pantalla de la dueña para decidir y vigilar: autoriza o rechaza lo que otro departamento no puede resolver solo y ve lo que cruza departamentos y no está bien. Ejemplo: el lunes Carmen abre Dirección; Pendientes le dice «Ventas $262,000 última semana · ▲ 51%» y, en rojo, «Por autorizar · 3 días» en el ajuste AJ-0044 de Bodega. Aprieta «Revisar», lee el ajuste en su tarjeta y lo autoriza.

## Quién entra

- Las cuentas con Dirección; al inicio, solo la dueña. Ve importes en pesos, nunca sueldos; sin «ven sueldos y tarifas», lo que se debe no lleva la nómina.
- **Pastilla del menú:** las autorizaciones por autorizar; roja cuando una lleva `direccion.autorizacion_dias_menu_rojo` (3) días esperando. Las alertas no cuentan.
- **Acción principal:** «Autorizar», solo si hay alguna por autorizar: abre Autorizaciones.
- **Pestañas:** Pendientes (con autorizaciones y alertas; roja si hay alguna) · Autorizaciones · Indicadores · Alertas cruzadas (con su número).

## Pendientes

**Consulta:** `direccion.pendientes`.

| | |
|---|---|
| **Recibe** | `grupo`, opcional: `autorizaciones` o `alertas` |
| **Regresa** | Los indicadores del periodo de `direccion.primer_vistazo` (semana o día), los pendientes y el conteo de cada grupo |
| **Recorte** | Sin «ven sueldos y tarifas», lo que se debe no lleva la nómina. Nunca sueldos |

**La barra de indicadores:**

| Cifra | Qué dice | Su línea | Lleva a |
|---|---|---|---|
| «Ventas» | Lo vendido en el periodo por las cuatro vías: «$262,000 última semana», con la gráfica chica de ocho periodos | «▲ 51% contra la anterior» (▼ si bajó) | Indicadores |
| «Producción» | Prendas terminadas en los últimos 6 días de trabajo: «4,175 prendas terminadas», en rojo si hay lotes atorados; gráfica de 12 días | En rojo y primero: «{n} lote atorado · {n} en riesgo»; después «▲ 8% contra la anterior» | Indicadores |
| «Existencias» | «30,477 piezas en total», con la barra repartida por ubicación | «{n} en bodega» | Indicadores |
| «Cuentas por cobrar y pagar» | «$373,550 por cobrar», con la barra por cobrar (verde) contra por pagar (ámbar) | «Por pagar {monto}» | Contaduría · Pendientes |

**El panel:** filtros «Todos», «Autorizaciones» y «Alertas». Columnas: Tipo · Referencia · Fecha · Importe · Estado · botón.

| Tipo | Referencia | Estado | Botón |
|---|---|---|---|
| «Autorización» | El tipo y, abajo, «{qué se pide} · {departamento}, {quién}»; fecha en que se pidió; importe o cantidad con su unidad («20 m»), o «—» | «Por autorizar» (ámbar); «Por autorizar · {n} días» (rojo) desde `direccion.autorizacion_dias_rojo` (2) días | «Revisar» → Autorizaciones |
| «Alerta» | El título y, abajo, su detalle; sin fecha ni importe | «Por revisar», en el color de la alerta | «Ver» → a donde lleva su «Ver» |

Orden: rojo, ámbar, por fecha; las alertas, sin fecha, al final de su color. Vacío: «Sin pendientes».

## Autorizaciones

**Consulta:** `direccion.autorizaciones`.

| | |
|---|---|
| **Recibe** | `tipo`, opcional · `cursor_resueltas` |
| **Regresa** | Los filtros («Todas» y cada tipo con algo, con su conteo); las por autorizar, de la más vieja a la más nueva: folio, tipo, departamento que la pide, fecha, días esperando, qué se pide, detalle, importe, importe facturado, cantidad y unidad, «Lo pidió {persona}», si la pidió quien ve, si puede decidirla y por qué no, su documento y su `version`; y las resueltas, la más reciente arriba: fecha, qué, detalle, resultado con su motivo y si la pidió y autorizó la misma persona |

- **Filtros** «Todas {n}» y uno por tipo con algo pendiente: «Ajuste de inventario», «Recepción de más», «Nota de crédito», «Pago fuera de lo normal», «Aprobar desarrollo», «Alta de usuario». Filtran solo las tarjetas.
- **Una tarjeta por autorización:** arriba el tipo, «{departamento} · {fecha}» y, desde 2 días, «{n} días esperando» en ámbar; en negritas qué se pide y abajo el detalle; abajo «Lo pidió {persona}», «Pedida por ti» (ámbar) si fue la misma cuenta, y los botones «Rechazar» y «Autorizar».
- **«Autorizar»** → `direccion.decidir_autorizacion` con `autorizar` y `desde` = `direccion`. Un alta de usuario solo la decide la dueña y pide «Confirmar con Google»; otra cuenta ve el botón apagado y «Las cuentas nuevas solo las da la dueña». Aviso: «Autorizado por Dirección: {tipo}». La tarjeta sale y su renglón entra arriba en Resueltas, resaltado un momento; si ya no queda ninguna, «Autorizar» sale de la barra superior.
- **«Rechazar»** → la ventana «Rechazar» (abajo).
- **Qué dice cada tipo y qué pasa al decidirlo** está en [autorizaciones](../../modulos/direccion/autorizaciones.md#los-tipos); la tarjeta muestra lo que la consulta trae armado (por ejemplo, «Pagar a Textiles Aurora lo recibido: $39,000 en lugar de $40,560»).
- **Resueltas:** tabla Fecha · Qué · Detalle · Resultado («Autorizado» en verde o «Rechazado» en rojo, con el motivo abajo; y «pedida y autorizada por la misma persona» si fue así). Solo se lee.
- **Vacío:** «Nada espera tu autorización». Con un filtro que se quedó sin tarjetas, regresa a «Todas».

## Indicadores

**Consulta:** `direccion.indicadores`.

| | |
|---|---|
| **Recibe** | `comparar`: `semana_pasada` (al abrir), `hace_un_mes` o `temporada_pasada` |
| **Regresa** | Las ventas de la semana con su total, su variación y cada canal (Tienda 1, Tienda 2, Clientes externos, En línea) contra lo que se compara, y desde cuándo vende cada canal; las ventas por semana de ocho semanas contra el año pasado; las prendas terminadas de los últimos 12 días de trabajo con los lotes atorados, en proceso y por cortar; y la existencia por ubicación |
| **Recorte** | Nunca sueldos ni costos |

Los cuatro paneles (de dónde sale cada cifra, en [alertas e indicadores](../../modulos/direccion/alertas-e-indicadores.md#los-indicadores)):

1. **«Ventas de la semana del {fecha}»:** el total con su flecha y su porcentaje «contra semana anterior», «contra hace un mes» o «contra misma semana del año pasado»; dos barras por canal, «Esta semana» y la comparación en tono claro. Arriba, «Semana pasada», «Hace un mes» y «Temporada pasada», que solo cambian este panel.
2. **«Ventas por semana, las tres vías»** («{primera semana} a {última}»): la línea de este año contra la punteada del año pasado; el último punto con su cifra («$262k»).
3. **«Prendas terminadas por día»** («{n} esta semana»): barras de los últimos 12 días de trabajo y, abajo, «{n} lote atorado, {n} en proceso, {n} por cortar».
4. **«Existencia por ubicación»** («{n} piezas»): una barra por cada una de las siete ubicaciones con su cifra.

Un canal que todavía no vende sale en 0 con «Sin ventas todavía».

## Alertas cruzadas

**Consultas:** `direccion.alertas` y `inventario.ultimo_cuadre`.

| `direccion.alertas` | |
|---|---|
| **Regresa** | Por alerta, en el orden de su tabla: clave, regla, título, detalle, los departamentos que cruza, color y a dónde lleva «Ver» (departamento, pestaña y documento). Se calcula al leer con la misma función del trabajo de alertas (ver [alertas e indicadores](../../modulos/direccion/alertas-e-indicadores.md#las-alertas)) |

| `inventario.ultimo_cuadre` | |
|---|---|
| **Quién** | Dirección o Bodega |
| **Regresa** | Lo mismo que la lectura del mismo nombre: la fecha, el estado, cuándo empezó y terminó, sus contadores y su error |

- **Una tarjeta por alerta,** con su orilla roja o ámbar a la izquierda: el título en negritas, el detalle, «Cruza: {departamentos}» y «Ver ›». El detalle de cada una:

| Alerta | Detalle |
|---|---|
| Lote detenido | «{prenda} para {cliente o destino}, entrega comprometida el {fecha}», más «. Falla {FM}: {falla}, {n} horas de paro» si es por máquina |
| Consumo de tela | «Patrón {n} m, real {n} m por pieza» |
| Concentración | «{saldo del cliente} de {saldo total}», más «, con {monto} de más de {n} días» si lo tiene, «. Semáforo: {semáforo}» |
| Descontinuado con existencia | «{n} en bodega y el resto en tiendas» |
| Sin tiempo de reposición | «Cobertura de {n} días; {proveedor} entrega en {n}. Existencia {n} {unidad} y {n} comprometidos en producción» |
| Aparato sin sincronizar | «Ventas y corte sin recibir; su existencia no se ofrece en línea» |
| Cuadre con residuo | «{n} diferencias y {n} excepciones en Bodega», con la hora en que terminó |

- **«Ver»** cambia de departamento y abre su pestaña (en la de un lote, también su cajón). Si la cuenta no tiene ese departamento, «Ver» no sale.
- **Vacío:** «Nada fuera de lo normal».

## Cajones y ventanas

Dirección no tiene cajones propios: «Ver» abre los de otros departamentos.

**Ventana «Rechazar»:** el título y, abajo, lo que se pide; el campo «Motivo» de una línea (de 5 a 90 letras) con el cursor puesto; «Volver» y «Rechazar» (rojo). Sin motivo: «Escribe el motivo: le llega a quien lo pidió». «Rechazar» → `direccion.decidir_autorizacion` con `rechazar` y el motivo. Aviso: «Rechazado: {tipo}».

## Lo que no se copia de la muestra

- La pestaña «Próximamente»: son ideas para después y van a [registros](../../registros/REGISTROS.md#para-después).
- El texto «Hoy son reglas fijas; después las explicará la inteligencia artificial…»: no se explica la pantalla.
- Al decidir la última de un tipo filtrado, no dice «Nada espera tu autorización» si quedan otras: regresa a «Todas».
- La recepción de más muestra su cantidad con su unidad («20 m»), no en pesos.

## Cómo está hecho

*Lo escribe Claude Code al terminar la fase 19.*
