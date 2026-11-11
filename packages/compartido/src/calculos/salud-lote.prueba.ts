/**
 * Prueba de la salud de un lote: atorado, sin datos de la tablet, atrasado, en riesgo o en tiempo en ese orden, sin
 * contar los días en que la tablet no subió nada; lo mismo en la tablet que en la API, porque las dos usan esta
 * función.
 * Fase 12 · docs/fases/12-produccion.md (parte 2)
 */

import fc from "fast-check";
import { Temporal } from "temporal-polyfill";
import { describe, expect, it } from "vitest";
import type { DiaDeLaSemana } from "./fechas.ts";
import { type DatosDeSalud, diasSinAvance, saludDeLote } from "./salud-lote.ts";

/** Los siete días, de donde se escogen días de trabajo al azar. */
const todaLaSemana: DiaDeLaSemana[] = [1, 2, 3, 4, 5, 6, 7];

/** Lunes a sábado, como `general.dias_de_trabajo` al inicio. */
const lunesASabado: DiaDeLaSemana[] = [1, 2, 3, 4, 5, 6];

/** Un lote en tiempo el miércoles 11 de noviembre de 2026, con avance de ayer y la tablet al día. */
const enTiempo: DatosDeSalud = {
	hoy: Temporal.PlainDate.from("2026-11-11"),
	fechaEntrega: Temporal.PlainDate.from("2026-11-30"),
	faltan: 120,
	ultimoAvance: Temporal.PlainDate.from("2026-11-10"),
	ultimaSincronizacion: Temporal.PlainDate.from("2026-11-11"),
	diasSinSubir: [],
	cuelloDeBotella: "Costados",
	atoradoPorMaquina: null,
	diasDeTrabajo: lunesASabado,
	loteAtoradoDias: 2,
	riesgoAtrasoDias: 4,
};

/** Un día al azar de 2026 y 2027. */
const unDia = fc.integer({ min: 0, max: 700 }).map((n) => Temporal.PlainDate.from("2026-01-01").add({ days: n }));

/** Datos al azar de un lote en proceso. */
const datosAlAzar = fc
	.record({
		hoy: unDia,
		entrega: fc.integer({ min: -20, max: 40 }),
		faltan: fc.integer({ min: 0, max: 500 }),
		avance: fc.integer({ min: 0, max: 15 }),
		sincronizacion: fc.option(fc.integer({ min: 0, max: 10 }), { nil: null }),
		sinSubir: fc.array(fc.integer({ min: 0, max: 15 }), { maxLength: 10 }),
		maquina: fc.boolean(),
		atorado: fc.integer({ min: 1, max: 5 }),
		riesgo: fc.integer({ min: 0, max: 10 }),
		dias: fc.subarray(todaLaSemana, { minLength: 1 }),
	})
	.map(
		(azar): DatosDeSalud => ({
			hoy: azar.hoy,
			fechaEntrega: azar.hoy.add({ days: azar.entrega }),
			faltan: azar.faltan,
			ultimoAvance: azar.hoy.subtract({ days: azar.avance }),
			ultimaSincronizacion: azar.sincronizacion === null ? null : azar.hoy.subtract({ days: azar.sincronizacion }),
			diasSinSubir: azar.sinSubir.map((dias) => azar.hoy.subtract({ days: dias })),
			cuelloDeBotella: "Costados",
			atoradoPorMaquina: azar.maquina ? { operacion: "Costados", falla: "F-0012" } : null,
			diasDeTrabajo: azar.dias,
			loteAtoradoDias: azar.atorado,
			riesgoAtrasoDias: azar.riesgo,
		}),
	);

describe("La salud da atorado, sin datos de la tablet, atrasado, en riesgo o en tiempo en ese orden, sin contar los días en que la tablet no subió nada", () => {
	it("los casos de la regla 7", () => {
		expect(saludDeLote(enTiempo)).toEqual({ tipo: "en_tiempo" });
		// Entrega en 4 días con piezas por hacer: en riesgo; sin piezas por hacer, en tiempo.
		const cerca = { ...enTiempo, fechaEntrega: Temporal.PlainDate.from("2026-11-15") };
		expect(saludDeLote(cerca)).toEqual({ tipo: "en_riesgo" });
		expect(saludDeLote({ ...cerca, faltan: 0 })).toEqual({ tipo: "en_tiempo" });
		expect(saludDeLote({ ...enTiempo, fechaEntrega: Temporal.PlainDate.from("2026-11-10") })).toEqual({
			tipo: "atrasado",
		});
		// Sin avance desde el lunes 9: martes y miércoles son dos días de trabajo.
		const sinAvance = { ...enTiempo, ultimoAvance: Temporal.PlainDate.from("2026-11-09") };
		expect(saludDeLote(sinAvance)).toEqual({ tipo: "atorado", operacion: "Costados", dias: 2 });
		// Si el martes la tablet no subió nada, ese día no cuenta.
		expect(saludDeLote({ ...sinAvance, diasSinSubir: [Temporal.PlainDate.from("2026-11-10")] })).toEqual({
			tipo: "en_tiempo",
		});
		// La tablet no sincroniza desde el lunes: sin datos, aunque esté atrasado.
		expect(
			saludDeLote({
				...sinAvance,
				fechaEntrega: Temporal.PlainDate.from("2026-11-01"),
				ultimaSincronizacion: Temporal.PlainDate.from("2026-11-09"),
			}),
		).toEqual({ tipo: "sin_datos", desde: Temporal.PlainDate.from("2026-11-09") });
		// Una máquina parada gana a todo.
		expect(saludDeLote({ ...sinAvance, atoradoPorMaquina: { operacion: "Pegar cuello", falla: "F-0012" } })).toEqual({
			tipo: "atorado_maquina",
			operacion: "Pegar cuello",
			falla: "F-0012",
		});
	});

	it("con datos al azar: gana la primera que aplica, en el orden de la regla 7", () => {
		fc.assert(
			fc.property(datosAlAzar, (datos) => {
				const salud = saludDeLote(datos);
				if (datos.atoradoPorMaquina !== null) return salud.tipo === "atorado_maquina";
				const sinDatos = saludDeLote({ ...datos, ultimaSincronizacion: datos.hoy });
				if (salud.tipo === "sin_datos") return sinDatos.tipo !== "sin_datos";
				if (salud.tipo === "atorado") return diasSinAvance(datos) >= datos.loteAtoradoDias;
				if (diasSinAvance(datos) >= datos.loteAtoradoDias) return false;
				const faltanDias = datos.hoy.until(datos.fechaEntrega).days;
				if (salud.tipo === "atrasado") return faltanDias < 0;
				if (salud.tipo === "en_riesgo")
					return faltanDias >= 0 && datos.faltan > 0 && faltanDias <= datos.riesgoAtrasoDias;
				return faltanDias >= 0 && (datos.faltan === 0 || faltanDias > datos.riesgoAtrasoDias);
			}),
			{ numRuns: 5000 },
		);
	});

	it("con datos al azar: un día más en que la tablet no subió nada nunca vuelve atorado a un lote que no lo estaba", () => {
		fc.assert(
			fc.property(datosAlAzar, fc.integer({ min: 0, max: 15 }), (datos, dias) => {
				const conOtro = { ...datos, diasSinSubir: [...datos.diasSinSubir, datos.hoy.subtract({ days: dias })] };
				return diasSinAvance(conOtro) <= diasSinAvance(datos);
			}),
			{ numRuns: 3000 },
		);
	});
});
