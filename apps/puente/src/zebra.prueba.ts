/**
 * Prueba de la Zebra: sin papel, con la tapa abierta, en pausa o sin contestar, el trabajo queda en `fallo` con su texto
 * y quien lo pidió lo ve; con papel, se imprime. Contra la API real y la Zebra de mentira.
 * Fase 20 · docs/fases/20-tablet-puente-de-impresion-e-impresos.md (criterio «Sin papel, con la tapa abierta, en pausa
 * o sin contestar, el trabajo queda en `fallo` con su texto y quien lo pidió lo ve») y docs/apps/puente-de-impresion.md
 * («Cómo trabaja», pasos 3 y 4)
 */

import { Temporal } from "temporal-polyfill";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { quienesDePrueba } from "../../api/src/nucleo/pruebas/cuentas-de-prueba.ts";
import { levantarPuenteDePrueba, type PuenteDePrueba } from "./de-prueba.ts";
import { atenderTrabajos } from "./trabajos.ts";
import { etiquetaDePrueba, leerEstado, textosDeLaZebra } from "./zebra.ts";

/** Una nota de prueba: lo que imprime la etiqueta de prueba. */
const nota = "01936f2e-0000-7000-8000-0000000000b1";

describe("la Zebra: lo que le impide imprimir deja el trabajo en fallo con su texto, y quien lo pidió lo ve", () => {
	let prueba: PuenteDePrueba;
	beforeAll(async () => {
		prueba = await levantarPuenteDePrueba();
	});
	afterAll(async () => {
		await prueba.cerrar();
	});

	/** El aviso en vivo que le toca a quien pidió el trabajo. */
	async function avisoDe(trabajoId: string) {
		const { rows } = await prueba.servidor.base.dueno.query(
			"SELECT datos FROM eventos WHERE tipo = 'impresion.terminada' AND datos->>'trabajo_id' = $1",
			[trabajoId],
		);
		return rows.map((fila) => fila.datos);
	}

	it.each([
		["sin_papel", textosDeLaZebra.sinEtiquetas],
		["tapa_abierta", textosDeLaZebra.tapaAbierta],
		["en_pausa", textosDeLaZebra.enPausa],
		["callada", textosDeLaZebra.noContesta],
	] as const)(
		"sin papel, con la tapa abierta, en pausa o sin contestar: %s deja el trabajo en fallo con «%s» y quien lo pidió lo ve",
		async (estado, texto) => {
			prueba.zebra.ponerEn(estado);
			const trabajo = await prueba.pedirTrabajo([nota], 1);
			const antes = prueba.zebra.recibido.length;
			await atenderTrabajos(prueba.piezas);
			expect(await prueba.trabajo(trabajo)).toEqual({ estado: "fallo", error: texto });
			expect(prueba.zebra.recibido).toHaveLength(antes);
			const quien = quienesDePrueba.ventas;
			expect(await avisoDe(trabajo)).toEqual([
				expect.objectContaining({
					resultado: "fallo",
					texto: `No se imprimió en Zebra Aduana: ${texto}. Usa el PDF.`,
					sesion_id: quien?.tipo === "cuenta" ? quien.sesionId : "",
				}),
			]);
			expect(await prueba.registro()).toContain(`fallo: ${texto}`);
		},
	);

	it("con papel se imprime: la Zebra recibe el ZPL del trabajo y quien lo pidió ve «Etiquetas impresas»", async () => {
		prueba.zebra.ponerEn("con_papel");
		const trabajo = await prueba.pedirTrabajo([nota], 3);
		const zpl = await prueba.zplDe(trabajo);
		await atenderTrabajos(prueba.piezas);
		expect(await prueba.trabajo(trabajo)).toEqual({ estado: "impreso", error: null });
		expect(prueba.zebra.recibido.at(-1)).toBe(zpl);
		expect(await avisoDe(trabajo)).toEqual([
			expect.objectContaining({ resultado: "impreso", texto: "Etiquetas impresas en Zebra Aduana" }),
		]);
	});

	it("lee los tres textos de ~HS: el orden de lo que impide imprimir y la respuesta que no ha terminado de llegar", () => {
		const [stx, etx] = [String.fromCharCode(2), String.fromCharCode(3)];
		const respuesta = (uno: string, dos: string) =>
			`${stx}${uno}${etx}\r\n${stx}${dos}${etx}\r\n${stx}1234,0${etx}\r\n`;
		expect(leerEstado(respuesta("030,0,0,1245", "000,0,0,0"))).toEqual({ lista: true });
		expect(leerEstado(respuesta("030,1,1,1245", "000,0,1,0"))).toEqual({
			lista: false,
			error: textosDeLaZebra.sinEtiquetas,
		});
		expect(leerEstado(respuesta("030,0,1,1245", "000,0,1,0"))).toEqual({
			lista: false,
			error: textosDeLaZebra.tapaAbierta,
		});
		expect(leerEstado(`${stx}030,0,0,1245${etx}\r\n${stx}000,0`)).toBeNull();
	});

	it("la etiqueta de prueba del registro dice «Unifórmame · prueba de impresión» con su fecha y su hora", () => {
		const zpl = etiquetaDePrueba(Temporal.Instant.from("2026-11-14T16:42:00Z"));
		expect(zpl).toMatch(/^\^XA\^CI28/);
		expect(zpl).toContain("^FDUnifórmame^FS");
		expect(zpl).toContain("^FDprueba de impresión^FS");
		expect(zpl).toContain("^FD14 nov 2026 10:42^FS");
		expect(zpl).toMatch(/\^XZ$/);
	});
});
