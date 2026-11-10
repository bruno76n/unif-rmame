# Proyección de material

> **Qué cubre:** la cuenta de cada material que alimenta Por pedir: lo que hay, lo comprometido con los lotes por cortar, lo que viene en camino, el consumo por día según el mes, el día en que se acaba, el plazo del proveedor, el estado y cuánto pedir.
> **Estado:** Decidido.
> **Se construye en:** [fase 10](../../fases/10-patronaje-y-compras.md).
> **Se conecta con:** [materiales](materiales.md) · [órdenes de compra](ordenes-de-compra.md) · [proveedores y precios](proveedores-y-precios.md) · [cuenta de material](../patronaje/cuenta-de-material.md) · [existencias y cuadre](../inventario/existencias-y-cuadre.md) · [material en bodega](../inventario/material-en-bodega.md) · [lotes](../produccion/lotes.md) · [mandar a producción](../ventas/mandar-a-produccion.md) · [alertas e indicadores](../direccion/alertas-e-indicadores.md) · [paquete compartido](../../cimientos/PAQUETE-COMPARTIDO.md) · [pantallas de Compras](../../interfaz/fabrica/compras.md) · [entregas a corte](../inventario/entregas-a-corte.md)

## Para qué sirve

Una sola cuenta por material alimenta Por pedir, el estado de cada material, el pedido sugerido, el cajón «por qué», la lista de Materiales, la revisión de Ventas antes de mandar a producción, lo que Bodega tiene libre para el corte y la alerta de Dirección «sin tiempo de reposición». Nadie la copia.

Ejemplo de la muestra, con hoy el 11 de octubre: de gabardina azul marino hay 700 m; 331 m están comprometidos con los lotes L-2026-122 (214 m) y L-2026-123 (117 m), así que quedan 369 m libres, y en octubre se gastan 34 m al día. Se acaba el 21 de octubre. Textiles Aurora tarda 14 días: un pedido de hoy llegaría el 25, y faltarán 4 días de material. El pedido sugerido es para el 25 de octubre: el consumo del 25 de octubre al 23 de diciembre (1,523 m) más el mínimo de 150 m da 1,673 m, que de 50 en 50 son 1,700 m.

## Reglas

1. **Hay:** la existencia del material en Bodega y en Aduana, en su unidad de inventario (ver [existencias y cuadre](../inventario/existencias-y-cuadre.md)).
2. **Comprometido:** lo que piden los lotes «Por cortar» de cada material que todavía no reciben de Bodega (una tela ya entregada, o los avíos ya entregados, dejan de contar), con la cuenta de material de Patronaje: la tela principal con el desperdicio de la prenda, lo demás sin desperdicio, todo hacia arriba en su unidad (ver [cuenta de material](../patronaje/cuenta-de-material.md)). Un lote de una prenda sin receta no compromete nada.
3. **En camino:** lo que falta de cada línea de las órdenes enviadas o recibidas en parte, en su llegada esperada: la fecha prometida o, si ya pasó, hoy más `compras.dias_espera_orden_atrasada` (3) días (ver [órdenes de compra](ordenes-de-compra.md)). Los borradores no cuentan.
4. **Libre,** en tres sentidos:
   - **para comprar:** hay en bodega + hay en aduana − comprometido. Es el que usa la proyección, Materiales y el cajón Material;
   - **para el corte:** hay en bodega − comprometido, porque lo de aduana no se entrega al corte;
   - **en «La cuenta»** del cajón «por qué»: hay + en camino − comprometido.
