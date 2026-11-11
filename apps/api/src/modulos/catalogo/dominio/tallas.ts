/**
 * Lo que comparten las acciones de las tallas: si una talla ya la usa algún producto.
 * Fase 8 · docs/modulos/catalogo/tallas-y-tipos-de-prenda.md (regla 2)
 *
 * Una talla en uso no se renombra ni se quita, aunque sus variantes estén dadas de baja: su nombre está en el
 * historial.
 */

import { countDistinct, eq } from "drizzle-orm";
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
