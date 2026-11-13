/**
 * Prueba de `inventario.materiales` con los datos de la muestra: las entregas al corte por fecha con sus rollos
 * sugeridos, lo que regresa del corte, las telas en bodega con sus rollos para las etiquetas, los avíos con su uso y los
 * materiales sin carga inicial; y que solo la piden las cuentas con Bodega, sin precios ni costos.
 * Fase 19 · docs/fases/19-web-principal.md (criterio «Cada consulta revisa el departamento y el permiso fino en el
 * servidor y no manda lo que la cuenta no debe ver: precios a Aduana y Bodega…»)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";
import { pedir, soloBodegaYSinPrecios, valorDe } from "./bodega-de-prueba.ts";

/** Lo que regresa la consulta, en lo que revisa la prueba. */
interface Materiales {
	entregas: {
		folio: string;
		fecha_corte: string;
		telas: { tela: string; metros: string; sugeridos: { rollos: number; metros: string } | null }[];
	}[];
	regresa: { folio: string; es_retazo: boolean; metros: string }[];
	telas: { nombre: string; en_bodega: string; rollos: number; rollo_ids: string[] }[];
	avios: { nombre: string; existencia: string; usos: string[] }[];
	sin_carga: { nombre: string }[];
}

describe("Materiales: las entregas al corte, lo que regresa y lo que hay", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Pide la consulta como Bodega. */
	const materiales = async () => (await pedir(servidor, "inventario.materiales")) as unknown as Materiales;

	it("las entregas por fecha de corte, cada tela con lo que pide y sus rollos sugeridos (o «No alcanza»)", async () => {
		const { entregas } = await materiales();
		expect(entregas.length).toBeGreaterThan(0);
		const fechas = entregas.map((entrega) => entrega.fecha_corte);
		expect(fechas).toEqual([...fechas].sort());
		const conSugeridos = entregas.flatMap((entrega) => entrega.telas).filter((tela) => tela.sugeridos !== null);
		expect(conSugeridos.length).toBeGreaterThan(0);
		for (const tela of conSugeridos) {
			expect(Number(tela.sugeridos?.metros)).toBeGreaterThanOrEqual(Number(tela.metros));
		}
	});

	it("lo que regresa del corte, y las telas con los rollos que tienen en Bodega", async () => {
		const datos = await materiales();
		expect(datos.regresa).toHaveLength(2);
		expect(datos.regresa.some((rollo) => rollo.es_retazo && rollo.folio.startsWith("RZ-"))).toBe(true);
		const enBodega = Number(
			await valorDe(
				servidor,
				`SELECT count(*) FROM rollos r JOIN existencias_material em ON em.rollo_id = r.id
				JOIN ubicaciones u ON u.id = em.ubicacion_id AND u.tipo = 'bodega' WHERE em.cantidad > 0`,
			),
		);
		expect(datos.telas.reduce((suma, tela) => suma + tela.rollo_ids.length, 0)).toBe(enBodega);
		for (const avio of datos.avios) expect(avio.usos.length).toBeLessThanOrEqual(2);
	});

	it("solo la piden las cuentas con Bodega, y no lleva precios ni costos", async () => {
		await soloBodegaYSinPrecios(servidor, "inventario.materiales");
	});
});
