/**
 * Prueba de `admin.cambiar_minimo`: solo la dueña cambia un mínimo; el anterior queda de baja y el nuevo, vigente; la
 * misma cantidad no escribe nada; con la versión vieja, `409`.
 * Fase 14 · docs/fases/14-inventario-recepcion-del-taller-conteos-ajustes-y-reabasto.md («Criterios de terminado»)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ubicacionesPorCodigo } from "../../../nucleo/pruebas/inventario-de-prueba.ts";
import { mandarAccion } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

describe("Solo la dueña cambia un mínimo: el anterior queda de baja y el nuevo, vigente", () => {
	let servidor: ServidorDePrueba;
	let ubicacion: Record<string, string>;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
		ubicacion = await ubicacionesPorCodigo(servidor);
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Los mínimos de la Tienda 1 de las tallas de mayor venta, el vigente al final. */
	async function minimosDeT1() {
		const { rows } = await servidor.base.dueno.query(
			`SELECT piezas, baja_en IS NOT NULL AS de_baja, version::int AS version FROM minimos
			 WHERE ubicacion_id = $1 AND nivel = 'mayor_venta' ORDER BY baja_en IS NULL, creado_en`,
			[ubicacion.T1],
		);
		return rows;
	}

	/** Cambia el mínimo de mayor venta de la Tienda 1. */
	async function cambiar(piezas: number, quien = "duena", version?: number) {
		const vigente = (await minimosDeT1()).at(-1);
		return mandarAccion(
			servidor,
			"admin.cambiar_minimo",
			{ datos: { ubicacion_id: ubicacion.T1, nivel: "mayor_venta", piezas }, version: version ?? vigente?.version },
			quien,
		);
	}

	it("la siembra trae los seis mínimos; la dueña cambia uno: el anterior de baja y el nuevo vigente; el mismo valor no escribe", async () => {
		const { rows } = await servidor.base.dueno.query(
			`SELECT u.codigo, m.nivel, m.piezas FROM minimos m JOIN ubicaciones u ON u.id = m.ubicacion_id
			 WHERE m.baja_en IS NULL ORDER BY u.orden, m.nivel`,
		);
		expect(rows).toEqual([
			{ codigo: "BOD", nivel: "demas", piezas: 12 },
			{ codigo: "BOD", nivel: "mayor_venta", piezas: 30 },
			{ codigo: "T1", nivel: "demas", piezas: 4 },
			{ codigo: "T1", nivel: "mayor_venta", piezas: 8 },
			{ codigo: "T2", nivel: "demas", piezas: 4 },
			{ codigo: "T2", nivel: "mayor_venta", piezas: 8 },
		]);
		const respuesta = await cambiar(10);
		expect(respuesta.cuerpo.resultado).toMatchObject({
			mensaje: "Mínimo en Tienda 1 (tallas de mayor venta): 10",
			piezas: 10,
		});
		expect((await minimosDeT1()).map(({ piezas, de_baja }) => ({ piezas, de_baja }))).toEqual([
			{ piezas: 8, de_baja: true },
			{ piezas: 10, de_baja: false },
		]);
		expect((await cambiar(10)).estado).toBe(200);
		expect(await minimosDeT1()).toHaveLength(2);
	});

	it("solo la dueña; con la versión vieja, 409; cero no; sin mínimo en Aduana", async () => {
		expect((await cambiar(12, "admin")).cuerpo).toMatchObject({ codigo: "solo_duena" });
		expect((await cambiar(12, "duena", 1)).estado).toBe(409);
		expect((await cambiar(0)).cuerpo).toMatchObject({ campos: { piezas: "Escribe un número mayor que cero" } });
		const enAduana = await mandarAccion(
			servidor,
			"admin.cambiar_minimo",
			{ datos: { ubicacion_id: ubicacion.ADU, nivel: "demas", piezas: 3 }, version: 0 },
			"duena",
		);
		expect(enAduana.cuerpo).toMatchObject({ codigo: "ubicacion_sin_minimo", mensaje: "Aduana no lleva mínimo." });
	});
});
