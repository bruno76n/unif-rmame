/**
 * Prueba de dar de baja y reactivar a una persona: nada se borra, la persona de la dueña no se da de baja.
 * Fase 7 · docs/fases/07-autorizaciones-y-personal.md (partes 2, 3 y 4)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mandarAccion } from "../../../nucleo/pruebas/llamadas.ts";
import { nuevaPersona } from "../../../nucleo/pruebas/personas-de-prueba.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

describe("dar de baja conserva la persona y le quita lo que la deja entrar; la persona de la dueña no se da de baja", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** La versión de una persona. */
	async function version(id: string): Promise<number> {
		const { rows } = await servidor.base.dueno.query("SELECT version FROM personas WHERE id = $1", [id]);
		return Number(rows[0]?.version);
	}

	it("da de baja con su motivo y su bitácora; otra vez, ya_dada_de_baja; reactivar la regresa sin PIN ni cuenta", async () => {
		const id = await nuevaPersona(servidor.base.dueno, "taller");
		const sinMotivo = await mandarAccion(
			servidor,
			"personal.dar_baja_persona",
			{ datos: { persona_id: id, motivo: "x" }, version: await version(id) },
			"personal",
		);
		expect(sinMotivo.cuerpo).toMatchObject({ campos: { motivo: "Escribe el motivo" } });
		const baja = await mandarAccion(
			servidor,
			"personal.dar_baja_persona",
			{ datos: { persona_id: id, motivo: "Renunció" }, version: await version(id) },
			"personal",
		);
		expect(baja.cuerpo).toMatchObject({ resultado: { mensaje: "Persona de prueba dada de baja" } });
		const { rows } = await servidor.base.dueno.query("SELECT baja_en, motivo_baja FROM personas WHERE id = $1", [id]);
		expect(rows[0]).toEqual({ baja_en: expect.any(Date), motivo_baja: "Renunció" });
		const otraVez = await mandarAccion(
			servidor,
			"personal.dar_baja_persona",
			{ datos: { persona_id: id, motivo: "Renunció" }, version: await version(id) },
			"personal",
		);
		expect(otraVez.cuerpo).toMatchObject({ codigo: "ya_dada_de_baja" });
		const reactivada = await mandarAccion(
			servidor,
			"personal.reactivar_persona",
			{ datos: { persona_id: id }, version: await version(id) },
			"personal",
		);
		expect(reactivada.cuerpo).toMatchObject({
			resultado: { mensaje: "Persona de prueba reactivada. Falta asignarle PIN del taller" },
		});
		const activa = await mandarAccion(
			servidor,
			"personal.reactivar_persona",
			{ datos: { persona_id: id }, version: await version(id) },
			"personal",
		);
		expect(activa.cuerpo).toMatchObject({ codigo: "no_esta_de_baja" });
	});

	it("la persona de la dueña no se da de baja", async () => {
		const id = "01936f2e-0000-7000-8000-0000000000e1";
		const respuesta = await mandarAccion(
			servidor,
			"personal.dar_baja_persona",
			{ datos: { persona_id: id, motivo: "No se puede" }, version: await version(id) },
			"personal",
		);
		expect(respuesta.cuerpo).toMatchObject({ codigo: "es_la_duena", mensaje: "La dueña no se da de baja." });
	});
});
