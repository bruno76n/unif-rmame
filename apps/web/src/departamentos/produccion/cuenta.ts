/**
 * Las direcciones de lo que Producción abre en otro departamento: «Ver pedido» solo con Ventas a externos, «Capturar
 * receta» y «Ver receta» con Patronaje (`useTieneDepartamento`, de lo común).
 * Fase 19 · docs/interfaz/fabrica/produccion.md («Quién entra»)
 */

/** Las direcciones de lo que Producción abre en otro departamento. */
export const enOtroDepartamento = {
	/** El cajón del pedido en Ventas a externos. */
	pedido: (pedidoId: string) => `/ventas/pedidos?cajon=pedido&id=${pedidoId}`,
	/** La receta de una prenda en Patronaje. */
	receta: (productoId: string) => `/patronaje/recetas?cajon=receta&id=${productoId}`,
};
