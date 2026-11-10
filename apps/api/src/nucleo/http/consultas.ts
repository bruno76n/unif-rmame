/**
 * Lo que comparten las consultas: el cursor opaco de la paginación y el recorte según la cuenta.
 * Fase 3 · docs/cimientos/API.md («Acciones y consultas» y «El recorte según la cuenta»)
 *
 * Lo que una cuenta no debe ver no viaja: el campo no viene y `recortado` dice cuáles faltan. Un
 * registro que la cuenta no puede ver responde `404` (`noExiste`, en `errores.ts`).
 */

import { ErrorDeApi } from "./errores.ts";

/**
 * Arma el cursor de la página siguiente con la posición del último renglón.
 * @param posicion Lo que la consulta necesita para seguir (por ejemplo, el `creado_en` y el `id` del último).
 * @returns Un texto opaco: el cliente no lo arma ni lo interpreta.
 */
export function cursorDe(posicion: Record<string, string | number>): string {
	return Buffer.from(JSON.stringify(posicion)).toString("base64url");
}

/**
 * Lee un cursor.
 * @param cursor Lo que mandó el cliente, o nada para la primera página.
 * @returns La posición, o `undefined` si es la primera página.
 * @throws `400` si el cursor no es uno que haya dado la API.
 */
export function leerCursor(cursor: string | undefined): Record<string, string | number> | undefined {
	if (cursor === undefined) return undefined;
	try {
		const leido: unknown = JSON.parse(Buffer.from(cursor, "base64url").toString());
		if (typeof leido === "object" && leido !== null && !Array.isArray(leido)) {
			const posicion = Object.fromEntries(
				Object.entries(leido).filter(
					(par): par is [string, string | number] => typeof par[1] === "string" || typeof par[1] === "number",
				),
			);
			if (Object.keys(posicion).length === Object.keys(leido).length) return posicion;
		}
	} catch {
		// Un cursor que no se puede leer es un dato mal formado, como cualquier otro.
	}
	throw new ErrorDeApi("validacion", null, undefined, {
		campos: { cursor: "Ese cursor no es válido. Vuelve a cargar la lista." },
	});
}

/**
 * Corta una página: se piden `limite + 1` renglones para saber si hay más.
 * @param renglones Lo que regresó la base, hasta `limite + 1`.
 * @param limite Cuántos renglones van en la página.
 * @param posicionDe La posición de un renglón, para el cursor.
 */
export function paginar<Renglon>(
	renglones: readonly Renglon[],
	limite: number,
	posicionDe: (renglon: Renglon) => Record<string, string | number>,
): { renglones: Renglon[]; cursor: string | null; hay_mas: boolean } {
	const pagina = renglones.slice(0, limite);
	const ultimo = pagina.at(-1);
	const hayMas = renglones.length > limite;
	return {
		renglones: pagina,
		cursor: hayMas && ultimo !== undefined ? cursorDe(posicionDe(ultimo)) : null,
		hay_mas: hayMas,
	};
}

/**
 * Quita de un objeto los campos que la cuenta no puede ver.
 * @param objeto Lo que se va a mandar.
 * @param campos Los campos que se le recortan a esta cuenta.
 * @returns El objeto sin esos campos y la lista de los que se quitaron.
 */
export function recortar(
	objeto: Record<string, unknown>,
	campos: readonly string[],
): { objeto: Record<string, unknown>; recortado: string[] } {
	const recortado = campos.filter((campo) => campo in objeto);
	return {
		objeto: Object.fromEntries(Object.entries(objeto).filter(([llave]) => !recortado.includes(llave))),
		recortado,
	};
}
