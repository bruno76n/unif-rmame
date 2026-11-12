/**
 * Prueba de cancelar un gasto: con motivo, una sola vez; el de un servicio no se cancela desde Contaduría.
 * Fase 17 · docs/fases/17-contaduria-por-pagar-facturas-gastos-y-nomina.md (criterio «su gasto no se cancela desde
 * Contaduría»)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { registrarGastoDePrueba, servicioConCostoDePrueba } from "../../../nucleo/pruebas/gastos-de-prueba.ts";
import { mandarAccion } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

describe("Un gasto se cancela con motivo; el de un servicio no se cancela desde Contaduría", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Contaduría cancela un gasto con su versión de ahora. */
	async function cancelar(id: string, motivo = "Se registró dos veces") {
		const { rows } = await servidor.base.dueno.query("SELECT version::int AS v FROM gastos WHERE id = $1", [id]);
		return mandarAccion(
			servidor,
			"contaduria.cancelar_gasto",
			{ datos: { gasto_id: id, motivo }, version: rows[0]?.v },
			"contaduria",
		);
	}

	it("se cancela con su motivo, una sola vez", async () => {
		const { gasto_id: id, folio } = z
			.object({ gasto_id: z.uuid(), folio: z.string() })
			.parse((await registrarGastoDePrueba(servidor)).cuerpo.resultado);
		expect((await cancelar(id, "no")).estado).toBe(400);
		expect((await cancelar(id)).cuerpo.resultado).toMatchObject({ mensaje: `${folio} cancelado` });
		const { rows } = await servidor.base.dueno.query(
			"SELECT estado, motivo_cancelacion, cancelado_por IS NOT NULL AS con_quien FROM gastos WHERE id = $1",
			[id],
		);
		expect(rows).toEqual([{ estado: "cancelado", motivo_cancelacion: "Se registró dos veces", con_quien: true }]);
		expect((await cancelar(id)).cuerpo).toMatchObject({
			codigo: "gasto_cancelado",
			mensaje: `${folio} ya está cancelado.`,
		});
	});

	it("el gasto de un servicio no se cancela desde Contaduría", async () => {
		const servicio = await servicioConCostoDePrueba(servidor, 45_000);
		const { rows } = await servidor.base.dueno.query("SELECT gasto_id FROM servicios WHERE id = $1", [
			servicio.servicioId,
		]);
		expect((await cancelar(String(rows[0]?.gasto_id))).cuerpo).toMatchObject({
			codigo: "gasto_de_mantenimiento",
			mensaje: `Este gasto viene del servicio ${servicio.folio} de Mantenimiento.`,
		});
	});
});
