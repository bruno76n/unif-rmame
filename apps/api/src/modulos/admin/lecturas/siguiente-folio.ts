/**
 * `admin.siguiente_folio`: el siguiente folio de un tipo, sin tomarlo.
 * Fase 4 · docs/modulos/admin/folios.md («`admin.siguiente_folio` · lectura»)
 */

import { z } from "zod";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import { alcanceDe, armarFolio, contadorDe, plantillaDe, prefijoDelAlcance } from "../dominio/folios.ts";

/** Lo que recibe. */
const pedido = z.object({ tipo: z.string().min(1), alcance: z.string().optional() });

/**
 * El siguiente folio armado y, si el contador tiene máximo, cuántos quedan.
 * @param contexto El contexto de la acción.
 * @param datos `tipo` y `alcance` (el año se pone solo en OP- y L-).
 */
export async function siguienteFolio(
	contexto: ContextoDeAccion,
	datos: unknown,
): Promise<{ folio: string; quedan: number | undefined }> {
	const { tipo, alcance: pedidoAlcance } = pedido.parse(datos);
	const plantilla = await plantillaDe(contexto.transaccion, tipo);
	const alcance = alcanceDe(contexto, plantilla.prefijo, pedidoAlcance);
	// Un alcance que todavía no tiene contador empieza en el mínimo de su plantilla.
	const contador = (await contadorDe(contexto.transaccion, tipo, alcance)) ?? {
		...plantilla,
		prefijo: prefijoDelAlcance(plantilla.prefijo, alcance),
	};
	return {
		folio: armarFolio(contador.prefijo, contador.siguiente, contador.digitos),
		quedan: contador.maximo === null ? undefined : contador.maximo - contador.siguiente + 1,
	};
}
