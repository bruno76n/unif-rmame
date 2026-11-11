/**
 * Prueba de `compras.cerrar_orden_pagada` y `compras.recalcular_estado_orden`: la orden recibida se cierra sola al
 * quedar pagada, sin quién; en otro estado las internas no la tocan.
 * Fase 10 · docs/fases/10-patronaje-y-compras.md (parte 4)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearBase } from "../../../nucleo/base/conexion.ts";
import { enAccionDePrueba } from "../../../nucleo/pruebas/accion-de-prueba.ts";
import { ordenDePrueba, ordenEnEstado } from "../../../nucleo/pruebas/compras-de-prueba.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

describe("La orden pagada se cierra sola; las internas no tocan una orden en otro estado", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Llama una interna de la orden como lo haría Contaduría o Aduana. */
	function interna(nombre: string, ordenId: string) {
		return enAccionDePrueba(crearBase(servidor.base.app), servidor.modulos, (contexto) =>
			contexto.interna(`compras.${nombre}`, { orden_compra_id: ordenId }),
		);
	}

	/** El estado de la orden y si tiene quién la cerró. */
	async function estado(ordenId: string) {
		const { rows } = await servidor.base.dueno.query(
			"SELECT estado, cerrada_en IS NOT NULL AS con_fecha, cerrada_por FROM ordenes_compra WHERE id = $1",
			[ordenId],
		);
		return rows[0];
	}

	it("la recibida queda cerrada, con su fecha y sin quién: la cerró el sistema", async () => {
		const orden = await ordenDePrueba(servidor);
		await ordenEnEstado(servidor, orden.id, "recibida");
		expect(await interna("cerrar_orden_pagada", orden.id)).toEqual({ cerrada: true });
		expect(await estado(orden.id)).toEqual({ estado: "cerrada", con_fecha: true, cerrada_por: null });
		// Ya cerrada, otra vez no hace nada.
		expect(await interna("cerrar_orden_pagada", orden.id)).toEqual({ cerrada: false });
	});

	it("en borrador, enviada, recibida en parte, cancelada o cerrada con faltante, no la toca", async () => {
		for (const otro of ["borrador", "enviada", "recibida_en_parte", "cancelada", "cerrada_con_faltante"]) {
			const orden = await ordenDePrueba(servidor);
			if (otro !== "borrador") await ordenEnEstado(servidor, orden.id, otro);
			expect(await interna("cerrar_orden_pagada", orden.id)).toEqual({ cerrada: false });
			expect((await estado(orden.id))?.estado).toBe(otro);
		}
	});

	it("recalcular: sin nada recibido (hasta la fase 11), la enviada queda recibida en parte; borrador, cancelada y cerradas no cambian", async () => {
		const enviada = await ordenDePrueba(servidor);
		await ordenEnEstado(servidor, enviada.id, "enviada");
		expect(await interna("recalcular_estado_orden", enviada.id)).toEqual({ estado: "recibida_en_parte" });
		for (const otro of ["borrador", "cancelada", "cerrada", "cerrada_con_faltante"]) {
			const orden = await ordenDePrueba(servidor);
			if (otro !== "borrador") await ordenEnEstado(servidor, orden.id, otro);
			expect(await interna("recalcular_estado_orden", orden.id)).toEqual({ estado: otro });
		}
	});
});
