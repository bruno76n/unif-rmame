/**
 * Prueba de `inventario.detalle_recibir_material`: una orden enviada trae lo que le falta a cada línea (la tela, con
 * sus metros; el avío, en su unidad y entero), sin precios; recibida en parte, solo lo que falta; una que no existe da
 * `404`; y solo la pide Aduana.
 * Fase 19 · docs/fases/19-web-principal.md (criterio «Cada consulta revisa el departamento y el permiso fino en el
 * servidor y no manda lo que la cuenta no debe ver: precios a Aduana y Bodega…»)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ordenParaRecibir, recibirDePrueba } from "../../../nucleo/pruebas/aduana-de-prueba.ts";
import { pedirConsulta } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";
import { comoAduana, soloAduanaYSinPrecios } from "./aduana-de-prueba.ts";

/** Lo que regresa la consulta, en lo que revisa la prueba. */
interface Detalle {
	folio: string;
	se_puede_recibir: boolean;
	materiales: { orden_compra_linea_id: string; es_tela: boolean; unidad: string; entera: boolean; faltaban: string }[];
}

describe("El cajón Recibir material", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	it("lo que le falta a cada línea, sin precios; recibida en parte, solo lo que falta", async () => {
		const orden = await ordenParaRecibir(servidor, 100);
		const parametros = { orden_compra_id: orden.id };
		const detalle = (await comoAduana(
			servidor,
			"inventario.detalle_recibir_material",
			parametros,
		)) as unknown as Detalle;
		expect(detalle.folio).toBe(orden.folio);
		expect(detalle.se_puede_recibir).toBe(true);
		const tela = detalle.materiales.find((material) => material.orden_compra_linea_id === orden.lineaTela);
		expect(tela).toMatchObject({ es_tela: true, unidad: "m", faltaban: "100" });
		const avio = detalle.materiales.find((material) => material.orden_compra_linea_id === orden.lineaAvio);
		expect(avio).toMatchObject({ es_tela: false, faltaban: "500" });
		await soloAduanaYSinPrecios(servidor, "inventario.detalle_recibir_material", parametros);
		await recibirDePrueba(servidor, orden, [{ metros: "100", partida: "P-9" }]);
		const despues = (await comoAduana(
			servidor,
			"inventario.detalle_recibir_material",
			parametros,
		)) as unknown as Detalle;
		expect(despues.materiales.map((material) => material.orden_compra_linea_id)).toEqual([orden.lineaAvio]);
	});

	it("una orden que no existe da 404", async () => {
		const respuesta = await pedirConsulta(
			servidor,
			"inventario.detalle_recibir_material",
			{ orden_compra_id: "01936f2e-0000-7000-8000-00000000dead" },
			"aduana",
		);
		expect(respuesta.estado).toBe(404);
	});
});
