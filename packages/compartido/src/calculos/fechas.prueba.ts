/**
 * Pruebas de las fechas del negocio.
 * Fase 1 · docs/cimientos/PAQUETE-COMPARTIDO.md («Fechas y horas»)
 */

import fc from "fast-check";
import { Temporal } from "temporal-polyfill";
import { describe, expect, it } from "vitest";
import {
	type DiaDeLaSemana,
	diaDeNegocio,
	diasHabilesEntre,
	inicioDeSemana,
	sumarDiasHabiles,
	zonaDelNegocio,
} from "./fechas.ts";

/** Lunes a sábado: el valor inicial de `general.dias_de_trabajo`. */
const lunesASabado: DiaDeLaSemana[] = [1, 2, 3, 4, 5, 6];

/** Momentos entre 2000 y 2100. */
const momentos = fc
	.integer({ min: 946_684_800_000, max: 4_102_444_800_000 })
	.map((milisegundos) => Temporal.Instant.fromEpochMilliseconds(milisegundos));
/** Días entre 2000 y 2100. */
const dias = fc.integer({ min: 0, max: 36_500 }).map((n) => Temporal.PlainDate.from("2000-01-01").add({ days: n }));
/** Cualquier juego de días de trabajo que no esté vacío. */
const diasDeTrabajo = fc.uniqueArray(fc.constantFrom<DiaDeLaSemana>(1, 2, 3, 4, 5, 6, 7), {
	minLength: 1,
	maxLength: 7,
});

describe("el día de negocio sale en hora de México: un momento de las 23:30 de México es de ese día", () => {
	it("una venta de las 23:30 en México es de ese día, aunque en UTC ya sea el siguiente", () => {
		const momento = Temporal.Instant.from("2026-11-11T05:30:00Z");
		expect(diaDeNegocio(momento).toString()).toBe("2026-11-10");
	});

	it("casos fijos alrededor de la medianoche de México", () => {
		expect(diaDeNegocio(Temporal.Instant.from("2026-11-11T05:59:59Z")).toString()).toBe("2026-11-10");
		expect(diaDeNegocio(Temporal.Instant.from("2026-11-11T06:00:00Z")).toString()).toBe("2026-11-11");
		expect(diaDeNegocio(Temporal.Instant.from("2027-01-01T05:00:00Z")).toString()).toBe("2026-12-31");
	});

	it("siempre es la fecha del reloj de México en ese momento", () => {
		fc.assert(
			fc.property(momentos, (momento) => {
				const enMexico = momento.toZonedDateTimeISO(zonaDelNegocio);
				expect(diaDeNegocio(momento).equals(enMexico.toPlainDate())).toBe(true);
			}),
			{ numRuns: 3000 },
		);
	});
});

describe("las semanas empiezan en lunes", () => {
	it("el inicio de la semana es el lunes de esa semana", () => {
		fc.assert(
			fc.property(dias, (dia) => {
				const lunes = inicioDeSemana(dia);
				expect(lunes.dayOfWeek).toBe(1);
				const distancia = lunes.until(dia).days;
				expect(distancia >= 0 && distancia < 7).toBe(true);
			}),
			{ numRuns: 3000 },
		);
	});

	it("casos fijos: el martes 10 de noviembre de 2026 es de la semana del lunes 9; el domingo 15, también", () => {
		expect(inicioDeSemana(Temporal.PlainDate.from("2026-11-10")).toString()).toBe("2026-11-09");
		expect(inicioDeSemana(Temporal.PlainDate.from("2026-11-15")).toString()).toBe("2026-11-09");
		expect(inicioDeSemana(Temporal.PlainDate.from("2026-11-16")).toString()).toBe("2026-11-16");
	});
});

describe("los días hábiles saltan los días que no son de trabajo", () => {
	it("sumar n días hábiles cae en un día de trabajo, con justo n días hábiles de por medio", () => {
		fc.assert(
			fc.property(dias, fc.integer({ min: 0, max: 60 }), diasDeTrabajo, (dia, n, trabajo) => {
				const resultado = sumarDiasHabiles(dia, n, trabajo);
				expect(diasHabilesEntre(dia, resultado, trabajo)).toBe(n);
				if (n > 0) expect(trabajo).toContain(resultado.dayOfWeek);
			}),
			{ numRuns: 2000 },
		);
	});

	it("contar días hábiles nunca cuenta un día que no es de trabajo", () => {
		fc.assert(
			fc.property(dias, fc.integer({ min: 0, max: 60 }), diasDeTrabajo, (desde, largo, trabajo) => {
				const hasta = desde.add({ days: largo });
				let esperados = 0;
				for (let d = desde.add({ days: 1 }); Temporal.PlainDate.compare(d, hasta) <= 0; d = d.add({ days: 1 })) {
					if (trabajo.some((t) => t === d.dayOfWeek)) esperados++;
				}
				expect(diasHabilesEntre(desde, hasta, trabajo)).toBe(esperados);
			}),
			{ numRuns: 2000 },
		);
	});

	it("casos fijos de lunes a sábado: el lote atorado de 2 días hábiles", () => {
		const viernes = Temporal.PlainDate.from("2026-11-13");
		expect(sumarDiasHabiles(viernes, 2, lunesASabado).toString()).toBe("2026-11-16");
		expect(diasHabilesEntre(viernes, Temporal.PlainDate.from("2026-11-16"), lunesASabado)).toBe(2);
		expect(diasHabilesEntre(Temporal.PlainDate.from("2026-11-16"), viernes, lunesASabado)).toBe(0);
	});

	it("sin días de trabajo no hay días hábiles que contar", () => {
		expect(() => sumarDiasHabiles(Temporal.PlainDate.from("2026-11-13"), 1, [])).toThrow(RangeError);
		expect(() => sumarDiasHabiles(Temporal.PlainDate.from("2026-11-13"), -1, lunesASabado)).toThrow(RangeError);
	});
});
