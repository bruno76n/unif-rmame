/**
 * Prueba del dibujo de la etiqueta de rollo y de la de retazo: el ZPL contra su foto guardada, con acentos, ñ, nombres
 * largos, un `^` y un `~`; el PDF con una página de 2 × 1 pulgadas por etiqueta y su texto; ninguna trae un costo.
 * Fase 20 · docs/fases/20-tablet-puente-de-impresion-e-impresos.md (criterio «Cada etiqueta lleva lo que dice su
 * archivo, en ZPL y en PDF, con acentos, ñ, nombres largos y un `^` o un `~` en los datos») y docs/impresos/etiquetas.md
 * («La etiqueta de rollo y la de retazo»)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { ordenParaRecibir, recibirDePrueba } from "../../nucleo/pruebas/aduana-de-prueba.ts";
import { leerBarras, leerPdf } from "../../nucleo/pruebas/leer-impresos.ts";
import {
	crearServidorDePrueba,
	encabezadosDeLaWeb,
	type ServidorDePrueba,
} from "../../nucleo/pruebas/servidor-de-prueba.ts";
import { barrasEnPng } from "../pdf.ts";
import { dibujarRollos, type EtiquetaDeMaterial } from "./rollo.ts";

/** Un rollo de la muestra. */
const rollo: EtiquetaDeMaterial = {
	tipo: "rollo",
	folio: "R-0431",
	tela: "Gabardina azul marino",
	partida: "Partida P-2224 · 7731-B",
	metros: "92 m",
	origen: "Textiles Aurora · 7 nov 2026",
};

/** Un retazo con una tela de nombre largo, con ñ, un `^` y un `~`. */
const retazo: EtiquetaDeMaterial = {
	tipo: "retazo",
	folio: "RZ-012",
	delRollo: "del R-0431",
	telaYPartida: "Piqué peinado de algodón ~extra suave~ niño^ñ · Partida P-2224",
	metros: "14.5 m",
	corte: "Corte L-2026-121 · 12 nov 2026",
};

describe("la etiqueta de rollo y la de retazo", () => {
	it("cada etiqueta lleva lo que dice su archivo en ZPL: su foto guardada, con acentos, ñ, nombres largos, `^` y `~`", async () => {
		const zpl = await dibujarRollos([rollo, retazo], "zpl", 1);
		await expect(zpl).toMatchFileSnapshot("./fotos/rollo.zpl");
		const datos = [...String(zpl).matchAll(/\^FD(.*?)\^FS/g)].map((campo) => campo[1] ?? "").join("");
		expect(datos).not.toMatch(/[\^~]/);
	});

	it("una «Carga inicial» sin partida dice lo suyo; el PDF trae una página de 2 × 1 pulgadas por etiqueta", async () => {
		const inicial: EtiquetaDeMaterial = { ...rollo, folio: "R-0001", partida: "Sin partida", origen: "Carga inicial" };
		const pdf = await dibujarRollos([inicial, retazo], "pdf", 1);
		if (typeof pdf === "string") throw new Error("el PDF salió como texto");
		const [primera, segunda] = leerPdf(pdf);
		expect([primera?.ancho, primera?.alto, segunda?.ancho, segunda?.alto]).toEqual([144, 72, 144, 72]);
		const delRollo = (primera?.textos ?? []).join("");
		expect(delRollo).toContain("R-0001 · 92 m");
		expect(delRollo).toContain("Sin partida · Carga inicial");
		const delRetazo = (segunda?.textos ?? []).join("");
		expect(delRetazo).toContain("Retazo RZ-012 · del R-0431");
		expect(delRetazo).toContain("14.5 m · Corte L-2026-121 · 12 nov 2026");
		// Ninguna etiqueta de material trae un peso.
		expect(`${delRollo}${delRetazo}`).not.toContain("$");
	});

	it("sus barras dicen el folio y se leen con un lector de códigos", async () => {
		expect(await leerBarras(await barrasEnPng("RZ-012"))).toEqual(["RZ-012"]);
	});
});

describe("las etiquetas de rollo con los datos de Inventario", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	it("Bodega pide en un PDF las de los rollos de una tela («Etiquetas»), una por rollo; Ventas no las pide", async () => {
		const orden = await ordenParaRecibir(servidor);
		const recibida = await recibirDePrueba(servidor, orden, [
			{ metros: "100", partida: "A" },
			{ metros: "62.5", partida: "B" },
		]);
		expect(recibida.estado, JSON.stringify(recibida.cuerpo)).toBe(200);
		const { traspaso_id: traspaso } = z.object({ traspaso_id: z.uuid() }).parse(recibida.cuerpo.resultado);
		const { rows } = await servidor.base.dueno.query(
			`SELECT r.id, r.folio FROM traspaso_lineas l JOIN rollos r ON r.id = l.rollo_id
			 WHERE l.traspaso_id = $1 ORDER BY l.renglon`,
			[traspaso],
		);
		const ids = rows.map((fila) => String(fila.id));
		const pedir = (quien: string) =>
			servidor.app.inject({
				method: "GET",
				url: `/v1/etiquetas/rollo/${ids[0]}?formato=pdf&ids=${ids.join(",")}`,
				headers: encabezadosDeLaWeb(quien),
			});
		const deBodega = await pedir("bodega");
		expect(deBodega.statusCode, deBodega.body).toBe(200);
		const paginas = leerPdf(deBodega.rawPayload);
		expect(paginas.map((pagina) => pagina.textos.at(-1))).toEqual(rows.map((fila) => fila.folio));
		const texto = paginas.flatMap((pagina) => pagina.textos).join("");
		expect(texto).toContain("62.5 m");
		expect(texto).toMatch(/Partida P-\d+/);
		expect(texto).not.toContain("$");
		expect((await pedir("ventas")).statusCode).toBe(403);
	});
});
