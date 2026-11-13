/**
 * Lo que comparten las pruebas de las consultas de Mantenimiento: un número de la base y las horas de paro de las
 * fallas que detienen, como las da la lectura del módulo.
 * Fase 19 · docs/fases/19-web-principal.md («Criterios de terminado»)
 */

import { z } from "zod";
import { crearBase } from "../../../nucleo/base/conexion.ts";
import { enAccionDePrueba } from "../../../nucleo/pruebas/accion-de-prueba.ts";
import type { ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

/**
 * Un número que regresa una consulta de SQL, leído con el dueño de la base.
 * @param servidor El servidor de prueba.
 * @param consulta El SQL, que regresa un renglón con una columna.
 */
export async function numeroDe(servidor: ServidorDePrueba, consulta: string): Promise<number> {
	const { rows } = await servidor.base.dueno.query(consulta);
	return Number(Object.values(rows[0] ?? {})[0] ?? 0);
}

/**
 * Las horas de paro de cada falla abierta que detuvo su máquina, por su id: las de `mantenimiento.fallas_que_detienen`.
 * @param servidor El servidor de prueba.
 */
export async function horasDeLasParadas(servidor: ServidorDePrueba): Promise<Map<string, number>> {
	const leidas = await enAccionDePrueba(crearBase(servidor.base.app), servidor.modulos, (contexto) =>
		contexto.lectura("mantenimiento.fallas_que_detienen", {}),
	);
	const { fallas } = z
		.object({ fallas: z.array(z.object({ falla_id: z.uuid(), horas_paro: z.number() })) })
		.parse(leidas);
	return new Map(fallas.map((falla) => [falla.falla_id, falla.horas_paro]));
}

/**
 * El id de una fila por una condición, leído con el dueño de la base.
 * @param servidor El servidor de prueba.
 * @param consulta El SQL, que regresa un renglón con su `id`.
 */
export async function idDe(servidor: ServidorDePrueba, consulta: string): Promise<string> {
	const { rows } = await servidor.base.dueno.query(consulta);
	return z.uuid().parse(rows[0]?.id);
}
