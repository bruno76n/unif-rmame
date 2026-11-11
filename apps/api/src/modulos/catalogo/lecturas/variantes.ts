/**
 * `catalogo.variante_por_codigo`: la variante de un código de prenda de 6 dígitos.
 * Fase 13 · docs/modulos/catalogo/variantes-codigos-y-etiquetas.md («Lecturas»)
 */

import { eq } from "drizzle-orm";
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
