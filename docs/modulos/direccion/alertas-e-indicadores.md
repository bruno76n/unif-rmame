# Alertas e indicadores

> **Qué cubre:** las alertas cruzadas de Dirección: de dónde sale cada una, cuándo se prende y cuándo desaparece; el trabajo que avisa solo las nuevas y la memoria que guarda para eso; y de dónde salen los indicadores de Dirección.
> **Estado:** Decidido.
> **Se construye en:** [fase 18](../../fases/18-tienda-en-linea-direccion-y-contador.md).
> **Se conecta con:** [autorizaciones](autorizaciones.md) · [lotes](../produccion/lotes.md) · [máquinas, fallas y servicios](../mantenimiento/maquinas-fallas-y-servicios.md) · [cuenta de material](../patronaje/cuenta-de-material.md) · [proyección de material](../compras/proyeccion-de-material.md) · [contador y cuadres](../contaduria/contador-y-cuadres.md) · [crédito de clientes](../contaduria/credito-de-clientes.md) · [productos](../catalogo/productos.md) · [existencias y cuadre](../inventario/existencias-y-cuadre.md) · [dispositivos](../admin/dispositivos.md) · [avisos](../admin/avisos.md) · [módulos](../../cimientos/MODULOS.md) · [eventos y trabajos](../../cimientos/EVENTOS-Y-TRABAJOS.md) · [pantallas de Dirección](../../interfaz/fabrica/direccion.md)

## Para qué sirve

Dirección ve en un solo lugar lo que cruza departamentos y no está bien, sin tener que buscarlo. Ejemplo: a las 10:30 el trabajo de alertas encuentra que el L-2026-118 lleva 3 días de trabajo atorado en «Costados» porque la recta de Ana está parada: nace la alerta roja «L-2026-118 detenido en Costados desde hace 3 días · Recta 04 parada», y las cuentas con Dirección reciben el aviso. Cuando Mantenimiento resuelve la falla y el lote avanza, la alerta desaparece sola; nadie tuvo que cerrarla.

## Reglas

1. **Una alerta no es un documento:** se calcula cada vez que se mira, desaparece sola cuando deja de cumplirse su regla, y nadie la resuelve ni la descarta.
2. **Cada alerta** tiene su clave (la regla y su entidad: `lote_detenido:{lote}`), su título, su detalle, su color, los departamentos que cruza y a dónde lleva «Ver». Salen en el orden de la tabla de abajo.
3. **Cada regla lee a su dueño** con las lecturas de su módulo: Dirección no lee las tablas de otros (ver [módulos](../../cimientos/MODULOS.md)).
4. **El trabajo avisa solo las nuevas:** recuerda cuándo vio cada clave por primera y por última vez y cuándo dejó de salir. Una que reaparece después de desaparecer cuenta como nueva.
5. **Los indicadores** no se guardan: se calculan al leer, en las consultas de Dirección.

## Las alertas

