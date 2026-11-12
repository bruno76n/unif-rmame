/**
 * Prueba de lo que baja de Mantenimiento a la tablet: las máquinas activas, sus fallas abiertas y los motivos, nunca
 * costos; la máquina dada de baja y la falla resuelta bajan como `quitar`.
 * Fase 13 · docs/fases/13-calidad-y-mantenimiento.md («Criterios de terminado»)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { bajarHastaTener, fotoCompleta } from "../../nucleo/pruebas/bajada-de-prueba.ts";
import { mandarAccion } from "../../nucleo/pruebas/llamadas.ts";
import { maquinaDePrueba, motivoDePrueba } from "../../nucleo/pruebas/mantenimiento-de-prueba.ts";
import { nuevaPersona } from "../../nucleo/pruebas/personas-de-prueba.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../nucleo/pruebas/servidor-de-prueba.ts";

describe("A la tablet bajan las máquinas activas, sus fallas abiertas y los motivos, nunca costos", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	it("la máquina y su falla abierta bajan; resuelta, la falla se quita; dada de baja, la máquina se quita", async () => {
		const persona = await nuevaPersona(servidor.base.dueno, "taller");
		const maquina = await maquinaDePrueba(servidor, persona);
		const reportada = await mandarAccion(
			servidor,
			"mantenimiento.reportar_falla",
			{ datos: { maquina_id: maquina.id, motivo_falla_id: await motivoDePrueba(servidor, "No prende") } },
			"mantenimiento",
		);
		const fallaId = z.object({ falla_id: z.uuid() }).parse(reportada.cuerpo.resultado).falla_id;
		const { cambios, cursor } = await fotoCompleta(servidor);
		expect(cambios.find((cambio) => cambio.id === maquina.id)).toEqual({
			tabla: "maquinas",
			op: "cambio",
			id: maquina.id,
			datos: { folio: maquina.folio, nombre: maquina.nombre, persona_id: persona },
		});
		expect(cambios.find((cambio) => cambio.id === fallaId)).toMatchObject({
			tabla: "fallas",
			datos: { estado: "reportada" },
		});
		expect(cambios.filter((cambio) => cambio.tabla === "motivos_falla").map((cambio) => cambio.datos?.nombre)).toEqual(
			expect.arrayContaining(["No prende", "Otra cosa"]),
		);
		expect(JSON.stringify(cambios)).not.toMatch(/costo|tecnico|horas_paro/);
		// Se resuelve la falla y se da de baja la máquina.
		const { rows: tecnico } = await servidor.base.dueno.query(
			"INSERT INTO tecnicos (id, nombre) VALUES (gen_random_uuid(), 'Técnico de la bajada') RETURNING id",
		);
		const version = async (tabla: string, id: string) =>
			Number(
				(await servidor.base.dueno.query(`SELECT version::int AS v FROM ${tabla} WHERE id = $1`, [id])).rows[0]?.v,
			);
		await mandarAccion(
			servidor,
			"mantenimiento.registrar_servicio",
			{
				datos: {
					falla_id: fallaId,
					tecnico_id: tecnico[0]?.id,
					que_se_hizo: "Cambio de motor",
					costo_centavos: 0,
					horas_paro: 2,
				},
				version: await version("fallas", fallaId),
			},
			"mantenimiento",
		);
		await mandarAccion(
			servidor,
			"mantenimiento.baja_maquina",
			{
				datos: { maquina_id: maquina.id, motivo: "Se vendió como chatarra" },
				version: await version("maquinas", maquina.id),
			},
			"mantenimiento",
		);
		const despues = await bajarHastaTener(servidor, cursor, [fallaId, maquina.id]);
		expect(
			despues.cambios.filter((cambio) => [fallaId, maquina.id].includes(cambio.id)).map((cambio) => cambio.op),
		).toEqual(["quitar", "quitar"]);
	});
});
