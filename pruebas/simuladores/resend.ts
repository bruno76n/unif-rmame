/**
 * El simulador de Resend (correo) para las pruebas.
 * Fase 2 · docs/cimientos/PRUEBAS.md («Simuladores de los servicios de fuera») y docs/modulos/admin/avisos.md
 *
 * Sigue la interfaz oficial de envío (`POST https://api.resend.com/emails`): pide la llave en
 * `Authorization: Bearer`, revisa los campos obligatorios, respeta `Idempotency-Key` y guarda cada
 * correo para que la prueba lo revise. Sus errores tienen la forma de los de Resend.
 */

import { randomUUID } from "node:crypto";
import { HttpResponse, http } from "msw";
import { aplicarFalla, type ModoDeFalla } from "./fallas.ts";

/** El punto de envío de Resend. */
export const envioDeResend = "https://api.resend.com/emails";

/** Un correo que llegó al simulador. */
export interface CorreoEnviado {
	id: string;
	from: string;
	to: string[];
	subject: string;
	html: string | undefined;
	text: string | undefined;
}

/** Un error con la forma de Resend: `statusCode`, `name` y `message`. */
function errorDeResend(statusCode: number, name: string, message: string): Response {
	return HttpResponse.json({ statusCode, name, message }, { status: statusCode });
}

/** Lee un campo de texto del cuerpo, o `undefined` si no es texto. */
function texto(cuerpo: Record<string, unknown>, campo: string): string | undefined {
	const valor = cuerpo[campo];
	return typeof valor === "string" ? valor : undefined;
}

/**
 * Crea un simulador de Resend.
 * @returns Sus manejadores de MSW, los correos enviados y cómo ponerlo a fallar.
 */
export function crearSimuladorDeResend() {
	const correos: CorreoEnviado[] = [];
	const porClave = new Map<string, { cuerpo: string; id: string }>();
	let modo: ModoDeFalla = "ninguna";

	const manejadores = [
		http.post(envioDeResend, async ({ request }) => {
			const falla = await aplicarFalla(modo, {
				servidor: () =>
					errorDeResend(500, "application_error", "An unexpected error occurred, please try again later."),
				demasiadasPeticiones: () =>
					errorDeResend(429, "rate_limit_exceeded", "Too many requests. Please try again later."),
			});
			if (falla) return falla;
			const autorizacion = request.headers.get("authorization");
			if (autorizacion === null || !autorizacion.startsWith("Bearer ")) {
				return errorDeResend(401, "missing_api_key", "Missing API key in the authorization header.");
			}
			if (!/^Bearer re_\S+$/.test(autorizacion)) return errorDeResend(403, "invalid_api_key", "API key is invalid.");
			const crudo = await request.text();
			const clave = request.headers.get("idempotency-key");
			const anterior = clave === null ? undefined : porClave.get(clave);
			if (anterior !== undefined) {
				return anterior.cuerpo === crudo
					? HttpResponse.json({ id: anterior.id })
					: errorDeResend(
							409,
							"invalid_idempotent_request",
							"Same idempotency key used with a different request payload.",
						);
			}
			let cuerpo: Record<string, unknown>;
			try {
				const leido: unknown = JSON.parse(crudo);
				cuerpo = typeof leido === "object" && leido !== null ? Object.fromEntries(Object.entries(leido)) : {};
			} catch {
				return errorDeResend(422, "validation_error", "Invalid JSON body.");
			}
			const para = cuerpo.to;
			const destinatarios =
				typeof para === "string" ? [para] : Array.isArray(para) ? para.filter((d) => typeof d === "string") : [];
			const de = texto(cuerpo, "from");
			const asunto = texto(cuerpo, "subject");
			const html = texto(cuerpo, "html");
			const plano = texto(cuerpo, "text");
			if (
				de === undefined ||
				destinatarios.length === 0 ||
				asunto === undefined ||
				(html === undefined && plano === undefined)
			) {
				return errorDeResend(
					422,
					"validation_error",
					"The `from`, `to`, `subject` and `html` or `text` fields are required.",
				);
			}
			const id = randomUUID();
			correos.push({ id, from: de, to: destinatarios, subject: asunto, html, text: plano });
			if (clave !== null) porClave.set(clave, { cuerpo: crudo, id });
			return HttpResponse.json({ id });
		}),
	];

	return {
		manejadores,
		/** Los correos que llegaron, en orden. */
		correos,
		ponerAFallar(nuevoModo: ModoDeFalla): void {
			modo = nuevoModo;
		},
	};
}
