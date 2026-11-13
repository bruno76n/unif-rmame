/**
 * Prueba de `personal.pines` con los datos de la muestra: solo las personas activas del Taller sin cuenta de Google,
 * cada una con «Sin PIN», su PIN activo o «Bloqueado» desde cuándo, la versión de su PIN para restablecer o
 * desbloquear, nunca el PIN ni su hash, y que solo la piden las cuentas con Personal.
 * Fase 19 · docs/fases/19-web-principal.md (criterio «Cada consulta revisa el departamento y el permiso fino en el
 * servidor y no manda lo que la cuenta no debe ver»)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mandarAccion, pedirConsulta } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";
import { idDePersona, valorDe } from "./de-prueba.ts";

/** Lo que se revisa de la respuesta. */
interface Pines {
	personas: {
		persona_id: string;
		nombre: string;
		puesto: string;
		tablet: {
			tiene: boolean;
			estado: { texto: string; color: string } | null;
			bloqueado_desde: string | null;
			version: number | null;
		};
	}[];
}

describe("Personal · PIN del taller: quién puede tener PIN y cómo está, sin el PIN", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Pide la consulta como Personal. */
	async function pines(): Promise<Pines> {
		const respuesta = await pedirConsulta(servidor, "personal.pines", {}, "personal");
		expect(respuesta.estado, JSON.stringify(respuesta.cuerpo)).toBe(200);
		return respuesta.cuerpo.resultado as Pines;
	}

	it("solo las personas activas del Taller sin cuenta de Google, todas «Sin PIN» al empezar", async () => {
		const { personas } = await pines();
		const esperadas = Number(
			await valorDe(
				servidor,
				`SELECT count(*) FROM personas p WHERE p.baja_en IS NULL AND p.area = 'taller'
				AND NOT EXISTS (SELECT 1 FROM usuarios u WHERE u.persona_id = p.id AND u.estado IN ('activa', 'solicitada'))`,
			),
		);
		expect(personas).toHaveLength(esperadas);
		const nombres = personas.map((persona) => persona.nombre);
		expect(nombres).toContain("Lupita Ramos");
		// Tomás entra con su cuenta de Google; Rosa es de la oficina; Rosa Elena está dada de baja.
		expect(nombres).not.toContain("Tomás Ruiz");
		expect(nombres).not.toContain("Rosa Méndez");
		expect(nombres).not.toContain("Rosa Elena Díaz");
		const lupita = personas.find((persona) => persona.nombre === "Lupita Ramos");
		expect(lupita).toMatchObject({
			puesto: "Costura",
			tablet: { tiene: false, estado: { texto: "Sin PIN", color: "ambar" }, version: null },
		});
	});

	it("con PIN: sin estado y con la versión de su PIN; bloqueado: «Bloqueado» en rojo desde cuándo; nunca el PIN", async () => {
		const ana = await idDePersona(servidor, "Ana Torres");
		const mari = await idDePersona(servidor, "Mari Cruz");
		for (const persona of [ana, mari]) {
			const asignado = await mandarAccion(
				servidor,
				"personal.asignar_pin",
				{ datos: { persona_id: persona } },
				"personal",
			);
			expect(asignado.estado, JSON.stringify(asignado.cuerpo)).toBe(200);
		}
		await servidor.base.dueno.query(
			"UPDATE pines SET estado = 'bloqueado', bloqueado_en = now() WHERE persona_id = $1 AND estado = 'activo'",
			[mari],
		);
		const datos = await pines();
		const deAna = datos.personas.find((persona) => persona.persona_id === ana);
		expect(deAna?.tablet).toMatchObject({ tiene: true, estado: null, bloqueado_desde: null });
		expect(deAna?.tablet.version).toBe(
			Number(await valorDe(servidor, "SELECT version FROM pines WHERE persona_id = $1 AND estado = 'activo'", ana)),
		);
		const deMari = datos.personas.find((persona) => persona.persona_id === mari);
		expect(deMari?.tablet).toMatchObject({ tiene: true, estado: { texto: "Bloqueado", color: "rojo" } });
		expect(deMari?.tablet.bloqueado_desde).toEqual(expect.any(String));
		expect(JSON.stringify(datos)).not.toMatch(/argon2|pin_hash|"pin"/);
	});

	it("solo la piden las cuentas con Personal", async () => {
		for (const quien of ["produccion", "ventas", "admin"]) {
			expect((await pedirConsulta(servidor, "personal.pines", {}, quien)).estado, quien).toBe(403);
		}
	});
});
