/**
 * El recorte común: lo que el servidor le quita a toda respuesta según la cuenta, además de lo que recorta
 * cada consulta.
 * Fase 5 · docs/cimientos/ACCESO-Y-PERMISOS.md («El recorte común», paso 8) y docs/cimientos/API.md
 *
 * - **La cuenta de soporte** no recibe ningún monto: todo campo en centavos (`_centavos`) se quita.
 * - **Sin «ven sueldos y tarifas»** (y sin ser la dueña) no viajan los campos de sueldo y de tarifa que
 *   declaran los módulos (`camposDeSueldo`).
 *
 * Se quita a cualquier profundidad, y la respuesta dice en `recortado` qué campos faltan. Lo de los
 * aparatos lo dice su alcance (fase 6).
 */

import { type QuienLlama, veSueldosYTarifas } from "./quien.ts";

/** El sufijo de los campos de dinero, que siempre van en centavos. */
const sufijoDeMonto = "_centavos";

/**
 * Qué campos no ve quien llama, además de lo que recorta cada consulta.
 * @param quien Quién llama.
 * @param camposDeSueldo Los campos de sueldo o de tarifa de los módulos.
 * @returns Una función que dice si un campo se le quita.
 */
export function camposQueNoVe(quien: QuienLlama, camposDeSueldo: ReadonlySet<string>): (campo: string) => boolean {
	if (quien.tipo !== "cuenta") return () => false;
	if (quien.esSoporte) return (campo) => campo.endsWith(sufijoDeMonto) || camposDeSueldo.has(campo);
	if (veSueldosYTarifas(quien)) return () => false;
	return (campo) => camposDeSueldo.has(campo);
}

/**
 * Quita de una respuesta, a cualquier profundidad, los campos que quien llama no ve.
 * @param quien Quién llama.
 * @param objeto Lo que se va a mandar.
 * @param camposDeSueldo Los campos de sueldo o de tarifa de los módulos.
 * @returns La respuesta sin esos campos y cuáles se quitaron.
 */
export function recorteComun(
	quien: QuienLlama,
	objeto: Record<string, unknown>,
	camposDeSueldo: ReadonlySet<string>,
): { objeto: Record<string, unknown>; recortado: string[] } {
	const noVe = camposQueNoVe(quien, camposDeSueldo);
	const recortado = new Set<string>();
	const quitarDe = (actual: Record<string, unknown>): Record<string, unknown> =>
		Object.fromEntries(
			Object.entries(actual).flatMap(([campo, adentro]) => {
				if (noVe(campo)) {
					recortado.add(campo);
					return [];
				}
				return [[campo, quitar(adentro)]];
			}),
		);
	const quitar = (actual: unknown): unknown => {
		if (Array.isArray(actual)) return actual.map(quitar);
		if (typeof actual !== "object" || actual === null) return actual;
		return quitarDe(Object.fromEntries(Object.entries(actual)));
	};
	const sinLoQueNoVe = quitarDe(objeto);
	return { objeto: sinLoQueNoVe, recortado: [...recortado] };
}
