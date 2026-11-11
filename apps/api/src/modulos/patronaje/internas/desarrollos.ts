/**
 * `patronaje.aplicar_decision_desarrollo` y `patronaje.ligar_producto_desarrollo`: la decisión de Dirección sobre
 * un desarrollo sin escuela, y su alta en catálogo.
 * Fase 10 · docs/modulos/patronaje/desarrollos.md («Acciones internas»)
 *
 * El efecto de `aprobar_desarrollo` corre en la transacción de `direccion.decidir_autorizacion` y no escribe
 * bitácora: el renglón es el de Dirección.
 */

import { z } from "zod";
import { errorDeRegla } from "../../../nucleo/http/errores.ts";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import { avanzar, leerDesarrollo } from "../dominio/desarrollos.ts";

/** Lo que manda `direccion.decidir_autorizacion` al efecto. */
const decision = z
	.object({
		autorizacion_id: z.uuid(),
		decision: z.enum(["autorizar", "rechazar"]),
		motivo: z.string().optional(),
		desarrollo_id: z.uuid(),
	})
	.passthrough();

/** Lo que recibe `patronaje.ligar_producto_desarrollo`. */
const pedidoDeLigar = z.object({ desarrollo_id: z.uuid(), producto_id: z.uuid() }).strict();

/**
 * `patronaje.aplicar_decision_desarrollo`: autorizada, pasa a ficha técnica aprobada por Dirección; rechazada,
 * regresa a muestra con el motivo como cambios pedidos. Si ya no está en aprobación, no hace nada.
 * @param contexto El contexto de la decisión de Dirección.
 * @param datos La autorización, la decisión, su motivo y el desarrollo.
 * @returns Las etapas de antes y después, para la bitácora de Dirección, y el folio.
 */
export async function aplicarDecisionDesarrollo(contexto: ContextoDeAccion, datos: unknown) {
	const pedido = decision.parse(datos);
	const desarrollo = await leerDesarrollo(contexto.transaccion, pedido.desarrollo_id);
	if (desarrollo.etapa !== "aprobacion") return { datos: { desarrollo: desarrollo.folio } };
	const quien = contexto.quien.tipo === "cuenta" ? contexto.quien.usuarioId : null;
	if (pedido.decision === "autorizar") {
		await avanzar(contexto, desarrollo, {
			etapa: "ficha_tecnica",
			accion: "aprobado",
			cambios: { aprobadoEn: contexto.ahora.toString(), aprobadoPorTipo: "direccion", aprobadoPor: quien },
			autorizacionId: pedido.autorizacion_id,
		});
	} else {
		const motivo = pedido.motivo ?? "Dirección lo rechazó";
		await avanzar(contexto, desarrollo, {
			etapa: "muestra",
			accion: "cambios_pedidos",
			cambios: { motivoCambios: motivo },
			motivo,
			autorizacionId: pedido.autorizacion_id,
		});
	}
	return {
		antes: { etapa: desarrollo.etapa },
		despues: { etapa: pedido.decision === "autorizar" ? "ficha_tecnica" : "muestra" },
		datos: { desarrollo: desarrollo.folio },
	};
}

/**
 * `patronaje.ligar_producto_desarrollo`: el producto que Catálogo creó desde el desarrollo lo deja en catálogo.
 * @param contexto El contexto del alta del producto.
 * @param datos El desarrollo y el producto.
 * @returns El folio del desarrollo.
 * @throws `422 desarrollo_no_disponible`: «{DS} ya no está en Ficha técnica: revisa el desarrollo.».
 */
export async function ligarProductoDesarrollo(contexto: ContextoDeAccion, datos: unknown): Promise<{ folio: string }> {
	const pedido = pedidoDeLigar.parse(datos);
	const desarrollo = await leerDesarrollo(contexto.transaccion, pedido.desarrollo_id);
	if (desarrollo.etapa !== "ficha_tecnica") {
		throw errorDeRegla(
			"desarrollo_no_disponible",
			`${desarrollo.folio} ya no está en Ficha técnica: revisa el desarrollo.`,
		);
	}
	await avanzar(contexto, desarrollo, {
		etapa: "en_catalogo",
		accion: "alta_en_catalogo",
		cambios: { productoId: pedido.producto_id, enCatalogoEn: contexto.ahora.toString() },
	});
	return { folio: desarrollo.folio };
}
