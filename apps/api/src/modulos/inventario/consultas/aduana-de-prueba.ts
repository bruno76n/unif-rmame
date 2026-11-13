/**
 * Lo que comparten las pruebas de las consultas de Aduana: pedir una consulta como la cuenta de Aduana y revisar que
 * solo la pidan las cuentas con Aduana y que no mande precios ni costos.
 * Fase 19 · docs/fases/19-web-principal.md (criterio «Cada consulta revisa el departamento y el permiso fino en el
 * servidor y no manda lo que la cuenta no debe ver: precios a Aduana y Bodega…»)
 */

import { expect } from "vitest";
import { mandarAccion, pedirConsulta } from "../../../nucleo/pruebas/llamadas.ts";
import type { LoteCortado } from "../../../nucleo/pruebas/produccion-de-prueba.ts";
import type { ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

/**
 * Pide una consulta como la cuenta de Aduana y espera un 200.
 * @param servidor El servidor de prueba.
 * @param nombre La consulta.
 * @param parametros Sus parámetros.
 * @returns Su resultado.
 */
export async function comoAduana(
	servidor: ServidorDePrueba,
	nombre: string,
	parametros: Record<string, string> = {},
): Promise<Record<string, unknown>> {
	const respuesta = await pedirConsulta(servidor, nombre, parametros, "aduana");
	expect(respuesta.estado, JSON.stringify(respuesta.cuerpo)).toBe(200);
	return respuesta.cuerpo.resultado as Record<string, unknown>;
}

/**
 * Revisa que una consulta solo la pidan las cuentas con Aduana (Bodega, Ventas, Contaduría y Compras reciben `403`)
 * y que lo que manda no lleve precios, costos ni centavos.
 * @param servidor El servidor de prueba.
 * @param nombre La consulta.
 * @param parametros Sus parámetros.
 */
export async function soloAduanaYSinPrecios(
	servidor: ServidorDePrueba,
	nombre: string,
	parametros: Record<string, string> = {},
): Promise<void> {
	for (const quien of ["bodega", "ventas", "contaduria", "compras"]) {
		expect((await pedirConsulta(servidor, nombre, parametros, quien)).estado, quien).toBe(403);
	}
	const texto = JSON.stringify(await comoAduana(servidor, nombre, parametros));
	expect(texto).not.toMatch(/centavos|costo|precio|\$/);
}

/**
 * Un valor de la base de prueba.
 * @param servidor El servidor de prueba.
 * @param consulta El SQL, que regresa una fila.
 * @param parametros Sus parámetros.
 */
export async function valorDe(servidor: ServidorDePrueba, consulta: string, ...parametros: unknown[]): Promise<string> {
	const { rows } = await servidor.base.dueno.query(consulta, parametros);
	return String(Object.values(rows[0] ?? {})[0]);
}

/**
 * Aduana recibe un lote revisado, contando lo mismo de cada talla de sus bultos (los rechazos de Calidad salen como
 * diferencia, que no importa a estas pruebas).
 * @param servidor El servidor de prueba.
 * @param lote El lote.
 */
export async function recibirLoteDePrueba(servidor: ServidorDePrueba, lote: LoteCortado): Promise<void> {
	const { rows } = await servidor.base.dueno.query(
		`SELECT rt.variante_id FROM revision_tallas rt JOIN revisiones r ON r.id = rt.revision_id WHERE r.lote_id = $1`,
		[lote.loteId],
	);
	const respuesta = await mandarAccion(
		servidor,
		"inventario.recibir_del_taller",
		{ datos: { lote_id: lote.loteId, tallas: rows.map((fila) => ({ variante_id: fila.variante_id, piezas: 3 })) } },
		"aduana",
	);
	expect(respuesta.estado, JSON.stringify(respuesta.cuerpo)).toBe(200);
}
