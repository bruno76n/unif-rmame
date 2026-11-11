/**
 * Prueba de la proyección de material: el ejemplo de la gabardina azul marino y, con datos al azar, que el día en
 * que se acaba es el primero en que la serie baja de cero, que lo que faltó no se recupera y que el pedido sugerido
 * es múltiplo de compra y cubre los días más el mínimo; y el consumo medido con el factor de su mes.
 * Fase 10 · docs/fases/10-patronaje-y-compras.md (parte 5)
 */

import fc from "fast-check";
import { Temporal } from "temporal-polyfill";
import { describe, expect, it } from "vitest";
import {
	consumoNormal,
	consumoPorMes,
	type InsumosDeProyeccion,
	type Llegada,
	proyectarMaterial,
} from "./proyeccion-material.ts";

/** Los factores iniciales de `compras.factor_consumo_{mes}`, en milésimos: ene 0.9 … dic 0.6. */
const factores = [900n, 800n, 900n, 1100n, 1700n, 2500n, 3200n, 2200n, 1200n, 1000n, 800n, 600n];

/** Los límites iniciales de los parámetros. */
const limites = { diasMaximos: 420, diasPedirEstaSemana: 7, diasMasDeSeisMeses: 200 };

/** Metros en milésimos. */
const m = (metros: number) => BigInt(metros) * 1000n;

/** La gabardina azul marino de la muestra, con hoy el 11 de octubre: 369 m libres, 34 m al día en octubre. */
const gabardina: InsumosDeProyeccion = {
	hoy: "2026-10-11",
	libre: m(369),
	llegadas: [],
	consumoNormal: m(34),
	factores,
	plazo: 14,
	minimo: m(150),
	multiplo: m(50),
	diasCubre: 60,
	limites,
};

describe("La proyección da los números del ejemplo de la gabardina azul marino (se acaba el 21 oct, faltan 4 días, pide 1,700 m)", () => {
	it("se acaba el 21 de octubre, faltarán 4 días, el pedido es para el 25 y pide 1,700 m", () => {
		const proyeccion = proyectarMaterial(gabardina);
		expect(proyeccion).toMatchObject({
			seAcaba: "2026-10-21",
			llegariaHoy: "2026-10-25",
			fechaLimite: "2026-10-07",
			diasSinMaterial: 4,
			estado: "sin_tiempo_de_entrega",
			linea: "Faltará material 4 días",
			paraCuando: "2026-10-25",
			porPedir: m(1_700),
		});
		// Del 25 de octubre al 23 de diciembre: 7 × 34 + 30 × 27.2 + 23 × 20.4 = 1,523.2 m; más 150, 1,673.2.
		expect(proyeccion.consumoPorMes.slice(9)).toEqual([m(34), 27_200n, 20_400n]);
		expect(proyeccion.serie.slice(0, 11)).toEqual([335, 301, 267, 233, 199, 165, 131, 97, 63, 29, -5].map(m));
	});

	it("con 1,700 m llegando el 25, alcanza hasta el primer día en que vuelve a bajar de cero; con mucho, más de un año", () => {
		const { alcanzaHasta, serie } = proyectarMaterial({ ...gabardina, otraCantidad: m(1_700) });
		expect(alcanzaHasta).not.toBeNull();
		const dia = Temporal.PlainDate.from(String(alcanzaHasta));
		expect(Temporal.PlainDate.compare(dia, Temporal.PlainDate.from("2026-10-25"))).toBeGreaterThan(0);
		expect(proyectarMaterial({ ...gabardina, otraCantidad: m(1_000_000) }).alcanzaHasta).toBeNull();
		// La serie de la proyección no cambia con otra cantidad.
		expect(serie).toEqual(proyectarMaterial(gabardina).serie);
	});

	it("los estados y su línea: pedir hoy, esta semana, antes de una fecha, en más de 6 meses y sin consumo", () => {
		// 34 m al día en octubre; se acaba cuando lo libre ya no alcanza.
		const con = (libre: number) => proyectarMaterial({ ...gabardina, libre: m(libre) });
		// Se acaba el 25 (15 días × 34 = 510 > 500 > 476): la fecha límite es hoy.
		expect(con(500)).toMatchObject({ seAcaba: "2026-10-25", estado: "pedir_esta_semana", linea: "Pedir hoy" });
		expect(con(700)).toMatchObject({ estado: "pedir_esta_semana", linea: "Pedir antes del 17 de octubre" });
		expect(con(1_200)).toMatchObject({ estado: "alcanza", linea: expect.stringMatching(/^Pedir antes del /) });
		expect(con(12_000)).toMatchObject({ estado: "alcanza", linea: "Pedir en más de 6 meses" });
		expect(proyectarMaterial({ ...gabardina, consumoNormal: null })).toMatchObject({
			seAcaba: null,
			estado: "alcanza",
			linea: "Sin consumo todavía",
			paraCuando: "2026-10-25",
			porPedir: m(150),
		});
		// Lo libre ya negativo: se acaba hoy.
		expect(
			proyectarMaterial({ ...gabardina, libre: -1n, llegadas: [{ dia: "2026-10-11", cantidad: m(9_000) }] }),
		).toMatchObject({
			seAcaba: "2026-10-11",
			diasSinMaterial: 14,
		});
	});
});

