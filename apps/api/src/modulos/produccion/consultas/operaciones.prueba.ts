/**
 * Prueba de `produccion.operaciones` y de `produccion.produccion_por_persona` con los datos de la muestra: los siete
 * flujos con el corte primero, quién hace cada operación, su candado y «Sin tarifa»; la tarifa solo con «ven sueldos y
 * tarifas»; y las piezas buenas de cada persona del Taller, sin tarifas ni importes. Solo Producción.
 * Fase 19 · docs/fases/19-web-principal.md (criterio «Cada consulta revisa el departamento y el permiso fino en el
 * servidor y no manda lo que la cuenta no debe ver: … sueldos y tarifas sin su permiso»)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pedirConsulta } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

/** Un flujo, lo que se revisa. */
interface Flujo {
	nombre: string;
	prendas: string[];
	lotes_en_proceso: number;
	operaciones: {
		operacion: string;
		es_corte: boolean;
		persona: string;
		sin_tarifa: boolean;
		tarifa_centavos?: number | null;
	}[];
}

describe("produccion.operaciones y produccion.produccion_por_persona", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	it("los flujos con el corte primero, sus prendas, su candado y sin la tarifa para Producción", async () => {
		const respuesta = await pedirConsulta(servidor, "produccion.operaciones", {}, "produccion");
		expect(respuesta.estado, JSON.stringify(respuesta.cuerpo)).toBe(200);
		expect(JSON.stringify(respuesta.cuerpo.resultado)).not.toMatch(/centavos/);
		expect(respuesta.cuerpo.recortado).toContain("tarifa_centavos");
		const { flujos, personas, antes_por_omision } = respuesta.cuerpo.resultado as {
			flujos: Flujo[];
			personas: { nombre: string }[];
			antes_por_omision: string;
		};
		expect(flujos).toHaveLength(7);
		expect(flujos.every((flujo) => flujo.operaciones[0]?.es_corte === true)).toBe(true);
		expect(flujos.every((flujo) => flujo.operaciones.every((operacion) => !operacion.sin_tarifa))).toBe(true);
		const polo = flujos.find((flujo) => flujo.nombre === "Playera polo");
		expect(polo?.lotes_en_proceso).toBeGreaterThan(0);
		expect(polo?.prendas).toContain("Playera polo blanca lisa");
		expect(personas.map((persona) => persona.nombre)).not.toContain("Rosa Elena Díaz");
		expect(antes_por_omision).toBe("Planchado");
	});

	it("con «ven sueldos y tarifas» viaja la tarifa de cada operación", async () => {
		const respuesta = await pedirConsulta(servidor, "produccion.operaciones", {}, "duena");
		const { flujos } = respuesta.cuerpo.resultado as { flujos: Flujo[] };
		expect(
			flujos.every((flujo) => flujo.operaciones.every((operacion) => typeof operacion.tarifa_centavos === "number")),
		).toBe(true);
	});

	it("la producción por persona: la gente activa del Taller, de quien lleva más hoy a quien lleva menos", async () => {
		const respuesta = await pedirConsulta(servidor, "produccion.produccion_por_persona", {}, "produccion");
		expect(respuesta.estado, JSON.stringify(respuesta.cuerpo)).toBe(200);
		expect(JSON.stringify(respuesta.cuerpo)).not.toMatch(/centavos|tarifa|importe/);
		const { personas } = respuesta.cuerpo.resultado as {
			personas: { nombre: string; hoy: number; semana: number; operaciones: string[] }[];
		};
		expect(personas).toHaveLength(13);
		personas.forEach((persona, i) => {
			if (i > 0) expect(persona.hoy).toBeLessThanOrEqual(personas[i - 1]?.hoy ?? 0);
			expect(persona.semana).toBeGreaterThanOrEqual(persona.hoy);
		});
		expect(personas.find((persona) => persona.nombre === "Beto Aguilar")?.operaciones).toEqual(["Corte"]);
	});

	it("solo Producción las pide", async () => {
		expect((await pedirConsulta(servidor, "produccion.operaciones", {}, "personal")).estado).toBe(403);
		expect((await pedirConsulta(servidor, "produccion.produccion_por_persona", {}, "personal")).estado).toBe(403);
	});
});
