/**
 * Prueba de la lista de Personal · Personas: por área, sin el pago salvo con «Ver tarifas», que pide el
 * permiso de sueldos y queda en la bitácora.
 * Fase 7 · docs/fases/07-autorizaciones-y-personal.md (parte 5)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
	crearServidorDePrueba,
	encabezadosDeLaWeb,
	type ServidorDePrueba,
} from "../../../nucleo/pruebas/servidor-de-prueba.ts";

describe("la lista de Personal recorta el pago sin el permiso y apunta la consulta de tarifas", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	it("la lista de Personal: sin «Ver tarifas» no lleva el pago; con él pide el permiso y queda en la bitácora", async () => {
		const ver = async (quien: string, parametros: string) => {
			const respuesta = await servidor.app.inject({
				method: "GET",
				url: `/v1/consultas/personal.personas?${parametros}`,
				headers: encabezadosDeLaWeb(quien),
			});
			return { estado: respuesta.statusCode, cuerpo: respuesta.json() };
		};
		const taller = await ver("personal", "area=taller");
		expect(taller.estado).toBe(200);
		expect(taller.cuerpo.resultado.personas.length).toBeGreaterThan(0);
		expect(taller.cuerpo.resultado.personas.every((persona: { area: string }) => persona.area === "taller")).toBe(true);
		expect(JSON.stringify(taller.cuerpo)).not.toContain("pago_dia_centavos");
		expect((await ver("personal", "ver_tarifas=si")).cuerpo).toMatchObject({ codigo: "sin_permiso_fino" });
		const conTarifas = await ver("personal_sueldos", "area=oficina&ver_tarifas=si");
		expect(conTarifas.cuerpo.resultado.personas[0]).toHaveProperty("pago_dia_centavos");
		const { rows } = await servidor.base.dueno.query(
			"SELECT count(*)::int AS n FROM bitacora WHERE descripcion = 'Consultó las tarifas del personal'",
		);
		expect(rows[0]).toEqual({ n: 1 });
	});
});
