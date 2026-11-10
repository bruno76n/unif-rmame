/**
 * `direccion.cancelar_autorizacion`: el módulo de origen cancela la autorización de un documento que se
 * canceló mientras esperaba.
 * Fase 7 · docs/modulos/direccion/autorizaciones.md («`direccion.cancelar_autorizacion`» y regla 7)
 *
 * Recibe la autorización, o su tipo y el id de su documento (la primera liga del tipo). Solo se cancela una
 * que espera.
 */

import { tiposDeAutorizacion } from "@uniformame/compartido/contratos/direccion/autorizaciones";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { errorDeRegla, noExiste } from "../../../nucleo/http/errores.ts";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import { columnaDeLiga, leerAutorizacion, ligasDelTipo } from "../dominio/autorizaciones.ts";
import { autorizaciones } from "../tablas.ts";

/** Lo que recibe: la autorización, o el tipo y su documento; y el motivo. */
const pedido = z.union([
	z.object({ autorizacion_id: z.uuid(), motivo: z.string().min(1) }),
	z.object({ tipo: z.enum(tiposDeAutorizacion), documento_id: z.uuid(), motivo: z.string().min(1) }),
]);

/**
 * Busca la autorización que espera de un documento.
 * @returns Su id, o `undefined` si su documento no tiene ninguna esperando.
 */
async function laQueEspera(
	contexto: ContextoDeAccion,
	tipo: (typeof tiposDeAutorizacion)[number],
	documentoId: string,
): Promise<string | undefined> {
	const [primera] = ligasDelTipo[tipo];
	if (primera === undefined) throw new Error(`${tipo} no tiene liga`);
	const [esperando] = await contexto.transaccion
		.select({ id: autorizaciones.id })
		.from(autorizaciones)
		.where(
			and(
				eq(autorizaciones.tipo, tipo),
				eq(autorizaciones.estado, "por_autorizar"),
				eq(columnaDeLiga(primera), documentoId),
			),
		);
	return esperando?.id;
}

/**
 * Cancela la autorización.
 * @param contexto El contexto del módulo que cancela su documento.
 * @param datos `autorizacion_id`, o `tipo` y `documento_id`; y `motivo`.
 * @returns `autorizacion_id`.
 * @throws `404` si no existe; `422 ya_decidida` si ya no espera.
 */
export async function cancelarAutorizacion(contexto: ContextoDeAccion, datos: unknown) {
	const pedida = pedido.parse(datos);
	const id =
		"autorizacion_id" in pedida
			? pedida.autorizacion_id
			: await laQueEspera(contexto, pedida.tipo, pedida.documento_id);
	if (id === undefined) throw noExiste();
	const autorizacion = await leerAutorizacion(contexto.transaccion, id);
	if (autorizacion.estado !== "por_autorizar") throw errorDeRegla("ya_decidida", "Esa autorización ya se decidió.");
	const { quien } = contexto;
	await contexto.transaccion
		.update(autorizaciones)
		.set({
			estado: "cancelada",
			canceladoEn: contexto.ahora.toString(),
			canceladoPor: quien.tipo === "cuenta" ? quien.usuarioId : null,
			motivoCancelacion: pedida.motivo,
		})
		.where(eq(autorizaciones.id, id));
	contexto.guardarEvento({
		tipo: "autorizacion.cancelada",
		datos: { autorizacion_id: id, tipo: autorizacion.tipo },
		tablas: ["autorizaciones"],
		entidad: "autorizaciones",
		entidadId: id,
		entidadFolio: autorizacion.folio,
	});
	return { autorizacion_id: id };
}
