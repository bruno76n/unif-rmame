/**
 * Prueba de «Bultos para ti»: solo bultos con tope, primero los atorados y atrasados, luego en riesgo, por entrega y por
 * orden, hasta el máximo; lo mismo en la tablet que en la API.
 * Fase 12 · docs/fases/12-produccion.md (parte 4)
 */

import fc from "fast-check";
import { Temporal } from "temporal-polyfill";
import { describe, expect, it } from "vitest";
import { type BultoCandidato, bultosParaTi } from "./bultos-para-ti.ts";

/** Un bulto candidato al azar. */
const candidato = fc.record({
	bultoId: fc.uuid(),
	numero: fc.integer({ min: 1, max: 30 }),
	tope: fc.integer({ min: 0, max: 24 }),
	salud: fc.constantFrom<BultoCandidato["salud"]>(
		"atorado_maquina",
		"sin_datos",
		"atorado",
		"atrasado",
		"en_riesgo",
		"en_tiempo",
	),
	fechaEntrega: fc
		.integer({ min: 0, max: 60 })
		.map((dias) => Temporal.PlainDate.from("2026-11-11").add({ days: dias })),
});

describe("«Bultos para ti»: con tope, primero lo atorado y atrasado, luego en riesgo, por entrega y por orden, hasta el máximo", () => {
	it("el atrasado va antes que el que entrega primero en tiempo; un bulto sin tope no sale", () => {
		const entrega = (dia: string) => Temporal.PlainDate.from(dia);
		const lista = bultosParaTi(
			[
				{ bultoId: "a", numero: 1, tope: 24, salud: "en_tiempo", fechaEntrega: entrega("2026-11-12") },
				{ bultoId: "b", numero: 3, tope: 10, salud: "atrasado", fechaEntrega: entrega("2026-11-20") },
				{ bultoId: "c", numero: 2, tope: 0, salud: "atorado", fechaEntrega: entrega("2026-11-10") },
				{ bultoId: "d", numero: 1, tope: 5, salud: "en_riesgo", fechaEntrega: entrega("2026-11-14") },
			],
			6,
		);
		expect(lista.map((bulto) => bulto.bultoId)).toEqual(["b", "d", "a"]);
	});

	it("con datos al azar: nunca pasa del máximo, todos tienen tope y van en su orden", () => {
		fc.assert(
			fc.property(fc.array(candidato, { maxLength: 30 }), fc.integer({ min: 0, max: 10 }), (candidatos, maximo) => {
				const lista = bultosParaTi(candidatos, maximo);
				const conTope = candidatos.filter((bulto) => bulto.tope > 0).length;
				if (lista.length !== Math.min(maximo, conTope)) return false;
				const grupo = (bulto: BultoCandidato) =>
					["atorado", "atorado_maquina", "atrasado"].includes(bulto.salud) ? 0 : bulto.salud === "en_riesgo" ? 1 : 2;
				return lista.every((bulto, i) => {
					const anterior = lista[i - 1];
					if (bulto.tope <= 0) return false;
					if (anterior === undefined) return true;
					return (
						grupo(anterior) < grupo(bulto) ||
						(grupo(anterior) === grupo(bulto) &&
							Temporal.PlainDate.compare(anterior.fechaEntrega, bulto.fechaEntrega) <= 0)
					);
				});
			}),
			{ numRuns: 3000 },
		);
	});
});
