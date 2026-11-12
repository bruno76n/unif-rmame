/**
 * Las internas de las facturas de proveedor: volver a revisarlas cuando cambia lo recibido de una orden, y el efecto
 * de la decisión de Dirección sobre «Pagar lo recibido».
 * Fase 17 · docs/modulos/contaduria/facturas-de-proveedor.md («`contaduria.revisar_facturas_de_orden`») y
 * cuentas-por-pagar.md («`contaduria.aplicar_decision_pago_fuera_de_lo_normal`»)
 *
 * Ninguna escribe bitácora: la revisión regresa sus renglones a la acción que la llama (la recepción) o al efecto de
 * la decisión, que los pone en su `despues`; el efecto deja el renglón a Dirección.
 */

import { eq } from "drizzle-orm";
import { z } from "zod";
import { noExiste } from "../../../nucleo/http/errores.ts";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import {
	bloquearCuentaDeFactura,
	bloquearFactura,
	bloquearOrdenes,
	type FacturaRevisada,
	montoLoRecibido,
	revisarFacturas,
} from "../dominio/facturas.ts";
import { cuentasPorPagar, facturasProveedor } from "../tablas.ts";

/** Lo que recibe `contaduria.revisar_facturas_de_orden`. */
const deUnaOrden = z.object({ orden_compra_id: z.uuid() }).strict();

/**
 * `contaduria.revisar_facturas_de_orden`: lo recibido de una orden cambió (Aduana la recibió, o Dirección rechazó lo
 * recibido de más); sus facturas detenidas y conciliadas sin pagos se vuelven a comparar (regla 6).
 * @param contexto El contexto de quien llama, que ya tiene la orden bloqueada.
 * @param datos `orden_compra_id`.
 * @returns Las facturas que cambiaron de estado, con su folio y el renglón de bitácora para quien llama.
 */
export async function revisarFacturasDeOrden(
	contexto: ContextoDeAccion,
	datos: unknown,
): Promise<{ facturas: FacturaRevisada[] }> {
	const { orden_compra_id } = deUnaOrden.parse(datos);
	const [orden] = await bloquearOrdenes(contexto, [orden_compra_id]);
	if (orden === undefined) throw noExiste();
	return { facturas: await revisarFacturas(contexto, [orden.orden_compra_id], `al recibir ${orden.folio}`) };
}

/** Lo que manda `direccion.decidir_autorizacion` al efecto. */
const decisionDePago = z
	.object({
		autorizacion_id: z.uuid(),
		decision: z.enum(["autorizar", "rechazar"]),
		factura_proveedor_id: z.uuid(),
	})
	.passthrough();

/**
 * `contaduria.aplicar_decision_pago_fuera_de_lo_normal`: el efecto que Contaduría registra para el tipo
 * `pago_fuera_de_lo_normal`. Autorizada, la factura queda autorizada con lo recibido más su IVA proporcional y la
 * diferencia por aclarar (su total no cambia), y su cuenta, por pagar por ese monto. Rechazada, la factura vuelve a
 * detenida, a cargo de Contaduría, y su cuenta sigue detenida. Corre en la transacción de la decisión, sin bitácora.
 * @param contexto El contexto de la decisión.
 * @param datos La autorización, la decisión y la factura.
 * @returns La factura antes y después, para el renglón de Dirección.
 * @throws Error del programa si la factura no espera con esa autorización.
 */
export async function aplicarDecisionPagoFueraDeLoNormal(contexto: ContextoDeAccion, datos: unknown) {
	const decision = decisionDePago.parse(datos);
	const { transaccion } = contexto;
	const factura = await bloquearFactura(transaccion, decision.factura_proveedor_id);
	if (factura.estado !== "esperando_autorizacion" || factura.autorizacionId !== decision.autorizacion_id) {
		throw new Error(`la factura ${factura.folio} no espera la autorización ${decision.autorizacion_id}`);
	}
	const cuenta = await bloquearCuentaDeFactura(transaccion, factura.id);
	const evento = (tipo: "factura_proveedor.autorizada" | "factura_proveedor.rechazada") =>
		contexto.guardarEvento({
			tipo,
			datos: { factura_proveedor_id: factura.id },
			tablas: ["facturas_proveedor", "cuentas_por_pagar"],
			entidad: "facturas_proveedor",
			entidadId: factura.id,
			entidadFolio: factura.folio,
		});
	if (decision.decision === "rechazar") {
		await transaccion
			.update(facturasProveedor)
			.set({ estado: "detenida", responsableDetencion: "contaduria" })
			.where(eq(facturasProveedor.id, factura.id));
		evento("factura_proveedor.rechazada");
		return { antes: { estado: factura.estado }, despues: { estado: "detenida" } };
	}
	const autorizado = montoLoRecibido(factura);
	await transaccion
		.update(facturasProveedor)
		.set({
			estado: "autorizada",
			montoAutorizadoCentavos: autorizado,
			diferenciaPorAclararCentavos: factura.totalFacturadoCentavos - autorizado,
		})
		.where(eq(facturasProveedor.id, factura.id));
	await transaccion
		.update(cuentasPorPagar)
		.set({ estado: "por_pagar", importeCentavos: autorizado, saldoCentavos: autorizado })
		.where(eq(cuentasPorPagar.id, cuenta.id));
	evento("factura_proveedor.autorizada");
	return {
		antes: { estado: factura.estado, importe_centavos: cuenta.importeCentavos },
		despues: { estado: "autorizada", importe_centavos: autorizado },
	};
}
