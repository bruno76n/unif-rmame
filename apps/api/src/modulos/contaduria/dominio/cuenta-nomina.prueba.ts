/**
 * Prueba de la cuenta de la nómina: días, piezas con y sin dañadas, correcciones, descuentos y lo que no alcanzó,
 * con las dos opciones; el total nunca baja de 0.
 * Fase 17 · docs/fases/17-contaduria-por-pagar-facturas-gastos-y-nomina.md (criterio «La cuenta de la nómina sigue
 * sus reglas»)
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	contarNomina,
	descontar,
	type EntradaDeNomina,
	type FichaParaNomina,
	importeDeTiempo,
	type ReglasDeNomina,
} from "./cuenta-nomina.ts";

/** Una ficha de prueba. */
function ficha(personaId: string, nombre: string, formaPago: FichaParaNomina["formaPago"], pagoDia: number | null) {
	return {
		personaId,
		nombre,
		area: "taller",
		ubicacionId: null,
		puesto: "Costurera",
		formaPago,
		pagoDiaCentavos: pagoDia,
		bajaEn: null,
	} satisfies FichaParaNomina;
}

/** Las opciones de siempre: sin dañadas, perdonar. */
const comoEmpieza: ReglasDeNomina = { pagarDanadas: false, descuentoMayor: "perdonar" };

/** Una entrada vacía, con lo que se diga. */
function entrada(parte: Partial<EntradaDeNomina>): EntradaDeNomina {
	return {
		conAsistencia: new Map(),
		fichas: new Map(),
		registros: [],
		correcciones: [],
		arrastres: new Map(),
		descuentos: new Map(),
		reglas: comoEmpieza,
		...parte,
	};
}

