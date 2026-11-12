/**
 * Prueba de `linea.prendas_en_camino`: el W- pasa a esperando prendas cuando Bodega lo surte a aduana; en otro estado,
 * la interna no lo cambia; uno que espera su pago no se surte.
 * Fase 18 · docs/fases/18-tienda-en-linea-direccion-y-contador.md (criterio «El W- pasa a esperando prendas al
 * surtirse y a listo para empacar con lo último en aduana»)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { llamarInterna, meterPiezas, ubicacionesPorCodigo } from "../../../nucleo/pruebas/inventario-de-prueba.ts";
import {
	comoElSitio,
	pedidoDelSitio,
	pedidoLineaComoQuedo,
	pedidoLineaEnBodega,
	prendaEnLinea,
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

	it("un W- que espera su pago no se surte: 422 y nada cambia", async () => {
		await servidor.base.dueno.query(
			"UPDATE parametros SET valor_booleano = true WHERE clave = 'linea.acepta_pago_pendiente'",
		);
		const [variante = ""] = await prendaEnLinea(servidor);
		const { BOD = "" } = await ubicacionesPorCodigo(servidor);
		await meterPiezas(servidor, BOD, variante, 1);
		const pedido = pedidoDelSitio([{ variante_id: variante, cantidad: 1 }], {
			pago: { estado: "pendiente", pagado_en: undefined, metodo: "oxxo" },
		});
		const recibido = await comoElSitio(servidor, "linea.recibir_pedido", pedido);
		const { folio } = recibido.cuerpo.resultado as { folio: string };
		const { respuesta } = await surtirPedidoLinea(servidor, pedido.id);
		expect(respuesta.cuerpo).toMatchObject({
			codigo: "esperando_pago",
			mensaje: `${folio} espera su pago: se surte cuando se pague.`,
		});
		expect(await pedidoLineaComoQuedo(servidor, pedido.id)).toMatchObject({
			estado: "esperando_pago",
			reservas: [{ ubicacion: "BOD", piezas: 1, vence: true }],
		});
	});
});
