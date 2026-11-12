/**
 * Prueba de `produccion.hilo_pedido` con un pedido de la muestra que tiene lotes: por prenda, las seis paradas en su
 * orden con sus piezas, los lotes con su etapa o su salud, y nada de dinero; solo Producción y Ventas lo piden.
 * Fase 19 · docs/fases/19-web-principal.md (criterio «Cada consulta revisa el departamento y el permiso fino en el
 * servidor y no manda lo que la cuenta no debe ver»)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pedirConsulta } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

/** Una prenda del hilo. */
interface PrendaDelHilo {
	producto_id: string;
	prenda: string;
	paradas: { parada: string; piezas: number; linea: string; tono: string }[];
	lotes: { folio: string; estado: string; salud: string | null }[];
}

describe("El hilo del pedido: las seis paradas de cada prenda y sus lotes, sin dinero", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	it("un pedido con lotes: cada prenda con sus seis paradas y sus lotes; sin dinero; solo Producción y Ventas", async () => {
		const { rows } = await servidor.base.dueno.query(
			`SELECT l.pedido_id, count(DISTINCT l.producto_id)::int AS prendas FROM lotes l
			 WHERE l.pedido_id IS NOT NULL AND l.estado <> 'cancelado' GROUP BY l.pedido_id ORDER BY count(*) DESC LIMIT 1`,
		);
		const [{ pedido_id: pedido, prendas: conLotes }] = rows as [{ pedido_id: string; prendas: number }];
		const respuesta = await pedirConsulta(servidor, "produccion.hilo_pedido", { pedido_id: pedido }, "produccion");
		expect(respuesta.estado, JSON.stringify(respuesta.cuerpo)).toBe(200);
		expect(JSON.stringify(respuesta.cuerpo)).not.toMatch(/centavos|precio/);
		const prendas = (respuesta.cuerpo.resultado as { prendas: PrendaDelHilo[] }).prendas;
		expect(prendas.length).toBeGreaterThanOrEqual(conLotes);
		for (const prenda of prendas) {
			expect(prenda.paradas.map((parada) => parada.parada)).toEqual([
				"pedido",
				"corte",
				"costura",
				"calidad",
				"aduana",
				"entrega",
			]);
			expect(prenda.paradas.every((parada) => parada.piezas >= 0)).toBe(true);
		}
		const conSusLotes = prendas.filter((prenda) => prenda.lotes.length > 0);
		expect(conSusLotes.length).toBe(conLotes);
		for (const lote of conSusLotes.flatMap((prenda) => prenda.lotes)) {
			expect(lote.folio).toMatch(/^L-\d{4}-\d+$/);
			expect(lote.salud).not.toBeNull();
		}
		// Lo mismo para una sola prenda.
		const una = conSusLotes[0];
		const soloUna = await pedirConsulta(
			servidor,
			"produccion.hilo_pedido",
			{ pedido_id: pedido, producto_id: una?.producto_id ?? "" },
			"ventas",
		);
		expect((soloUna.cuerpo.resultado as { prendas: PrendaDelHilo[] }).prendas).toEqual([una]);
		// Bodega no lo pide; un pedido que no existe, 404.
		expect((await pedirConsulta(servidor, "produccion.hilo_pedido", { pedido_id: pedido }, "bodega")).estado).toBe(403);
		expect(
			(
				await pedirConsulta(
					servidor,
					"produccion.hilo_pedido",
					{ pedido_id: "01936f2e-0000-7000-8000-00000000dead" },
					"produccion",
				)
			).estado,
		).toBe(404);
	});
});
