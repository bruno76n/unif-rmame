/**
 * Prueba de `ventas.revision_mandar`: lo que se va a producción de un pedido nuevo (sus tallas, lo libre en bodega, el
 * lote nuevo con el folio que sigue y la prenda sin receta), lo que dice la revisión cuando ya se mandó (se suma al
 * lote que no se corta), sin dinero; un pedido sin nada por mandar no se abre; solo Ventas la pide.
 * Fase 19 · docs/fases/19-web-principal.md (criterios «Cada botón llama a su acción…» y «Cada consulta revisa el
 * departamento y el permiso fino en el servidor y no manda lo que la cuenta no debe ver»)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { meterPiezas, ubicacionesPorCodigo } from "../../../nucleo/pruebas/inventario-de-prueba.ts";
import { mandarAccion, pedirConsulta } from "../../../nucleo/pruebas/llamadas.ts";
import type { PrendaDelTaller } from "../../../nucleo/pruebas/produccion-de-prueba.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";
import {
	darDeAltaClienteDePrueba,
	pedidoConfirmadoDePrueba,
	prendaParaVender,
	versionDelPedido,
} from "../../../nucleo/pruebas/ventas-de-prueba.ts";
import { pedidoDeLaMuestra } from "./de-la-muestra.ts";

/** Lo que se lee de la respuesta. */
interface Revision {
	piezas: number;
	avisos: { texto: string; color: string }[];
	hilo: { parada: string; linea: string }[];
	prendas: {
		tallas: string;
		piezas: number;
		bodega: { texto: string; piezas: number } | null;
		lote: string;
		material: { texto: string }[];
	}[];
}

describe("La revisión antes de mandar a producción: tallas, bodega, lote y material", () => {
	let servidor: ServidorDePrueba;
	let prenda: PrendaDelTaller;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
		prenda = await prendaParaVender(servidor);
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	it("un pedido nuevo: sus tallas, lo libre en bodega, el lote nuevo y la prenda sin receta; sin dinero", async () => {
		const cliente = await darDeAltaClienteDePrueba(servidor);
		const pedido = await pedidoConfirmadoDePrueba(servidor, {
			cliente_id: cliente.cliente_id,
			renglones: [
				{ variante_id: prenda.variantes["4"], cantidad: 40 },
				{ variante_id: prenda.variantes["6"], cantidad: 10 },
			],
		});
		const ubicacion = await ubicacionesPorCodigo(servidor);
		await meterPiezas(servidor, ubicacion.BOD ?? "", prenda.variantes["4"] ?? "", 7);
		const respuesta = await pedirConsulta(servidor, "ventas.revision_mandar", { pedido_id: pedido.pedido_id });
		expect(respuesta.estado, JSON.stringify(respuesta.cuerpo)).toBe(200);
		expect(JSON.stringify(respuesta.cuerpo)).not.toMatch(/centavos/);
		const revision = respuesta.cuerpo.resultado as Revision;
		expect(revision.piezas).toBe(50);
		expect(revision.prendas).toHaveLength(1);
		expect(revision.prendas[0]).toMatchObject({
			tallas: "4: 40 · 6: 10",
			piezas: 50,
			bodega: { texto: "Bodega tiene libres: 4: 7", piezas: 7 },
		});
		expect(revision.prendas[0]?.lote).toMatch(/^Lote nuevo L-\d{4}-\d+ · se corta el \d+ \w+$/);
		expect(revision.prendas[0]?.material).toEqual([
			{ texto: "Sin receta: no se corta hasta que Patronaje la capture", color: "rojo" },
		]);
		expect(revision.avisos[0]?.texto).toBe(
			`${prenda.nombre} no tiene receta: no se corta hasta que Patronaje la capture`,
		);
		expect(revision.hilo.map((parada) => parada.linea)).toContain("falta la receta");
		// Mandado la mitad, lo que falta se suma al lote que todavía no se corta.
		const mandado = await mandarAccion(
			servidor,
			"ventas.mandar_a_produccion",
			{
				datos: { pedido_id: pedido.pedido_id, renglones: [{ variante_id: prenda.variantes["4"], piezas: 20 }] },
				version: await versionDelPedido(servidor, pedido.pedido_id),
			},
			"ventas",
		);
		expect(mandado.estado, JSON.stringify(mandado.cuerpo)).toBe(200);
		const despues = (await pedirConsulta(servidor, "ventas.revision_mandar", { pedido_id: pedido.pedido_id })).cuerpo
			.resultado as Revision;
		expect(despues.piezas).toBe(30);
		expect(despues.prendas[0]?.lote).toMatch(/^Se suman al lote L-\d{4}-\d+, que se corta el /);
	});

	it("un pedido sin nada por mandar no se abre; solo Ventas la pide", async () => {
		const entregado = await pedidoDeLaMuestra(servidor, "PE-0001");
		const respuesta = await pedirConsulta(servidor, "ventas.revision_mandar", { pedido_id: entregado });
		expect(respuesta.estado).toBe(422);
		expect(respuesta.cuerpo).toMatchObject({
			codigo: "nada_por_mandar",
			mensaje: "Todo el pedido ya está en producción",
		});
		expect(
			(await pedirConsulta(servidor, "ventas.revision_mandar", { pedido_id: entregado }, "produccion")).estado,
		).toBe(403);
	});
});
