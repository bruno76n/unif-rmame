/**
 * Lo que comparten las pruebas de las consultas de Personal: un valor de la base, el id de una persona por su nombre y
 * una operación nueva sin tarifa (un flujo de «Una sola operación» que arma Producción, como en la fábrica).
 * Fase 19 · docs/fases/19-web-principal.md («Criterios de terminado»)
 */

import { z } from "zod";
import { mandarAccion } from "../../../nucleo/pruebas/llamadas.ts";
import type { ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

/**
 * El primer valor del primer renglón de un SQL, leído con el dueño de la base.
 * @param servidor El servidor de prueba.
 * @param consulta El SQL.
 * @param parametros Sus parámetros (`$1`…).
 */
export async function valorDe(
	servidor: ServidorDePrueba,
	consulta: string,
	...parametros: unknown[]
): Promise<unknown> {
	const { rows } = await servidor.base.dueno.query(consulta, parametros);
	return Object.values(rows[0] ?? {})[0];
}

/**
 * El id de una persona de la muestra por su nombre.
 * @param servidor El servidor de prueba.
 * @param nombre Su nombre («Sergio Gómez»).
 */
export async function idDePersona(servidor: ServidorDePrueba, nombre: string): Promise<string> {
	return z.uuid().parse(await valorDe(servidor, "SELECT id FROM personas WHERE nombre = $1", nombre));
}

/**
 * Producción arma un flujo nuevo de «Una sola operación»: nace con el corte y una operación, las dos sin tarifa.
 * @param servidor El servidor de prueba.
 * @param nombre El nombre del flujo, distinto en cada prueba.
 * @returns El flujo y sus operaciones, en orden.
 */
export async function flujoSinTarifas(
	servidor: ServidorDePrueba,
	nombre: string,
): Promise<{ flujo_id: string; operaciones: string[] }> {
	const persona = await idDePersona(servidor, "Beto Aguilar");
	const creado = await mandarAccion(
		servidor,
		"produccion.crear_flujo",
		{
			datos: {
				nombre,
				parte_de: "una_sola_operacion",
				persona_corte_id: persona,
				persona_base_id: await idDePersona(servidor, "Ana Torres"),
			},
		},
		"produccion",
	);
	const { resultado } = z
		.object({
			resultado: z.object({ flujo_id: z.uuid(), operaciones: z.array(z.object({ flujo_operacion_id: z.uuid() })) }),
		})
		.parse(creado.cuerpo);
	return {
		flujo_id: resultado.flujo_id,
		operaciones: resultado.operaciones.map((operacion) => operacion.flujo_operacion_id),
	};
}
