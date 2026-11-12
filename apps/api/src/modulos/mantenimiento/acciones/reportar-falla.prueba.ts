/**
 * Prueba de `mantenimiento.reportar_falla`, `mandar_a_reparacion`, `guardar_nota_seguimiento` y `registrar_servicio`:
 * una máquina tiene una sola falla abierta (desde la tablet se aplica sin crear otra; desde Mantenimiento es un error);
 * la falla se manda a reparación con su técnico, lleva su nota y la resuelve un servicio, que la deja sin nota.
 * Fase 13 · docs/fases/13-calidad-y-mantenimiento.md («Criterios de terminado»)
 */

import { v7 as uuidv7 } from "uuid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { mandarAccion } from "../../../nucleo/pruebas/llamadas.ts";
import { maquinaDePrueba, motivoDePrueba } from "../../../nucleo/pruebas/mantenimiento-de-prueba.ts";
import { nuevaPersona } from "../../../nucleo/pruebas/personas-de-prueba.ts";
import { subirDeLaTablet } from "../../../nucleo/pruebas/produccion-de-prueba.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

describe("Una máquina tiene una sola falla abierta: desde la tablet se aplica sin crear otra; desde Mantenimiento es un error", () => {
	let servidor: ServidorDePrueba;
	let persona: string;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
		persona = await nuevaPersona(servidor.base.dueno, "taller");
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Una consulta con el rol dueño. */
	async function consultar(texto: string, valores: unknown[] = []) {
		return (await servidor.base.dueno.query(texto, valores)).rows;
	}

	/** La versión de una falla. */
	async function versionDe(fallaId: string): Promise<number> {
		return Number((await consultar("SELECT version::int AS v FROM fallas WHERE id = $1", [fallaId]))[0]?.v);
	}

	/** Mantenimiento reporta una falla. */
	function reportar(maquinaId: string, motivo: string, nota?: string) {
		return mandarAccion(
			servidor,
			"mantenimiento.reportar_falla",
			{ datos: { maquina_id: maquinaId, motivo_falla_id: motivo, ...(nota === undefined ? {} : { nota }) } },
			"mantenimiento",
		);
	}

	/** La tablet reporta una falla con la persona que entró con su PIN. */
	function desdeLaTablet(maquinaId: string, motivo: string) {
		return subirDeLaTablet(
			servidor,
			"mantenimiento.reportar_falla",
			{ id: uuidv7(), maquina_id: maquinaId, motivo_falla_id: motivo, sin_internet: false },
			persona,
		);
	}

	it("desde la tablet nace la falla con su folio, quién la reportó y quién traía la máquina; otra se aplica sin crearla", async () => {
		const maquina = await maquinaDePrueba(servidor, persona);
		const noPrende = await motivoDePrueba(servidor, "No prende");
		const primera = await desdeLaTablet(maquina.id, noPrende);
		expect(primera).toMatchObject({ resultado: "aplicado", datos: { detuvo_maquina: true } });
		expect(
			await consultar(
				"SELECT origen, reporto_persona_id, persona_asignada_id, detuvo_maquina, parada_desde IS NOT NULL AS parada, estado, folio FROM fallas WHERE maquina_id = $1",
				[maquina.id],
			),
		).toEqual([
			{
				origen: "tablet",
				reporto_persona_id: persona,
				persona_asignada_id: persona,
				detuvo_maquina: true,
				parada: true,
				estado: "reportada",
				folio: expect.stringMatching(/^FM-\d{4}$/),
			},
		]);
		// Otra desde la tablet: se aplica, sin crear otra falla y sin excepción.
		const segunda = await desdeLaTablet(maquina.id, await motivoDePrueba(servidor, "Hace ruido"));
		expect(segunda).toMatchObject({ resultado: "aplicado", datos: { falla_id: null }, excepciones: [] });
		expect(await consultar("SELECT count(*)::int AS n FROM fallas WHERE maquina_id = $1", [maquina.id])).toEqual([
			{ n: 1 },
		]);
		// Desde Mantenimiento, es un error.
		expect((await reportar(maquina.id, noPrende)).cuerpo).toMatchObject({
			codigo: "maquina_con_falla_abierta",
			mensaje: `${maquina.nombre} ya tiene una falla abierta en Mantenimiento`,
		});
	});

	it("de Mantenimiento: la falla que no detiene trabaja con falla; se manda a reparación parada, lleva su nota y la resuelve un servicio", async () => {
		const maquina = await maquinaDePrueba(servidor, persona);
		const reportada = await reportar(
			maquina.id,
			await motivoDePrueba(servidor, "Rompe el hilo"),
			"Revienta a cada rato",
		);
		const { falla_id, folio } = z.object({ falla_id: z.uuid(), folio: z.string() }).parse(reportada.cuerpo.resultado);
		expect(reportada.cuerpo.resultado).toMatchObject({ mensaje: `${folio}: ${maquina.nombre} trabaja con falla` });
		const mandada = await mandarAccion(
			servidor,
			"mantenimiento.mandar_a_reparacion",
			{
				datos: { falla_id, tecnico_nombre: "Taller Hernández", se_queda_parada: true },
				version: await versionDe(falla_id),
			},
			"mantenimiento",
		);
		expect(mandada.cuerpo.resultado).toMatchObject({ mensaje: `${folio} en reparación con Taller Hernández` });
		const tecnico = z.object({ tecnico_id: z.uuid() }).parse(mandada.cuerpo.resultado).tecnico_id;
		expect(
			await consultar("SELECT estado, detuvo_maquina, parada_desde IS NOT NULL AS parada FROM fallas WHERE id = $1", [
				falla_id,
			]),
		).toEqual([{ estado: "en_reparacion", detuvo_maquina: true, parada: true }]);
		// Mandarla otra vez no se puede.
		expect(
			(
				await mandarAccion(
					servidor,
					"mantenimiento.mandar_a_reparacion",
					{ datos: { falla_id, tecnico_id: tecnico, se_queda_parada: true }, version: await versionDe(falla_id) },
					"mantenimiento",
				)
			).cuerpo,
		).toMatchObject({ codigo: "falla_no_reportada", mensaje: `${folio} ya está en reparación.` });
		const nota = await mandarAccion(
			servidor,
			"mantenimiento.guardar_nota_seguimiento",
			{ datos: { falla_id, nota: "Esperan la refacción" }, version: await versionDe(falla_id) },
			"mantenimiento",
		);
		expect(nota.cuerpo.resultado).toEqual({ mensaje: `Nota guardada en ${folio}` });
		const servicio = await mandarAccion(
			servidor,
			"mantenimiento.registrar_servicio",
			{
				datos: {
					falla_id,
					tecnico_id: tecnico,
					que_se_hizo: "Cambio de lanzadera",
					costo_centavos: 65_000,
					horas_paro: 13,
				},
				version: await versionDe(falla_id),
			},
			"mantenimiento",
		);
		expect(servicio.cuerpo.resultado).toMatchObject({
			mensaje: `${maquina.nombre} vuelve a trabajar. 13 horas de paro quedan registradas`,
			folio: expect.stringMatching(/^SM-\d{4}$/),
		});
		expect(await consultar("SELECT estado, nota_seguimiento FROM fallas WHERE id = $1", [falla_id])).toEqual([
			{ estado: "resuelta", nota_seguimiento: null },
		]);
		expect(
			await consultar("SELECT costo_centavos::int AS costo, horas_paro FROM servicios WHERE falla_id = $1", [falla_id]),
		).toEqual([{ costo: 65_000, horas_paro: 13 }]);
		// Ya resuelta: ni nota ni otro servicio; y la máquina acepta una falla nueva.
		expect(
			(
				await mandarAccion(
					servidor,
					"mantenimiento.guardar_nota_seguimiento",
					{ datos: { falla_id, nota: "otra" }, version: await versionDe(falla_id) },
					"mantenimiento",
				)
			).cuerpo,
		).toMatchObject({ codigo: "falla_resuelta" });
		expect((await reportar(maquina.id, await motivoDePrueba(servidor, "Hace ruido"))).estado).toBe(200);
	});

	it("una falla que ya detuvo la máquina sigue parada hasta la reparación; un servicio suelto va a una máquina activa", async () => {
		const maquina = await maquinaDePrueba(servidor, persona);
		const reportada = await reportar(maquina.id, await motivoDePrueba(servidor, "No prende"));
		const { falla_id } = z.object({ falla_id: z.uuid() }).parse(reportada.cuerpo.resultado);
		const sinParar = await mandarAccion(
			servidor,
			"mantenimiento.mandar_a_reparacion",
			{ datos: { falla_id, tecnico_nombre: "Don Pepe", se_queda_parada: false }, version: await versionDe(falla_id) },
			"mantenimiento",
		);
		expect(sinParar.cuerpo).toMatchObject({ codigo: "ya_estaba_parada" });
		const otra = await maquinaDePrueba(servidor, persona);
		const tecnico = z.object({ tecnico_id: z.uuid() }).parse(
			(
				await mandarAccion(
					servidor,
					"mantenimiento.mandar_a_reparacion",
					{
						datos: { falla_id, tecnico_nombre: "don pepe", se_queda_parada: true },
						version: await versionDe(falla_id),
					},
					"mantenimiento",
				)
			).cuerpo.resultado,
		).tecnico_id;
		// «don pepe» es el mismo técnico que «Don Pepe».
		expect(await consultar("SELECT count(*)::int AS n FROM tecnicos WHERE lower(nombre) = 'don pepe'")).toEqual([
			{ n: 1 },
		]);
		const suelto = await mandarAccion(
			servidor,
			"mantenimiento.registrar_servicio",
			{
				version: Number((await consultar("SELECT version::int AS v FROM maquinas WHERE id = $1", [otra.id]))[0]?.v),
				datos: {
					maquina_id: otra.id,
					tecnico_id: tecnico,
					que_se_hizo: "Limpieza y aceite",
					costo_centavos: 0,
					horas_paro: 0,
				},
			},
			"mantenimiento",
		);
		expect(suelto.cuerpo.resultado).toMatchObject({ mensaje: expect.stringMatching(/^SM-\d{4} registrado$/) });
	});
});
