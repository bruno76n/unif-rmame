/**
 * Prueba de la hoja del lote: lleva lo que dice su archivo (el lote y su orden, la prenda, para quién, el corte, la tela
 * con sus partidas, los bultos con su total y el flujo), nunca trae precios, costos ni tarifas, se parte en varias hojas
 * repitiendo el encabezado de su tabla, y solo la saca Producción.
 * Fase 20 · docs/fases/20-tablet-puente-de-impresion-e-impresos.md (criterio «Cada hoja lleva lo que dice su archivo;
 * … la del despacho y la del lote nunca traen precios») y docs/impresos/hojas.md («La hoja del lote» y «Cómo se
 * prueba»)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type SiembraDelCatalogo, siembraDelCatalogo } from "../../nucleo/pruebas/catalogo-de-prueba.ts";
import { leerPdf } from "../../nucleo/pruebas/leer-impresos.ts";
import { loteCortado } from "../../nucleo/pruebas/produccion-de-prueba.ts";
import {
	crearServidorDePrueba,
	encabezadosDeLaWeb,
	type ServidorDePrueba,
} from "../../nucleo/pruebas/servidor-de-prueba.ts";
import type { MarcoDeLaHoja } from "../hoja.ts";
import { dibujarHojaDeLote } from "./lote.ts";

/** El marco de una hoja de prueba. */
const marco: MarcoDeLaHoja = {
	empresa: {
		nombreComercial: "Uniformes Alameda",
		razonSocial: "Uniformes Alameda SA de CV",
		rfc: "UAL900101AB1",
		domicilio: "Av. Juárez 123, Zamora, Mich.",
	},
	nombre: "Lote",
	folio: "L-2026-121",
	fecha: "OP-2026-072",
	sacada: "Sacada el 14 nov 2026 a las 10:42 por Carmen Villaseñor",
};

describe("la hoja del lote", () => {
	let servidor: ServidorDePrueba;
	let siembra: SiembraDelCatalogo;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
		siembra = await siembraDelCatalogo(servidor);
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	it("cada hoja lleva lo que dice su archivo; la del lote nunca trae precios, costos ni tarifas; solo la saca Producción", async () => {
		const lote = await loteCortado(servidor, siembra, [12, 8, 0]);
		const pedir = (quien: string) =>
			servidor.app.inject({
				method: "GET",
				url: `/v1/etiquetas/lote/${lote.loteId}?formato=pdf`,
				headers: encabezadosDeLaWeb(quien),
			});
		const respuesta = await pedir("produccion");
		expect(respuesta.statusCode, respuesta.body).toBe(200);
		const paginas = leerPdf(respuesta.rawPayload);
		expect([paginas[0]?.ancho, paginas[0]?.alto]).toEqual([612, 792]);
		// Un texto puede venir en pedazos: se lee junto, con un solo espacio.
		const texto = paginas
			.flatMap((pagina) => pagina.textos)
			.join(" ")
			.replace(/\s+/g, " ");
		for (const dice of [
			"Lote",
			lote.folio,
			"Cortado el",
			"Bulto",
			"Talla",
			"Piezas",
			...lote.bultos.map((bulto) => bulto.folio),
			"Total",
			"20 piezas",
			"Orden",
			"Operación",
			"La hace",
			"Hoja 1 de 1",
			"Sacada el",
		]) {
			expect(texto).toContain(dice);
		}
		expect(texto).toMatch(/· entrega \d{1,2} [a-z]{3} \d{4}/);
		expect(texto).not.toContain("$");
		for (const quien of ["ventas", "aduana"]) expect((await pedir(quien)).statusCode, quien).toBe(403);
	});

	it("un lote que todavía no se corta no tiene hoja", async () => {
		const { rows } = await servidor.base.dueno.query("SELECT id, folio FROM lotes WHERE estado = 'por_cortar' LIMIT 1");
		const [porCortar] = rows;
		if (porCortar === undefined) return;
		const respuesta = await servidor.app.inject({
			method: "GET",
			url: `/v1/etiquetas/lote/${porCortar.id}?formato=pdf`,
			headers: encabezadosDeLaWeb("produccion"),
		});
		expect(respuesta.json()).toMatchObject({
			codigo: "lote_sin_cortar",
			mensaje: `${porCortar.folio} todavía no se corta.`,
		});
	});

	it("una tabla que no cabe sigue en la hoja siguiente con su encabezado, y cada hoja dice «Hoja {n} de {total}»", async () => {
		const bultos = Array.from({ length: 90 }, (_, i) => ({
			folio: `B-2026-121-${String(i + 1).padStart(2, "0")}`,
			talla: "8",
			piezas: "24",
		}));
		const paginas = leerPdf(
			await dibujarHojaDeLote(marco, {
				prenda: "Pantalón azul marino",
				paraQuien: "Distribuidora Escolar Zamora · entrega 20 nov 2026",
				cortado: "Cortado el 12 nov 2026 por Carmen Villaseñor · receta versión 3",
				tela: "Gabardina azul marino · Partida P-2224 y P-2231: el tono puede variar entre piezas",
				bultos,
				totalPiezas: "2,160 piezas",
				flujo: [{ orden: "1", operacion: "Unir costados", laHace: "Rosa Méndez" }],
			}),
		);
		expect(paginas.length).toBeGreaterThan(1);
		paginas.forEach((pagina, i) => {
			const texto = pagina.textos.join(" ");
			expect(texto).toContain(`Hoja ${i + 1} de ${paginas.length}`);
			expect(texto).toContain("Sacada el 14 nov 2026 a las 10:42 por Carmen Villaseñor");
		});
		// La tabla de los bultos repite su encabezado en la segunda hoja.
		expect(paginas[1]?.textos.slice(0, 6)).toEqual(expect.arrayContaining(["Bulto", "Talla", "Piezas"]));
		const todos = paginas.flatMap((pagina) => pagina.textos);
		expect(bultos.every((bulto) => todos.includes(bulto.folio))).toBe(true);
	});
});
