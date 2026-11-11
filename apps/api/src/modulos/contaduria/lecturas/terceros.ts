/**
 * `contaduria.datos_terceros`: el nombre, el RFC y los roles de unos terceros, para los mensajes, la bitácora y lo
 * que cambió de las acciones de Compras y de Ventas. Nunca saldos.
 * Fase 10 · docs/modulos/contaduria/terceros-y-deudas.md («Lecturas»)
 */

import { inArray } from "drizzle-orm";
import { z } from "zod";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import { rolesDe } from "../internas/terceros.ts";
import { terceros } from "../tablas.ts";

/** Lo que recibe: los terceros. */
const pedido = z.object({ tercero_ids: z.array(z.uuid()) }).strict();

/** Un tercero como lo da la lectura. */
export interface DatosDeTercero {
	nombre: string;
	rfc: string | null;
	roles: string[];
}

/**
 * Lee unos terceros.
 * @param contexto El contexto de quien lee.
 * @param datos `tercero_ids`.
 * @returns Por id, su nombre, su RFC y sus roles. Un id que no existe no viene.
 */
export async function datosTerceros(
	contexto: ContextoDeAccion,
	datos: unknown,
): Promise<Record<string, DatosDeTercero>> {
	const { tercero_ids } = pedido.parse(datos);
	if (tercero_ids.length === 0) return {};
	const leidos = await contexto.transaccion.select().from(terceros).where(inArray(terceros.id, tercero_ids));
	return Object.fromEntries(
		leidos.map((tercero) => [tercero.id, { nombre: tercero.nombre, rfc: tercero.rfc, roles: rolesDe(tercero) }]),
	);
}
