/**
 * `admin.tomar_folio`: el folio de un documento, en orden y sin huecos, dentro de su transacción.
 * Fase 4 · docs/modulos/admin/folios.md («`admin.tomar_folio` · interna»)
 *
 * Con `asigna = servidor` toma el siguiente con un solo `UPDATE … RETURNING`: el renglón queda bloqueado
 * hasta que la transacción termina, así que dos documentos a la vez reciben números seguidos, y si la
 * transacción falla el número no se gasta. Un alcance nuevo (el año, un aparato) crea su contador con el
 * formato de la siembra. Con `asigna = aparato` no da folio: sube el contador al número recibido.
 */

import { and, eq, isNull, lte, or, sql } from "drizzle-orm";
import { z } from "zod";
import { errorDeRegla } from "../../../nucleo/http/errores.ts";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import { alcanceDe, armarFolio, contadorDe, crearContadorDelAlcance, plantillaDe } from "../dominio/folios.ts";
import { contadoresFolio } from "../tablas.ts";

/** Lo que recibe. */
const pedido = z.object({
	tipo: z.string().min(1),
	alcance: z.string().optional(),
	n: z.number().int().positive().optional(),
	numero_recibido: z.number().int().positive().optional(),
});

/** Un folio tomado: armado y su número. */
export interface FolioTomado {
	folio: string;
	numero: number;
}

/**
 * Toma uno o `n` folios seguidos, o sube el contador de un aparato.
 * @param contexto El contexto de la acción.
 * @param datos `tipo`, `alcance` (el año se pone solo en OP- y L-), `n` y `numero_recibido`.
 * @returns El folio y su número; la lista si se pidió `n`; nada si fue un número recibido.
 * @throws `422 folio_agotado` si el contador llegó a su máximo o no le alcanzan los `n`.
 */
export async function tomarFolio(
	contexto: ContextoDeAccion,
	datos: unknown,
): Promise<FolioTomado | FolioTomado[] | undefined> {
	const { tipo, alcance: pedidoAlcance, n, numero_recibido } = pedido.parse(datos);
	const { transaccion } = contexto;
	const plantilla = await plantillaDe(transaccion, tipo);
	const alcance = alcanceDe(contexto, plantilla.prefijo, pedidoAlcance);
	if (alcance !== "" && (await contadorDe(transaccion, tipo, alcance)) === undefined) {
		await crearContadorDelAlcance(transaccion, plantilla, alcance);
	}
	const deEste = and(eq(contadoresFolio.tipo, tipo), eq(contadoresFolio.alcance, alcance));
	if (plantilla.asigna === "aparato") {
		if (numero_recibido === undefined) throw new Error(`el folio ${tipo} lo pone el aparato`);
		// Solo sube: un número viejo que llega tarde no lo baja.
		await transaccion
			.update(contadoresFolio)
			.set({ siguiente: numero_recibido + 1 })
			.where(and(deEste, lte(contadoresFolio.siguiente, numero_recibido)));
		return undefined;
	}
	const cuantos = n ?? 1;
	const [tomado] = await transaccion
		.update(contadoresFolio)
		.set({ siguiente: sql`${contadoresFolio.siguiente} + ${cuantos}` })
		.where(
			and(
				deEste,
				// Sin dar una parte: si no alcanzan los `n`, no toma ninguno.
				or(
					isNull(contadoresFolio.maximo),
					sql`${contadoresFolio.siguiente} + ${cuantos} - 1 <= ${contadoresFolio.maximo}`,
				),
			),
		)
		.returning({
			primero: sql<number>`(${contadoresFolio.siguiente} - ${cuantos})::bigint`.mapWith(Number),
			prefijo: contadoresFolio.prefijo,
			digitos: contadoresFolio.digitos,
		});
	if (tomado === undefined) {
		const maximo = (await contadorDe(transaccion, tipo, alcance))?.maximo;
		throw errorDeRegla("folio_agotado", `Se acabaron los códigos de fábrica (hasta ${maximo ?? "su máximo"}).`);
	}
	const folios = Array.from({ length: cuantos }, (_, i) => ({
		folio: armarFolio(tomado.prefijo, tomado.primero + i, tomado.digitos),
		numero: tomado.primero + i,
	}));
	return n === undefined ? folios[0] : folios;
}
