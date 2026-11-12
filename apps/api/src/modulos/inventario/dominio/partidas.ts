/**
 * Las partidas de tela P-: la de cada código de la etiqueta de un proveedor, que nace una sola vez.
 * Fase 11 · docs/modulos/inventario/material-en-bodega.md («La tabla `partidas_tela`»)
 * Fase 14 · también la carga inicial de tela, con el proveedor habitual
 */

import { and, eq, sql } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";
import { quienCambia } from "../../../nucleo/acciones/comunes.ts";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import { partidasTela } from "../tablas.ts";

/** Lo que regresa `admin.tomar_folio`. */
const folioTomado = z.object({ folio: z.string() });

/**
 * La partida de cada código de una tela de un proveedor: la que ya existe, o una nueva con su folio P-. Toma un
 * candado por proveedor y material para que dos recepciones a la vez no la creen dos veces.
 * @param recepcionId La recepción de proveedor que la trae primero; ninguna en la carga inicial.
 * @returns Por código, su partida.
 */
export async function partidasDe(
	contexto: ContextoDeAccion,
	proveedorId: string,
	materialId: string,
	codigos: readonly string[],
	recepcionId: string | null,
): Promise<Map<string, string>> {
	const { transaccion } = contexto;
	await transaccion.execute(
		sql`SELECT pg_advisory_xact_lock(hashtextextended(${`partida:${proveedorId}:${materialId}`}, 0))`,
	);
	const porCodigo = new Map<string, string>();
	for (const codigo of [...new Set(codigos)]) {
		const [existente] = await transaccion
			.select({ id: partidasTela.id })
			.from(partidasTela)
			.where(
				and(
					eq(partidasTela.proveedorId, proveedorId),
					eq(partidasTela.materialId, materialId),
					eq(partidasTela.codigoProveedor, codigo),
				),
			);
		if (existente !== undefined) {
			porCodigo.set(codigo, existente.id);
			continue;
		}
		const id = uuidv7();
		const { folio } = folioTomado.parse(await contexto.interna("admin.tomar_folio", { tipo: "partida" }));
		await transaccion.insert(partidasTela).values({
			id,
			folio,
			codigoProveedor: codigo,
			materialId,
			proveedorId,
			primeraRecepcionId: recepcionId,
			creadoPor: quienCambia(contexto),
		});
		porCodigo.set(codigo, id);
	}
	return porCodigo;
}
