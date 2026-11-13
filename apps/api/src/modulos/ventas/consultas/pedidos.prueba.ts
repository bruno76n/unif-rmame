/**
 * Prueba de `ventas.pedidos` con la muestra: los abiertos por cliente (con el detenido sin pedidos), sin entregados
 * ni cancelados hasta que se piden, el filtro por etapa con sus conteos, el buscador con todas sus palabras, la vista
 * por estado y que solo Ventas la pide.
 * Fase 19 · docs/fases/19-web-principal.md (criterio «Cada consulta revisa el departamento y el permiso fino en el
 * servidor y no manda lo que la cuenta no debe ver»)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pedirConsulta } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

/** Lo que se lee de la respuesta. */
interface Pedidos {
	etapas: { clave: string; conteo: number }[];
	clientes: { nombre: string; detenido: boolean; credito: { texto: string } }[];
	pedidos: {
		folio: string;
		cliente: string;
		etapa: { clave: string };
		avance: { texto: string } | null;
		estado: { texto: string };
	}[];
}

describe("La lista de Pedidos: por cliente o por estado, con filtros por etapa y buscador", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Pide la lista. */
	async function pedidos(parametros: Record<string, string> = {}): Promise<Pedidos> {
		const respuesta = await pedirConsulta(servidor, "ventas.pedidos", parametros);
		expect(respuesta.estado, JSON.stringify(respuesta.cuerpo)).toBe(200);
		return respuesta.cuerpo.resultado as Pedidos;
	}

	it("por cliente: los abiertos de cada cliente, los borradores sin confirmar, y el detenido con su crédito", async () => {
		const lista = await pedidos();
		const { rows } = await servidor.base.dueno.query(
			"SELECT folio FROM pedidos WHERE estado IN ('borrador', 'confirmado') ORDER BY folio",
		);
		expect(lista.pedidos.map((pedido) => pedido.folio).sort()).toEqual(
			rows.map((fila: { folio: string }) => fila.folio),
		);
		const borradores = lista.pedidos.filter((pedido) => pedido.etapa.clave === "borrador");
		expect(borradores).toHaveLength(2);
		expect(borradores.every((pedido) => pedido.avance === null && pedido.estado.texto === "Borrador")).toBe(true);
		expect(lista.clientes.map((cliente) => cliente.nombre)).toContain("Uniformes El Bajío");
		expect(lista.clientes.find((cliente) => cliente.nombre === "Uniformes El Bajío")).toMatchObject({
			detenido: true,
			credito: { texto: "Detenido por crédito" },
		});
		expect(lista.etapas.find((etapa) => etapa.clave === "borrador")?.conteo).toBe(2);
	});

	it("los entregados solo salen si se piden, al final; los cancelados nunca", async () => {
		const conEntregados = await pedidos({ mostrar_entregados: "si" });
		const entregados = conEntregados.pedidos.filter((pedido) => pedido.etapa.clave === "entregado");
		expect(entregados.length).toBeGreaterThan(0);
		expect(conEntregados.pedidos.slice(-entregados.length).every((pedido) => pedido.etapa.clave === "entregado")).toBe(
			true,
		);
		await servidor.base.dueno.query(
			`UPDATE pedidos SET estado = 'cancelado', cancelado_en = now(), cancelado_por = creado_por,
				motivo_cancelacion = 'Prueba' WHERE folio = 'PE-0017'`,
		);
		const sinCancelados = await pedidos({ mostrar_entregados: "si" });
		expect(sinCancelados.pedidos.map((pedido) => pedido.folio)).not.toContain("PE-0017");
		await servidor.base.dueno.query(
			`UPDATE pedidos SET estado = 'borrador', cancelado_en = NULL, cancelado_por = NULL, motivo_cancelacion = NULL
			 WHERE folio = 'PE-0017'`,
		);
	});

	it("el filtro por etapa no cambia los conteos; el buscador pide todas sus palabras", async () => {
		const todos = await pedidos();
		const borradores = await pedidos({ etapa: "borrador" });
		expect(borradores.pedidos.every((pedido) => pedido.etapa.clave === "borrador")).toBe(true);
		expect(borradores.etapas).toEqual(todos.etapas);
		const morelos = await pedidos({ buscar: "colegio morelos" });
		expect(morelos.pedidos.length).toBeGreaterThan(0);
		expect(morelos.pedidos.every((pedido) => pedido.cliente === "Colegio Morelos")).toBe(true);
		expect((await pedidos({ buscar: "colegio zzzz" })).pedidos).toEqual([]);
		// Por estado no trae los grupos por cliente.
		expect((await pedidos({ vista: "estado" })).clientes).toEqual([]);
	});

	it("solo Ventas la pide", async () => {
		expect((await pedirConsulta(servidor, "ventas.pedidos", {}, "aduana")).estado).toBe(403);
		expect((await pedirConsulta(servidor, "ventas.pedidos", {}, "produccion")).estado).toBe(403);
	});
});
