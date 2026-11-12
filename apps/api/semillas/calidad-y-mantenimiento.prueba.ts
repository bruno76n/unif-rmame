/**
 * Prueba de Calidad y Mantenimiento de la muestra: lo cargan las acciones del sistema, en el día que dice la muestra.
 * Fase 13 · docs/fases/13-calidad-y-mantenimiento.md («Cómo se construye»)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearServidorDePrueba, type ServidorDePrueba } from "../src/nucleo/pruebas/servidor-de-prueba.ts";

describe("los datos de la muestra de Calidad y Mantenimiento se cargan con estas mismas acciones", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Una consulta con el rol dueño. */
	async function consultar(texto: string): Promise<Record<string, unknown>[]> {
		return (await servidor.base.dueno.query(texto)).rows;
	}

	it("los defectos con sus operaciones, las doce máquinas con su tipo y los técnicos", async () => {
		expect(await consultar("SELECT count(*)::int AS n FROM defectos")).toEqual([{ n: 12 }]);
		expect(
			await consultar(
				`SELECT o.nombre FROM defecto_operaciones d JOIN defectos f ON f.id = d.defecto_id JOIN operaciones o ON o.id = d.operacion_id
				 WHERE f.nombre = 'Costura abierta' ORDER BY o.nombre`,
			),
		).toEqual([
			{ nombre: "Canesú y hombros" },
			{ nombre: "Costados" },
			{ nombre: "Entrepierna" },
			{ nombre: "Hombros" },
		]);
		expect(await consultar("SELECT count(*)::int AS n FROM maquinas WHERE baja_en IS NULL")).toEqual([{ n: 12 }]);
		expect(
			await consultar(
				"SELECT prefijo FROM tipos_maquina WHERE nombre IN ('Recta', 'Overlock', 'Ojaladora') ORDER BY prefijo",
			),
		).toEqual([{ prefijo: "O" }, { prefijo: "OJ" }, { prefijo: "R" }]);
		expect(await consultar("SELECT count(*)::int AS n FROM tecnicos")).toEqual([{ n: 3 }]);
	});

	it("las fallas de la tablet en su día, sus reparaciones y los servicios; la Collareta 3 sigue parada", async () => {
		expect(await consultar("SELECT estado, count(*)::int AS n FROM fallas GROUP BY estado ORDER BY estado")).toEqual([
			{ estado: "en_reparacion", n: 1 },
			{ estado: "reportada", n: 1 },
			{ estado: "resuelta", n: 4 },
		]);
		expect(await consultar("SELECT count(*)::int AS n FROM fallas WHERE origen <> 'tablet'")).toEqual([{ n: 0 }]);
		expect(
			await consultar(
				"SELECT count(*)::int AS n, sum(costo_centavos)::int AS costo, sum(horas_paro)::int AS horas FROM servicios",
			),
		).toEqual([{ n: 8, costo: 773_000, horas: 72 }]);
		expect(
			await consultar(
				`SELECT m.nombre, f.detuvo_maquina, f.nota_seguimiento IS NOT NULL AS con_nota FROM fallas f JOIN maquinas m ON m.id = f.maquina_id
				 WHERE f.estado <> 'resuelta' ORDER BY m.nombre`,
			),
		).toEqual([
			{ nombre: "Collareta 3", detuvo_maquina: true, con_nota: true },
			{ nombre: "Recta 7", detuvo_maquina: false, con_nota: false },
		]);
	});
});
