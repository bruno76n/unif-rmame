/**
 * Prueba de la hoja del despacho: lleva lo que dice su archivo (el destino, cuándo salió y quién lo despachó, cada
 * traspaso con su tabla, el total de piezas y «Recibió» para firmar), nunca trae precios, y solo la saca Aduana.
 * Fase 20 · docs/fases/20-tablet-puente-de-impresion-e-impresos.md (criterio «Cada hoja lleva lo que dice su archivo;
 * … la del despacho y la del lote nunca traen precios») y docs/impresos/hojas.md («La hoja del despacho»)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { despacharDePrueba, traspasoEnAduana } from "../../nucleo/pruebas/aduana-de-prueba.ts";
import { leerPdf } from "../../nucleo/pruebas/leer-impresos.ts";
import {
	crearServidorDePrueba,
	encabezadosDeLaWeb,
	type ServidorDePrueba,
} from "../../nucleo/pruebas/servidor-de-prueba.ts";

describe("la hoja del despacho", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	it("cada hoja lleva lo que dice su archivo; la del despacho nunca trae precios; solo la saca Aduana", async () => {
		const uno = await traspasoEnAduana(servidor, "T1");
		const otro = await traspasoEnAduana(servidor, "T1");
		const despachado = await despacharDePrueba(servidor, [uno.id, otro.id]);
		expect(despachado.estado, JSON.stringify(despachado.cuerpo)).toBe(200);
		const { despacho_id: despacho } = z.object({ despacho_id: z.uuid() }).parse(despachado.cuerpo.resultado);
		const pedir = (quien: string) =>
			servidor.app.inject({
				method: "GET",
				url: `/v1/etiquetas/despacho/${despacho}?formato=pdf`,
				headers: encabezadosDeLaWeb(quien),
			});
		const respuesta = await pedir("aduana");
		expect(respuesta.statusCode, respuesta.body).toBe(200);
		const paginas = leerPdf(respuesta.rawPayload);
		const texto = paginas
			.flatMap((pagina) => pagina.textos)
			.join(" ")
			.replace(/\s+/g, " ");
		const { rows } = await servidor.base.dueno.query("SELECT folio FROM despachos WHERE id = $1", [despacho]);
		for (const dice of [
			"Despacho",
			String(rows[0]?.folio),
			"A Tienda 1",
			"Salió el",
			"lo despachó",
			`${uno.folio} ·`,
			`${otro.folio} ·`,
			"Prenda",
			"Talla",
			"Piezas",
			"16 piezas en total",
			"Recibió",
			"Firma",
			"Hora",
		]) {
			expect(texto).toContain(dice);
		}
		expect(texto).not.toContain("$");
		for (const quien of ["ventas", "bodega"]) expect((await pedir(quien)).statusCode, quien).toBe(403);
	});
});
