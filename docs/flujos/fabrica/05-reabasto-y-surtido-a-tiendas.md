# Flujo 05 · Reabasto y surtido a tiendas

> **Qué cubre:** el reabasto de Bodega del mínimo a la sugerencia, la orden y el lote que la llena, y el surtido a una tienda sin caja: «Mandar a {tienda}», la recepción en Aduana, el despacho y la entrega con la firma de su encargada; lo que tiene que cuadrar al final y lo que sale mal.
> **Estado:** Decidido.
> **Se construye en:** [fase 21](../../fases/21-pruebas-de-punta-a-punta.md).
> **Se conecta con:** [pruebas](../../cimientos/PRUEBAS.md) · [mínimos y reabasto](../../modulos/inventario/minimos-y-reabasto.md) · [migración](../../MIGRACION.md) · [fase 21](../../fases/21-pruebas-de-punta-a-punta.md)

## Qué prueba

Que Bodega nunca se queda sin las tallas que más se venden y que nadie fabrica dos veces lo mismo: lo que falta se sugiere una vez, Producción lo levanta y llega a Bodega. Y que lo que se manda a una tienda sale de Bodega, pasa por Aduana y solo se da por entregado con la firma de quien lo recibe.

## Datos de arranque

- Los datos de la muestra.
- **Bodega bajo su mínimo:** 12 playeras polo blancas talla 10, todas libres, una talla de mayor venta (mínimo 30, meta 60), sin nada en camino ni sugerido.
- **En Bodega, libres:** 20 pants deportivos talla 12.
- **La Tienda 1 sin caja:** Unifórmame todavía no lleva su existencia (ver [migración](../../MIGRACION.md#las-tiendas-sin-caja)).
- **Las cuentas:** Bodega, Aduana y el encargado del taller.

## Pasos

| # | Quién · dónde | Qué hace | Qué tiene que pasar |
|---|---|---|---|
| 1 | Bodega · Reabasto | El renglón de la playera talla 10 en «Fabricación»: «Fabricar 48». «A producción» → `inventario.sugerir_fabricar` | «Sugerencia enviada a producción: 48 Playera polo blanca 10»; la Tienda 1 no sale en Reabasto |
| 2 | Producción · Pendientes | «Sugerencia de bodega» · «Levantar orden» → `produccion.levantar_orden_sugerencia` | «{OP} levantada: {L}, {n} piezas por cortar»: una orden de temporada para Bodega; la sugerencia queda levantada con su orden y su lote |
| 3 | Bodega · Reabasto | Vuelve a mirar | La playera talla 10 sale en «Sugerido a producción» con «48 pedidas a producción»; no propone fabricar otra vez |
| 4 | Taller, Calidad y Aduana | El lote sigue como en el [flujo 01](01-pedido-externo.md) hasta Aduana: todo aprobado y recibido | Un A- `lote_temporada` en aduana con destino Bodega y sus etiquetas por imprimir |
| 5 | Aduana y Bodega | Imprime sus etiquetas, despacha a Bodega y Bodega recibe | Bodega sube a 60 o más; la sugerencia ya no cuenta como en camino y el renglón sale de Reabasto |
| 6 | Bodega · cajón de la variante | La Tienda 1 pidió por teléfono 10 playeras talla 10: «Mandar a Tienda 1», 10 → `inventario.mover_a_tienda` | «Traspaso a Tienda 1: 10 Playera polo blanca 10, enviado a aduana»: un A- `reabasto` en camino a aduana con el RB- de hoy de la Tienda 1 |
| 7 | Bodega · cajón de la variante | El mismo día, 5 pants talla 12 a la Tienda 1 | Su propio A-, con el mismo RB- |
| 8 | Aduana · Recibir lo que viene en camino | «Llegó completo», los dos → `inventario.recibir_en_aduana` | «{A} recibido en aduana: {n} piezas para Tienda 1», cada uno |
| 9 | Aduana · Despachar | Los dos juntos, «Despachar a Tienda 1» → `inventario.despachar`, y su «Hoja» | Un D- en tránsito con los dos A-; la hoja lleva las 15 piezas, sin precios, y los renglones para la firma |
| 10 | Aduana · En tránsito | Con la hoja firmada por Rosa Elena: «Confirmar entrega», «Llegó completo» → `inventario.entregar_a_tienda_sin_caja` | «{D} entregado en Tienda 1: 15 piezas»: las piezas salen de Tránsito a Fuera y el despacho queda recibido |

## Lo que tiene que cuadrar al final

- **Bodega:** 12 + las aprobadas del lote − 10 playeras talla 10, y 20 − 5 pants talla 12. Ninguna sugerencia por decidir de esas variantes.
- **La Tienda 1:** sin existencia en Unifórmame; las 15 piezas quedaron en el libro como entregadas en ella, con quién firmó, en su RB- del día.
- **Los tramos:** nada en camino a aduana, en aduana ni en tránsito por estos traspasos; la existencia es la suma del libro y el cuadre de la noche no deja residuo.
- **La sugerencia:** levantada, con su orden y su lote, y el lote en aduana.

## Lo que sale mal

- **Mandar más de lo libre:** se mueve lo que hay y avisa «{prenda} talla {t}: solo se movieron {n}»; con nada libre, `sin_libres`.
- **Dos «Mandar» al mismo tiempo para la misma tienda:** los dos A- quedan con el mismo RB-, y ninguno toma piezas que el otro ya tomó.
- **La hoja firmada dice que faltó una:** «Llegó con diferencias»: 14 salen a la tienda, una se queda en Tránsito a cargo de Aduana, por aclarar (ver [flujo 08](08-diferencias-y-ajustes.md)).
- **Levantar dos veces la misma sugerencia:** `sugerencia_ya_decidida`.
- **Bodega sugiere otra vez antes de que llegue el lote:** lo ya sugerido cuenta y no propone de más.
- **Confirmar la entrega de una tienda que ya lleva su existencia:** `no_es_tienda_sin_caja`; esa tienda confirma desde su caja (con el POS).

## Cómo está hecho

*Lo escribe Claude Code al terminar la fase 21.*
