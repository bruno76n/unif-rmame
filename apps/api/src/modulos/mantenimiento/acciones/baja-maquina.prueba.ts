/**
 * Prueba de `mantenimiento.baja_maquina`: una máquina con falla abierta no se da de baja; sin falla, sí, con su motivo;
 * sus fallas y servicios se quedan.
 * Fase 13 · docs/fases/13-calidad-y-mantenimiento.md («Criterios de terminado»)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mandarAccion } from "../../../nucleo/pruebas/llamadas.ts";
import { maquinaDePrueba, motivoDePrueba } from "../../../nucleo/pruebas/mantenimiento-de-prueba.ts";
import { nuevaPersona } from "../../../nucleo/pruebas/personas-de-prueba.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

describe("Una máquina con falla abierta no se da de baja", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Mantenimiento da de baja una máquina con su versión de ahora. */
	async function darDeBaja(maquinaId: string, motivo = "Ya no tiene arreglo") {
		const { rows } = await servidor.base.dueno.query("SELECT version::int AS v FROM maquinas WHERE id = $1", [
			maquinaId,
		]);
		return mandarAccion(
			servidor,
			"mantenimiento.baja_maquina",
			{ datos: { maquina_id: maquinaId, motivo }, version: rows[0]?.v },
			"mantenimiento",
		);
	}

	it("con falla abierta no; resuelta, sí, con su motivo; ya de baja, no otra vez", async () => {
		const maquina = await maquinaDePrueba(servidor, await nuevaPersona(servidor.base.dueno, "taller"));
		const reportada = await mandarAccion(
			servidor,
			"mantenimiento.reportar_falla",
			{ datos: { maquina_id: maquina.id, motivo_falla_id: await motivoDePrueba(servidor, "No prende") } },
			"mantenimiento",
		);
		expect(reportada.estado).toBe(200);
		expect((await darDeBaja(maquina.id)).cuerpo).toMatchObject({
			codigo: "maquina_con_falla_abierta",
			mensaje: `${maquina.nombre} tiene una falla abierta: resuélvela antes de darla de baja`,
		});
		await servidor.base.dueno.query(
			"UPDATE fallas SET estado = 'resuelta', resuelta_en = now(), resuelta_por = (SELECT id FROM usuarios LIMIT 1) WHERE maquina_id = $1",
			[maquina.id],
		);
		expect((await darDeBaja(maquina.id, "No")).estado).toBe(400);
		expect((await darDeBaja(maquina.id)).cuerpo.resultado).toEqual({ mensaje: `${maquina.nombre} dada de baja` });
		expect((await darDeBaja(maquina.id)).cuerpo).toMatchObject({ codigo: "maquina_ya_de_baja" });
		const { rows } = await servidor.base.dueno.query(
			"SELECT m.motivo_baja, (SELECT count(*)::int FROM fallas f WHERE f.maquina_id = m.id) AS fallas FROM maquinas m WHERE m.id = $1",
			[maquina.id],
		);
		expect(rows).toEqual([{ motivo_baja: "Ya no tiene arreglo", fallas: 1 }]);
	});
});
