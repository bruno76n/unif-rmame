/**
 * Prueba de `inventario.detalle_recibir_taller`: un lote revisado trae sus tallas y a dónde va, nunca lo que aprobó
 * Calidad (el conteo es a ciegas); recibido, lo dice; uno que no existe da `404`; y solo la pide Aduana, sin precios.
 * Fase 19 · docs/fases/19-web-principal.md (criterio «Cada consulta revisa el departamento y el permiso fino en el
 * servidor y no manda lo que la cuenta no debe ver…») y docs/modulos/inventario/recepcion-del-taller.md (regla 3)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loteRevisado } from "../../../nucleo/pruebas/calidad-de-prueba.ts";
import { siembraDelCatalogo } from "../../../nucleo/pruebas/catalogo-de-prueba.ts";
import { mandarAccion, pedirConsulta } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";
import { comoAduana, soloAduanaYSinPrecios } from "./aduana-de-prueba.ts";

/** Lo que regresa la consulta, en lo que revisa la prueba. */
interface Detalle {
	folio: string;
	va_a: string;
	recibido: boolean;
	tallas: { variante_id: string; talla: string; parte_a_bodega: boolean }[];
}

describe("El cajón Recibir del taller", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	it("las tallas que revisó Calidad, a dónde van y nada de lo aprobado; recibido, lo dice", async () => {
		const lote = await loteRevisado(servidor, await siembraDelCatalogo(servidor), [5, 3, 0]);
		const parametros = { lote_id: lote.loteId };
		const detalle = (await comoAduana(servidor, "inventario.detalle_recibir_taller", parametros)) as unknown as Detalle;
		expect(detalle.folio).toBe(lote.folio);
		expect(detalle.va_a).toBe("Bodega");
		expect(detalle.recibido).toBe(false);
		expect(detalle.tallas.map((talla) => talla.talla)).toEqual(["4", "6"]);
		expect(JSON.stringify(detalle)).not.toMatch(/aprobad|esperad|"piezas"/);
		await soloAduanaYSinPrecios(servidor, "inventario.detalle_recibir_taller", parametros);
		const recibir = await mandarAccion(
			servidor,
			"inventario.recibir_del_taller",
			{ datos: { lote_id: lote.loteId, tallas: detalle.tallas.map((talla) => ({ ...talla, piezas: 4 })) } },
			"aduana",
		);
		expect(recibir.estado, JSON.stringify(recibir.cuerpo)).toBe(200);
		const despues = (await comoAduana(servidor, "inventario.detalle_recibir_taller", parametros)) as unknown as Detalle;
		expect(despues.recibido).toBe(true);
	});

	it("un lote que no existe da 404", async () => {
		const respuesta = await pedirConsulta(
			servidor,
			"inventario.detalle_recibir_taller",
			{ lote_id: "01936f2e-0000-7000-8000-00000000dead" },
			"aduana",
		);
		expect(respuesta.estado).toBe(404);
	});
});
