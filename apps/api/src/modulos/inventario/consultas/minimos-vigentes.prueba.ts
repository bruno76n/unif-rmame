/**
 * Prueba de `inventario.minimos_vigentes`: los dos mínimos vigentes de cada ubicación con su versión, como los da la
 * lectura de Inventario; solo para Administración del sistema; y un cambio de la dueña se ve en seguida.
 * Fase 19 · docs/fases/19-web-principal.md (criterio «Cada consulta revisa el departamento y el permiso fino en el
 * servidor y no manda lo que la cuenta no debe ver»)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mandarAccion, pedirConsulta } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

/** Lo que lee la prueba. */
interface Minimos {
	ubicaciones: {
		ubicacion_id: string;
		ubicacion: string;
		mayor_venta: { piezas: number; version: number } | null;
		demas: { piezas: number; version: number } | null;
	}[];
}

describe("inventario.minimos_vigentes: los mínimos de existencia de Configuración", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	it("solo la pide Administración del sistema; Bodega no", async () => {
		expect((await pedirConsulta(servidor, "inventario.minimos_vigentes", {}, "bodega")).estado).toBe(403);
	});

	it("los dos vigentes de cada ubicación, como en la base, y el cambio de la dueña con su versión nueva", async () => {
		const respuesta = await pedirConsulta(servidor, "inventario.minimos_vigentes", {}, "admin");
		expect(respuesta.estado, JSON.stringify(respuesta.cuerpo)).toBe(200);
		const { ubicaciones } = respuesta.cuerpo.resultado as Minimos;
		const { rows } = await servidor.base.dueno.query(
			"SELECT ubicacion_id, nivel, piezas, version FROM minimos WHERE baja_en IS NULL",
		);
		expect(ubicaciones.length).toBeGreaterThan(0);
		for (const vigente of rows) {
			const ubicacion = ubicaciones.find((una) => una.ubicacion_id === vigente.ubicacion_id);
			expect(ubicacion?.[vigente.nivel === "mayor_venta" ? "mayor_venta" : "demas"]).toEqual({
				piezas: vigente.piezas,
				version: Number(vigente.version),
			});
		}
		const [bodega] = ubicaciones.filter((una) => una.ubicacion === "Bodega");
		const minimo = bodega?.mayor_venta;
		if (bodega === undefined || minimo === null || minimo === undefined) throw new Error("Bodega sin mínimo");
		const cambio = await mandarAccion(
			servidor,
			"admin.cambiar_minimo",
			{
				datos: { ubicacion_id: bodega.ubicacion_id, nivel: "mayor_venta", piezas: minimo.piezas + 5 },
				version: minimo.version,
			},
			"duena",
		);
		expect(cambio.estado, JSON.stringify(cambio.cuerpo)).toBe(200);
		const despues = (await pedirConsulta(servidor, "inventario.minimos_vigentes", {}, "admin")).cuerpo
			.resultado as Minimos;
		expect(despues.ubicaciones.find((una) => una.ubicacion === "Bodega")?.mayor_venta?.piezas).toBe(minimo.piezas + 5);
	});
});
