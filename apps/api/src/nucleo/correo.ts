/**
 * El envío de correo: con Resend en producción; en local, al registro del worker.
 * Fase 4 · docs/modulos/admin/avisos.md («El correo») y docs/cimientos/INFRAESTRUCTURA.md («Resend»)
 *
 * Cada correo lleva una clave de idempotencia (la de su aviso): si la respuesta de Resend se pierde y el
 * worker lo vuelve a mandar, Resend no lo manda dos veces.
 */

import { Resend } from "resend";

/** El remitente de los avisos: el dominio verificado en Resend. */
export const remitenteDeAvisos = "Unifórmame <avisos@uniformame.mx>";

/** Un correo listo para salir. */
export interface Correo {
	para: string;
	asunto: string;
	html: string;
	texto: string;
	/** La clave de idempotencia: la misma en cada reintento de ese correo. */
	clave: string;
}

/** Manda un correo; si no sale, lanza el error con el mensaje del servicio. */
export type EnviarCorreo = (correo: Correo) => Promise<void>;

/**
 * El envío con Resend.
 * @param llave La llave de Resend (`RESEND_LLAVE`).
 */
export function crearEnvioConResend(llave: string): EnviarCorreo {
	const resend = new Resend(llave);
	return async (correo) => {
		const { error } = await resend.emails.send(
			{ from: remitenteDeAvisos, to: correo.para, subject: correo.asunto, html: correo.html, text: correo.texto },
			{ idempotencyKey: correo.clave },
		);
		if (error !== null) throw new Error(`Resend: ${error.message}`);
	};
}

/**
 * El envío de `pnpm local`: no sale nada; el correo queda en el registro del worker.
 * @param escribir A dónde se escribe.
 */
export function crearEnvioAlRegistro(escribir: (linea: string) => void): EnviarCorreo {
	return async (correo) => {
		escribir(`Correo a ${correo.para}: ${correo.asunto}`);
	};
}
