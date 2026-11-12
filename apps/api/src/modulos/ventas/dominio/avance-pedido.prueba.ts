/**
 * Prueba del avance de un pedido, su etapa y su alerta: salen como dicen sus reglas, con el ejemplo y con datos al
 * azar.
 * Fase 16 · docs/fases/16-ventas-a-externos.md («Criterios de terminado»)
 */

import fc from "fast-check";
import { Temporal } from "temporal-polyfill";
import { describe, expect, it } from "vitest";
import { alertaDelPedido, avanceDeTalla, etapaDelPedido, type TallaDelPedido } from "./avance.ts";

/** Hoy, para la prueba. */
const hoy = Temporal.PlainDate.from("2026-11-12");

/** Lo demás de la alerta, con lo que se cambie. */
const datos = (cambios: Partial<Parameters<typeof alertaDelPedido>[1]> = {}) => ({
	fechaEntrega: "2026-11-20",
	hoy,
	diasEnRiesgo: 3,
	conOrden: false,
	cambioPorAplicar: false,
	...cambios,
});

/** Una talla sin nada, con lo que se cambie. */
const talla = (cambios: Partial<TallaDelPedido> = {}): TallaDelPedido => ({
	varianteId: "v",
	pedido: 0,
	entregado: 0,
	enNota: 0,
	listo: 0,
	deBodega: 0,
	enProduccion: 0,
	...cambios,
});

/** Una talla al azar. */
const tallaAlAzar = fc
	.record({
		pedido: fc.integer({ min: 0, max: 200 }),
		entregado: fc.integer({ min: 0, max: 60 }),
		enNota: fc.integer({ min: 0, max: 60 }),
		listo: fc.integer({ min: 0, max: 60 }),
		deBodega: fc.integer({ min: 0, max: 60 }),
		enProduccion: fc.integer({ min: 0, max: 200 }),
	})
	.map((cuentas) => talla(cuentas));

describe("El avance, la etapa y la alerta salen como dicen sus reglas", () => {
	it("el ejemplo: 40 pedidas, 10 entregadas, 5 en nota, 5 listas, 4 de bodega y 30 en producción: faltan 16, nada por mandar, 14 de más", () => {
		expect(
			avanceDeTalla(talla({ pedido: 40, entregado: 10, enNota: 5, listo: 5, deBodega: 4, enProduccion: 30 })),
		).toMatchObject({ falta: 16, porMandar: 0, deMas: 14 });
		expect(avanceDeTalla(talla({ pedido: 40, enProduccion: 25 }))).toMatchObject({
			falta: 40,
			porMandar: 15,
			deMas: 0,
		});
	});

	it("la etapa: confirmado, entrega parcial, listo en aduana y en producción", () => {
		expect(etapaDelPedido([avanceDeTalla(talla({ pedido: 10 }))])).toBe("confirmado");
		expect(etapaDelPedido([avanceDeTalla(talla({ pedido: 10, enNota: 1, enProduccion: 9 }))])).toBe("entrega_parcial");
		expect(etapaDelPedido([avanceDeTalla(talla({ pedido: 10, listo: 10 }))])).toBe("listo_en_aduana");
		expect(etapaDelPedido([avanceDeTalla(talla({ pedido: 10, listo: 4, deBodega: 6 }))])).toBe("en_produccion");
	});

	it("la alerta: la primera que aplica", () => {
		const tallas = (cambios: Partial<TallaDelPedido>) => [avanceDeTalla(talla({ pedido: 10, ...cambios }))];
		expect(alertaDelPedido(tallas({ listo: 10 }), datos({ fechaEntrega: "2026-11-11" }))).toEqual({ tipo: "atrasado" });
		expect(alertaDelPedido(tallas({ listo: 2, enProduccion: 8 }), datos())).toEqual({ tipo: "listo_para_entregar" });
		expect(alertaDelPedido(tallas({ enProduccion: 4 }), datos({ conOrden: true }))).toEqual({
			tipo: "por_mandar",
			piezas: 6,
			conOrden: true,
		});
		expect(alertaDelPedido(tallas({ enProduccion: 10 }), datos({ fechaEntrega: "2026-11-15" }))).toEqual({
			tipo: "en_riesgo",
		});
		expect(alertaDelPedido(tallas({ enProduccion: 10 }), datos({ cambioPorAplicar: true }))).toEqual({
			tipo: "cambio_por_aplicar",
		});
		expect(alertaDelPedido(tallas({ enProduccion: 10 }), datos())).toBeNull();
	});

	it("con datos al azar, las cuentas cuadran: lo que falta se reparte entre en producción y por mandar, y la alerta sigue su orden", () => {
		fc.assert(
			fc.property(
				fc.array(tallaAlAzar, { minLength: 1, maxLength: 6 }),
				fc.integer({ min: -5, max: 20 }),
				fc.boolean(),
				fc.boolean(),
				(tallas, diasAEntrega, conOrden, cambioPorAplicar) => {
					const avance = tallas.map(avanceDeTalla);
					for (const una of avance) {
						expect(una.falta).toBe(Math.max(0, una.pedido - una.entregado - una.enNota - una.listo - una.deBodega));
						// Lo que falta es lo que está en producción (hasta lo que falta) más lo que falta mandar.
						expect(Math.min(una.enProduccion, una.falta) + una.porMandar).toBe(una.falta);
						expect(una.deMas).toBe(Math.max(0, una.enProduccion - una.falta));
						expect(una.porMandar === 0 || una.deMas === 0).toBe(true);
					}
					const alerta = alertaDelPedido(avance, {
						fechaEntrega: hoy.add({ days: diasAEntrega }).toString(),
						hoy,
						diasEnRiesgo: 3,
						conOrden,
						cambioPorAplicar,
					});
					const suma = (cuenta: (una: (typeof avance)[number]) => number) =>
						avance.reduce((total, una) => total + cuenta(una), 0);
					if (diasAEntrega < 0) expect(alerta).toEqual({ tipo: "atrasado" });
					else if (suma((una) => una.listo) > 0) expect(alerta).toEqual({ tipo: "listo_para_entregar" });
					else if (suma((una) => una.porMandar) > 0) {
						expect(alerta).toEqual({ tipo: "por_mandar", piezas: suma((una) => una.porMandar), conOrden });
					}
					const etapa = etapaDelPedido(avance);
					const movido = suma((una) => una.entregado + una.enNota + una.listo + una.deBodega + una.enProduccion);
					if (movido === 0) expect(etapa).toBe("confirmado");
					else if (suma((una) => una.entregado + una.enNota) > 0) expect(etapa).toBe("entrega_parcial");
					else expect(["listo_en_aduana", "en_produccion"]).toContain(etapa);
				},
			),
			{ numRuns: 3000 },
		);
	});
});