describe("La cuenta de la nómina sigue sus reglas", () => {
	it("el ejemplo del archivo: Sergio por días y Lupita por piezas, con una corrección y su descuento", () => {
		const sergio = ficha("p-sergio", "Sergio Gómez", "tiempo", 35_000);
		const lupita = ficha("p-lupita", "Lupita Ramos", "pieza", null);
		const cuenta = contarNomina(
			entrada({
				conAsistencia: new Map([["p-sergio", 5.5]]),
				fichas: new Map([
					["p-sergio", sergio],
					["p-lupita", lupita],
				]),
				registros: [
					{
						registroId: "r-1",
						personaId: "p-lupita",
						fecha: "2026-11-03",
						flujoOperacionId: "f-1",
						piezasBuenas: 1_240,
						piezasDanadas: 6,
						tarifaCentavos: 120,
					},
				],
				correcciones: [
					{
						registroId: "r-0",
						personaId: "p-lupita",
						fecha: "2026-10-30",
						flujoOperacionId: "f-1",
						piezasBuenas: 30,
						piezasDanadas: 0,
						piezasPagadas: 30,
						tarifaCentavos: 120,
						importePagadoCentavos: 3_600,
					},
				],
				descuentos: new Map([["p-lupita", { id: "d-1", montoCentavos: 20_000, motivo: "Préstamo" }]]),
			}),
		);
		const [primera, segunda] = cuenta.renglones;
		expect(primera).toMatchObject({
			ficha: lupita,
			piezas: 1_240,
			importePiezasCentavos: 148_800,
			totalCentavos: 125_200,
		});
		expect(primera?.correccionesCentavos).toBe(-3_600);
		expect(primera?.detalle.map((pieza) => [pieza.tipo, pieza.importeCentavos])).toEqual([
			["pago", 148_800],
			["correccion", -3_600],
		]);
		expect(segunda).toMatchObject({ ficha: sergio, dias: 5.5, importeTiempoCentavos: 192_500, totalCentavos: 192_500 });
		expect(cuenta.totalCentavos).toBe(125_200 + 192_500);
	});

	it("las dañadas se pagan solo si se decide; quien cobra por tiempo registra sin cobrar sus piezas", () => {
		const registro = {
			registroId: "r-1",
			personaId: "p-1",
			fecha: "2026-11-03",
			flujoOperacionId: "f-1",
			piezasBuenas: 10,
			piezasDanadas: 2,
			tarifaCentavos: 100,
		};
		const fichas = new Map([["p-1", ficha("p-1", "Ana", "mixta", 30_000)]]);
		expect(contarNomina(entrada({ fichas, registros: [registro] })).renglones[0]?.importePiezasCentavos).toBe(1_000);
		expect(
			contarNomina(entrada({ fichas, registros: [registro], reglas: { ...comoEmpieza, pagarDanadas: true } }))
				.renglones[0]?.importePiezasCentavos,
		).toBe(1_200);
		const porTiempo = contarNomina(
			entrada({ fichas: new Map([["p-1", ficha("p-1", "Ana", "tiempo", 30_000)]]), registros: [registro] }),
		);
		expect(porTiempo.renglones[0]?.detalle).toEqual([
			expect.objectContaining({
				sePaga: false,
				motivoNoPago: "cobra_por_tiempo",
				piezasPagadas: 0,
				importeCentavos: 0,
			}),
		]);
	});

	it("medio día con un pago impar se redondea una vez, al total de la semana", () => {
		expect(importeDeTiempo({ formaPago: "tiempo", pagoDiaCentavos: 35_001 }, 0.5)).toBe(17_501);
		expect(importeDeTiempo({ formaPago: "tiempo", pagoDiaCentavos: 35_001 }, 1.5)).toBe(52_502);
		expect(importeDeTiempo({ formaPago: "pieza", pagoDiaCentavos: 35_000 }, 3)).toBe(0);
	});

	it("lo que no alcanzó se perdona o pasa a la siguiente semana; un bruto negativo también", () => {
		expect(descontar(10_000, 15_000, 0, { descuentoMayor: "perdonar" })).toEqual({
			descontadoCentavos: 10_000,
			noAlcanzoCentavos: 5_000,
			destinoNoAlcanzo: "perdonado",
			totalCentavos: 0,
		});
		expect(descontar(-3_600, 0, 1_000, { descuentoMayor: "siguiente_semana" })).toEqual({
			descontadoCentavos: 0,
			noAlcanzoCentavos: 4_600,
			destinoNoAlcanzo: "siguiente_semana",
			totalCentavos: 0,
		});
	});

	it("con datos al azar, el total nunca baja de 0 y cada peso por descontar se descuenta o no alcanza", () => {
		const monto = fc.integer({ min: 0, max: 500_000 });
		fc.assert(
			fc.property(
				fc.integer({ min: -400_000, max: 1_000_000 }),
				monto,
				monto,
				fc.constantFrom<ReglasDeNomina["descuentoMayor"]>("perdonar", "siguiente_semana"),
				(bruto, descuento, arrastre, descuentoMayor) => {
					const cuenta = descontar(bruto, descuento, arrastre, { descuentoMayor });
					expect(cuenta.totalCentavos).toBeGreaterThanOrEqual(0);
					expect(cuenta.totalCentavos).toBe(Math.max(0, bruto) - cuenta.descontadoCentavos);
					expect(cuenta.descontadoCentavos + cuenta.noAlcanzoCentavos).toBe(descuento + arrastre + Math.max(0, -bruto));
					expect(cuenta.descontadoCentavos).toBeLessThanOrEqual(Math.max(0, bruto));
					expect(cuenta.destinoNoAlcanzo === null).toBe(cuenta.noAlcanzoCentavos === 0);
				},
			),
		);
	});

	it("con personas y registros al azar, cada registro entra una vez a su persona y los totales suman sus renglones", () => {
		const persona = fc.record({
			formaPago: fc.constantFrom<FichaParaNomina["formaPago"]>("tiempo", "pieza", "mixta"),
			pagoDia: fc.integer({ min: 10_000, max: 80_000 }),
			dias: fc.integer({ min: 0, max: 12 }).map((medios) => medios / 2),
			descuento: fc.option(fc.integer({ min: 1, max: 500 }).map((pesos) => pesos * 100)),
			arrastre: fc.integer({ min: 0, max: 50_000 }),
		});
		const registro = fc.record({
			persona: fc.nat(3),
			buenas: fc.integer({ min: 0, max: 500 }),
			danadas: fc.integer({ min: 0, max: 20 }),
			tarifa: fc.integer({ min: 0, max: 500 }),
			pagado: fc.option(fc.integer({ min: 0, max: 100_000 })),
		});
		fc.assert(
			fc.property(
				fc.array(persona, { minLength: 1, maxLength: 4 }),
				fc.array(registro, { maxLength: 15 }),
				fc.boolean(),
				(personas, registros, pagarDanadas) => {
					const ids = personas.map((_, i) => `p-${i}`);
					const deQuien = (i: number) => ids[i % ids.length] ?? "p-0";
					const nuevos = registros.filter((uno) => uno.pagado === null);
					const corregir = registros.filter((uno) => uno.pagado !== null);
					const cuenta = contarNomina(
						entrada({
							conAsistencia: new Map(
								personas.flatMap((una, i) => (una.formaPago === "pieza" ? [] : [[ids[i] ?? "", una.dias] as const])),
							),
							fichas: new Map(
								personas.map((una, i) => [
									ids[i] ?? "",
									ficha(ids[i] ?? "", `Persona ${i}`, una.formaPago, una.pagoDia),
								]),
							),
							registros: nuevos.map((uno, i) => ({
								registroId: `n-${i}`,
								personaId: deQuien(uno.persona),
								fecha: "2026-11-03",
								flujoOperacionId: "f-1",
								piezasBuenas: uno.buenas,
								piezasDanadas: uno.danadas,
								tarifaCentavos: uno.tarifa,
							})),
							correcciones: corregir.map((uno, i) => ({
								registroId: `c-${i}`,
								personaId: deQuien(uno.persona),
								fecha: "2026-10-27",
								flujoOperacionId: "f-1",
								piezasBuenas: uno.buenas,
								piezasDanadas: uno.danadas,
								piezasPagadas: uno.buenas,
								tarifaCentavos: uno.tarifa,
								importePagadoCentavos: uno.pagado ?? 0,
							})),
							arrastres: new Map(personas.map((una, i) => [ids[i] ?? "", una.arrastre])),
							descuentos: new Map(
								personas.flatMap((una, i) =>
									una.descuento === null
										? []
										: [[ids[i] ?? "", { id: `d-${i}`, montoCentavos: una.descuento, motivo: "Préstamo" }] as const],
								),
							),
							reglas: { pagarDanadas, descuentoMayor: "siguiente_semana" },
						}),
					);
					const detalle = cuenta.renglones.flatMap((renglon) => renglon.detalle);
					expect(detalle).toHaveLength(registros.length);
					expect(new Set(detalle.map((pieza) => `${pieza.tipo}|${pieza.registroId}`)).size).toBe(registros.length);
					for (const renglon of cuenta.renglones) {
						expect(renglon.totalCentavos).toBeGreaterThanOrEqual(0);
						expect(renglon.brutoCentavos).toBe(
							renglon.importeTiempoCentavos + renglon.importePiezasCentavos + renglon.correccionesCentavos,
						);
						const forma = renglon.ficha.formaPago;
						if (forma === "pieza") expect(renglon.importeTiempoCentavos).toBe(0);
						if (forma === "tiempo") expect(renglon.importePiezasCentavos).toBe(0);
					}
					expect(cuenta.totalCentavos).toBe(
						cuenta.renglones.reduce((suma, renglon) => suma + renglon.totalCentavos, 0),
					);
				},
			),
		);
	});
});
