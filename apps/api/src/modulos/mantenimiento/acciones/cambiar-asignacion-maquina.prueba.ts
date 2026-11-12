/**
 * Prueba de `mantenimiento.cambiar_asignacion_maquina`: cambiar quién trae una máquina no cambia la falla abierta, que
 * guarda quién la traía al fallar; la trae una persona activa del Taller; si esa persona se da de baja, la máquina
 * queda sin quién la trae.
 * Fase 13 · docs/fases/13-calidad-y-mantenimiento.md («Criterios de terminado»)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { conGoogle, mandarAccion } from "../../../nucleo/pruebas/llamadas.ts";
import { maquinaDePrueba, motivoDePrueba } from "../../../nucleo/pruebas/mantenimiento-de-prueba.ts";
import { nuevaPersona } from "../../../nucleo/pruebas/personas-de-prueba.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

describe("Cambiar quién trae una máquina no cambia la falla abierta", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Una consulta con el rol dueño. */
	async function consultar(texto: string, valores: unknown[] = []) {
		return (await servidor.base.dueno.query(texto, valores)).rows;
	}

	/** Mantenimiento cambia quién trae la máquina. */
	async function cambiar(maquinaId: string, personaId: string) {
		const [{ v } = { v: 0 }] = await consultar("SELECT version::int AS v FROM maquinas WHERE id = $1", [maquinaId]);
		return mandarAccion(
			servidor,
			"mantenimiento.cambiar_asignacion_maquina",
			{ datos: { maquina_id: maquinaId, persona_id: personaId }, version: v },
			"mantenimiento",
		);
	}

	it("la máquina cambia de persona y su falla abierta conserva a quien la traía al fallar", async () => {
		const [antes, despues] = [
			await nuevaPersona(servidor.base.dueno, "taller"),
			await nuevaPersona(servidor.base.dueno, "taller"),
		];
		const maquina = await maquinaDePrueba(servidor, antes);
		await mandarAccion(
			servidor,
			"mantenimiento.reportar_falla",
			{ datos: { maquina_id: maquina.id, motivo_falla_id: await motivoDePrueba(servidor, "Salta puntada") } },
			"mantenimiento",
		);
		const respuesta = await cambiar(maquina.id, despues);
		expect(respuesta.cuerpo.resultado).toEqual({
			mensaje: expect.stringMatching(new RegExp(`^${maquina.nombre} ahora la trae `)),
		});
		expect(await consultar("SELECT persona_id FROM maquinas WHERE id = $1", [maquina.id])).toEqual([
			{ persona_id: despues },
		]);
		expect(await consultar("SELECT persona_asignada_id FROM fallas WHERE maquina_id = $1", [maquina.id])).toEqual([
			{ persona_asignada_id: antes },
		]);
		expect((await cambiar(maquina.id, await nuevaPersona(servidor.base.dueno, "oficina"))).cuerpo).toMatchObject({
			codigo: "persona_no_valida",
		});
	});

	it("si la persona que la trae se da de baja, la máquina queda sin quién la trae", async () => {
		const persona = await nuevaPersona(servidor.base.dueno, "taller");
		const maquina = await maquinaDePrueba(servidor, persona);
		const [{ v } = { v: 0 }] = await consultar("SELECT version::int AS v FROM personas WHERE id = $1", [persona]);
		const baja = await mandarAccion(
			servidor,
			"personal.dar_baja_persona",
			{ datos: { persona_id: persona, motivo: "Renunció a la fábrica" }, version: v },
			"personal",
			conGoogle(),
		);
		expect(baja.estado).toBe(200);
		expect(await consultar("SELECT persona_id FROM maquinas WHERE id = $1", [maquina.id])).toEqual([
			{ persona_id: null },
		]);
	});
});
