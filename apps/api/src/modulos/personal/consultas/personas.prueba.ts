/**
 * Prueba de la lista de Personal · Personas: por área, sin el pago salvo con «Ver tarifas», que pide el
 * permiso de sueldos y queda en la bitácora.
 * Fase 7 · docs/fases/07-autorizaciones-y-personal.md (parte 5)
 * Fase 19 · docs/fases/19-web-principal.md (criterio «Cada consulta … no manda lo que la cuenta no debe ver: … sueldos
 * y tarifas sin su permiso»): la tarifa promedio de quien cobra por pieza solo con «Ver tarifas», las tiendas para el
 * filtro y si la cuenta puede pedir las tarifas.
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

	it("Personas para la pantalla: las tiendas del filtro, si la cuenta ve sueldos, y la tarifa promedio de quien cobra por pieza solo con «Ver tarifas»", async () => {
		const ver = async (quien: string, parametros: string) =>
			(
				await servidor.app.inject({
					method: "GET",
					url: `/v1/consultas/personal.personas?${parametros}`,
					headers: encabezadosDeLaWeb(quien),
				})
			).json();
		const sinTarifas = await ver("personal", "area=taller");
		expect(sinTarifas.resultado.ve_sueldos).toBe(false);
		expect(sinTarifas.resultado.tiendas.map((tienda: { nombre: string }) => tienda.nombre)).toEqual([
			"Tienda 1",
			"Tienda 2",
		]);
		expect(JSON.stringify(sinTarifas)).not.toContain("tarifa_centavos");
		const conTarifas = await ver("personal_sueldos", "area=taller&ver_tarifas=si");
		expect(conTarifas.resultado.ve_sueldos).toBe(true);
		const lupita = conTarifas.resultado.personas.find(
			(persona: { nombre: string }) => persona.nombre === "Lupita Ramos",
		);
		// Lupita hace de base los hombros, el canesú y la entrepierna: el promedio de sus tarifas vigentes.
		const { rows } = await servidor.base.dueno.query(
			`SELECT round(avg(t.tarifa_centavos))::int AS promedio FROM flujo_operaciones f
			JOIN flujos fl ON fl.id = f.flujo_id AND fl.baja_en IS NULL
			JOIN tarifas_operacion t ON t.flujo_operacion_id = f.id AND t.vigente_hasta IS NULL
			JOIN personas p ON p.id = f.persona_base_id
			WHERE p.nombre = 'Lupita Ramos' AND f.baja_en IS NULL`,
		);
		expect(lupita.tarifa_centavos).toBe(rows[0]?.promedio);
		const sergio = conTarifas.resultado.personas.find(
			(persona: { nombre: string }) => persona.nombre === "Sergio Gómez",
		);
		expect(sergio.pago_dia_centavos).toBe(22_000);
	});
});
