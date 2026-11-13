/**
 * Prueba de `inventario.reabasto` con los datos de la muestra: los grupos que tienen renglones, cada renglón con lo que
 * dice la cuenta del reabasto (en la muestra las tiendas no tienen caja: solo Bodega, que solo se fabrica), lo ya
 * pedido a Producción que pasa el renglón a «Sugerido a producción», y que solo la piden las cuentas con Bodega, sin
 * precios ni costos.
 * Fase 19 · docs/fases/19-web-principal.md (criterio «Cada consulta revisa el departamento y el permiso fino en el
 * servidor y no manda lo que la cuenta no debe ver…»)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";
import { pedir, soloBodegaYSinPrecios, valorDe } from "./bodega-de-prueba.ts";

/** Un renglón, en lo que revisa la prueba. */
interface Renglon {
	variante_id: string;
	ubicacion_id: string;
	ubicacion: string;
	libres: number;
	minimo: number;
	mover: number;
	fabricar: number;
	pedidas: number;
}

/** Lo que regresa la consulta. */
interface Reabasto {
	grupos: { clave: string; renglones: Renglon[] }[];
}

describe("Reabasto: lo que falta en cada ubicación con mínimo, en sus cuatro grupos", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Pide la consulta como Bodega. */
	const reabasto = async () => (await pedir(servidor, "inventario.reabasto")) as unknown as Reabasto;

	it("solo salen los grupos con renglones; Bodega bajo su mínimo solo se fabrica, hasta su meta", async () => {
		const { grupos } = await reabasto();
		expect(grupos.length).toBeGreaterThan(0);
		for (const grupo of grupos) expect(grupo.renglones.length).toBeGreaterThan(0);
		const fabricacion = grupos.find((grupo) => grupo.clave === "fabricacion");
		expect(fabricacion).toBeDefined();
		for (const renglon of fabricacion?.renglones ?? []) {
			expect(renglon).toMatchObject({ ubicacion: "Bodega", mover: 0 });
			expect(renglon.libres).toBeLessThan(renglon.minimo);
			expect(renglon.fabricar).toBe(renglon.minimo * 2 - renglon.libres);
		}
		// Las tiendas de la muestra no tienen caja: Reabasto no las cuenta.
		expect(grupos.flatMap((grupo) => grupo.renglones).some((renglon) => renglon.ubicacion !== "Bodega")).toBe(false);
	});

	it("lo ya pedido a Producción pasa el renglón a «Sugerido a producción», con sus piezas pedidas", async () => {
		const [renglon] = (await reabasto()).grupos.find((grupo) => grupo.clave === "fabricacion")?.renglones ?? [];
		if (renglon === undefined) throw new Error("la muestra no trae nada por fabricar");
		const sugerencia = await valorDe(
			servidor,
			`INSERT INTO sugerencias_reabasto (id, variante_id, ubicacion_id, piezas) VALUES (uuidv7(), $1, $2, $3)
			RETURNING id`,
			renglon.variante_id,
			renglon.ubicacion_id,
			renglon.fabricar,
		);
		try {
			const { grupos } = await reabasto();
			const sugerido = grupos
				.find((grupo) => grupo.clave === "sugerido")
				?.renglones.find((suyo) => suyo.variante_id === renglon.variante_id);
			expect(sugerido).toMatchObject({ fabricar: 0, pedidas: renglon.fabricar });
		} finally {
			await servidor.base.dueno.query("DELETE FROM sugerencias_reabasto WHERE id = $1", [sugerencia]);
		}
	});

	it("solo la piden las cuentas con Bodega, y no lleva precios ni costos", async () => {
		await soloBodegaYSinPrecios(servidor, "inventario.reabasto");
	});
});
