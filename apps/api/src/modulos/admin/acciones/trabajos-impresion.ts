/**
 * `admin.trabajos_impresion`: el programa puente pide sus trabajos por imprimir.
 * Fase 4 · docs/modulos/admin/impresion.md («`admin.trabajos_impresion`»)
 *
 * Es una acción y no una consulta: entregar los trabajos los pasa a `mandado`. Solo los de la impresora de
 * ese puente, en el orden en que se pidieron. Sin bitácora: imprimir no cambia datos del negocio.
 * Fase 6 · docs/modulos/admin/dispositivos.md (regla 7): la respuesta le dice `rotar_llave` cuando su llave
 * cumplió `admin.dias_rotar_llave` desde que se rotó (o desde que se registró).
 */

import { trabajosImpresion } from "@uniformame/compartido/contratos/admin/impresion";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { implementarAccion } from "../../../nucleo/modulos.ts";
import { leTocaRotarLaLlave } from "../dominio/dispositivos.ts";
import { impresoras, trabajosImpresion as trabajos } from "../tablas.ts";

/**
 * La ruta de la etiqueta en ZPL de un trabajo.
 * @param trabajo Su tipo, lo que se imprime y las copias.
 */
export function rutaDeLaEtiqueta(trabajo: { tipo: string; ids: readonly string[]; copias: number }): string {
	const [primero] = trabajo.ids;
	const varios = trabajo.ids.length > 1 ? `&ids=${trabajo.ids.join(",")}` : "";
	return `/v1/etiquetas/${trabajo.tipo}/${primero}?formato=zpl&copias=${trabajo.copias}${varios}`;
}

export const accionTrabajosImpresion = implementarAccion(trabajosImpresion, async (contexto) => {
	const { quien, transaccion } = contexto;
	if (quien.tipo !== "aparato") throw new Error("solo un puente pide trabajos de impresión");
	const suyas = transaccion
		.select({ id: impresoras.id })
		.from(impresoras)
		.where(and(eq(impresoras.dispositivoId, quien.dispositivoId), isNull(impresoras.bajaEn)));
	const pendientes = await transaccion
		.select()
		.from(trabajos)
		.where(and(eq(trabajos.estado, "por_imprimir"), inArray(trabajos.impresoraId, suyas)))
		.orderBy(asc(trabajos.creadoEn))
		.for("update");
	if (pendientes.length > 0) {
		await transaccion
			.update(trabajos)
			.set({ estado: "mandado", mandadoEn: contexto.ahora.toString() })
			.where(
				inArray(
					trabajos.id,
					pendientes.map((trabajo) => trabajo.id),
				),
			);
	}
	return {
		resultado: {
			rotar_llave: await leTocaRotarLaLlave(contexto.transaccion, quien.dispositivoId, contexto.ahora),
			mensaje: `${pendientes.length} trabajos`,
			trabajos: pendientes.map((trabajo) => ({
				id: trabajo.id,
				impresora_id: trabajo.impresoraId,
				tipo: trabajo.tipo,
				ids: trabajo.ids,
				copias: trabajo.copias,
				ruta: rutaDeLaEtiqueta(trabajo),
			})),
		},
		sinBitacora: true,
	};
});
