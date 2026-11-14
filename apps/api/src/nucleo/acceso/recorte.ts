/**
 * El recorte común: lo que el servidor le quita a toda respuesta según la cuenta, además de lo que recorta
 * cada consulta.
 * Fase 5 · docs/cimientos/ACCESO-Y-PERMISOS.md («El recorte común», paso 8) y docs/cimientos/API.md
 *
 * - **La cuenta de soporte** no recibe ningún monto: todo campo en centavos (`_centavos`) se quita, y todo monto
 *   escrito en un texto (un mensaje, un aviso, una descripción: «$1,250») llega tapado, «$••••».
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
 * Un monto escrito en un texto («$1,250», «$12,500.50»), como lo escribe `enPesos`: el mismo patrón sirve para la base
 * (`regexp_replace`, en la bitácora) y para JavaScript.
 */
export const patronDeMonto = "\\$ ?[0-9][0-9,]*(\\.[0-9]+)?";
/** Cómo queda un monto tapado. */
export const montoTapado = "$••••";

/**
 * Un texto sin sus montos: «Pagó FP-1172 por $••••».
 * @param texto El texto.
 */
export function sinMontosEnTexto(texto: string): string {
	return texto.replace(new RegExp(patronDeMonto, "g"), montoTapado);
}

/**
 * Si quien llama es la cuenta de soporte, que nunca recibe un monto ni escrito en un texto.
 * @param quien Quién llama.
 */
export function noVeMontos(quien: QuienLlama): boolean {
	return quien.tipo === "cuenta" && quien.esSoporte;
}

/**
 * Tapa, a cualquier profundidad, los montos escritos en los textos de un valor.
 * @param valor Un valor de la respuesta.
 */
function taparMontos(valor: unknown): unknown {
	if (typeof valor === "string") return sinMontosEnTexto(valor);
	if (Array.isArray(valor)) return valor.map(taparMontos);
	if (typeof valor !== "object" || valor === null) return valor;
	return Object.fromEntries(Object.entries(valor).map(([campo, adentro]) => [campo, taparMontos(adentro)]));
}

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
 * @returns La respuesta sin esos campos (y, a soporte, con sus textos sin montos) y cuáles se quitaron.
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
	const sinCampos = quitarDe(objeto);
	// A soporte, además, los montos escritos en los textos: así la regla no depende de que cada consulta, acción o
	// error escriba los suyos de otra forma.
	const sinLoQueNoVe = noVeMontos(quien)
		? Object.fromEntries(Object.entries(sinCampos).map(([campo, valor]) => [campo, taparMontos(valor)]))
		: sinCampos;
	return { objeto: sinLoQueNoVe, recortado: [...recortado] };
}
