/**
 * Prueba de `ventas.pedido` con la muestra: el pedido con una nota entregada (su avance, su tabla por talla, sus notas
 * y lo que se puede hacer), un borrador que se confirma, la lectura de Contaduría sin botones que escriben, y que
 * Aduana y Bodega no lo piden (llevan precios).
 * Fase 19 · docs/fases/19-web-principal.md (criterio «Cada consulta revisa el departamento y el permiso fino en el
 * servidor y no manda lo que la cuenta no debe ver: precios a Aduana y Bodega…»)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pedirConsulta } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";
import { pedidoDeLaMuestra } from "./de-la-muestra.ts";

/** Lo que se lee de la respuesta. */
interface Pedido {
	folio: string;
	estado: string;
	etapa: { clave: string };
	avance: { texto: string };
	prendas: { nombre: string; precio: string; filas: { concepto: string; total: number }[] }[];
	notas: { folio: string; estado: { texto: string } }[];
	relacionados: { notas: number; lotes: { cuantos: number } };
	puede: Record<string, boolean>;
}

describe("El cajón del pedido: avance, prendas por talla, notas y lo que se puede hacer", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Pide el pedido. */
	async function pedido(folio: string, quien = "ventas") {
		return pedirConsulta(servidor, "ventas.pedido", { pedido_id: await pedidoDeLaMuestra(servidor, folio) }, quien);
	}

	it("un pedido con una nota entregada: su avance, su tabla por talla, su nota y sus botones", async () => {
		// En la muestra, el pedido del Instituto Juan Pablo II con la nota entregada de 70 playeras.
		const respuesta = await pedido("PE-0013");
		expect(respuesta.estado, JSON.stringify(respuesta.cuerpo)).toBe(200);
		const leido = respuesta.cuerpo.resultado as Pedido;
		expect(leido).toMatchObject({ folio: "PE-0013", estado: "confirmado", etapa: { clave: "entrega_parcial" } });
		expect(leido.avance.texto).toBe("70 de 200 piezas entregadas");
		expect(leido.notas.map((nota) => [nota.folio, nota.estado.texto])).toEqual([["NV-0010", "Entregada"]]);
		const conceptos = leido.prendas.flatMap((prenda) => prenda.filas.map((fila) => fila.concepto));
		expect(conceptos).toContain("Pedido");
		expect(conceptos).toContain("Entregado");
		expect(leido.prendas.every((prenda) => prenda.filas.every((fila) => fila.total > 0))).toBe(true);
		expect(leido.prendas.every((prenda) => /\$/.test(prenda.precio))).toBe(true);
		expect(leido.relacionados.notas).toBe(1);
		expect(leido.puede).toMatchObject({ modificar: true, cancelar: false, confirmar: false, pdf: true });
	});

	it("un borrador se puede confirmar, editar y cancelar, sin PDF", async () => {
		const leido = (await pedido("PE-0015")).cuerpo.resultado as Pedido;
		expect(leido.etapa.clave).toBe("borrador");
		expect(leido.puede).toMatchObject({ confirmar: true, editar: true, cancelar: true, modificar: false, pdf: false });
		expect(leido.relacionados.lotes.cuantos).toBe(0);
	});

	it("Contaduría lo lee sin botones que escriben; Aduana y Bodega no lo piden", async () => {
		const deContaduria = await pedido("PE-0013", "contaduria");
		expect(deContaduria.estado).toBe(200);
		const puede = (deContaduria.cuerpo.resultado as Pedido).puede;
		expect(Object.entries(puede).filter(([clave, valor]) => clave !== "pdf" && valor)).toEqual([]);
		expect((await pedido("PE-0013", "aduana")).estado).toBe(403);
		expect((await pedido("PE-0013", "bodega")).estado).toBe(403);
	});
});
