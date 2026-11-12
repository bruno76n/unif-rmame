/**
 * Las lecturas de productos para las alertas de Dirección: los descontinuados con sus variantes
 * (`catalogo.productos_descontinuados`) y el nombre de unos productos (`catalogo.nombres_de_productos`).
 * Fase 18 · docs/modulos/catalogo/productos.md («Lecturas») y docs/modulos/direccion/alertas-e-indicadores.md
 */

import { asc, eq, inArray, isNotNull } from "drizzle-orm";
import { z } from "zod";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import { productos, variantes } from "../tablas.ts";

/**
 * Los productos descontinuados, con todas sus variantes (también las dadas de baja: la pieza ya existe).
 * @param contexto El contexto de quien lee (el trabajo de las alertas de Dirección).
 */
export async function productosDescontinuados(contexto: ContextoDeAccion) {
	const filas = await contexto.transaccion
		.select({ producto_id: productos.id, nombre: productos.nombre, variante_id: variantes.id })
		.from(productos)
		.innerJoin(variantes, eq(variantes.productoId, productos.id))
		.where(isNotNull(productos.bajaEn))
		.orderBy(asc(productos.nombre), asc(productos.id));
	const porProducto = new Map<string, { producto_id: string; nombre: string; variante_ids: string[] }>();
	for (const fila of filas) {
		const producto = porProducto.get(fila.producto_id) ?? {
			producto_id: fila.producto_id,
			nombre: fila.nombre,
			variante_ids: [],
		};
		producto.variante_ids.push(fila.variante_id);
		porProducto.set(fila.producto_id, producto);
	}
	return { productos: [...porProducto.values()] };
}

/**
 * `catalogo.nombres_de_productos`: el nombre de cada producto, para los títulos de las alertas de Dirección.
 * @param datos `producto_ids`.
 * @returns Por id, su nombre; el que no existe no viene.
 */
export async function nombresDeProductos(contexto: ContextoDeAccion, datos: unknown) {
	const { producto_ids } = z
		.object({ producto_ids: z.array(z.uuid()) })
		.strict()
		.parse(datos);
	if (producto_ids.length === 0) return { nombres: {} };
	const filas = await contexto.transaccion
		.select({ id: productos.id, nombre: productos.nombre })
		.from(productos)
		.where(inArray(productos.id, producto_ids));
	return { nombres: Object.fromEntries(filas.map((fila) => [fila.id, fila.nombre])) };
}