/** Insumos al azar: lo libre, las llegadas en los primeros 60 días, el consumo, el plazo, el mínimo y el múltiplo. */
const insumosAlAzar = fc
	.record({
		hoy: fc.integer({ min: 0, max: 730 }).map((dias) => Temporal.PlainDate.from("2026-01-01").add({ days: dias })),
		libre: fc.bigInt({ min: -500_000n, max: 5_000_000n }),
		llegadas: fc.array(
			fc.record({ dia: fc.integer({ min: 0, max: 60 }), cantidad: fc.bigInt({ min: 1n, max: 2_000_000n }) }),
			{
				maxLength: 4,
			},
		),
		consumoNormal: fc.option(fc.bigInt({ min: 0n, max: 100_000n }), { nil: null }),
		plazo: fc.integer({ min: 1, max: 60 }),
		minimo: fc.bigInt({ min: 0n, max: 500_000n }),
		multiplo: fc.bigInt({ min: 1n, max: 100_000n }),
		diasCubre: fc.integer({ min: 1, max: 365 }),
	})
	.map(
		({ hoy, llegadas, ...resto }): InsumosDeProyeccion => ({
			...resto,
			hoy: hoy.toString(),
			llegadas: llegadas.map(({ dia, cantidad }): Llegada => ({ dia: hoy.add({ days: dia }).toString(), cantidad })),
			factores,
			limites: { ...limites, diasMaximos: 120 },
		}),
	);

describe("Con datos al azar: el día en que se acaba es el primero en que la serie baja de cero; lo que faltó no se recupera; el pedido sugerido es múltiplo de compra y cubre los días más el mínimo", () => {
	it("el día en que se acaba es el primero en que la serie baja de cero (u hoy, si lo libre ya es negativo)", () => {
		fc.assert(
			fc.property(insumosAlAzar, (insumos) => {
				const { serie, seAcaba } = proyectarMaterial(insumos);
				const hoy = Temporal.PlainDate.from(insumos.hoy);
				const primero = serie.findIndex((queda) => queda < 0n);
				const esperado = insumos.libre < 0n ? 0 : primero;
				expect(seAcaba).toBe(esperado < 0 ? null : hoy.add({ days: esperado }).toString());
			}),
			{ numRuns: 2_000 },
		);
	});

	it("lo que faltó no se recupera: una llegada que encuentra la serie en negativo suma desde cero", () => {
		fc.assert(
			fc.property(insumosAlAzar, (insumos) => {
				const { serie, consumoPorMes: consumos } = proyectarMaterial(insumos);
				const hoy = Temporal.PlainDate.from(insumos.hoy);
				for (let numero = 1; numero < serie.length; numero++) {
					const dia = hoy.add({ days: numero });
					const llega = insumos.llegadas
						.filter((llegada) => llegada.dia === dia.toString())
						.reduce((suma, llegada) => suma + llegada.cantidad, 0n);
					const antes = serie[numero - 1] ?? 0n;
					const desde = llega > 0n && antes < 0n ? 0n : antes;
					expect(serie[numero]).toBe(desde + llega - (consumos[dia.month - 1] ?? 0n));
				}
			}),
			{ numRuns: 1_000 },
		);
	});

	it("lo que faltó no se recupera, visto desde fuera: la serie nunca queda abajo de la cuenta sin perdón (lo libre más lo que llegó menos lo consumido), y es igual mientras nada llega sobre un negativo", () => {
		fc.assert(
			fc.property(insumosAlAzar, (insumos) => {
				const { serie, consumoPorMes: consumos } = proyectarMaterial(insumos);
				const hoy = Temporal.PlainDate.from(insumos.hoy);
				let sinPerdon = insumos.libre;
				let perdono = false;
				for (let numero = 0; numero < serie.length; numero++) {
					const dia = hoy.add({ days: numero });
					const llega = insumos.llegadas
						.filter((llegada) => llegada.dia === dia.toString())
						.reduce((suma, llegada) => suma + llegada.cantidad, 0n);
					const antes = numero === 0 ? insumos.libre : (serie[numero - 1] ?? 0n);
					if (llega > 0n && antes < 0n) perdono = true;
					sinPerdon += llega - (consumos[dia.month - 1] ?? 0n);
					const queda = serie[numero] ?? 0n;
					expect(queda >= sinPerdon).toBe(true);
					if (!perdono) expect(queda).toBe(sinPerdon);
				}
			}),
			{ numRuns: 1_000 },
		);
	});

	it("el pedido sugerido es múltiplo de compra y cubre el consumo de sus días desde «para cuándo» más el mínimo, sin pasarse de un múltiplo", () => {
		fc.assert(
			fc.property(insumosAlAzar, (insumos) => {
				const { porPedir, paraCuando, consumoPorMes: consumos } = proyectarMaterial(insumos);
				const desde = Temporal.PlainDate.from(paraCuando);
				let necesita = insumos.minimo;
				for (let numero = 0; numero < insumos.diasCubre; numero++) {
					necesita += consumos[desde.add({ days: numero }).month - 1] ?? 0n;
				}
				expect(porPedir % insumos.multiplo).toBe(0n);
				expect(porPedir >= necesita).toBe(true);
				expect(porPedir - insumos.multiplo < necesita).toBe(true);
			}),
			{ numRuns: 2_000 },
		);
	});
});

