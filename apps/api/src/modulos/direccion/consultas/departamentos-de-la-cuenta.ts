/**
 * Lo que comparten las consultas de Dirección: a qué pantalla de otro departamento puede llevar a la cuenta. Leen con las mismas funciones que el trabajo de alertas con `contexto.comoAccion`.
 * Fase 19 · docs/interfaz/fabrica/direccion.md («Alertas cruzadas»: «Se calcula al leer con la misma función del
 * trabajo de alertas»)
 */

import { type QuienLlama, tieneDepartamento } from "../../../nucleo/acceso/quien.ts";

/**
 * La ruta de la web a la que lleva algo, si la cuenta tiene su departamento (el primer pedazo de la ruta).
 * @param quien Quien consulta.
 * @param ruta La ruta, sin la diagonal del principio (`produccion/lotes?cajon=lote&id={id}`).
 * @returns La ruta, o `null` si la cuenta no tiene ese departamento.
 */
export function rutaSiLaTiene(quien: QuienLlama, ruta: string): string | null {
	return tieneDepartamento(quien, ruta.split("/")[0] ?? "") ? ruta : null;
}
