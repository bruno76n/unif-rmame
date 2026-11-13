/**
 * Prueba de `inventario.detalle_entrega_corte` con los datos de la muestra: un lote por cortar con receta trae cada tela
 * por entregar con los rollos de Bodega (los sugeridos marcados), los avíos con si alcanzan y la gente del Taller; uno
 * que no está por cortar da `422`; y solo la piden las cuentas con Bodega, sin precios ni costos.
 * Fase 19 · docs/fases/19-web-principal.md (criterio «Cada consulta revisa el departamento y el permiso fino en el
 * servidor y no manda lo que la cuenta no debe ver: precios a Aduana y Bodega…»)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pedirConsulta } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";
import { pedir, soloBodegaYSinPrecios, valorDe } from "./bodega-de-prueba.ts";

/** Lo que regresa la consulta, en lo que revisa la prueba. */
interface Detalle {
	folio: string;
	receta_version_id: string;
	telas: { papel: string | null; rollos: { rollo_id: string; sugerido: boolean }[] }[];
	avios: { material: string; alcanza: boolean }[];
	personas: { nombre: string }[];
}

describe("El cajón Entrega al corte: las telas por entregar con sus rollos", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	it("un lote con rollos sugeridos: cada tela con sus rollos de Bodega, los sugeridos marcados", async () => {
		const loteId = await valorDe(
			servidor,
			"SELECT lote_id FROM apartados_rollo WHERE estado = 'sugerido' ORDER BY fecha_corte, lote_id LIMIT 1",
		);
		const detalle = (await pedir(servidor, "inventario.detalle_entrega_corte", {
			lote_id: loteId,
		})) as unknown as Detalle;
		expect(detalle.folio).toMatch(/^L-/);
		expect(detalle.telas.length).toBeGreaterThan(0);
		expect(detalle.telas[0]?.papel).toBeNull();
		const sugeridos = detalle.telas.flatMap((tela) => tela.rollos).filter((rollo) => rollo.sugerido);
		const enLaBase = Number(
			await valorDe(
				servidor,
				"SELECT count(*) FROM apartados_rollo WHERE lote_id = $1 AND estado = 'sugerido'",
				loteId,
			),
		);
		expect(sugeridos).toHaveLength(enLaBase);
		expect(detalle.personas.length).toBeGreaterThan(0);
	});

	it("un lote que no está por cortar da 422; solo la piden las cuentas con Bodega, sin precios ni costos", async () => {
		const cortado = await valorDe(servidor, "SELECT id FROM lotes WHERE estado <> 'por_cortar' ORDER BY folio LIMIT 1");
		const respuesta = await pedirConsulta(servidor, "inventario.detalle_entrega_corte", { lote_id: cortado }, "bodega");
		expect(respuesta.estado).toBe(422);
		const loteId = await valorDe(
			servidor,
			"SELECT lote_id FROM apartados_rollo WHERE estado = 'sugerido' ORDER BY fecha_corte, lote_id LIMIT 1",
		);
		await soloBodegaYSinPrecios(servidor, "inventario.detalle_entrega_corte", { lote_id: loteId });
	});
});
