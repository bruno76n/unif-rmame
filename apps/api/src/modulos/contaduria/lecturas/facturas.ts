/**
 * `contaduria.facturacion_de_orden`: lo que Compras lee de la facturación de sus órdenes, para «Esperando factura»
 * y el cierre de la orden pagada.
 * Fase 17 · docs/modulos/contaduria/facturas-de-proveedor.md («Lecturas»)
 */

import { and, asc, eq, inArray, ne } from "drizzle-orm";
import { z } from "zod";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import { cuentasPorPagar, facturaProveedorOrdenes, facturasProveedor } from "../tablas.ts";

/** Lo que recibe: las órdenes. */
const pedido = z.object({ orden_compra_ids: z.array(z.uuid()) }).strict();

/** Una factura no cancelada de una orden, sin montos. */
interface FacturaDeOrden {
	factura_proveedor_id: string;
	folio: string;
	estado: string;
	pagada: boolean;
}

/**
 * Por orden, sus facturas no canceladas: su folio, su estado y si su cuenta quedó pagada. Sin montos.
 * @param contexto El contexto de quien lee (Compras).
 * @param datos `orden_compra_ids`.
 * @returns `ordenes`: por orden pedida, sus facturas (una lista vacía si no tiene).
 */
export async function facturacionDeOrden(
	contexto: ContextoDeAccion,
	datos: unknown,
): Promise<{ ordenes: Record<string, FacturaDeOrden[]> }> {
	const { orden_compra_ids } = pedido.parse(datos);
	const ordenes: Record<string, FacturaDeOrden[]> = Object.fromEntries(orden_compra_ids.map((id) => [id, []]));
	if (orden_compra_ids.length === 0) return { ordenes };
	const filas = await contexto.transaccion
		.select({
			ordenCompraId: facturaProveedorOrdenes.ordenCompraId,
			id: facturasProveedor.id,
			folio: facturasProveedor.folio,
			estado: facturasProveedor.estado,
			cuenta: cuentasPorPagar.estado,
		})
		.from(facturaProveedorOrdenes)
		.innerJoin(facturasProveedor, eq(facturasProveedor.id, facturaProveedorOrdenes.facturaProveedorId))
		.innerJoin(cuentasPorPagar, eq(cuentasPorPagar.facturaProveedorId, facturasProveedor.id))
		.where(
			and(inArray(facturaProveedorOrdenes.ordenCompraId, orden_compra_ids), ne(facturasProveedor.estado, "cancelada")),
		)
		.orderBy(asc(facturasProveedor.creadoEn), asc(facturasProveedor.id));
	for (const fila of filas) {
		ordenes[fila.ordenCompraId]?.push({
			factura_proveedor_id: fila.id,
			folio: fila.folio,
			estado: fila.estado,
			pagada: fila.cuenta === "pagada",
		});
	}
	return { ordenes };
}
