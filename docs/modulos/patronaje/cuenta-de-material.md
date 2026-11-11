# Cuenta de material

> **Qué cubre:** la única cuenta de tela y avíos de todo el sistema: cuánto lleva un corte o un pedido, material por material y en la unidad en que se guarda, con el desperdicio de la prenda; y cómo sale ese desperdicio de los cortes.
> **Estado:** Decidido.
> **Se construye en:** [fase 10](../../fases/10-patronaje-y-compras.md).
> **Se conecta con:** [recetas](recetas.md) · [paquete compartido](../../cimientos/PAQUETE-COMPARTIDO.md) · [proyección de material](../compras/proyeccion-de-material.md) · [existencias y cuadre](../inventario/existencias-y-cuadre.md) · [corte y bultos](../produccion/corte-y-bultos.md) · [mandar a producción](../ventas/mandar-a-produccion.md) · [pantallas de Ventas](../../interfaz/fabrica/ventas.md) · [entregas a corte](../inventario/entregas-a-corte.md) · [alertas e indicadores](../direccion/alertas-e-indicadores.md) · [pantallas de Patronaje](../../interfaz/fabrica/patronaje.md) · [pantallas de Producción](../../interfaz/fabrica/produccion.md)

## Para qué sirve

Ventas, al revisar un pedido antes de mandarlo a producción; Compras, para saber cuánto está comprometido; Bodega, para entregar al corte; y el corte, para saber si la tela alcanza y cuánta se usó, porque nadie la mide: todos usan esta misma cuenta, y nadie la copia. Sale de la receta vigente y del desperdicio de la prenda.

Ejemplo de la muestra: con su receta, el corte L-2026-122 de 190 piezas lleva 214 m de gabardina azul marino, 190 cierres de 14 cm, 190 botones, 190 etiquetas de talla y 1 cono de hilo poliéster marino.

## Reglas

1. **Para cortar,** por talla: la tela principal es metros del patrón × (1 + desperdicio ÷ 100). La combinación, el forro y los avíos van sin desperdicio.
2. **El desperdicio de una prenda** es el que dejan sus cortes; mientras no tiene cortes, `patronaje.desperdicio_estimado_pct` (6 %).
3. **Lo que lleva un corte o un pedido,** material por material: la suma por talla de piezas × cantidad de la talla (o piezas totales × cantidad, si va igual en todas las tallas), la tela principal con su desperdicio, y todo dividido entre la conversión de la versión (`receta_por_unidad_inventario`), para dejarlo en la unidad en que se guarda el material.
4. **El redondeo:** todo hacia arriba, al entero de su unidad de inventario (214 m, 190 pza); un material que se cuenta entero (conos, cajas) lleva al menos 1. Si falta un dato (no hay receta, o una talla no tiene valor), ese material sale «—» y no cuenta.
5. **El desperdicio medido de un lote:** metros usados de la tela principal en su corte ÷ metros del patrón del lote − 1. Los usados son lo que pide la receta, con sus decimales, salvo que el corte haya cambiado lo que quedó: así, solo un corte con algo distinto mueve el desperdicio de la prenda (ver [corte y bultos](../produccion/corte-y-bultos.md)). Los metros del patrón son las piezas cortadas por talla × los metros de la tela principal de esa talla en la versión con la que se cortó el lote. Un lote que quedó abajo del piso del patrón no cuenta.
6. **El desperdicio de una prenda** junta todos sus lotes cortados, cada uno contra los metros de su propia versión: Σ metros reales ÷ Σ metros del patrón − 1. Su respaldo es cuántos lotes lleva. Es **alto** si pasa de `patronaje.desperdicio_alto_pct` (10 %): sale en rojo en Rendimiento y en los indicadores de Patronaje. Es **dato flojo** con menos de `patronaje.dato_flojo_lotes` (3) lotes. El «real» de cada talla es estimado: su patrón × (1 + desperdicio), porque el rollo solo da metros por lote.
7. **Una sola cuenta.** La cuenta vive como función pura en el [paquete compartido](../../cimientos/PAQUETE-COMPARTIDO.md): la pantalla la corre mientras se escribe y la API la vuelve a correr al guardar, con los mismos insumos. La API nunca confía en lo que calculó la pantalla.

## Lecturas

### `patronaje.calcular_material(producto, piezas_por_talla, version)`

| | |
|---|---|
| **La usan** | Ventas (la revisión del pedido), Compras (el comprometido), Bodega (la entrega al corte) y Producción (el corte) |
| **Recibe** | El producto, las piezas por talla y, si se pide, una versión de la receta (si no, la vigente) |
| **Regresa** | Por material: cuánto lleva en su unidad de inventario, con la regla 4, o «—» |

### `patronaje.desperdicio_prenda(producto)`

| | |
|---|---|
| **La usan** | Patronaje, Compras, Bodega, Producción y Dirección |
| **Recibe** | La prenda, o ninguna para todas las que tienen lotes cortados (la alerta de Dirección, desde la fase 18) |
| **Regresa** | El desperdicio medido y su respaldo (cuántos lotes), si es alto y si es dato flojo; o el estimado, si no se ha medido |

## Parámetros

Los cambia solo la dueña, en Configuración (ver [configuración](../admin/configuracion.md)). Todos van en «Parámetros».

| Parámetro | Valor inicial | Para qué |
|---|---|---|
| `patronaje.desperdicio_estimado_pct` | 6 % | El desperdicio de una prenda que todavía no tiene cortes |
| `patronaje.desperdicio_alto_pct` | 10 % | Más que esto es desperdicio alto |
| `patronaje.dato_flojo_lotes` | 3 lotes | Con menos lotes medidos, el desperdicio es dato flojo |

## Permisos

Las lecturas no tienen dinero y las usan los módulos que dice su tabla. Quien ve el resultado en una pantalla es quien ve esa pantalla.

## Lo que llega después

- **Fase 12:** el desperdicio medido, con los cortes cerrados. Hasta entonces, toda prenda usa el estimado.

## Cómo está hecho

**Fase 10, parte 2.**

- **La cuenta** es `cuentaDeMaterial` (`packages/compartido/src/calculos/cuenta-material.ts`): recibe los materiales de la versión (con su conversión congelada y si su unidad se cuenta entera), las piezas por talla y el desperdicio como texto decimal. Cuenta en milésimos con `BigInt`: Σ piezas × cantidad × (100 000 + desperdicio) ÷ (100 000 × conversión), hacia arriba. Un material que se cuenta entero lleva al menos uno si hay piezas (decisión 530).
- **`patronaje.calcular_material`** (`modulos/patronaje/lecturas/recetas.ts`) lee la versión (la vigente, o la que se pida), si cada unidad se cuenta entera (de «Unidades de material») y el desperdicio, y corre la misma función. Sin receta regresa la versión vacía y ningún material.
- **`patronaje.desperdicio_prenda`** regresa siempre `prendas`: con una prenda, su estimado (`patronaje.desperdicio_estimado_pct`), no medido, sin lotes y dato flojo; sin prenda, ninguna. El medido llega con los cortes de la fase 12 (decisión 527).
- **Pruebas:** `packages/compartido/src/calculos/cuenta-material.prueba.ts` (el corte de la muestra, la combinación y los centímetros, la talla sin valor, el mínimo de uno, y 2,000 casos al azar: siempre el entero de arriba de la cuenta exacta, y más desperdicio nunca da menos) y `modulos/patronaje/lecturas/calcular-material.prueba.ts` (la API da lo mismo que la función con los mismos insumos).