describe("Con 90 días de salidas, el consumo deja de ser el inicial y sale de las salidas divididas entre el factor de su mes", () => {
	it("el ejemplo del avío: 30 días de julio con 96 piezas son 30 de un mes normal", () => {
		const hoy = Temporal.PlainDate.from("2026-08-30");
		// Los 90 días antes de hoy: del 1 de junio al 29 de agosto. Solo julio tiene salidas.
		const salidas = Array.from({ length: 31 }, (_, numero) => ({
			dia: Temporal.PlainDate.from("2026-07-01").add({ days: numero }).toString(),
			cantidad: 96_000n,
		}));
		const medido = consumoNormal({ hoy, inicial: 5_000n, primeraSalida: "2026-05-01", salidas, factores, dias: 90 });
		// 31 días × 30 piezas ÷ 90 días = 10.333…
		expect(medido).toEqual({ consumo: 10_333n, medido: true });
		// Sin 90 días de salidas, el inicial.
		expect(consumoNormal({ hoy, inicial: 5_000n, primeraSalida: "2026-06-02", salidas, factores, dias: 90 })).toEqual({
			consumo: 5_000n,
			medido: false,
		});
		expect(consumoNormal({ hoy, inicial: null, primeraSalida: null, salidas: [], factores, dias: 90 })).toEqual({
			consumo: null,
			medido: false,
		});
	});

	it("con datos al azar: la salida de hoy no cuenta, y un consumo constante de un mes normal se mide igual", () => {
		fc.assert(
			fc.property(fc.integer({ min: 0, max: 730 }), fc.bigInt({ min: 0n, max: 100_000n }), (dias, normal) => {
				const hoy = Temporal.PlainDate.from("2026-01-01").add({ days: dias });
				const consumos = consumoPorMes(normal, factores);
				const salidas = Array.from({ length: 91 }, (_, numero) => {
					const dia = hoy.subtract({ days: numero });
					return { dia: dia.toString(), cantidad: consumos[dia.month - 1] ?? 0n };
				});
				const { consumo } = consumoNormal({
					hoy,
					inicial: null,
					primeraSalida: hoy.subtract({ days: 90 }).toString(),
					salidas,
					factores,
					dias: 90,
				});
				// Cada día redondeó al milésimo: a lo más un milésimo de diferencia por factor bajo.
				expect(consumo).not.toBeNull();
				const diferencia = (consumo ?? 0n) - normal;
				expect(diferencia >= -2n && diferencia <= 2n).toBe(true);
			}),
			{ numRuns: 1_000 },
		);
	});
});
