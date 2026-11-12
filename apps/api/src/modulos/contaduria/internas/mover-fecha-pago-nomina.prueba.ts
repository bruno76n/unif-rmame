/**
 * Prueba de mover la fecha de pago de la nómina: cambiar `nomina.dia_pago` mueve las nóminas por pagar a la siguiente
 * fecha con ese día, a partir de mañana, con su renglón de bitácora; una pagada no se mueve.
 * Fase 17 · docs/fases/17-contaduria-por-pagar-facturas-gastos-y-nomina.md (criterio «Cambiar el día de pago mueve
 * las nóminas por pagar con su renglón de bitácora»)
 */

import { Temporal } from "temporal-polyfill";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mandarAccion } from "../../../nucleo/pruebas/llamadas.ts";
import { pagarNominaDePrueba, semanaConNomina } from "../../../nucleo/pruebas/nomina-de-prueba.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

describe("Cambiar el día de pago mueve las nóminas por pagar con su renglón de bitácora", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Una consulta con el rol dueño. */
	async function consultar(texto: string, valores: unknown[]) {
		return (await servidor.base.dueno.query(texto, valores)).rows;
	}

	it("Cambiar el día de pago mueve las nóminas por pagar con su renglón de bitácora; una pagada no se mueve", async () => {
		const pagada = await semanaConNomina(servidor, "2025-02-03");
		expect((await pagarNominaDePrueba(servidor, pagada.nominaId)).estado).toBe(200);
		const porPagar = await semanaConNomina(servidor, "2025-02-10");
		// Nace con el siguiente martes después de su sábado.
		expect(await consultar("SELECT fecha_pago::text AS f FROM nominas WHERE id = $1", [porPagar.nominaId])).toEqual([
			{ f: "2025-02-18" },
		]);
		const [parametro] = await consultar("SELECT version::int AS v FROM parametros WHERE clave = 'nomina.dia_pago'", []);
		const cambio = await mandarAccion(
			servidor,
			"admin.cambiar_parametro",
			{ datos: { clave: "nomina.dia_pago", valor: "viernes" }, version: parametro?.v },
			"duena",
		);
		expect(cambio.estado).toBe(200);
		const manana = Temporal.Now.plainDateISO("America/Mexico_City").add({ days: 1 });
		const viernes = manana.add({ days: (5 - manana.dayOfWeek + 7) % 7 }).toString();
		expect(await consultar("SELECT fecha_pago::text AS f FROM nominas WHERE id = $1", [porPagar.nominaId])).toEqual([
			{ f: viernes },
		]);
		expect(await consultar("SELECT fecha_pago::text AS f FROM nominas WHERE id = $1", [pagada.nominaId])).toEqual([
			{ f: "2025-02-11" },
		]);
		const renglones = await consultar(
			`SELECT descripcion FROM bitacora WHERE comando_id = (
				SELECT comando_id FROM bitacora WHERE entidad_id = $1 AND accion = 'admin.cambiar_parametro') ORDER BY ocurrido_en, id`,
			[porPagar.nominaId],
		);
		expect(renglones.map((renglon) => renglon.descripcion)).toEqual([
			expect.stringMatching(/Día de pago de la nómina: viernes/),
			expect.stringMatching(/^Fecha de pago de la nómina del 10 al 15 de febrero: 18 de febrero → \d+ de \w+$/),
		]);
	});
});
