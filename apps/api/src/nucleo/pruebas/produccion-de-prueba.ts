/**
 * Ayudas de prueba de Producción: un flujo con su corte y sus operaciones, hecho directo en la base.
 * Fase 12 · docs/modulos/produccion/operaciones-y-flujos.md
 */

import type pg from "pg";
import { v7 as uuidv7 } from "uuid";
import { nuevaPersona } from "./personas-de-prueba.ts";

/** Un flujo de prueba: su id, su nombre, quien hace sus operaciones y sus operaciones en orden (la primera, el corte). */
export interface FlujoDePrueba {
	flujoId: string;
	nombre: string;
	personaId: string;
	operaciones: { flujoOperacionId: string; operacionId: string; nombre: string }[];
}

/**
 * Da de alta, con el rol dueño, un flujo con el corte y otras operaciones nuevas, todas de una persona del Taller.
 * @param dueno La conexión con el rol dueño.
 * @param demas Cuántas operaciones lleva después del corte.
 */
export async function flujoDePrueba(dueno: pg.Pool, demas = 2): Promise<FlujoDePrueba> {
	const sufijo = uuidv7().slice(-8);
	const personaId = await nuevaPersona(dueno, "taller");
	const flujoId = uuidv7();
	const nombre = `Flujo de prueba ${sufijo}`;
	await dueno.query("INSERT INTO flujos (id, nombre) VALUES ($1, $2)", [flujoId, nombre]);
	const { rows } = await dueno.query("SELECT id, nombre FROM operaciones WHERE es_corte");
	const corte = { id: String(rows[0]?.id), nombre: String(rows[0]?.nombre) };
	const otras = Array.from({ length: demas }, (_, i) => ({ id: uuidv7(), nombre: `Operación ${i + 1} ${sufijo}` }));
	for (const otra of otras)
		await dueno.query("INSERT INTO operaciones (id, nombre) VALUES ($1, $2)", [otra.id, otra.nombre]);
	const operaciones = [];
	for (const [i, operacion] of [corte, ...otras].entries()) {
		const flujoOperacionId = uuidv7();
		await dueno.query(
			"INSERT INTO flujo_operaciones (id, flujo_id, operacion_id, orden, persona_base_id) VALUES ($1, $2, $3, $4, $5)",
			[flujoOperacionId, flujoId, operacion.id, i + 1, personaId],
		);
		operaciones.push({ flujoOperacionId, operacionId: operacion.id, nombre: operacion.nombre });
	}
	return { flujoId, nombre, personaId, operaciones };
}

/**
 * Una operación de un flujo de prueba que no es el corte: la que recibe una tarifa.
 * @param dueno La conexión con el rol dueño.
 * @returns Su id en el flujo, su nombre y el del flujo.
 */
export async function operacionDePrueba(dueno: pg.Pool) {
	const flujo = await flujoDePrueba(dueno, 1);
	const [, operacion] = flujo.operaciones;
	if (operacion === undefined) throw new Error("el flujo de prueba no tiene operaciones");
	return { id: operacion.flujoOperacionId, nombre: operacion.nombre, flujo: flujo.nombre };
}
