/**
 * Las autorizaciones del módulo de prueba: pedir y cancelar la de un desarrollo de prueba, y su efecto.
 * Fase 7 · docs/fases/07-autorizaciones-y-personal.md («Criterios de terminado»: «con un efecto de prueba»)
 *
 * El efecto deja una nota `efecto:{decision}:{desarrollo}`; falla con `desarrollo_bloqueado` si hay una nota
 * `bloquea:{desarrollo}`, e intenta escribir bitácora si hay una nota `escribe:{desarrollo}`.
 */

import { eq } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";
import { errorDeRegla } from "../../../http/errores.ts";
import { type AccionImplementada, type ContextoDeAccion, implementarAccion } from "../../../modulos.ts";
import { cancelarDesarrollo, pedirAprobacion } from "./contratos.ts";
import { notas } from "./tablas.ts";

/** Lo que recibe el efecto. */
const decision = z.object({ desarrollo_id: z.uuid(), decision: z.enum(["autorizar", "rechazar"]) }).passthrough();

/** Dice si hay una nota con ese texto. */
async function hayNota(contexto: ContextoDeAccion, texto: string): Promise<boolean> {
	return (await contexto.transaccion.select({ id: notas.id }).from(notas).where(eq(notas.texto, texto))).length > 0;
}

/**
 * El efecto de `aprobar_desarrollo` en el módulo de prueba.
 * @param contexto El contexto de la decisión.
 * @param datos La decisión y la liga.
 */
export async function aplicarDecisionDesarrollo(contexto: ContextoDeAccion, datos: unknown) {
	const { desarrollo_id: desarrollo, decision: decidido } = decision.parse(datos);
	if (await hayNota(contexto, `bloquea:${desarrollo}`)) {
		throw errorDeRegla("desarrollo_bloqueado", "Ese desarrollo no se puede decidir.");
	}
	if (await hayNota(contexto, `escribe:${desarrollo}`)) contexto.bitacora({ descripcion: "El efecto escribió" });
	await contexto.transaccion
		.insert(notas)
		.values({ id: uuidv7(), texto: `efecto:${decidido}:${desarrollo}`, montoCentavos: 0 });
	return {
		antes: { estado: "muestra" },
		despues: { estado: decidido === "autorizar" ? "ficha_tecnica" : "muestra" },
		datos: { desarrollo },
	};
}

/** Las acciones que piden y cancelan la autorización. */
export const accionesDeAutorizaciones: AccionImplementada[] = [
	implementarAccion(pedirAprobacion, async (contexto, datos) => {
		const pedida = z.object({ autorizacion_id: z.uuid(), folio: z.string() }).parse(
			await contexto.interna("direccion.pedir_autorizacion", {
				tipo: "aprobar_desarrollo",
				departamento_origen: "patronaje",
				resumen: datos.resumen,
				documento: "El desarrollo",
				desarrollo_id: datos.desarrollo_id,
			}),
		);
		contexto.bitacora({ descripcion: `Pidió aprobar el desarrollo: ${pedida.folio}` });
		return { resultado: { ...pedida, mensaje: "Mandado a Dirección" } };
	}),
	implementarAccion(cancelarDesarrollo, async (contexto, datos) => {
		await contexto.interna("direccion.cancelar_autorizacion", {
			tipo: "aprobar_desarrollo",
			documento_id: datos.desarrollo_id,
			motivo: "Se canceló el desarrollo",
		});
		contexto.bitacora({ descripcion: "Canceló el desarrollo" });
		return { resultado: { mensaje: "Desarrollo cancelado" } };
	}),
];
