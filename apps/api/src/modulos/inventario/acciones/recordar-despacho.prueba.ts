/**
 * Prueba de `inventario.recordar_despacho`: Aduana solo recuerda; quien recibe es quien confirma.
 * Fase 11 · docs/fases/11-aduana-y-bodega.md (parte 2)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { despacharDePrueba, traspasoEnAduana, versionDeDespacho } from "../../../nucleo/pruebas/aduana-de-prueba.ts";
import { mandarAccion } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

describe("Solo quien recibe confirma: Aduana solo recuerda", () => {
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

	/** Despacha unos traspasos y regresa el despacho. */
	async function despachado(ids: string[]): Promise<string> {
		const respuesta = await despacharDePrueba(servidor, ids);
		return z.object({ despacho_id: z.uuid() }).parse(respuesta.cuerpo.resultado).despacho_id;
	}

	/** Bodega recibe un despacho. */
	async function recibir(despachoId: string, datos: Record<string, unknown>) {
		return mandarAccion(
			servidor,
			"inventario.recibir_despacho",
			{ datos: { despacho_id: despachoId, ...datos }, version: await versionDeDespacho(servidor, despachoId) },
			"bodega",
		);
	}

	it("recordar: suma un recordatorio y avisa a quien recibe; ya confirmado no se recuerda", async () => {
		const traspaso = await traspasoEnAduana(servidor, "BOD");
		const despacho = await despachado([traspaso.id]);
		const recordar = async () =>
			mandarAccion(
				servidor,
				"inventario.recordar_despacho",
				{ datos: { despacho_id: despacho }, version: await versionDeDespacho(servidor, despacho) },
				"aduana",
			);
		expect((await recordar()).cuerpo.resultado).toMatchObject({
			mensaje: "Recordatorio enviado a Bodega. Solo quien recibe puede confirmar",
		});
		await recordar();
		expect(await consultar("SELECT recordatorios FROM despachos WHERE id = $1", [despacho])).toEqual([
			{ recordatorios: 2 },
		]);
		await recibir(despacho, { modo: "completo" });
		expect((await recordar()).cuerpo).toMatchObject({
			codigo: "ya_confirmado",
			mensaje: expect.stringMatching(/^D-\d{4} ya lo confirmó Bodega$/),
		});
	});
});
