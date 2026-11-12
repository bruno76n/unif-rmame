/**
 * Prueba de `linea.prendas_en_camino`: el W- pasa a esperando prendas cuando Bodega lo surte a aduana; en otro estado,
 * la interna no lo cambia.
 * Fase 18 · docs/fases/18-tienda-en-linea-direccion-y-contador.md (criterio «El W- pasa a esperando prendas al
 * surtirse y a listo para empacar con lo último en aduana»)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { llamarInterna } from "../../../nucleo/pruebas/inventario-de-prueba.ts";
import {
	pedidoLineaComoQuedo,
	pedidoLineaEnBodega,
	surtirPedidoLinea,
} from "../../../nucleo/pruebas/linea-de-prueba.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

describe("El W- pasa a esperando prendas al surtirse", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	it("Bodega surte el W- y queda esperando prendas, con su evento; sin Aduana ver precios en la respuesta", async () => {
		const pedido = await pedidoLineaEnBodega(servidor, 2);
		const { respuesta } = await surtirPedidoLinea(servidor, pedido.id);
		expect(respuesta.estado, JSON.stringify(respuesta.cuerpo)).toBe(200);
		expect(JSON.stringify(respuesta.cuerpo)).not.toMatch(/centavos|pago/);
		expect(await pedidoLineaComoQuedo(servidor, pedido.id)).toMatchObject({ estado: "esperando_prendas" });
		const { rows } = await servidor.base.dueno.query("SELECT tipo FROM eventos WHERE entidad_id = $1", [pedido.id]);
		expect(rows.map((fila) => fila.tipo)).toContain("pedido_linea.esperando_prendas");
	});

	it("en otro estado no hace nada", async () => {
		const pedido = await pedidoLineaEnBodega(servidor);
		await surtirPedidoLinea(servidor, pedido.id);
		expect(await llamarInterna(servidor, "linea.prendas_en_camino", { pedido_linea_id: pedido.id })).toEqual({
			cambio: false,
		});
		expect(await pedidoLineaComoQuedo(servidor, pedido.id)).toMatchObject({ estado: "esperando_prendas" });
	});
});
