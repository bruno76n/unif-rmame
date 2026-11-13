/**
 * Prueba de `ventas.armar_nota`: lo listo en aduana de un pedido por talla, con el precio del pedido, el folio que
 * sigue y el anticipo disponible; sin nada listo no se abre; solo Ventas la pide.
 * Fase 19 · docs/fases/19-web-principal.md (criterio «Cada consulta revisa el departamento y el permiso fino en el
 * servidor y no manda lo que la cuenta no debe ver»)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { listoEnAduanaDePrueba } from "../../../nucleo/pruebas/inventario-de-prueba.ts";
import { pedirConsulta } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";
import {
	darDeAltaClienteDePrueba,
	pedidoConfirmadoDePrueba,
	prendaParaVender,
} from "../../../nucleo/pruebas/ventas-de-prueba.ts";

/** Lo que se lee de la respuesta. */
interface Armado {
	folio: string;
	anticipo_disponible_centavos: number;
	prendas: { linea: string; tallas: { talla: string; listas: number; precio_unitario_centavos: number }[] }[];
}

describe("Armar nota de entrega: lo listo en aduana por talla, con el precio del pedido", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	it("lo listo por talla con su precio y el folio que sigue; sin nada listo no se abre", async () => {
		const prenda = await prendaParaVender(servidor);
		const cliente = await darDeAltaClienteDePrueba(servidor);
		const pedido = await pedidoConfirmadoDePrueba(servidor, {
			cliente_id: cliente.cliente_id,
			renglones: [
				{ variante_id: prenda.variantes["4"], cantidad: 30, precio_dado_centavos: 20_000 },
				{ variante_id: prenda.variantes["6"], cantidad: 10, precio_dado_centavos: 20_000 },
			],
		});
		const sinListo = await pedirConsulta(servidor, "ventas.armar_nota", { pedido_id: pedido.pedido_id });
		expect(sinListo.estado).toBe(422);
		expect(sinListo.cuerpo).toMatchObject({ codigo: "nada_listo", mensaje: "Nada listo en aduana para este pedido" });
		await listoEnAduanaDePrueba(servidor, pedido.pedido_id, prenda.variantes["4"] ?? "", 12);
		const respuesta = await pedirConsulta(servidor, "ventas.armar_nota", { pedido_id: pedido.pedido_id });
		expect(respuesta.estado, JSON.stringify(respuesta.cuerpo)).toBe(200);
		const armado = respuesta.cuerpo.resultado as Armado;
		expect(armado.folio).toBe("NV-0011");
		expect(armado.anticipo_disponible_centavos).toBe(0);
		expect(armado.prendas).toEqual([
			{
				producto_id: prenda.productoId,
				nombre: prenda.nombre,
				linea: "12 listas en aduana · faltan 40 del pedido",
				tallas: [{ variante_id: prenda.variantes["4"], talla: "4", listas: 12, precio_unitario_centavos: 20_000 }],
			},
		]);
		expect((await pedirConsulta(servidor, "ventas.armar_nota", { pedido_id: pedido.pedido_id }, "aduana")).estado).toBe(
			403,
		);
	});
});