| Alerta | Cuándo sale | De dónde | Color | «Ver» lleva a |
|---|---|---|---|---|
| «{lote} detenido en {operación} desde hace {n} días», más « · {máquina} parada» si la causa es una falla | Un lote en proceso atorado, por falta de avance o por una máquina parada (ver [lotes](../produccion/lotes.md#reglas), regla 7) | `produccion.lotes_atorados` | Rojo | Producción, cajón del lote |
| «{producto}: consumo de tela {n}% sobre patrón» | Su desperdicio medido es alto (más de `patronaje.desperdicio_alto_pct`, 10 %); salen las de más desperdicio, hasta `direccion.alerta_consumo_tela_max` (2) | `patronaje.desperdicio_prenda`, de todas las prendas cortadas | Ámbar | Patronaje, Rendimiento |
| «{cliente} concentra el {n}% del saldo por cobrar», más «, con {monto} de más de {d} días» si tiene vencido de más de `direccion.alerta_concentracion_vencido_dias` (30) días | El cliente con más saldo pasa de `direccion.alerta_concentracion_cliente_pct` (35 %) del saldo total | `contaduria.resumen_direccion` | Rojo con ese vencido; si no, ámbar | Contaduría, Cuentas por cobrar |
| «{producto} descontinuado con {n} piezas en existencia» | Un producto descontinuado con piezas en alguna ubicación; una por producto | `catalogo.productos_descontinuados` e `inventario.existencia_de_variantes` | Ámbar | Bodega, Existencias |
| «{material} sin tiempo de reposición» | Su estado en la cuenta de Compras es «Sin tiempo de entrega»: habrá días sin material; salen los que se acaban primero, hasta `direccion.alerta_reposicion_max` (2) | `compras.cuenta_material` | Rojo | Compras, Por pedir |
| «{aparato} de {ubicación} sin sincronizar desde hace {tiempo}» | Una tablet o una caja lleva `admin.horas_sin_sincronizar_aviso` (4 h) sin sincronizar | `admin.aparatos_sin_sincronizar` | Rojo | Administración del sistema, Dispositivos |
| «El cuadre del {fecha} dejó {n} cosas por revisar» | El último cuadre de inventario quedó con residuo | `inventario.ultimo_cuadre` | Rojo | Bodega, sus diferencias y excepciones |

Las reglas viven como una función pura en `modulos/direccion/dominio/`: recibe lo que dan las lecturas y los parámetros, y regresa las alertas en su orden. La usan el trabajo de abajo y la consulta de Alertas cruzadas (fase 19): la pantalla y el aviso dicen lo mismo.

## La tabla `alertas_direccion_vistas`

La memoria del trabajo, para avisar solo las nuevas. No es el estado de la alerta: la pantalla la sigue calculando al leer.

| Columna | Tipo | Nulo | Qué es |
|---|---|---|---|
| `id` | uuid | no | Llave |
| `clave` | text | no | La regla y su entidad. Única donde `desaparecio_en` está vacío |
| `regla` | text | no | |
| `entidad_id` | uuid | sí | |
| `titulo` | text | no | El último que se vio |
| `color` | text | no | CHECK (`rojo`, `ambar`) |
| `primera_vez_en` · `ultima_vez_en` | timestamptz | no | |
| `desaparecio_en` | timestamptz | sí | |
| `avisada_en` | timestamptz | sí | |

Lleva las columnas comunes (ver [base de datos](../../cimientos/BASE-DE-DATOS.md#columnas-comunes)). **Índices:** único (`clave`) donde `desaparecio_en` es nulo.

## El trabajo «Alertas de Dirección»

| | |
|---|---|
| **Cuándo** | Cada `direccion.minutos_revisar_alertas` (30 min) y al terminar el cuadre de inventario (evento `cuadre.terminado`) |
| **Lee** | Las alertas de este momento, con la función de arriba |
| **Escribe** | Una clave nueva, con su primera y su última vez; una que ya estaba, su última vez, su título y su color; una que ya no sale, `desaparecio_en` |
| **Avisa** | Por cada alerta nueva: el aviso `alerta_direccion` a las cuentas con Dirección, con su título y la liga de «Ver» (ver [avisos](../admin/avisos.md)), y `avisada_en`. Si algo cambió, el evento `alertas_direccion.cambiaron`: «hay cambios» para las pantallas de Dirección |
| **Repetible** | Una corrida sin alertas nuevas no avisa nada |

## Los indicadores

Son consultas de Dirección (fase 19), que leen al momento sin guardar nada. Nunca muestran sueldos ni costos.

| Indicador | Qué muestra | De dónde sale |
|---|---|---|
| Ventas | Lo vendido en el periodo por Tienda 1, Tienda 2, Clientes externos y En línea; ocho periodos; contra el anterior, hace cuatro semanas o la misma semana del año pasado | Las notas de entrega menos sus notas de crédito, los W- pagados y, con el POS, los cortes de las tiendas |
| Producción | Las prendas terminadas en los últimos 6 días de trabajo contra los 6 anteriores, sus 12 días, y los lotes atorados y en riesgo | Los registros de operación y los lotes |
| Existencias | Las piezas de cada una de las siete ubicaciones y su total | Las existencias |
| Cuentas por cobrar y pagar | Los saldos, lo vencido y lo detenido | `contaduria.resumen_direccion` |

En Pendientes, el periodo es el de `direccion.primer_vistazo`: la semana o el día. Las autorizaciones que esperan y sus días son de [autorizaciones](autorizaciones.md).

## Parámetros

Los cambia solo la dueña, en Configuración (ver [configuración](../admin/configuracion.md)).

| Parámetro | Valor inicial | Sección | Para qué |
|---|---|---|---|
| `direccion.primer_vistazo` | Semana (o Día) | Decisiones de operación | El periodo de los indicadores en Pendientes de Dirección |
| `direccion.alerta_consumo_tela_max` | 2 | Parámetros | Cuántas prendas salen, a lo más, en la alerta de consumo de tela |
| `direccion.alerta_concentracion_cliente_pct` | 35 % | Parámetros | La parte del saldo por cobrar que prende la alerta de concentración |
| `direccion.alerta_concentracion_vencido_dias` | 30 días | Parámetros | El vencido que pone roja esa alerta |
| `direccion.alerta_reposicion_max` | 2 | Parámetros | Cuántos materiales salen, a lo más, en «sin tiempo de reposición» |
| `direccion.minutos_revisar_alertas` | 30 min | Técnicos | Cada cuánto corre el trabajo de alertas |

El aviso usa `avisos.correo_alerta_direccion` (No), de [avisos](../admin/avisos.md#parámetros).

## Permisos

- Las alertas y los indicadores los ve quien tiene Dirección.
- Sin «ven sueldos y tarifas», «Por pagar» no lleva la nómina.

## Eventos

`alertas_direccion.cambiaron`.

## Lo que llega después

- **Fase 19:** Dirección: Pendientes, Indicadores y Alertas cruzadas, con su «Ver».
- **Con el POS:** las ventas de las tiendas en el indicador de Ventas, y las cajas en la alerta de aparatos sin sincronizar.

## Cómo está hecho

*Lo escribe Claude Code al terminar la fase 18.*
