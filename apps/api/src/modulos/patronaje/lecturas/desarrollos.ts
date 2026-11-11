/**
 * `patronaje.desarrollos_en_proceso_de_escuela`: los desarrollos de una escuela que no están en catálogo ni
 * descartados, para el candado `escuela_con_desarrollos` de Catálogo.
 * Fase 10 · docs/modulos/patronaje/desarrollos.md («Lecturas»)
 */

import { and, asc, eq, notInArray } from "drizzle-orm";
import { z } from "zod";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import { desarrollos } from "../tablas.ts";

/** Lo que recibe: la escuela. */
const pedido = z.object({ escuela_id: z.uuid() }).strict();

/**
 * Lee los desarrollos en proceso de una escuela.
 * @param contexto El contexto de quien lee (la baja de una escuela).
 * @param datos `escuela_id`.
 * @returns Sus folios DS-, en orden.
 */
export async function desarrollosEnProcesoDeEscuela(
	contexto: ContextoDeAccion,
	datos: unknown,
): Promise<{ folios: string[] }> {
	const { escuela_id } = pedido.parse(datos);
	const enProceso = await contexto.transaccion
		.select({ folio: desarrollos.folio })
		.from(desarrollos)
		.where(and(eq(desarrollos.escuelaId, escuela_id), notInArray(desarrollos.etapa, ["en_catalogo", "cancelado"])))
		.orderBy(asc(desarrollos.folio));
	return { folios: enProceso.map((desarrollo) => desarrollo.folio) };
}
