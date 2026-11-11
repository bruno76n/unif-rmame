/**
 * Lo que comparten las acciones de las tallas: si una talla ya la usa algún producto.
 * Fase 8 · docs/modulos/catalogo/tallas-y-tipos-de-prenda.md (regla 2)
 *
 * Una talla en uso no se renombra ni se quita, aunque sus variantes estén dadas de baja: su nombre está en el
 * historial. Los productos y sus variantes llegan en la parte 3 de la fase; hasta entonces ninguna talla está
 * en uso.
 */

import type { Transaccion } from "../../../nucleo/base/transacciones.ts";
import type { tallas } from "../tablas.ts";

/**
 * Revisa que ningún producto use la talla.
 * @param _transaccion La transacción.
 * @param _talla La talla.
 * @throws `422 talla_en_uso` («La talla {t} ya la usan {n} productos: no se renombra ni se quita.»).
 */
export async function revisarQueNoSeUsa(
	_transaccion: Transaccion,
	_talla: Pick<typeof tallas.$inferSelect, "id" | "nombre">,
): Promise<void> {}
