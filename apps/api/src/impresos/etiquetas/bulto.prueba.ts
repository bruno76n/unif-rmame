/**
 * Prueba del dibujo de la etiqueta de bulto: el ZPL contra su foto guardada, con acentos, ñ, nombres largos, un `^` y
 * un `~`; el PDF con una página de 2 × 1 pulgadas por bulto, su texto y sus barras, que lee la tablet.
 * Fase 20 · docs/fases/20-tablet-puente-de-impresion-e-impresos.md (criterio «Cada etiqueta lleva lo que dice su
 * archivo, en ZPL y en PDF, con acentos, ñ, nombres largos y un `^` o un `~` en los datos») y docs/impresos/etiquetas.md
 * («La etiqueta de bulto»)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type SiembraDelCatalogo, siembraDelCatalogo } from "../../nucleo/pruebas/catalogo-de-prueba.ts";
import { leerBarras, leerPdf } from "../../nucleo/pruebas/leer-impresos.ts";
import { loteCortado } from "../../nucleo/pruebas/produccion-de-prueba.ts";
import {
	crearServidorDePrueba,
	encabezadosDeLaWeb,
	type ServidorDePrueba,
} from "../../nucleo/pruebas/servidor-de-prueba.ts";
import { barrasEnPng } from "../pdf.ts";
import { dibujarBultos, type EtiquetaDeBulto } from "./bulto.ts";

/** El bulto 3 de 9 del L-2026-121. */
const bulto: EtiquetaDeBulto = {
	folio: "B-2026-121-03",
	prenda: "Pantalón azul marino",
	talla: "Talla 12",
	piezas: "24 piezas",
	lote: "L-2026-121 · bulto 3 de 9",
	paraQuien: "Distribuidora Escolar Zamora · entrega 20 nov 2026",
};

/** Uno con nombres largos, acentos, ñ, un `^` y un `~`. */
const largo: EtiquetaDeBulto = {
	folio: "B-2026-122-10",
	prenda: "Suéter cuello V de niña con escudo bordado ^dorado~",
	talla: "Talla 14",
	piezas: "1 pieza",
	lote: "L-2026-122 · bulto 10 de 10",
	paraQuien: "Colegio Montaña de Peñuelas Ñuñoa · entrega 3 dic 2026",
};

describe("la etiqueta de bulto", () => {
	it("cada etiqueta lleva lo que dice su archivo en ZPL: su foto guardada, con acentos, ñ, nombres largos, `^` y `~`", async () => {
		const zpl = await dibujarBultos([bulto, largo], "zpl", 1);
		await expect(zpl).toMatchFileSnapshot("./fotos/bulto.zpl");
		const datos = [...String(zpl).matchAll(/\^FD(.*?)\^FS/g)].map((campo) => campo[1] ?? "").join("");
		expect(datos).not.toMatch(/[\^~]/);
		expect(datos).toContain("…");
	});

	it("la prenda que no cabe se corta con «…» y la talla siempre queda completa", async () => {
		const zpl = String(await dibujarBultos([largo], "zpl", 1));
		expect(zpl).toMatch(/…_C2_B7 Talla 14\^FS|… · Talla 14\^FS/);
	});

	it("el PDF trae una página de 2 × 1 pulgadas por bulto y por copia, con su texto", async () => {
		const pdf = await dibujarBultos([bulto], "pdf", 2);
		if (typeof pdf === "string") throw new Error("el PDF salió como texto");
		const paginas = leerPdf(pdf);
		expect(paginas.map((pagina) => [pagina.ancho, pagina.alto])).toEqual([
			[144, 72],
			[144, 72],
		]);
		const texto = (paginas[0]?.textos ?? []).join("");
		for (const renglon of [
			"B-2026-121-03",
			"Pantalón azul marino · Talla 12",
			"24 piezas · L-2026-121 · bulto 3 de 9",
			"Distribuidora Escolar Zamora · entrega 20 nov 2026",
		]) {
			expect(texto).toContain(renglon);
		}
	});

	it("sus barras dicen el folio B- y se leen con un lector de códigos, como en la tablet", async () => {
		expect(await leerBarras(await barrasEnPng(bulto.folio))).toEqual([bulto.folio]);
	});
});

describe("las etiquetas de bulto con los datos de Producción", () => {
	let servidor: ServidorDePrueba;
	let siembra: SiembraDelCatalogo;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
		siembra = await siembraDelCatalogo(servidor);
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	it("Producción pide las de un lote cortado: una página por bulto, con su folio, «bulto {n} de {total}» y su entrega", async () => {
		const lote = await loteCortado(servidor, siembra, [10, 6, 0]);
		const ids = lote.bultos.map((bulto) => bulto.id);
		const respuesta = await servidor.app.inject({
			method: "GET",
			url: `/v1/etiquetas/bulto/${ids[0]}?formato=pdf&ids=${ids.join(",")}`,
			headers: encabezadosDeLaWeb("produccion"),
		});
		expect(respuesta.statusCode, respuesta.body).toBe(200);
		const paginas = leerPdf(respuesta.rawPayload);
		expect(paginas.map((pagina) => pagina.textos.at(-1))).toEqual(lote.bultos.map((bulto) => bulto.folio));
		const [primero] = lote.bultos;
		const texto = (paginas[0]?.textos ?? []).join("");
		expect(texto).toContain(`${primero?.piezas} piezas · ${lote.folio} · bulto 1 de ${lote.bultos.length}`);
		expect(texto).toMatch(/· entrega \d{1,2} [a-z]{3} \d{4}/);
		// Lo pide Producción; Ventas no.
		const deVentas = await servidor.app.inject({
			method: "GET",
			url: `/v1/etiquetas/bulto/${ids[0]}?formato=pdf`,
			headers: encabezadosDeLaWeb("ventas"),
		});
		expect(deVentas.statusCode).toBe(403);
	});
});
