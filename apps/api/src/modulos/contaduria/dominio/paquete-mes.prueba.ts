/**
 * Prueba de la cuenta del paquete del contador: cada concepto suma lo de su mes, aunque sea cero; y, a lo largo de
 * varios meses con gastos que llegan tarde o se cancelan, cada gasto sale en un solo paquete: en el de su mes si llegó
 * antes de mandarlo, o en el siguiente que se mande, como de meses anteriores. Lo congelado nunca cambia.
 * Fase 18 · docs/fases/18-tienda-en-linea-direccion-y-contador.md (criterio «El paquete de un mes suma cada concepto
 * con sus documentos; al mandarlo se congela, y un gasto que llega tarde sale en el siguiente como de meses
 * anteriores»)
 */

import fc from "fast-check";
import { Temporal } from "temporal-polyfill";
import { describe, expect, it } from "vitest";
import { cuentaDelPaquete, type GastoDelPaquete, mesDe, type RenglonDelPaquete } from "./paquete-mes.ts";

describe("El paquete de un mes suma cada concepto; cada gasto sale en un solo paquete y lo congelado no cambia", () => {
	it("cada concepto suma lo de su mes con sus documentos; los de otro mes y los conceptos sin nada quedan en cero", () => {
		const { renglones, gastoIds } = cuentaDelPaquete(
			"2026-10-01",
			[
				{ concepto: "cobranza_clientes", fecha: "2026-10-03", montoCentavos: 1_000_000 },
				{ concepto: "cobranza_clientes", fecha: "2026-10-31", montoCentavos: 843_000 },
				{ concepto: "cobranza_clientes", fecha: "2026-11-01", montoCentavos: 999 },
				{ concepto: "anticipos_recibidos", fecha: "2026-10-12", montoCentavos: 4_000_000 },
				{ concepto: "nomina", fecha: "2026-10-07", montoCentavos: 2_410_500 },
				{ concepto: "nomina", fecha: "2026-10-14", montoCentavos: 2_410_500 },
			],
			[
				{
					id: "a",
					fecha: "2026-10-05",
					categoriaId: "luz",
					montoCentavos: 120_000,
					paqueteContadorId: null,
					cancelado: false,
				},
				{
					id: "b",
					fecha: "2026-10-09",
					categoriaId: "luz",
					montoCentavos: 80_000,
					paqueteContadorId: null,
					cancelado: false,
				},
				{
					id: "c",
					fecha: "2026-10-09",
					categoriaId: "agua",
					montoCentavos: 5_000,
					paqueteContadorId: null,
					cancelado: true,
				},
				{
					id: "d",
					fecha: "2026-09-28",
					categoriaId: "agua",
					montoCentavos: 7_000,
					paqueteContadorId: null,
					cancelado: false,
				},
				{
					id: "e",
					fecha: "2026-08-02",
					categoriaId: "agua",
					montoCentavos: 9_000,
					paqueteContadorId: null,
					cancelado: false,
				},
			],
			new Set(["2026-09-01"]),
		);
		const de = (concepto: string) => renglones.filter((renglon) => renglon.concepto === concepto);
		expect(de("cobranza_clientes")).toEqual([
			{
				concepto: "cobranza_clientes",
				categoriaId: null,
				deMesesAnteriores: false,
				montoCentavos: 1_843_000,
				documentos: 2,
			},
		]);
		expect(de("nomina")[0]).toMatchObject({ montoCentavos: 4_821_000, documentos: 2 });
		expect(de("ventas_tiendas")[0]).toMatchObject({ montoCentavos: 0, documentos: 0 });
		expect(de("ventas_en_linea")[0]).toMatchObject({ montoCentavos: 0, documentos: 0 });
		// El cancelado no entra; el de agosto tampoco: su paquete no se ha mandado.
		expect(de("gasto")).toEqual([
			{ concepto: "gasto", categoriaId: "luz", deMesesAnteriores: false, montoCentavos: 200_000, documentos: 2 },
			{ concepto: "gasto", categoriaId: "agua", deMesesAnteriores: true, montoCentavos: 7_000, documentos: 1 },
		]);
		expect(gastoIds).toEqual(["a", "b", "d"]);
	});

	it("a lo largo de varios meses, cada gasto sale en un solo paquete, en el de su mes o en el siguiente que se mande", () => {
		/** Lo que pasa antes de mandar el paquete de un mes: llegan gastos (de ese mes o de antes) y se cancelan. */
		const suceso = fc.oneof(
			fc.record({
				tipo: fc.constant("llega" as const),
				mesesAtras: fc.nat(3),
				dia: fc.integer({ min: 1, max: 28 }),
				categoria: fc.constantFrom("luz", "agua", "papeleria"),
				monto: fc.integer({ min: 1, max: 1_000_000 }),
			}),
			fc.record({ tipo: fc.constant("cancela" as const), cual: fc.nat(40) }),
		);
		fc.assert(
			fc.property(fc.array(fc.array(suceso, { maxLength: 8 }), { minLength: 1, maxLength: 6 }), (meses) => {
				const primero = Temporal.PlainDate.from("2026-01-01");
				const gastos: GastoDelPaquete[] = [];
				const enviados = new Set<string>();
				const congelados = new Map<string, RenglonDelPaquete[]>();
				meses.forEach((sucesos, i) => {
					const mes = primero.add({ months: i });
					for (const evento of sucesos) {
						if (evento.tipo === "llega") {
							gastos.push({
								id: `g${gastos.length}`,
								fecha: mes
									.subtract({ months: Math.min(evento.mesesAtras, i) })
									.with({ day: evento.dia })
									.toString(),
								categoriaId: evento.categoria,
								montoCentavos: evento.monto,
								paqueteContadorId: null,
								cancelado: false,
							});
						} else {
							const gasto = gastos[evento.cual % Math.max(1, gastos.length)];
							// Solo se cancela el que no ha salido en un paquete mandado.
							if (gasto !== undefined && gasto.paqueteContadorId === null) gasto.cancelado = true;
						}
					}
					// Se manda el paquete del mes: sus gastos quedan ligados y sus renglones, congelados.
					const { renglones, gastoIds } = cuentaDelPaquete(mes.toString(), [], gastos, enviados);
					for (const gasto of gastos) if (gastoIds.includes(gasto.id)) gasto.paqueteContadorId = mes.toString();
					enviados.add(mes.toString());
					congelados.set(mes.toString(), renglones);
				});
				// Cada gasto no cancelado salió exactamente una vez; uno cancelado, nunca; nadie salió antes de su mes.
				for (const gasto of gastos) {
					if (gasto.cancelado) expect(gasto.paqueteContadorId).toBeNull();
					else {
						expect(gasto.paqueteContadorId).not.toBeNull();
						expect((gasto.paqueteContadorId ?? "") >= mesDe(gasto.fecha)).toBe(true);
					}
				}
				// Lo de los gastos de cada paquete es exactamente lo de los gastos ligados a él al final: lo que llegó o se
				// canceló después no lo movió (en la base, sus renglones además solo crecen: `marcar_solo_crece`).
				for (const [mes, renglones] of congelados) {
					const suyos = gastos.filter((gasto) => gasto.paqueteContadorId === mes);
					const sumaRenglones = renglones
						.filter((renglon) => renglon.concepto === "gasto")
						.reduce((suma, renglon) => suma + renglon.montoCentavos, 0);
					expect(sumaRenglones).toBe(suyos.reduce((suma, gasto) => suma + gasto.montoCentavos, 0));
					for (const renglon of renglones.filter((uno) => uno.concepto === "gasto" && uno.deMesesAnteriores)) {
						expect(suyos.some((gasto) => gasto.categoriaId === renglon.categoriaId && mesDe(gasto.fecha) < mes)).toBe(
							true,
						);
					}
				}
			}),
			{ numRuns: 300 },
		);
	});
});
