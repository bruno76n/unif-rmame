/**
 * Las ayudas de las pruebas de los gastos: un valor de sus listas, registrar un gasto y un servicio con costo de
 * Mantenimiento.
 * Fase 17 · docs/modulos/contaduria/gastos.md
 */

import { Temporal } from "temporal-polyfill";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";
import { mandarAccion } from "./llamadas.ts";
import { maquinaDePrueba } from "./mantenimiento-de-prueba.ts";
import { nuevaPersona } from "./personas-de-prueba.ts";
import type { ServidorDePrueba } from "./servidor-de-prueba.ts";

/**
 * El id de un valor de una lista, por su nombre.
 * @param servidor El servidor de prueba.
 * @param lista La clave de la lista.
 * @param nombre El nombre del valor.
 */
export async function valorDeListaDePrueba(servidor: ServidorDePrueba, lista: string, nombre: string): Promise<string> {
	const { rows } = await servidor.base.dueno.query(
		"SELECT v.id FROM lista_valores v JOIN listas l ON l.id = v.lista_id WHERE l.clave = $1 AND v.nombre = $2",
		[lista, nombre],
	);
	return z.uuid().parse(rows[0]?.id);
}

/** Hoy, en hora de México. */
export function hoyEnMexico(): string {
	return Temporal.Now.plainDateISO("America/Mexico_City").toString();
}

/**
 * Contaduría registra un gasto: Luz, $1,250 en la fábrica, hoy, en efectivo, si no se dice otra cosa.
 * @param servidor El servidor de prueba.
 * @param datos Lo que cambia.
 */
export async function registrarGastoDePrueba(servidor: ServidorDePrueba, datos: Record<string, unknown> = {}) {
	return mandarAccion(
		servidor,
		"contaduria.registrar_gasto",
		{
			datos: {
				categoria_id: await valorDeListaDePrueba(servidor, "categorias_gasto", "Luz"),
				monto_centavos: 125_000,
				area: "fabrica",
				fecha: hoyEnMexico(),
				medio: "efectivo",
				...datos,
			},
		},
		"contaduria",
	);
}

/**
 * Mantenimiento registra un servicio suelto a una máquina nueva, con el costo que se diga.
 * @param servidor El servidor de prueba.
 * @param costo El costo del servicio, en centavos.
 * @returns El servicio, su folio y su máquina.
 */
export async function servicioConCostoDePrueba(servidor: ServidorDePrueba, costo: number) {
	const maquina = await maquinaDePrueba(servidor, await nuevaPersona(servidor.base.dueno, "taller"));
	const tecnico = uuidv7();
	await servidor.base.dueno.query("INSERT INTO tecnicos (id, nombre) VALUES ($1, $2)", [
		tecnico,
		`Técnico ${tecnico.slice(-8)}`,
	]);
	const { rows } = await servidor.base.dueno.query("SELECT version::int AS v FROM maquinas WHERE id = $1", [
		maquina.id,
	]);
	const respuesta = await mandarAccion(
		servidor,
		"mantenimiento.registrar_servicio",
		{
			datos: {
				maquina_id: maquina.id,
				tecnico_id: tecnico,
				que_se_hizo: "Cambio de banda",
				costo_centavos: costo,
				horas_paro: 2,
			},
			version: rows[0]?.v,
		},
		"mantenimiento",
	);
	if (respuesta.estado !== 200) throw new Error(`no se registró el servicio: ${JSON.stringify(respuesta.cuerpo)}`);
	const { servicio_id, folio } = z
		.object({ servicio_id: z.uuid(), folio: z.string() })
		.parse(respuesta.cuerpo.resultado);
	return { servicioId: servicio_id, folio, maquina };
}
