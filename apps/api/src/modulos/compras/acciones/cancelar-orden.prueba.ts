/**
 * Prueba de cancelar o descartar una orden: una recibida en parte no se cancela; cancelarla deja de contar en
 * camino; nada se borra.
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

describe("Una orden recibida en parte no se cancela; cancelar deja de contar en camino; nada se borra", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	const cancelar = (ordenId: string, motivo: string) =>
		conMotivoSobreOrden(servidor, "cancelar_orden", ordenId, motivo);

	it("un borrador se descarta y queda sin fecha; una enviada se cancela y deja de contar en camino; nada se borra", async () => {
		const borrador = await ordenDePrueba(servidor);
		expect((await cancelar(borrador.id, "ab")).cuerpo).toMatchObject({
			campos: { motivo: "Escribe al menos 5 letras." },
		});
		expect((await cancelar(borrador.id, "Ya no hace falta")).cuerpo.resultado).toMatchObject({
			mensaje: `${borrador.folio} descartada. Queda en el historial con su motivo`,
		});
		const enviada = await ordenDePrueba(servidor);
		await ordenEnEstado(servidor, enviada.id, "enviada");
		expect(await ordenEnCamino(servidor, enviada.id)).toBe(true);
		expect((await cancelar(enviada.id, "El proveedor no tiene")).cuerpo.resultado).toMatchObject({
			mensaje: `${enviada.folio} cancelada. Lo que faltaba ya no cuenta como en camino`,
		});
		expect(await ordenEnCamino(servidor, enviada.id)).toBe(false);
		const { rows } = await servidor.base.dueno.query(
			"SELECT folio, estado, fecha_prometida IS NULL AS sin_fecha, motivo_cancelacion FROM ordenes_compra WHERE id IN ($1, $2) ORDER BY folio",
			[borrador.id, enviada.id],
		);
		expect(rows).toEqual([
			{ folio: borrador.folio, estado: "cancelada", sin_fecha: true, motivo_cancelacion: "Ya no hace falta" },
			{ folio: enviada.folio, estado: "cancelada", sin_fecha: false, motivo_cancelacion: "El proveedor no tiene" },
		]);
		expect((await cancelar(enviada.id, "Otra vez")).cuerpo).toMatchObject({
			codigo: "orden_terminada",
			mensaje: `${enviada.folio} ya está cancelada: no se cancela.`,
		});
	});

	it("una recibida en parte no se cancela: se cierra con faltante", async () => {
		const orden = await ordenDePrueba(servidor);
		await ordenEnEstado(servidor, orden.id, "recibida_en_parte");
		expect((await cancelar(orden.id, "Ya no la quiero")).cuerpo).toMatchObject({
			codigo: "orden_recibida_en_parte",
			mensaje: `${orden.folio} ya recibió material: ciérrala con faltante.`,
		});
		expect(await ordenEnCamino(servidor, orden.id)).toBe(true);
	});
});
