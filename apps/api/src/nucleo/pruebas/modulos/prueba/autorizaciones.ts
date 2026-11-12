/**
 * Las autorizaciones del módulo de prueba: pedir y cancelar la de un pago de prueba, y su efecto.
 * Fase 7 · docs/fases/07-autorizaciones-y-personal.md («Criterios de terminado»: «con un efecto de prueba»)
 *
 * Usa el tipo `pago_fuera_de_lo_normal` (decisión 533), con facturas de proveedor de verdad. Desde la fase 17 ese
 * tipo tiene su efecto en Contaduría: el de prueba corre solo en el servidor con `efectoDePrueba` (decisión 699). El
 * efecto deja una nota `efecto:{decision}:{factura}`; falla con `factura_bloqueada` si hay una nota
 * `bloquea:{factura}`, e intenta escribir bitácora si hay una nota `escribe:{factura}`.
 */

import { eq } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";
import { errorDeRegla } from "../../../http/errores.ts";
import { type AccionImplementada, type ContextoDeAccion, implementarAccion } from "../../../modulos.ts";
import { cancelarFactura, pedirAprobacion } from "./contratos.ts";
import { notas } from "./tablas.ts";

/** Lo que recibe el efecto. */
const decision = z
	.object({ factura_proveedor_id: z.uuid(), decision: z.enum(["autorizar", "rechazar"]) })
	.passthrough();

/** Dice si hay una nota con ese texto. */
async function hayNota(contexto: ContextoDeAccion, texto: string): Promise<boolean> {
	return (await contexto.transaccion.select({ id: notas.id }).from(notas).where(eq(notas.texto, texto))).length > 0;
}

/**
 * El efecto de `pago_fuera_de_lo_normal` en el módulo de prueba.
 * @param contexto El contexto de la decisión.
 * @param datos La decisión y la liga.
 */
export async function aplicarDecisionPago(contexto: ContextoDeAccion, datos: unknown) {
	const { factura_proveedor_id: factura, decision: decidido } = decision.parse(datos);
	if (await hayNota(contexto, `bloquea:${factura}`)) {
		throw errorDeRegla("factura_bloqueada", "Esa factura no se puede decidir.");
	}
	if (await hayNota(contexto, `escribe:${factura}`)) contexto.bitacora({ descripcion: "El efecto escribió" });
	await contexto.transaccion
		.insert(notas)
		.values({ id: uuidv7(), texto: `efecto:${decidido}:${factura}`, montoCentavos: 0 });
	return {
		antes: { estado: "detenida" },
		despues: { estado: decidido === "autorizar" ? "por_pagar" : "detenida" },
		datos: { factura },
	};
}

/** Las acciones que piden y cancelan la autorización. */
export const accionesDeAutorizaciones: AccionImplementada[] = [
	implementarAccion(pedirAprobacion, async (contexto, datos) => {
		const pedida = z.object({ autorizacion_id: z.uuid(), folio: z.string() }).parse(
			await contexto.interna("direccion.pedir_autorizacion", {
				tipo: "pago_fuera_de_lo_normal",
				departamento_origen: "contaduria",
				resumen: datos.resumen,
				documento: "La factura",
				factura_proveedor_id: datos.factura_id,
			}),
		);
		contexto.bitacora({ descripcion: `Pidió autorizar el pago: ${pedida.folio}` });
		return { resultado: { ...pedida, mensaje: "Mandado a Dirección" } };
	}),
	implementarAccion(cancelarFactura, async (contexto, datos) => {
		await contexto.interna("direccion.cancelar_autorizacion", {
			tipo: "pago_fuera_de_lo_normal",
			documento_id: datos.factura_id,
			motivo: "Se canceló la factura",
		});
		contexto.bitacora({ descripcion: "Canceló la factura" });
		return { resultado: { mensaje: "Factura cancelada" } };
	}),
];
