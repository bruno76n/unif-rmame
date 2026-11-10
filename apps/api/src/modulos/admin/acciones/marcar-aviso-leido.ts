/**
 * `admin.marcar_aviso_leido`: cada persona marca leídos sus avisos.
 * Fase 4 · docs/modulos/admin/avisos.md («`admin.marcar_aviso_leido`»)
 *
 * Solo toca los avisos de la cuenta que llama: los ids que no son suyos se ignoran. Leer un aviso no cambia
 * datos del negocio, así que no deja bitácora ni eventos.
 */

import { marcarAvisoLeido } from "@uniformame/compartido/contratos/admin/avisos";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { errorDeCampo } from "../../../nucleo/http/errores.ts";
import { implementarAccion } from "../../../nucleo/modulos.ts";
import { avisos } from "../tablas.ts";

export const accionMarcarAvisoLeido = implementarAccion(marcarAvisoLeido, async (contexto, datos) => {
	const { quien } = contexto;
	if (quien.tipo !== "cuenta") throw new Error("solo una cuenta tiene avisos");
	if (datos.todos !== true && (datos.aviso_ids === undefined || datos.aviso_ids.length === 0)) {
		throw errorDeCampo("aviso_ids", "Di qué avisos o todos.");
	}
	const ahora = contexto.ahora.toString();
	await contexto.transaccion
		.update(avisos)
		.set({ leidoEn: ahora, actualizadoEn: ahora })
		.where(
			and(
				eq(avisos.usuarioId, quien.usuarioId),
				isNull(avisos.leidoEn),
				datos.todos === true ? undefined : inArray(avisos.id, datos.aviso_ids ?? []),
			),
		);
	return { resultado: { mensaje: "Avisos leídos" }, sinBitacora: true };
});
