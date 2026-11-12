/**
 * Prueba de la cuenta del reabasto: el mínimo, la meta, en cero o bajo mínimo, lo que se mueve y lo que se fabrica,
 * como dicen sus reglas; mover nunca pasa de los libres de Bodega; una tienda sin caja no entra.
 * Fase 14 · docs/fases/14-inventario-recepcion-del-taller-conteos-ajustes-y-reabasto.md («Criterios de terminado»)
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { cuentaDelReabasto, type DatosDelReabasto } from "./cuenta-reabasto.ts";

/** Las ubicaciones de la prueba: Bodega, dos tiendas con caja y una sin caja. */
const lugares = ["BOD", "T1", "T2", "T3"] as const;

/** Las variantes de la prueba: tallas de mayor venta y de las demás. */
const tallas = ["8", "10", "4", "S"] as const;

/** Unos datos al azar para la cuenta. */
const datosAlAzar = fc
	.record({
		minimos: fc.array(fc.tuple(fc.integer({ min: 1, max: 40 }), fc.integer({ min: 1, max: 20 })), {
			minLength: 4,
			maxLength: 4,
		}),
		factor: fc.integer({ min: 1, max: 4 }),
		libres: fc.array(fc.integer({ min: -5, max: 60 }), { minLength: 16, maxLength: 16 }),
		enCamino: fc.array(fc.integer({ min: 0, max: 20 }), { minLength: 16, maxLength: 16 }),
		sugerido: fc.array(fc.integer({ min: 0, max: 20 }), { minLength: 16, maxLength: 16 }),
	})
	.map(({ minimos, factor, libres, enCamino, sugerido }): DatosDelReabasto => {
		const mapa = (valores: number[]) =>
			Object.fromEntries(
				lugares.map((lugar, i) => [
					lugar,
					Object.fromEntries(tallas.map((talla, j) => [talla, valores[i * 4 + j] ?? 0])),
				]),
			);
		return {
			ubicaciones: lugares.map((lugar, i) => ({
				id: lugar,
				tipo: lugar === "BOD" ? "bodega" : "tienda",
				sinCaja: lugar === "T3",
				minimos: { mayorVenta: minimos[i]?.[0] ?? 1, demas: minimos[i]?.[1] ?? 1 },
			})),
			variantes: tallas.map((talla) => ({ id: talla, talla })),
			tallasMayorVenta: new Set(["8", "10", "12", "M"]),
			factorMeta: factor,
			libres: mapa(libres),
			enCamino: mapa(enCamino),
			yaSugerido: mapa(sugerido),
		};
	});

describe("La cuenta del reabasto da el mínimo, la meta, en cero o bajo mínimo, lo que se mueve y lo que se fabrica", () => {
	it("el ejemplo: la Tienda 1 con 2 libres y 3 en camino (mínimo 8, meta 16); Bodega con 7 libres: mover 7, fabricar 4", () => {
		const [tienda] = cuentaDelReabasto({
			ubicaciones: [
				{ id: "T1", tipo: "tienda", sinCaja: false, minimos: { mayorVenta: 8, demas: 4 } },
				{ id: "BOD", tipo: "bodega", sinCaja: false, minimos: { mayorVenta: 5, demas: 5 } },
			],
			variantes: [{ id: "polo-10", talla: "10" }],
			tallasMayorVenta: new Set(["8", "10", "12", "M"]),
			factorMeta: 2,
			libres: { T1: { "polo-10": 2 }, BOD: { "polo-10": 7 } },
			enCamino: { T1: { "polo-10": 3 } },
			yaSugerido: {},
		});
		expect(tienda).toEqual({
			ubicacionId: "T1",
			varianteId: "polo-10",
			minimo: 8,
			meta: 16,
			libres: 2,
			enCero: false,
			bajoMinimo: true,
			mover: 7,
			fabricar: 4,
		});
	});

	it("con datos al azar, cada renglón cumple sus reglas y lo que se mueve nunca pasa de los libres de Bodega", () => {
		fc.assert(
			fc.property(datosAlAzar, (datos) => {
				const renglones = cuentaDelReabasto(datos);
				// Una tienda sin caja no entra (regla 12).
				expect(renglones.some((renglon) => renglon.ubicacionId === "T3")).toBe(false);
				expect(renglones).toHaveLength(3 * tallas.length);
				for (const renglon of renglones) {
					const ubicacion = datos.ubicaciones.find((suya) => suya.id === renglon.ubicacionId);
					const mayor = datos.tallasMayorVenta.has(renglon.varianteId);
					const minimo = mayor ? ubicacion?.minimos.mayorVenta : ubicacion?.minimos.demas;
					expect(renglon.minimo).toBe(minimo);
					expect(renglon.meta).toBe(renglon.minimo * datos.factorMeta);
					expect(renglon.enCero).toBe(renglon.libres <= 0);
					expect(renglon.bajoMinimo).toBe(renglon.libres > 0 && renglon.libres < renglon.minimo);
					const sugerido = datos.yaSugerido[renglon.ubicacionId]?.[renglon.varianteId] ?? 0;
					if (ubicacion?.tipo === "bodega") {
						expect(renglon.mover).toBe(0);
						expect(renglon.fabricar).toBe(
							renglon.libres < renglon.minimo ? Math.max(0, renglon.meta - renglon.libres - sugerido) : 0,
						);
						continue;
					}
					const enCamino = datos.enCamino[renglon.ubicacionId]?.[renglon.varianteId] ?? 0;
					const falta = renglon.meta - renglon.libres - enCamino;
					if (renglon.libres >= renglon.minimo || falta <= 0) {
						expect([renglon.mover, renglon.fabricar]).toEqual([0, 0]);
						continue;
					}
					expect(renglon.mover).toBeGreaterThanOrEqual(0);
					expect(renglon.mover).toBeLessThanOrEqual(falta);
					expect(renglon.fabricar).toBe(Math.max(0, falta - renglon.mover - sugerido));
				}
				// Por variante, lo que se mueve suma a lo más los libres de Bodega, y una tienda recibe menos de lo
				// que le falta solo si Bodega ya no tiene.
				for (const talla of tallas) {
					const deBodega = Math.max(0, datos.libres.BOD?.[talla] ?? 0);
					const movidas = renglones.filter((renglon) => renglon.varianteId === talla);
					const total = movidas.reduce((suma, renglon) => suma + renglon.mover, 0);
					expect(total).toBeLessThanOrEqual(deBodega);
					const corta = movidas.some((renglon) => {
						const enCamino = datos.enCamino[renglon.ubicacionId]?.[talla] ?? 0;
						const falta = renglon.meta - renglon.libres - enCamino;
						return renglon.ubicacionId !== "BOD" && renglon.libres < renglon.minimo && renglon.mover < falta;
					});
					if (corta) expect(total).toBe(deBodega);
				}
			}),
			{ numRuns: 2000 },
		);
	});
});
