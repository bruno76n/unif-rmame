/**
 * Prueba de `compras.reabrir_orden_pagada`: la orden que cerró el pago vuelve a recibida al cancelarse el pago; en
 * otro estado no la toca.
 * Fase 10 · docs/fases/10-patronaje-y-compras.md (parte 4)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearBase } from "../../../nucleo/base/conexion.ts";
import { enAccionDePrueba } from "../../../nucleo/pruebas/accion-de-prueba.ts";
import { ordenDePrueba, ordenEnEstado } from "../../../nucleo/pruebas/compras-de-prueba.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

describe("La orden pagada vuelve a recibida al cancelarse su pago; las internas no tocan una orden en otro estado", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Llama una interna de la orden como lo haría Contaduría. */
	function interna(nombre: string, ordenId: string) {
		return enAccionDePrueba(crearBase(servidor.base.app), servidor.modulos, (contexto) =>
			contexto.interna(`compras.${nombre}`, { orden_compra_id: ordenId }),
		);
	}

	it("la cerrada por el pago vuelve a recibida, sin fecha de cierre, y se puede cerrar otra vez", async () => {
		const orden = await ordenDePrueba(servidor);
		await ordenEnEstado(servidor, orden.id, "recibida");
		await interna("cerrar_orden_pagada", orden.id);
		expect(await interna("reabrir_orden_pagada", orden.id)).toEqual({ reabierta: true });
		const { rows } = await servidor.base.dueno.query("SELECT estado, cerrada_en FROM ordenes_compra WHERE id = $1", [
			orden.id,
		]);
		expect(rows).toEqual([{ estado: "recibida", cerrada_en: null }]);
		expect(await interna("cerrar_orden_pagada", orden.id)).toEqual({ cerrada: true });
	});

	it("en otro estado no la toca, ni rechaza", async () => {
		for (const otro of ["borrador", "enviada", "recibida_en_parte", "recibida", "cancelada", "cerrada_con_faltante"]) {
			const orden = await ordenDePrueba(servidor);
			if (otro !== "borrador") await ordenEnEstado(servidor, orden.id, otro);
			expect(await interna("reabrir_orden_pagada", orden.id)).toEqual({ reabierta: false });
			const { rows } = await servidor.base.dueno.query("SELECT estado FROM ordenes_compra WHERE id = $1", [orden.id]);
			expect(rows[0]?.estado).toBe(otro);
		}
	});
});
