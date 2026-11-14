/**
 * Prueba de las etiquetas de un A- al salir de aduana (`inventario.marcar_etiquetas_impresas` y el tipo `traspaso`):
 * una etiqueta de prenda por pieza que Aduana contó para ese destino, talla por talla, o una de rollo por cada rollo del
 * material de un proveedor; «Imprimir etiquetas» manda el trabajo a la Zebra de Aduana, «PDF» lo abre, y los dos las
 * anotan impresas.
 * Fase 20 · docs/fases/20-tablet-puente-de-impresion-e-impresos.md (criterio «Las etiquetas de un A- son una de prenda
 * por pieza contada para ese destino, o una de rollo por rollo; «Imprimir etiquetas» manda el trabajo a la Zebra de
 * Aduana y «PDF» lo abre, y los dos las anotan impresas») y docs/impresos/etiquetas.md («Lo que lleva un A- al salir de
 * aduana»)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { ordenParaRecibir, recibirDePrueba, versionDeTraspaso } from "../../../nucleo/pruebas/aduana-de-prueba.ts";
import { loteRevisado } from "../../../nucleo/pruebas/calidad-de-prueba.ts";
import { type SiembraDelCatalogo, siembraDelCatalogo } from "../../../nucleo/pruebas/catalogo-de-prueba.ts";
import { leerPdf } from "../../../nucleo/pruebas/leer-impresos.ts";
import { mandarAccion } from "../../../nucleo/pruebas/llamadas.ts";
import {
	crearServidorDePrueba,
	encabezadosDeLaWeb,
	type ServidorDePrueba,
} from "../../../nucleo/pruebas/servidor-de-prueba.ts";

describe("las etiquetas de un A- al salir de aduana", () => {
	let servidor: ServidorDePrueba;
	let siembra: SiembraDelCatalogo;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
		siembra = await siembraDelCatalogo(servidor);
		// La Zebra de Aduana, con su puente.
		const [aduana] = await consultar("SELECT id FROM ubicaciones WHERE codigo = 'ADU'", []);
		await mandarAccion(
			servidor,
			"admin.guardar_impresora",
			{
				datos: {
					nombre: "Zebra Aduana",
					modelo: "ZD421",
					ubicacion_id: aduana?.id,
					dispositivo_id: "01936f2e-0000-7000-8000-000000000031",
				},
			},
			"duena",
		);
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Una consulta con el rol dueño. */
	async function consultar(texto: string, valores: unknown[]) {
		return (await servidor.base.dueno.query(texto, valores)).rows;
	}

	/** Pide las etiquetas de un A-: «Imprimir etiquetas» (`impresora`) o «PDF». */
	async function marcar(traspasoId: string, destino: "impresora" | "pdf") {
		return mandarAccion(
			servidor,
			"inventario.marcar_etiquetas_impresas",
			{ datos: { traspaso_id: traspasoId, destino }, version: await versionDeTraspaso(servidor, traspasoId) },
			"aduana",
		);
	}

	/** Lo que da la ruta de las etiquetas de un A-, como Aduana o como el puente. */
	async function etiquetasDe(traspasoId: string, formato: "zpl" | "pdf", quien = "aduana") {
		const respuesta = await servidor.app.inject({
			method: "GET",
			url: `/v1/etiquetas/traspaso/${traspasoId}?formato=${formato}`,
			headers:
				quien === "puente" ? { "x-prueba-quien": "puente", "x-app-version": "1.0.0" } : encabezadosDeLaWeb(quien),
		});
		expect(respuesta.statusCode, respuesta.body).toBe(200);
		return respuesta;
	}

	it("de un lote: una etiqueta de prenda por pieza contada para ese destino, talla por talla; el PDF lo abre y las anota", async () => {
		const lote = await loteRevisado(servidor, siembra, [3, 2, 0]);
		const recibida = await mandarAccion(
			servidor,
			"inventario.recibir_del_taller",
			{
				datos: {
					lote_id: lote.loteId,
					tallas: [
						{ variante_id: lote.prenda.variantes["6"], piezas: 2 },
						{ variante_id: lote.prenda.variantes["4"], piezas: 3 },
					],
				},
			},
			"aduana",
		);
		const [traspaso = ""] = z.object({ traspaso_ids: z.array(z.uuid()) }).parse(recibida.cuerpo.resultado).traspaso_ids;
		const codigos = await consultar("SELECT id, codigo FROM variantes WHERE id = ANY($1::uuid[])", [
			[lote.prenda.variantes["4"], lote.prenda.variantes["6"]],
		]);
		const codigo = (talla: "4" | "6") => codigos.find((fila) => fila.id === lote.prenda.variantes[talla])?.codigo;
		const pdf = leerPdf((await etiquetasDe(traspaso, "pdf")).rawPayload);
		// Cinco piezas contadas: cinco páginas de 2 × 1 pulgadas, la talla 4 antes que la 6.
		expect(pdf.map((pagina) => pagina.textos.at(-1))).toEqual([
			codigo("4"),
			codigo("4"),
			codigo("4"),
			codigo("6"),
			codigo("6"),
		]);
		for (const pagina of pdf) expect([pagina.ancho, pagina.alto]).toEqual([144, 72]);
		// «PDF» regresa su ruta y las anota impresas.
		const conPdf = await marcar(traspaso, "pdf");
		expect(conPdf.cuerpo.resultado).toMatchObject({ pdf_ruta: `/v1/etiquetas/traspaso/${traspaso}?formato=pdf` });
		expect(
			await consultar("SELECT etiquetas_impresas_en IS NOT NULL AS impresas FROM traspasos WHERE id = $1", [traspaso]),
		).toEqual([{ impresas: true }]);
	});

	it("«Imprimir etiquetas» manda un trabajo a la Zebra de Aduana: el puente baja un ZPL con una etiqueta por talla y sus copias", async () => {
		const lote = await loteRevisado(servidor, siembra, [4, 1, 0]);
		const recibida = await mandarAccion(
			servidor,
			"inventario.recibir_del_taller",
			{
				datos: {
					lote_id: lote.loteId,
					tallas: [
						{ variante_id: lote.prenda.variantes["4"], piezas: 4 },
						{ variante_id: lote.prenda.variantes["6"], piezas: 1 },
					],
				},
			},
			"aduana",
		);
		const [traspaso = ""] = z.object({ traspaso_ids: z.array(z.uuid()) }).parse(recibida.cuerpo.resultado).traspaso_ids;
		const enLaZebra = await marcar(traspaso, "impresora");
		expect(enLaZebra.estado, JSON.stringify(enLaZebra.cuerpo)).toBe(200);
		expect(
			await consultar("SELECT tipo, ids, copias, estado FROM trabajos_impresion WHERE $1::uuid = ANY(ids)", [traspaso]),
		).toEqual([{ tipo: "traspaso", ids: [traspaso], copias: 1, estado: "por_imprimir" }]);
		expect(
			await consultar("SELECT etiquetas_impresas_en IS NOT NULL AS impresas FROM traspasos WHERE id = $1", [traspaso]),
		).toEqual([{ impresas: true }]);
		// El puente baja el ZPL de su trabajo: la talla 4 con 4 copias y la 6 con 1, en ese orden.
		const zpl = (await etiquetasDe(traspaso, "zpl", "puente")).body;
		expect([...zpl.matchAll(/\^PQ(\d+)\^XZ/g)].map((copias) => copias[1])).toEqual(["4", "1"]);
		expect(zpl).not.toContain("$");
	});

	it("del material de un proveedor: una etiqueta de rollo por cada rollo, sin costo", async () => {
		const orden = await ordenParaRecibir(servidor);
		const recibida = await recibirDePrueba(servidor, orden, [
			{ metros: "100", partida: "A" },
			{ metros: "85.5", partida: "A" },
		]);
		const { traspaso_id: traspaso } = z.object({ traspaso_id: z.uuid() }).parse(recibida.cuerpo.resultado);
		const folios = await consultar(
			"SELECT r.folio FROM traspaso_lineas l JOIN rollos r ON r.id = l.rollo_id WHERE l.traspaso_id = $1 ORDER BY l.renglon",
			[traspaso],
		);
		const pdf = leerPdf((await etiquetasDe(traspaso, "pdf")).rawPayload);
		expect(pdf.map((pagina) => pagina.textos.at(-1))).toEqual(folios.map((fila) => fila.folio));
		const texto = pdf.flatMap((pagina) => pagina.textos).join(" ");
		expect(texto).toContain("85.5 m");
		expect(texto).not.toContain("$");
	});
});
