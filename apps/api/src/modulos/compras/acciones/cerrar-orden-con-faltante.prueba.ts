/**
 * Prueba de cerrar una orden con faltante: solo la recibida en parte; cerrarla deja de contar en camino y guarda
 * su motivo y quién la cerró.
 * Fase 10 · docs/fases/10-patronaje-y-compras.md (parte 4)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
	conMotivoSobreOrden,
	ordenDePrueba,
	ordenEnCamino,
	ordenEnEstado,
} from "../../../nucleo/pruebas/compras-de-prueba.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

describe("Solo la orden recibida en parte se cierra con faltante; cerrar deja de contar en camino; nada se borra", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	const cerrar = (ordenId: string, motivo: string) =>
		conMotivoSobreOrden(servidor, "cerrar_orden_con_faltante", ordenId, motivo);

	it("una enviada o en borrador no se cierra con faltante", async () => {
		const borrador = await ordenDePrueba(servidor);
		const enviada = await ordenDePrueba(servidor);
		await ordenEnEstado(servidor, enviada.id, "enviada");
		for (const orden of [borrador, enviada]) {
			expect((await cerrar(orden.id, "No llegó todo")).cuerpo).toMatchObject({
				codigo: "orden_no_recibida_en_parte",
				mensaje: `${orden.folio} no está recibida en parte: solo esas se cierran con faltante.`,
			});
		}
	});

	it("la recibida en parte se cierra: con su motivo y quién, deja de contar en camino y sigue en la base", async () => {
		const orden = await ordenDePrueba(servidor);
		await ordenEnEstado(servidor, orden.id, "recibida_en_parte");
		expect((await cerrar(orden.id, "ab")).cuerpo).toMatchObject({ campos: { motivo: "Escribe al menos 5 letras." } });
		const cerrada = await cerrar(orden.id, "No llegó todo");
		expect(cerrada.cuerpo.resultado).toMatchObject({
			mensaje: expect.stringMatching(
				new RegExp(`^${orden.folio} cerrada con faltante\\. 100 pza de Botón .+ ya no cuenta como en camino$`),
			),
		});
		expect(await ordenEnCamino(servidor, orden.id)).toBe(false);
		const { rows } = await servidor.base.dueno.query(
			"SELECT estado, motivo_cierre, cerrada_por IS NOT NULL AS con_quien FROM ordenes_compra WHERE id = $1",
			[orden.id],
		);
		expect(rows).toEqual([{ estado: "cerrada_con_faltante", motivo_cierre: "No llegó todo", con_quien: true }]);
		expect((await cerrar(orden.id, "Otra vez más")).cuerpo).toMatchObject({ codigo: "orden_no_recibida_en_parte" });
	});
});
