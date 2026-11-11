/**
 * `compras.costo_material`: el costo de unos materiales, en centavos por unidad de inventario.
 * Fase 10 · docs/modulos/compras/proveedores-y-precios.md («El costo de un material», «Lecturas»)
 *
 * El costo es el precio vigente de su línea en la orden enviada más reciente (por la hora de envío) que no está
 * cancelada, con cualquier proveedor; sin órdenes, el precio del alta. No es un promedio.
 */

import { and, desc, eq, inArray, isNotNull, ne } from "drizzle-orm";
import { z } from "zod";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import { precioVigente } from "../dominio/ordenes.ts";
import { ordenCompraLineas, ordenesCompra, preciosCompra } from "../tablas.ts";

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
	// La línea de la orden enviada más reciente que no está cancelada, por material.
	const deOrdenes = await contexto.transaccion
		.selectDistinctOn([ordenCompraLineas.materialId], {
			materialId: ordenCompraLineas.materialId,
			precioOrdenCentavos: ordenCompraLineas.precioOrdenCentavos,
			precioNotaCentavos: ordenCompraLineas.precioNotaCentavos,
		})
		.from(ordenCompraLineas)
		.innerJoin(ordenesCompra, eq(ordenesCompra.id, ordenCompraLineas.ordenCompraId))
		.where(
			and(
				inArray(ordenCompraLineas.materialId, material_ids),
				isNotNull(ordenesCompra.enviadaEn),
				ne(ordenesCompra.estado, "cancelada"),
			),
		)
		.orderBy(ordenCompraLineas.materialId, desc(ordenesCompra.enviadaEn));
	return {
		...Object.fromEntries(delAlta.map((precio) => [precio.materialId, precio.precioCentavos])),
		...Object.fromEntries(deOrdenes.map((linea) => [linea.materialId, precioVigente(linea)])),
	};
}
