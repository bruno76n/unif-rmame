/**
 * Prueba de `inventario.detalle_llegada_aduana` con los datos de la muestra: un despacho a Bodega trae su folio, su
 * versión, cuándo salió, lo que mandó Aduana por renglón (los rollos con su partida y sus metros) y si ya se recibió; uno
 * que no existe da `404`; y solo la piden las cuentas con Bodega, sin precios ni costos.
 * Fase 19 · docs/fases/19-web-principal.md (criterio «Cada consulta revisa el departamento y el permiso fino en el
 * servidor y no manda lo que la cuenta no debe ver: precios a Aduana y Bodega…»)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pedirConsulta } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";
import { pedir, soloBodegaYSinPrecios, valorDe } from "./bodega-de-prueba.ts";

/** Lo que regresa la consulta, en lo que revisa la prueba. */
interface Llegada {
	folio: string;
	version: number;
	recibido: boolean;
	mando: string;
	renglones: { es_material: boolean; rollo: string | null; enviado: string }[];
}

describe("El cajón Llegada de aduana: lo que trae un despacho a Bodega", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Un despacho de la muestra a Bodega. */
	const despachoABodega = () =>
		valorDe(
			servidor,
			`SELECT d.id FROM despachos d JOIN ubicaciones u ON u.id = d.destino_ubicacion_id AND u.tipo = 'bodega'
			ORDER BY d.folio LIMIT 1`,
		);

	it("un despacho de material a Bodega: sus rollos con lo que mandó Aduana; ya recibido", async () => {
		const despacho = await despachoABodega();
		const llegada = (await pedir(servidor, "inventario.detalle_llegada_aduana", {
			despacho_id: despacho,
		})) as unknown as Llegada;
		expect(llegada.folio).toMatch(/^D-/);
		expect(llegada.recibido).toBe(true);
		expect(llegada.renglones.length).toBeGreaterThan(0);
		for (const renglon of llegada.renglones) expect(renglon.es_material).toBe(true);
		// La tela llega por rollo; un avío, sin rollo.
		const rollos = llegada.renglones.flatMap((renglon) => (renglon.rollo === null ? [] : [renglon.rollo]));
		for (const rollo of rollos) expect(rollo).toMatch(/^R/);
		expect(llegada.mando).toMatch(/ m$/);
	});

	it("uno que no existe da 404; solo la piden las cuentas con Bodega, sin precios ni costos", async () => {
		const respuesta = await pedirConsulta(
			servidor,
			"inventario.detalle_llegada_aduana",
			{ despacho_id: "01936f2e-0000-7000-8000-00000000dead" },
			"bodega",
		);
		expect(respuesta.estado).toBe(404);
		await soloBodegaYSinPrecios(servidor, "inventario.detalle_llegada_aduana", {
			despacho_id: await despachoABodega(),
		});
	});
});
