/**
 * Prueba de `linea.prendas_en_aduana`: con lo último en aduana, el W- queda listo para empacar; si falta algo, sigue
 * esperando; si se canceló mientras venía en camino, lo que llega regresa a su origen y el W- no cambia.
 * Fase 18 · docs/fases/18-tienda-en-linea-direccion-y-contador.md (criterio «El W- pasa a esperando prendas al
 * surtirse y a listo para empacar con lo último en aduana»)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { llamarInterna } from "../../../nucleo/pruebas/inventario-de-prueba.ts";
import {
	pedidoLineaComoQuedo,
	pedidoLineaEnBodega,
	recibirCompletoEnAduana,
	surtirPedidoLinea,
} from "../../../nucleo/pruebas/linea-de-prueba.ts";
import { mandarAccion } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

describe("El W- pasa a listo para empacar con lo último en aduana", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	it("Aduana recibe lo último y el W- queda listo para empacar, con sus reservas en Aduana", async () => {
		const pedido = await pedidoLineaEnBodega(servidor, 2);
		const { traspasoId } = await surtirPedidoLinea(servidor, pedido.id);
		const recibido = await recibirCompletoEnAduana(servidor, traspasoId ?? "");
		expect(recibido.estado, JSON.stringify(recibido.cuerpo)).toBe(200);
		expect(JSON.stringify(recibido.cuerpo)).not.toMatch(/centavos|pago/);
		expect(await pedidoLineaComoQuedo(servidor, pedido.id)).toMatchObject({
			estado: "listo_para_empacar",
			reservas: [{ ubicacion: "ADU", piezas: 2 }],
		});
	});

	it("si falta algo sigue esperando; un W- cancelado no cambia", async () => {
		const pedido = await pedidoLineaEnBodega(servidor);
		await surtirPedidoLinea(servidor, pedido.id);
		expect(
			await llamarInterna(servidor, "linea.prendas_en_aduana", { pedido_linea_id: pedido.id, completo: false }),
		).toEqual({ cambio: false });
		expect(await pedidoLineaComoQuedo(servidor, pedido.id)).toMatchObject({ estado: "esperando_prendas" });
	});

	it("cancelado mientras venía en camino: lo que llega regresa a Bodega y el W- sigue cancelado", async () => {
		const pedido = await pedidoLineaEnBodega(servidor);
		const { traspasoId } = await surtirPedidoLinea(servidor, pedido.id);
		const { rows } = await servidor.base.dueno.query("SELECT version::int AS v FROM pedidos_linea WHERE id = $1", [
			pedido.id,
		]);
		const cancelado = await mandarAccion(
			servidor,
			"linea.cancelar_pedido",
			{ datos: { pedido_linea_id: pedido.id, motivo: "Se equivocó de talla" }, version: rows[0]?.v },
			"linea",
		);
		expect(cancelado.estado, JSON.stringify(cancelado.cuerpo)).toBe(200);
		expect((await recibirCompletoEnAduana(servidor, traspasoId ?? "")).estado).toBe(200);
		expect(await pedidoLineaComoQuedo(servidor, pedido.id)).toMatchObject({ estado: "cancelado", reservas: [] });
		const { rows: hijos } = await servidor.base.dueno.query(
			`SELECT h.tipo, u.codigo AS destino FROM traspasos h JOIN ubicaciones u ON u.id = h.destino_ubicacion_id
			 WHERE h.traspaso_padre_id = $1`,
			[traspasoId],
		);
		expect(hijos).toEqual([{ tipo: "regresa", destino: "BOD" }]);
	});
});
