/**
 * Las lecturas de las variantes: `catalogo.variante_por_codigo`, la variante de un código de prenda de 6 dígitos, y
 * `catalogo.datos_variantes`, lo que Tienda en línea congela de cada prenda de un W-.
 * Fase 13 · docs/modulos/catalogo/variantes-codigos-y-etiquetas.md («Lecturas»)
 * Fase 18 · `catalogo.datos_variantes`
 */

import { eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import { productos, tallas, variantes } from "../tablas.ts";

/**
 * La variante de un código, con su producto y su talla; también la dada de baja, porque la prenda ya se hizo.
 * @param datos `codigo`.
 * @returns La variante, o vacío si el código no es de ninguna prenda.
 */
export async function variantePorCodigo(contexto: ContextoDeAccion, datos: unknown) {
	const { codigo } = z.object({ codigo: z.string() }).parse(datos);
	const [variante] = await contexto.transaccion
		.select({
			variante_id: variantes.id,
			producto_id: variantes.productoId,
			producto: productos.nombre,
			talla_id: variantes.tallaId,
			talla: tallas.nombre,
		})
		.from(variantes)
		.innerJoin(productos, eq(productos.id, variantes.productoId))
		.innerJoin(tallas, eq(tallas.id, variantes.tallaId))
		.where(eq(variantes.codigo, codigo.trim()));
	return variante ?? null;
}

/** Lo que recibe `catalogo.datos_variantes`. */
const deVariantes = z.object({ variante_ids: z.array(z.uuid()) }).strict();

/**
 * `catalogo.datos_variantes`: por variante, su producto y su nombre, su talla, si está dada de baja y si su producto
 * se vende en línea (activo y con el canal «Tienda en línea»).
 * @param datos `variante_ids`.
 * @returns Las que existen; la que no existe no viene.
 */
export async function datosVariantes(contexto: ContextoDeAccion, datos: unknown) {
	const { variante_ids } = deVariantes.parse(datos);
	if (variante_ids.length === 0) return { variantes: [] };
	const filas = await contexto.transaccion
		.select({
			variante_id: variantes.id,
			producto_id: variantes.productoId,
			producto: productos.nombre,
			talla: tallas.nombre,
			varianteBaja: variantes.bajaEn,
			productoBaja: productos.bajaEn,
			canalEnLinea: productos.canalEnLinea,
		})
		.from(variantes)
		.innerJoin(productos, eq(productos.id, variantes.productoId))
		.innerJoin(tallas, eq(tallas.id, variantes.tallaId))
		.where(inArray(variantes.id, [...new Set(variante_ids)]));
	return {
		variantes: filas.map((fila) => ({
			variante_id: fila.variante_id,
			producto_id: fila.producto_id,
			producto: fila.producto,
			talla: fila.talla,
			dada_de_baja: fila.varianteBaja !== null,
			se_vende_en_linea: fila.productoBaja === null && fila.canalEnLinea,
		})),
	};
}
