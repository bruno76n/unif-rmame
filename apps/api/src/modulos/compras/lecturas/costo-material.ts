/**
 * `compras.costo_material`: el costo de unos materiales, en centavos por unidad de inventario.
 * Fase 10 · docs/modulos/compras/proveedores-y-precios.md («El costo de un material», «Lecturas»)
 *
 * El costo es el precio vigente de la orden enviada más reciente que no está cancelada, con cualquier proveedor;
 * sin órdenes, el precio del alta. No es un promedio. Las órdenes llegan en la parte 4: hasta entonces, todo
 * material cuesta lo de su alta.
 */

import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import { preciosCompra } from "../tablas.ts";

/** Lo que recibe: los materiales. */
const pedido = z.object({ material_ids: z.array(z.uuid()) }).strict();

/**
 * Lee el costo de unos materiales.
 * @param contexto El contexto de quien lee.
 * @param datos `material_ids`.
 * @returns Por material, su costo en centavos. Un material que no existe no viene.
 */
export async function costoMaterial(contexto: ContextoDeAccion, datos: unknown): Promise<Record<string, number>> {
	const { material_ids } = pedido.parse(datos);
	if (material_ids.length === 0) return {};
	const delAlta = await contexto.transaccion
		.selectDistinctOn([preciosCompra.materialId], {
			materialId: preciosCompra.materialId,
			precioCentavos: preciosCompra.precioCentavos,
		})
		.from(preciosCompra)
		.where(and(inArray(preciosCompra.materialId, material_ids), eq(preciosCompra.origen, "alta")))
		.orderBy(preciosCompra.materialId, desc(preciosCompra.creadoEn));
	return Object.fromEntries(delAlta.map((precio) => [precio.materialId, precio.precioCentavos]));
}
