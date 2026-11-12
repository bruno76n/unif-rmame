/**
 * Prueba de `linea.cancelar_pedido`: libera sus reservas y lo que estaba en aduana regresa a su origen; uno cancelado
 * o vencido ya no se cancela; sin motivo, 400; sin Tienda en línea, 403.
 * Fase 18 · docs/fases/18-tienda-en-linea-direccion-y-contador.md (criterio «Cancelar un W- libera sus reservas y
 * regresa a su origen lo que estaba en aduana; uno cancelado o vencido ya no se cancela»)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
	pedidoLineaComoQuedo,
	pedidoLineaDePrueba,
	pedidoLineaEnBodega,
	recibirCompletoEnAduana,
	surtirPedidoLinea,
} from "../../../nucleo/pruebas/linea-de-prueba.ts";
import { mandarAccion } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

describe("Cancelar un W- libera sus reservas y regresa a su origen lo que estaba en aduana", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Tienda en línea cancela un W- con su versión de ahora. */
	async function cancelar(id: string, motivo = "La clienta pidió cancelar", quien = "linea") {
		const { rows } = await servidor.base.dueno.query("SELECT version::int AS v FROM pedidos_linea WHERE id = $1", [id]);
		return mandarAccion(
			servidor,
			"linea.cancelar_pedido",
			{ datos: { pedido_linea_id: id, motivo }, version: rows[0]?.v },
			quien,
		);
	}

	it("listo para empacar: se cancela, sus reservas se liberan y lo de aduana regresa a Bodega, con su bitácora", async () => {
		const pedido = await pedidoLineaEnBodega(servidor, 2);
		const { traspasoId } = await surtirPedidoLinea(servidor, pedido.id);
		await recibirCompletoEnAduana(servidor, traspasoId ?? "");
		const respuesta = await cancelar(pedido.id);
		expect(respuesta.cuerpo.resultado).toMatchObject({
			mensaje: `${pedido.folio} cancelado. Lo que ya estaba en aduana regresa a su origen`,
		});
		expect(await pedidoLineaComoQuedo(servidor, pedido.id)).toMatchObject({ estado: "cancelado", reservas: [] });
		const { rows: hijos } = await servidor.base.dueno.query(
			`SELECT h.tipo, u.codigo AS destino FROM traspasos h JOIN ubicaciones u ON u.id = h.destino_ubicacion_id
			 WHERE h.traspaso_padre_id = $1`,
			[traspasoId],
		);
		expect(hijos).toEqual([{ tipo: "regresa", destino: "BOD" }]);
		const { rows: renglones } = await servidor.base.dueno.query(
			"SELECT descripcion, antes, despues FROM bitacora WHERE entidad_id = $1 AND descripcion LIKE '%canceló%'",
			[pedido.id],
		);
		expect(renglones).toEqual([
			{
				descripcion: expect.stringMatching(new RegExp(` canceló ${pedido.folio}: La clienta pidió cancelar$`)),
				antes: { estado: "listo_para_empacar" },
				despues: { estado: "cancelado", prendas: [expect.objectContaining({ piezas: 2, en_traspaso: true })] },
			},
		]);
	});

	it("uno cancelado o vencido ya no se cancela; sin motivo, 400; sin Tienda en línea, 403", async () => {
		const pedido = await pedidoLineaEnBodega(servidor);
		expect((await cancelar(pedido.id, "")).estado).toBe(400);
		expect((await cancelar(pedido.id, "Se canceló", "bodega")).cuerpo).toMatchObject({ codigo: "sin_departamento" });
		expect((await cancelar(pedido.id)).estado).toBe(200);
		expect((await cancelar(pedido.id)).cuerpo).toMatchObject({
			codigo: "no_cancelable",
			mensaje: `${pedido.folio} está cancelado: ya no se puede cancelar.`,
		});
		const vencido = await pedidoLineaDePrueba(servidor);
		await servidor.base.dueno.query(
			"UPDATE pedidos_linea SET estado = 'vencido', pago_estado = 'vencido' WHERE id = $1",
			[vencido],
		);
		expect((await cancelar(vencido)).cuerpo).toMatchObject({ codigo: "no_cancelable" });
	});
});
