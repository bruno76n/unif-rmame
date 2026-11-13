/**
 * Prueba de `ventas.notas_entrega` con la muestra: las diez notas entregadas, la más nueva primero, con su pedido y su
 * «nota i de n»; los conteos que no cambian con el buscador ni con el pedido; el filtro del pedido con su folio; y que
 * solo Ventas la pide.
 * Fase 19 · docs/fases/19-web-principal.md (criterio «Cada consulta revisa el departamento y el permiso fino en el
 * servidor y no manda lo que la cuenta no debe ver»)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pedirConsulta } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";
import { pedidoDeLaMuestra } from "./de-la-muestra.ts";

/** Lo que se lee de la respuesta. */
interface Notas {
	conteos: Record<string, number>;
	pedido: { folio: string } | null;
	notas: { folio: string; pedido_folio: string; nota_de: string; estado: string; piezas: number }[];
}

describe("La lista de notas de entrega: por estado, con buscador y filtro del pedido", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Pide la lista. */
	async function notas(parametros: Record<string, string> = {}): Promise<Notas> {
		const respuesta = await pedirConsulta(servidor, "ventas.notas_entrega", parametros);
		expect(respuesta.estado, JSON.stringify(respuesta.cuerpo)).toBe(200);
		return respuesta.cuerpo.resultado as Notas;
	}

	it("las notas de la muestra, la más nueva primero, con su pedido y «nota i de n»", async () => {
		const lista = await notas();
		expect(lista.conteos).toEqual({ todas: 10, por_despachar: 0, en_camino: 0, entregada: 10 });
		expect(lista.notas).toHaveLength(10);
		expect(lista.notas[0]).toMatchObject({
			folio: "NV-0010",
			pedido_folio: "PE-0013",
			nota_de: "nota 1 de 1",
			piezas: 70,
		});
		expect(lista.pedido).toBeNull();
	});

	it("el buscador y el pedido filtran sin cambiar los conteos", async () => {
		const todas = await notas();
		const buscada = await notas({ buscar: "nv-0010" });
		expect(buscada.notas.map((nota) => nota.folio)).toEqual(["NV-0010"]);
		expect(buscada.conteos).toEqual(todas.conteos);
		const delPedido = await notas({ pedido_id: await pedidoDeLaMuestra(servidor, "PE-0013") });
		expect(delPedido.pedido?.folio).toBe("PE-0013");
		expect(delPedido.notas.map((nota) => nota.folio)).toEqual(["NV-0010"]);
		expect(delPedido.conteos).toEqual(todas.conteos);
		expect((await notas({ estado: "en_camino" })).notas).toEqual([]);
	});

	it("solo Ventas la pide", async () => {
		expect((await pedirConsulta(servidor, "ventas.notas_entrega", {}, "aduana")).estado).toBe(403);
		expect((await pedirConsulta(servidor, "ventas.notas_entrega", {}, "bodega")).estado).toBe(403);
	});
});
