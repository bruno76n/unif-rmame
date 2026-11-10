# Flujo 03 · Producto nuevo

> **Qué cubre:** una prenda nueva de punta a punta: el desarrollo con su muestra y la aprobación de Dirección, el alta en Catálogo a partir de otra prenda, la receta copiada y corregida, sus etiquetas, la primera orden y el primer corte que verifica la receta; lo que tiene que cuadrar al final y lo que sale mal.
> **Estado:** Decidido.
> **Se construye en:** [fase 21](../../fases/21-pruebas-de-punta-a-punta.md).
> **Se conecta con:** [pruebas](../../cimientos/PRUEBAS.md) · [productos](../../modulos/catalogo/productos.md)

## Qué prueba

Que una prenda que no existía llega a la tienda sin atajos: Dirección aprueba la muestra, Catálogo le da códigos que nunca se repiten, Patronaje deja su receta, Compras sabe cuánta tela lleva y el primer corte la verifica.

## Datos de arranque

- Los datos de la muestra.
- **Una prenda base** con receta verificada: la chamarra deportiva marino, con su tela, su forro y sus avíos en Bodega.
- **El siguiente código de barras de la fábrica** conocido antes de empezar.
- **Las cuentas:** la dueña (Dirección), la oficina (Catálogo y Compras), Patronaje, Bodega y el encargado del taller.

## Pasos

| # | Quién · dónde | Qué hace | Qué tiene que pasar |
|---|---|---|---|
| 1 | Patronaje · Desarrollo de producto | «Nueva solicitud»: chamarra rompevientos, sin escuela, su tela y sus tallas → `patronaje.registrar_solicitud` | «{DS} registrada en Solicitud» |
| 2 | Patronaje · cajón del desarrollo | «Empezar muestra» → `patronaje.empezar_muestra`; luego «Muestra lista para aprobar» → `patronaje.entregar_muestra` | El desarrollo en aprobación, «Esperando aprobación de Dirección», con su AU- en Dirección |
| 3 | Dirección · Autorizaciones | Autoriza la muestra → `direccion.decidir_autorizacion` | El desarrollo pasa a ficha técnica en la misma transacción (`patronaje.aplicar_decision_desarrollo`) |
| 4 | Patronaje · cajón del desarrollo | «Dar de alta en catálogo», a partir de la chamarra deportiva → `catalogo.crear_producto` | «{producto} creado con {n} variantes, códigos {a} a {b}»: los códigos siguen al último sin hueco; las tallas normales nacen «Por imprimir»; los precios base de cada lista; la receta del base se copia como versión 1 sin verificar; el desarrollo queda en catálogo, ligado al producto |
| 5 | Patronaje · receta | Cambia la tela por talla y un avío, con motivo → `patronaje.guardar_receta` | La versión 2, sin verificar |
| 6 | Catálogo · Etiquetas | «PDF de {n} etiquetas» → `catalogo.imprimir_etiquetas` | El PDF con una etiqueta por talla; las variantes quedan impresas y la prenda sale de «Sin etiqueta» |
| 7 | Producción · Órdenes de producción | «Nueva orden de producción»: temporada para Bodega, 40 piezas → `produccion.crear_orden` | «{OP} levantada: {L}, 40 piezas por cortar»; Compras ve la tela que lleva con la versión 2 |
| 8 | Bodega y Producción | Entrega al corte de los rollos de la tela y del forro, y «Cerrar corte» sin tocar lo que quedó → `inventario.entregar_al_corte` y `produccion.cerrar_corte` | «{L} cortado. La receta de {prenda} queda verificada»: el lote congela la versión 2 y la receta queda verificada con ese lote; de la tela y del forro se usó lo que pide la receta, y lo que sobró de cada uno queda por recibir en Bodega |
| 9 | Tablet, Calidad y Aduana | El lote sigue como en el [flujo 01](01-pedido-externo.md) hasta Aduana, y Aduana lo despacha a Bodega | Las chamarras rompevientos aprobadas quedan en Bodega, cada una con su etiqueta impresa en Aduana |

## Lo que tiene que cuadrar al final

- **Los códigos:** uno por talla, seguidos desde el siguiente que había; el contador quedó en el último más uno y ningún código se repite en toda la base.
- **La receta:** versión 1 copiada, versión 2 con su motivo, y la 2 verificada por el lote que la congeló.
- **La tela:** lo comprometido para el lote era lo de la versión 2 por 40 piezas, de la tela y del forro; lo que se usó es lo de la receta y quedó en el corte y en el libro.
- **El desarrollo:** en catálogo, con su producto, su AU- autorizada y sus pasos en orden.
- **El inventario:** las chamarras en Bodega son las aprobadas; la existencia es la suma del libro.

## Lo que sale mal

- **Dirección rechaza la muestra** con motivo: el desarrollo regresa a muestra con ese motivo y se vuelve a entregar.
- **Se descarta el desarrollo** con motivo antes del alta: queda descartado en el historial, sin producto.
- **La prenda sin receta:** la orden avisa «Falta la receta: no se corta hasta que Patronaje la capture» y la entrega al corte responde `sin_receta`.
- **La receta cambia mientras se captura el corte:** `receta_cambio`, y el corte se vuelve a revisar con la versión nueva.
- **El forro no está en Bodega:** la entrega pasa la tela con el aviso «Faltan {m} m de {forro} para el corte completo»; el forro sigue comprometido, se entrega cuando llega, y sin él el corte no cierra (`falta_tela`).
- **Una talla de pedido especial** no entra en las etiquetas de Catálogo: `talla_especial`.
- **Dos altas a la vez:** cada una toma sus propios códigos seguidos, sin repetir ni dejar hueco.

## Cómo está hecho

*Lo escribe Claude Code al terminar la fase 21.*
