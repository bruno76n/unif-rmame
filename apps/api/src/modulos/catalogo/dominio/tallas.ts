/**
 * Lo que comparten las acciones y las consultas de las tallas: si una talla ya la usa algún producto, y el orden de las
 * tallas (primero su grupo y luego su lugar en él).
 * Fase 8 · docs/modulos/catalogo/tallas-y-tipos-de-prenda.md (regla 2)
 *
 * Una talla en uso no se renombra ni se quita, aunque sus variantes estén dadas de baja: su nombre está en el
 * historial.
 */

import { countDistinct, eq, type SQL, sql } from "drizzle-orm";
import type { Transaccion } from "../../../nucleo/base/transacciones.ts";
import { errorDeRegla } from "../../../nucleo/http/errores.ts";
import { type tallas, variantes } from "../tablas.ts";

/**
 * Revisa que ningún producto use la talla.
 * @param transaccion La transacción.
 * @param talla La talla.
 * @throws `422 talla_en_uso` («La talla {t} ya la usan {n} productos: no se renombra ni se quita.»).
 */
export async function revisarQueNoSeUsa(
	transaccion: Transaccion,
	talla: Pick<typeof tallas.$inferSelect, "id" | "nombre">,
): Promise<void> {
	const [usos] = await transaccion
		.select({ productos: countDistinct(variantes.productoId) })
		.from(variantes)
		.where(eq(variantes.tallaId, talla.id));
	const cuantos = usos?.productos ?? 0;
	if (cuantos > 0) {
		throw errorDeRegla(
			"talla_en_uso",
			`La talla ${talla.nombre} ya la usan ${cuantos} productos: no se renombra ni se quita.`,
		);
	}
}

/**
 * El orden de las tallas para un `ORDER BY`: primero el de su grupo y luego su lugar en él (4, 6, 8… antes que CH, M, G…
 * si el grupo de números va primero). Cada talla guarda su lugar solo dentro de su grupo.
 * @param alias Cómo se llama la tabla `tallas` en la consulta (`t`, `ta` o `tallas`).
 * Es el único orden de tallas del sistema: lo usan las consultas de todos los módulos que listan tallas.
 */
export function ordenDeTallas(alias: string): SQL {
	if (!/^[a-z_]+$/.test(alias)) throw new Error(`alias de tallas inválido: ${alias}`);
	return sql.raw(`(SELECT g.orden FROM grupos_talla g WHERE g.id = ${alias}.grupo_talla_id), ${alias}.orden`);
}
