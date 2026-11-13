/**
 * Prueba de `mantenimiento.servicios` con los datos de la muestra: los del año, del más reciente al más viejo, por
 * páginas, con lo que suman; un año sin servicios sale vacío; y solo la piden las cuentas con Mantenimiento.
 * Fase 19 · docs/fases/19-web-principal.md (criterio «Cada consulta revisa el departamento y el permiso fino en el
 * servidor y no manda lo que la cuenta no debe ver»)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pedirConsulta } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";
import { numeroDe } from "./de-prueba.ts";

/** Lo que regresa la consulta. */
interface Servicios {
	anio: number;
	anios: number[];
	resumen: { servicios: number; total_centavos?: number; horas_paro: number };
	renglones: {
		folio: string;
		fecha: string;
		maquina: string;
		tecnico: string;
		que_se_hizo: string;
		costo_centavos?: number;
		horas_paro: number;
	}[];
	cursor: string | null;
	hay_mas: boolean;
}

describe("Servicios: los del año, con lo que suman, por páginas", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Pide la consulta como Mantenimiento. */
	const pedir = async (parametros: Record<string, string>) => {
		const respuesta = await pedirConsulta(servidor, "mantenimiento.servicios", parametros, "mantenimiento");
		expect(respuesta.estado, JSON.stringify(respuesta.cuerpo)).toBe(200);
		return respuesta.cuerpo.resultado as Servicios;
	};

	it("los de 2026, del más reciente al más viejo, con su total y sus horas de paro, por páginas", async () => {
		const primera = await pedir({ anio: "2026", limite: "3" });
		const condicion = "WHERE extract(year from fecha) = 2026";
		expect(primera.anio).toBe(2026);
		expect(primera.anios).toContain(2026);
		expect(primera.resumen).toEqual({
			servicios: await numeroDe(servidor, `SELECT count(*) FROM servicios ${condicion}`),
			total_centavos: await numeroDe(servidor, `SELECT sum(costo_centavos) FROM servicios ${condicion}`),
			horas_paro: await numeroDe(servidor, `SELECT sum(horas_paro) FROM servicios ${condicion}`),
		});
		expect(primera.renglones[0]).toMatchObject({
			maquina: "Overlock 1",
			tecnico: "Técnica de Costura Juárez",
			que_se_hizo: "Ajuste de tiempo y cambio de garfio",
			costo_centavos: 85_000,
			horas_paro: 6,
		});
		expect(primera.hay_mas).toBe(true);
		const todos = [...primera.renglones];
		let cursor = primera.cursor;
		while (cursor !== null) {
			const siguiente = await pedir({ anio: "2026", limite: "3", cursor });
			todos.push(...siguiente.renglones);
			cursor = siguiente.cursor;
		}
		expect(todos).toHaveLength(primera.resumen.servicios);
		expect(new Set(todos.map((servicio) => servicio.folio)).size).toBe(todos.length);
		const fechas = todos.map((servicio) => servicio.fecha);
		expect(fechas).toEqual([...fechas].sort().reverse());
	});

	it("un año sin servicios sale vacío, con su resumen en cero", async () => {
		const vacio = await pedir({ anio: "2019" });
		expect(vacio.renglones).toEqual([]);
		expect(vacio.resumen).toEqual({ servicios: 0, total_centavos: 0, horas_paro: 0 });
	});

	it("solo la piden las cuentas con Mantenimiento", async () => {
		for (const quien of ["produccion", "direccion", "contaduria"]) {
			expect((await pedirConsulta(servidor, "mantenimiento.servicios", {}, quien)).estado, quien).toBe(403);
		}
	});
});
