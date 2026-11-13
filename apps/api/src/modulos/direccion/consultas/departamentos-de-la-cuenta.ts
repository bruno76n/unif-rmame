/**
 * Lo que comparten las consultas de Dirección: saber si la cuenta tiene un departamento y a qué pantalla de otro
 * departamento la puede llevar. Leen con las mismas funciones que el trabajo de alertas con `contexto.comoAccion`.
 * Fase 19 · docs/interfaz/fabrica/direccion.md («Alertas cruzadas»: «Se calcula al leer con la misma función del
 * trabajo de alertas»)
 */

import type { QuienLlama } from "../../../nucleo/acceso/quien.ts";

/**
 * Si la cuenta tiene un departamento (la dueña los tiene todos): lo que lleva a otro departamento solo sale si lo tiene.
 * @param quien Quien consulta.
 * @param departamento La clave del departamento.
 */
export function tieneDepartamento(quien: QuienLlama, departamento: string): boolean {
	return quien.tipo === "cuenta" && (quien.esDuena || quien.departamentos.includes(departamento));
}

/**
 * La ruta de la web a la que lleva algo, si la cuenta tiene su departamento (el primer pedazo de la ruta).
 * @param quien Quien consulta.
 * @param ruta La ruta, sin la diagonal del principio (`produccion/lotes?cajon=lote&id={id}`).
 * @returns La ruta, o `null` si la cuenta no tiene ese departamento.
 */
export function rutaSiLaTiene(quien: QuienLlama, ruta: string): string | null {
	return tieneDepartamento(quien, ruta.split("/")[0] ?? "") ? ruta : null;
}
