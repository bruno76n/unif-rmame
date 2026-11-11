/**
 * Prueba de `inventario.despachar`: un despacho junta traspasos de un solo destino y saca todo lo que queda en aduana de
 * cada uno; lo que no sale por despacho se rechaza con su motivo; mientras lo de más espera en aduana, el A- de esa
 * orden no se despacha.
 * Fase 11 · docs/fases/11-aduana-y-bodega.md (parte 2)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import {
	decidirDePrueba,
	despacharDePrueba,
	ordenParaRecibir,
	recibirDePrueba,
	traspasoEnAduana,
} from "../../../nucleo/pruebas/aduana-de-prueba.ts";
import { ubicacionesPorCodigo } from "../../../nucleo/pruebas/inventario-de-prueba.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

describe("Un despacho junta traspasos de un solo destino y saca todo lo que queda en aduana de cada uno; lo que no sale por despacho se rechaza con su motivo", () => {
	let servidor: ServidorDePrueba;
	let ubicacion: Record<string, string>;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
		ubicacion = await ubicacionesPorCodigo(servidor);
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Una consulta con el rol dueño. */
	async function consultar(texto: string, valores: unknown[]) {
		return (await servidor.base.dueno.query(texto, valores)).rows;
	}

	it("dos traspasos a la Tienda 1 salen en un D-: en tránsito, con su despacho, y todo lo de aduana pasa a Tránsito", async () => {
		const [uno, dos] = [await traspasoEnAduana(servidor, "T1"), await traspasoEnAduana(servidor, "T1")];
		const respuesta = await despacharDePrueba(servidor, [uno.id, dos.id]);
		expect(respuesta.cuerpo.resultado).toMatchObject({
			folio: expect.stringMatching(/^D-\d{4}$/),
			mensaje: expect.stringMatching(/^D-\d{4} sale a Tienda 1\. Queda en tránsito hasta que lo confirmen$/),
		});
		const { despacho_id: despachoId } = z.object({ despacho_id: z.uuid() }).parse(respuesta.cuerpo.resultado);
		expect(
			await consultar("SELECT estado, despacho_id FROM traspasos WHERE id = ANY($1::uuid[]) ORDER BY folio", [
				[uno.id, dos.id],
			]),
		).toEqual([
			{ estado: "en_transito", despacho_id: despachoId },
			{ estado: "en_transito", despacho_id: despachoId },
		]);
		expect(
			await consultar(
				`SELECT u.codigo, sum(e.piezas)::int AS piezas FROM existencias e JOIN ubicaciones u ON u.id = e.ubicacion_id
				 WHERE e.variante_id = ANY($1::uuid[]) AND e.piezas <> 0 GROUP BY u.codigo`,
				[[...uno.variantes, ...dos.variantes]],
			),
		).toEqual([{ codigo: "TRA", piezas: 16 }]);
		expect(await consultar("SELECT estado, recordatorios FROM despachos WHERE id = $1", [despachoId])).toEqual([
			{ estado: "en_transito", recordatorios: 0 },
		]);
	});

	it("a dos destinos no sale; el destino por decidir lo escoge Aduana; lo que ya salió no está en aduana", async () => {
		const [aTienda, aBodega] = [await traspasoEnAduana(servidor, "T1"), await traspasoEnAduana(servidor, "BOD")];
		expect((await despacharDePrueba(servidor, [aTienda.id, aBodega.id])).cuerpo).toMatchObject({
			codigo: "destinos_distintos",
			mensaje: "Un despacho va a un solo destino",
		});
		const sobrante = await traspasoEnAduana(servidor, null, "sobrante_descontinuada");
		expect((await despacharDePrueba(servidor, [sobrante.id])).cuerpo).toMatchObject({
			campos: { destino_ubicacion_id: "Escoge a dónde va" },
		});
		expect((await despacharDePrueba(servidor, [sobrante.id], ubicacion.BOD)).estado).toBe(200);
		expect(await consultar("SELECT destino_ubicacion_id FROM traspasos WHERE id = $1", [sobrante.id])).toEqual([
			{ destino_ubicacion_id: ubicacion.BOD },
		]);
		expect((await despacharDePrueba(servidor, [sobrante.id])).cuerpo).toMatchObject({
			codigo: "no_esta_en_aduana",
			mensaje: `${sobrante.folio} no está en aduana.`,
		});
	});

	it("un pedido en línea, una devolución con defecto y uno a un cliente sin su nota no salen por despacho", async () => {
		for (const [tipo, codigo] of [
			["pedido_linea", "se_empaca"],
			["devolucion_defecto", "espera_calidad"],
		] as const) {
			const traspaso = await traspasoEnAduana(servidor, "BOD", tipo);
			expect((await despacharDePrueba(servidor, [traspaso.id])).cuerpo).toMatchObject({ codigo });
		}
		const aCliente = await traspasoEnAduana(servidor, "BOD", "surtido_pedido_externo");
		await servidor.base.dueno.query(
			"UPDATE traspasos SET destino_ubicacion_id = NULL, destino_externo = 'cliente_externo' WHERE id = $1",
			[aCliente.id],
		);
		expect((await despacharDePrueba(servidor, [aCliente.id])).cuerpo).toMatchObject({
			codigo: "sin_nota",
			mensaje: "Sin nota de entrega no sale",
		});
	});

	it("lo de más rechazado que espera en aduana sale con «Devolver al proveedor», y mientras tanto el A- de esa orden no se despacha", async () => {
		const orden = await ordenParaRecibir(servidor);
		const recibida = await recibirDePrueba(servidor, orden, [{ metros: "110", partida: "A" }], 500);
		const { traspaso_id: aDeLaOrden } = z.object({ traspaso_id: z.uuid() }).parse(recibida.cuerpo.resultado);
		const { rows } = await servidor.base.dueno.query("SELECT id FROM autorizaciones WHERE orden_compra_linea_id = $1", [
			orden.lineaTela,
		]);
		await decidirDePrueba(servidor, String(rows[0]?.id), { decision: "rechazar", motivo: "No la pedimos" });
		expect((await despacharDePrueba(servidor, [aDeLaOrden])).cuerpo).toMatchObject({
			codigo: "devolucion_pendiente",
			mensaje: `Primero regresa al proveedor lo de más de ${orden.folio}.`,
		});
		const [devolucion] = await consultar(
			"SELECT id FROM traspasos WHERE tipo = 'devolucion_proveedor' AND orden_compra_id = $1",
			[orden.id],
		);
		await servidor.base.dueno.query("UPDATE traspasos SET estado = 'en_aduana' WHERE id = $1", [devolucion?.id]);
		expect((await despacharDePrueba(servidor, [String(devolucion?.id)])).cuerpo).toMatchObject({
			codigo: "es_devolucion_proveedor",
		});
	});
});
