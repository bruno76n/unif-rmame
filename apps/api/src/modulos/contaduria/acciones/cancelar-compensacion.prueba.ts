/**
 * Prueba de cancelar una compensación con el paquete del contador de su mes ya mandado: ya no se cancela.
 * Fase 18 · docs/fases/18-tienda-en-linea-direccion-y-contador.md (criterio «Con el paquete mandado, no se cancela un
 * pago ni una compensación de ese mes, ni un gasto que salió en él»)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { paqueteEnviadoDePrueba } from "../../../nucleo/pruebas/contaduria-de-prueba.ts";
import { conGoogle, mandarAccion } from "../../../nucleo/pruebas/llamadas.ts";
import { clienteQueTambienEsAcreedor } from "../../../nucleo/pruebas/por-pagar-de-prueba.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

describe("Con el paquete mandado, una compensación de ese mes ya no se cancela", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	it("la compensación del mes de un paquete mandado responde paquete_ya_enviado y sus saldos no cambian", async () => {
		const { cliente } = await clienteQueTambienEsAcreedor(servidor);
		const compensada = await mandarAccion(
			servidor,
			"contaduria.compensar",
			{ datos: { tercero_id: cliente.terceroId, monto_centavos: 50_000 } },
			"contaduria",
		);
		const { compensacion_id: id } = z.object({ compensacion_id: z.uuid() }).parse(compensada.cuerpo.resultado);
		const { rows } = await servidor.base.dueno.query(
			"SELECT fecha::text AS fecha, version::int AS v FROM compensaciones WHERE id = $1",
			[id],
		);
		await paqueteEnviadoDePrueba(servidor, `${String(rows[0]?.fecha).slice(0, 7)}-01`);
		const cancelada = await mandarAccion(
			servidor,
			"contaduria.cancelar_compensacion",
			{ datos: { compensacion_id: id, motivo: "Se compensó con la nota equivocada" }, version: rows[0]?.v },
			"contaduria",
			conGoogle(),
		);
		expect(cancelada.cuerpo).toMatchObject({
			codigo: "paquete_ya_enviado",
			mensaje: expect.stringMatching(
				/^El paquete de .+ ya se mandó al contador: esa compensación ya no se puede cancelar\.$/,
			),
		});
		expect((await servidor.base.dueno.query("SELECT estado FROM compensaciones WHERE id = $1", [id])).rows).toEqual([
			{ estado: "registrada" },
		]);
	});
});