5. **Bajo mínimo:** lo libre para comprar es menor que el mínimo del material.
6. **Consumo por día:** el consumo de un mes normal (ver [abajo](#el-consumo)) por el factor del mes de ese día, `compras.factor_consumo_{mes}`.
7. **Día en que se acaba:** se recorre día por día desde hoy (el consumo de hoy cuenta), hasta `compras.dias_maximos_proyeccion` (420) días: lo libre para comprar, más lo que llega hasta ese día, menos el consumo acumulado. El primer día en que baja de cero es el día en que se acaba. Si lo libre ya es negativo, se acaba hoy. Si no baja de cero en esos días, no tiene día en que se acaba y cuenta como sin consumo.
8. **Lo que faltó no se recupera:** en la serie de cada día, una llegada que encuentra la existencia en negativo suma desde cero.
9. **Plazo:** el plazo real del proveedor habitual (ver [proveedores y precios](proveedores-y-precios.md)). Un pedido de hoy llegaría hoy + plazo.
10. **Fecha límite para pedir:** el día en que se acaba − plazo. **Días sin material:** (hoy + plazo) − el día en que se acaba, cuando es mayor que cero.
11. **Estado:**

    | Estado | Cuándo |
    |---|---|
    | «Sin tiempo de entrega» (rojo) | Habrá días sin material |
    | «Pedir esta semana» (ámbar) | La fecha límite cae dentro de `compras.dias_pedir_esta_semana` (7) días o menos |
    | «Alcanza» (verde) | Lo demás, también sin consumo |

    Su línea: «Faltará material {n} días» · «Pedir hoy» (la fecha límite es hoy) · «Pedir antes del {fecha}» · «Pedir en más de 6 meses» (la fecha límite está a más de `compras.dias_etiqueta_mas_de_6_meses`, 200 días) · «Sin consumo todavía».
12. **Para cuándo:** el pedido sugerido se calcula para llegar el día en que se acaba, si todavía da tiempo. Si ya no da tiempo, o si no hay consumo, para hoy + plazo.
13. **Por pedir** (el pedido sugerido): el consumo por día de los `dias_cubre` días del material contados desde «para cuándo», ese día incluido, más el mínimo, hacia arriba al múltiplo de compra.
14. **Con otra cantidad:** con esa cantidad llegando el día «para cuándo», «alcanza hasta» el primer día desde esa llegada en que la existencia vuelve a bajar de cero; si no baja en los 365 días siguientes, «alcanza más de un año».
15. **En borrador:** un material que está en una orden en borrador lleva esa marca, con su folio, y sigue en Por pedir, porque el borrador no cuenta en camino.
16. **Las cantidades** se suman en milésimas enteras, como todo material (ver [paquete compartido](../../cimientos/PAQUETE-COMPARTIDO.md)), y solo el pedido sugerido se redondea.

## El consumo

- **Mientras no se mide,** el consumo de un mes normal es el `consumo_diario_inicial` que Compras escribe en el material. Vacío, el material no tiene consumo.
- **Medido:** cuando el material tiene salidas desde hace al menos `compras.dias_consumo_medido` (90) días, el consumo de un mes normal sale de las salidas de esos últimos días, sin contar hoy: cada día se divide entre el factor de su mes y el total se divide entre los días. Así un julio de temporada no se toma por un mes normal.
- **Qué cuenta como salida,** leído del libro de movimientos: la tela y los avíos que Bodega entregó al corte menos lo que regresó (rollos y retazos); los consumibles que el taller tomó en la tablet.
- **Los factores de cada mes son de todo el sistema,** iguales para todos los materiales.

Ejemplo: un avío con 90 días de salidas, de las cuales 30 días fueron de julio (factor 3.2) con 96 piezas al día: cada uno de esos días cuenta como 96 ÷ 3.2 = 30 piezas de un mes normal.

## Lecturas

### `compras.cuenta_material(materiales)`

| | |
|---|---|
| **La usan** | Compras (Por pedir, Pendientes, Materiales y sus cajones), Ventas (la revisión antes de mandar a producción: lo libre y lo que llega), Bodega (lo libre para el corte) y Dirección (la alerta «{material} sin tiempo de reposición») |
| **Recibe** | Los materiales que se quieren, o ninguno para todos los activos |
| **Regresa** | Por material: hay en bodega y en aduana; el comprometido, por lote; lo que viene, por orden, con su llegada esperada y si está atrasada; lo libre en sus tres sentidos y si está bajo mínimo; el consumo de un mes normal y si es inicial o medido; el consumo por día de cada mes; el día en que se acaba; el plazo; la fecha límite; los días sin material; el estado y su línea; para cuándo; el pedido sugerido; y si está en un borrador, con su folio |

Calcula todos los materiales en una sola pasada y la memoriza durante la petición: Por pedir, Pendientes y la alerta de Dirección leen los mismos números. No se guarda.

## La proyección en el paquete compartido

El cajón «por qué» cambia «Con {cantidad} alcanza hasta…» y su gráfica mientras se escribe la cantidad. Por eso los pasos 7 a 14, que no tocan la base, son una función pura del [paquete compartido](../../cimientos/PAQUETE-COMPARTIDO.md): recibe hoy, lo libre, las llegadas, el consumo de un mes normal, los factores, el plazo, el mínimo, el múltiplo, los días que cubre, los límites de los parámetros y, si hay, otra cantidad; regresa la serie de cada día y todo lo que sale de ella. La consulta del cajón da esos insumos, la pantalla la corre mientras se escribe, y `compras.cuenta_material` usa la misma función.

## Parámetros

Los cambia solo la dueña, en Configuración (ver [configuración](../admin/configuracion.md)). Todos van en «Parámetros».

| Parámetro | Valor inicial | Para qué |
|---|---|---|
| `compras.factor_consumo_ene` … `compras.factor_consumo_dic` | ene 0.9 · feb 0.8 · mar 0.9 · abr 1.1 · may 1.7 · jun 2.5 · jul 3.2 · ago 2.2 · sep 1.2 · oct 1.0 · nov 0.8 · dic 0.6 | Cuántas veces lo de un mes normal se consume en cada mes. Mayores que 0 |
| `compras.dias_consumo_medido` | 90 días | Los días de salidas con que se mide el consumo |
| `compras.dias_maximos_proyeccion` | 420 días | Hasta dónde se busca el día en que se acaba |
| `compras.dias_pedir_esta_semana` | 7 días | El estado «Pedir esta semana» |
| `compras.dias_etiqueta_mas_de_6_meses` | 200 días | La línea «Pedir en más de 6 meses» |
| `compras.fecha_regreso_clases` | 17 ago 2027 | La bandera de la línea de tiempo de Por pedir; su horizonte largo llega al fin de ese mes |
| `compras.horizonte_corto_semanas` | 12 semanas | El horizonte corto de la línea de tiempo de Por pedir |

Usa también `compras.dias_espera_orden_atrasada` ([órdenes de compra](ordenes-de-compra.md#parámetros)) y el desperdicio de cada prenda de Patronaje ([cuenta de material](../patronaje/cuenta-de-material.md#parámetros)).

## Permisos

La cuenta no lleva dinero: la usan los módulos de su tabla, y quien ve un número es quien ve esa pantalla.

## Lo que llega después

- **Fase 11:** lo recibido de cada línea, que baja lo que viene en camino, y el plazo real con las recepciones.
- **Fase 12:** el comprometido, con los lotes por cortar de Producción que todavía no reciben su material; y las salidas para el consumo medido: las entregas al corte, los rollos y retazos que regresan, y los consumibles que toma el taller. Hasta entonces nada está comprometido.
- **Fase 16:** Ventas lee la cuenta en la revisión antes de mandar a producción.
- **Fase 18:** la alerta de Dirección «{material} sin tiempo de reposición» (ver [alertas e indicadores](../direccion/alertas-e-indicadores.md)).
- **Fase 19:** Por pedir, Pendientes, Materiales y el cajón «por qué», con la función del paquete compartido.

## Cómo está hecho

*Lo escribe Claude Code al terminar la fase 10.*
