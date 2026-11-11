/**
 * Prueba de pedir y cancelar una autorización: un documento no tiene dos esperando, y uno que se cancela
 * cancela la suya.
 * Fase 7 · docs/fases/07-autorizaciones-y-personal.md (parte 1)
 */

import { v7 as uuidv7 } from "uuid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { cuentaDePrueba } from "../../../nucleo/pruebas/cuentas-de-prueba.ts";
import { procesarComoElWorker } from "../../../nucleo/pruebas/en-vivo.ts";
import { conGoogle, mandarAccion } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

/** Lo que regresa pedir una aprobación. */
const laPedida = z.object({ autorizacion_id: z.uuid(), folio: z.string() });

describe("un documento no puede tener dos autorizaciones esperando; uno que se cancela cancela la suya", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Pide autorizar el pago de una factura. */
	function pedir(factura: string) {
		return mandarAccion(servidor, "prueba.pedir_aprobacion", {
			datos: { factura_id: factura, resumen: "Pagar lo recibido" },
		});
	}

	it("nace por autorizar con su folio AU-, quién la pidió y su departamento, y avisa a Dirección", async () => {
		const factura = uuidv7();
		const pedida = await pedir(factura);
		expect(pedida.cuerpo).toMatchObject({ resultado: { folio: expect.stringMatching(/^AU-\d{4}$/) } });
		const { rows } = await servidor.base.dueno.query(
			`SELECT a.estado, a.tipo, a.factura_proveedor_id, a.creado_por, d.clave AS departamento
			 FROM autorizaciones a JOIN departamentos d ON d.id = a.departamento_origen_id WHERE a.factura_proveedor_id = $1`,
			[factura],
		);
		expect(rows).toEqual([
			{
				estado: "por_autorizar",
				tipo: "pago_fuera_de_lo_normal",
				factura_proveedor_id: factura,
				creado_por: cuentaDePrueba("ventas"),
				departamento: "contaduria",
			},
		]);
		const evento = await servidor.base.dueno.query(
			"SELECT tablas FROM eventos WHERE tipo = 'autorizacion.pedida' AND entidad_folio = $1",
			[laPedida.parse(pedida.cuerpo.resultado).folio],
		);
		expect(evento.rows).toEqual([{ tablas: ["autorizaciones"] }]);
	});

	it("al pedirla avisa a Dirección; al decidirla, a quien la pidió, con el motivo si se rechazó", async () => {
		const factura = uuidv7();
		const pedida = laPedida.parse((await pedir(factura)).cuerpo.resultado);
		await procesarComoElWorker(servidor);
		const avisos = async (tipo: string) =>
			(
				await servidor.base.dueno.query("SELECT usuario_id, texto FROM avisos WHERE tipo = $1 AND entidad_id = $2", [
					tipo,
					pedida.autorizacion_id,
				])
			).rows;
		expect(await avisos("autorizacion_pedida")).toContainEqual({
			usuario_id: cuentaDePrueba("direccion"),
			texto: "Contaduría pide autorización: Pagar lo recibido",
		});
		const { rows } = await servidor.base.dueno.query("SELECT version FROM autorizaciones WHERE id = $1", [
			pedida.autorizacion_id,
		]);
		await mandarAccion(
			servidor,
			"direccion.decidir_autorizacion",
			{
				datos: {
					autorizacion_id: pedida.autorizacion_id,
					decision: "rechazar",
					motivo: "No cuadra con la nota",
					desde: "direccion",
				},
				version: Number(rows[0]?.version),
			},
			"duena",
			conGoogle(),
		);
		await procesarComoElWorker(servidor);
		expect(await avisos("autorizacion_decidida")).toEqual([
			{
				usuario_id: cuentaDePrueba("ventas"),
				texto: `${pedida.folio} rechazada: Pagar lo recibido · No cuadra con la nota`,
			},
		]);
	});

	it("la segunda autorización del mismo documento, también a la vez, responde ya_pedida con el folio que espera", async () => {
		const factura = uuidv7();
		const respuestas = await Promise.all([pedir(factura), pedir(factura)]);
		expect(respuestas.map((respuesta) => respuesta.estado).sort()).toEqual([200, 422]);
		const folio = laPedida.parse(respuestas.find((respuesta) => respuesta.estado === 200)?.cuerpo.resultado);
		expect(respuestas.find((respuesta) => respuesta.estado === 422)?.cuerpo).toMatchObject({
			codigo: "ya_pedida",
			mensaje: `La factura ya tiene una autorización esperando: ${folio.folio}.`,
		});
	});

	it("si el documento se cancela, su autorización queda cancelada con su motivo, ya no se decide y el documento puede pedir otra", async () => {
		const factura = uuidv7();
		const pedida = await pedir(factura);
		const id = laPedida.parse(pedida.cuerpo.resultado).autorizacion_id;
		expect((await mandarAccion(servidor, "prueba.cancelar_factura", { datos: { factura_id: factura } })).estado).toBe(
			200,
		);
		const { rows } = await servidor.base.dueno.query(
			"SELECT estado, motivo_cancelacion, cancelado_por, version FROM autorizaciones WHERE id = $1",
			[id],
		);
		expect(rows[0]).toMatchObject({
			estado: "cancelada",
			motivo_cancelacion: "Se canceló la factura",
			cancelado_por: cuentaDePrueba("ventas"),
		});
		const decidir = await mandarAccion(
			servidor,
			"direccion.decidir_autorizacion",
			{ datos: { autorizacion_id: id, decision: "autorizar", desde: "direccion" }, version: Number(rows[0]?.version) },
			"duena",
			conGoogle(),
		);
		expect(decidir.cuerpo).toMatchObject({
			codigo: "ya_decidida",
			mensaje: "Esa autorización se canceló: Se canceló la factura.",
		});
		// Cancelar otra vez: ya no espera ninguna.
		expect((await mandarAccion(servidor, "prueba.cancelar_factura", { datos: { factura_id: factura } })).estado).toBe(
			404,
		);
		expect((await pedir(factura)).estado).toBe(200);
	});
});
